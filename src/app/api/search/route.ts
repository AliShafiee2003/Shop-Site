// GET /api/search?q=&locale= — normalized LIKE search (products / people / articles), rate limited.
import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { productCardInclude, sortCards, toProductCard } from '@/lib/server/catalog'
import { getActivePromotion } from '@/lib/server/promotions'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale } from '@/lib/server/utils'

/** Persian/Arabic-aware query normalization. */
export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    // Arabic ی/ى → Persian ی ; Arabic ك → Persian ک
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    // Arabic-Indic + Extended Arabic-Indic digits → Latin
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    // Arabic diacritics / marks
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // ZWNJ & soft hyphen → removed
    .replace(/[\u200C\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsSet(needle: string): string[] {
  const variants = new Set<string>()
  if (needle) variants.add(needle)
  const n = normalizeQuery(needle)
  if (n) variants.add(n)
  return [...variants]
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:search`, 30, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many searches. Please slow down.')

  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))
  const rawQ = (searchParams.get('q') ?? '').trim()
  const q = normalizeQuery(rawQ)

  if (q.length < 2) {
    return json({
      query: q,
      products: [],
      people: [],
      articles: [],
      counts: { products: 0, people: 0, articles: 0 },
    })
  }

  const needles = containsSet(q)

  // ── Products: translations / sku+isbn / contributor names / category names ──
  const productOr: Prisma.ProductWhereInput[] = []
  for (const needle of needles) {
    productOr.push(
      {
        translations: {
          some: {
            OR: [
              { title: { contains: needle } },
              { subtitle: { contains: needle } },
              { shortDescription: { contains: needle } },
            ],
          },
        },
      },
      { variants: { some: { OR: [{ sku: { contains: needle } }, { isbn13: { contains: needle } }] } } },
      { contributors: { some: { person: { translations: { some: { name: { contains: needle } } } } } } },
      { categories: { some: { category: { translations: { some: { name: { contains: needle } } } } } } },
    )
  }

  // PERF-001: the catalog read is bounded (take 200) and the exact total comes
  // from a parallel count — a runaway query ("a" matches everything) can no
  // longer load the whole table. SQL pre-orders by the same 'featured'
  // relevance signal (isFeatured desc, then publication date desc — SQLite
  // sorts NULLs last on DESC, matching the in-memory nulls-last rule) so the
  // bounded read keeps the best candidates; the final in-memory sortCards pass
  // keeps its exact ordering semantics on that (≤200-row) candidate set.
  const SEARCH_TAKE = 200
  const [matchedProducts, totalProducts, promo] = await Promise.all([
    db.product.findMany({
      where: { status: 'PUBLISHED', OR: productOr },
      include: productCardInclude,
      orderBy: [{ isFeatured: 'desc' }, { publicationDate: 'desc' }],
      take: SEARCH_TAKE,
    }),
    db.product.count({ where: { status: 'PUBLISHED', OR: productOr } }),
    getActivePromotion(),
  ])
  const productCards = sortCards(matchedProducts.map((p) => toProductCard(p, locale, promo)), 'featured')

  // ── People ──
  const matchedPeople = await db.person.findMany({
    where: {
      status: 'PUBLISHED',
      OR: needles.flatMap((needle): Prisma.PersonWhereInput[] => [
        { translations: { some: { name: { contains: needle } } } },
        ...(needle.length >= 2 ? [{ profession: { contains: needle } }] : []),
      ]),
    },
    include: { translations: true },
    take: 12,
  })
  const people = matchedPeople.slice(0, 4).map((p) => ({
    slug: p.slug,
    name: p.translations.find((x) => x.locale === locale)?.name
      ?? p.translations.find((x) => x.locale === 'en')?.name
      ?? p.slug,
    portraitUrl: p.portraitUrl,
    profession: p.profession,
  }))

  // ── Articles ──
  const matchedArticles = await db.article.findMany({
    where: {
      status: 'PUBLISHED',
      OR: needles.map((needle): Prisma.ArticleWhereInput => ({
        translations: { some: { OR: [{ title: { contains: needle } }, { excerpt: { contains: needle } }] } },
      })),
    },
    include: { translations: true },
    orderBy: { publishedAt: 'desc' },
    take: 12,
  })
  const articles = matchedArticles.slice(0, 4).map((a) => ({
    slug: a.slug,
    title: a.translations.find((x) => x.locale === locale)?.title
      ?? a.translations.find((x) => x.locale === 'en')?.title
      ?? a.slug,
  }))

  return json({
    query: q,
    products: productCards.slice(0, 8),
    people,
    articles,
    counts: {
      products: totalProducts,
      people: matchedPeople.length,
      articles: matchedArticles.length,
    },
  })
}
