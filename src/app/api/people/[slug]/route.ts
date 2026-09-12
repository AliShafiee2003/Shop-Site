// GET /api/people/[slug]?locale= — person detail with books + mentioning articles.
import { db } from '@/lib/db'
import { productCardInclude, toProductCard } from '@/lib/server/catalog'
import { getActivePromotion } from '@/lib/server/promotions'
import { apiError, json, normalizeLocale, parseJsonSafe, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const person = await db.person.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      translations: true,
      contributions: { include: { product: { include: productCardInclude } } },
      articleRels: { include: { article: { include: { translations: true } } } },
    },
  })
  if (!person) return apiError(404, 'NOT_FOUND')

  const t = pickLocale(person.translations, locale)
  const promo = await getActivePromotion()

  // Books: one entry per (product, role) contribution; only published products.
  const books = person.contributions
    .filter((c) => c.product.status === 'PUBLISHED')
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({
      product: toProductCard(c.product, locale, promo),
      role: c.role,
    }))

  const articles = person.articleRels
    .filter((r) => r.article.status === 'PUBLISHED')
    .map((r) => {
      const at = pickLocale(r.article.translations, locale)
      return {
        slug: r.article.slug,
        title: at?.title ?? r.article.slug,
        heroUrl: r.article.heroUrl,
        publishedAt: r.article.publishedAt ? r.article.publishedAt.toISOString() : null,
        excerpt: at?.excerpt ?? null,
      }
    })
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))

  return json({
    slug: person.slug,
    name: t?.name ?? person.slug,
    profession: person.profession,
    portraitUrl: person.portraitUrl,
    birthYear: person.birthYear,
    deathYear: person.deathYear,
    nationality: person.nationality,
    shortBio: t?.shortBio ?? null,
    fullBio: t?.fullBio ?? null,
    quote: locale === 'fa' ? (person.quoteFa ?? person.quoteEn) : (person.quoteEn ?? person.quoteFa),
    quoteSource: locale === 'fa' ? (person.quoteSourceFa ?? person.quoteSourceEn) : (person.quoteSourceEn ?? person.quoteSourceFa),
    website: person.website,
    socialLinks: parseJsonSafe<{ platform?: string; url?: string }[]>(person.socialLinks, []),
    roles: [...new Set(person.contributions.map((c) => c.role))],
    books,
    articles,
  })
}
