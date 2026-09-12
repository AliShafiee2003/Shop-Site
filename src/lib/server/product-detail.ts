// Shared product-detail loader — used by GET /api/products/[slug] AND by the
// server-rendered entry (src/app/page.tsx) so the PDP paints with full content.
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  productCardInclude,
  toProductCard,
  type ProductCardDTO,
} from '@/lib/server/catalog'
import { getActivePromotion, promoPriceFor, promoBadgeLabel, isPromoExcluded } from '@/lib/server/promotions'
import { parseJsonSafe, pickLocale } from '@/lib/server/utils'
import { getSessionUser } from '@/lib/server/auth'
import type { Locale } from '@/lib/types'

export async function getProductDetail(
  slug: string,
  locale: Locale,
  opts?: { reviewsSort?: 'recent' | 'helpful' },
) {
  const p = await db.product.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      ...productCardInclude,
      media: { orderBy: { sortOrder: 'asc' } },
      related: {
        orderBy: { sortOrder: 'asc' },
        include: { relatedProduct: { include: productCardInclude } },
      },
    },
  })
  if (!p) return null

  const promo = await getActivePromotion()

  // ── Long description blocks (requested locale → en fallback) ──
  const tLocale = p.translations.find((x) => x.locale === locale)
  const tEn = p.translations.find((x) => x.locale === 'en')
  const blockSource = tLocale?.longDescription ?? tEn?.longDescription ?? null
  const longDescription = parseJsonSafe<unknown[] | null>(blockSource, null)

  // ── Variants (active only, stable sort) ──
  const variants = p.variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.priceMinor - b.priceMinor)
    .map((v) => {
      const priced = promoPriceFor(promo, v.priceMinor, p.id, p.fixedPrice)
      return {
      id: v.id,
      sku: v.sku,
      isbn13: v.isbn13,
      format: v.format,
      bookLanguage: v.bookLanguage,
      editionLabel: v.editionLabel,
      pageCount: v.pageCount,
      widthMm: v.widthMm,
      heightMm: v.heightMm,
      depthMm: v.depthMm,
      weightG: v.weightG,
      priceMinor: v.priceMinor,
      salePriceMinor: priced.listPriceMinor != null ? priced.salePriceMinor : null,
      stock: v.stock,
      isActive: v.isActive,
      isLowStock: v.stock > 0 && v.stock <= v.lowStockThreshold,
      countryOfPrinting: v.countryOfPrinting,
      }
    })

  // ── Contributors / categories / gallery ──
  const contributors = [...p.contributors]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({
      slug: c.person.slug,
      name: pickLocale(c.person.translations, locale)?.name ?? c.person.slug,
      role: c.role,
      portraitUrl: c.person.portraitUrl,
    }))

  const categories = p.categories.map((pc) => ({
    slug: pc.category.slug,
    name: pickLocale(pc.category.translations, locale)?.name ?? pc.category.slug,
  }))

  const gallery = p.media.map((m) => ({
    url: m.url,
    alt: (locale === 'fa' ? m.altFa : m.altEn) ?? m.altEn ?? m.altFa ?? '',
  }))

  // ── Related products: manual first, then series → contributors → categories ──
  const related: ProductCardDTO[] = []
  const seen = new Set<string>([p.id])
  const push = (rows: Prisma.ProductGetPayload<{ include: typeof productCardInclude }>[]) => {
    for (const row of rows) {
      if (row.status !== 'PUBLISHED' || seen.has(row.id)) continue
      seen.add(row.id)
      related.push(toProductCard(row, locale, promo))
      if (related.length >= 4) return
    }
  }
  push(p.related.map((r) => r.relatedProduct))

  // PERF-002: the up-to-three fallback lookups used to run serially — a single
  // Promise.all instead. Rows are pushed in the SAME priority order (series →
  // contributors → categories) and push() dedupes + caps at 4, so the returned
  // `related` content is identical to the old short-circuit behaviour.
  const personIds = p.contributors.map((c) => c.personId)
  const categoryIds = p.categories.map((pc) => pc.categoryId)
  const [sameSeriesRows, byContributorRows, byCategoryRows] = await Promise.all([
    p.seriesSlug || p.series
      ? db.product.findMany({
          where: {
            status: 'PUBLISHED',
            id: { not: p.id },
            OR: [
              ...(p.seriesSlug ? [{ seriesSlug: p.seriesSlug }] : []),
              ...(p.series ? [{ series: p.series }] : []),
            ],
          },
          include: productCardInclude,
          take: 8,
        })
      : Promise.resolve([]),
    personIds.length > 0
      ? db.product.findMany({
          where: {
            status: 'PUBLISHED',
            id: { not: p.id },
            contributors: { some: { personId: { in: personIds } } },
          },
          include: productCardInclude,
          take: 8,
        })
      : Promise.resolve([]),
    categoryIds.length > 0
      ? db.product.findMany({
          where: {
            status: 'PUBLISHED',
            id: { not: p.id },
            categories: { some: { categoryId: { in: categoryIds } } },
          },
          include: productCardInclude,
          take: 8,
        })
      : Promise.resolve([]),
  ])
  push(sameSeriesRows)
  push(byContributorRows)
  push(byCategoryRows)

  // ── Reviews (approved only) ──
  // PERF-002: the read is bounded to the 50 most recent approved reviews while
  // a parallel aggregate keeps avg/count exact over ALL approved reviews. The
  // UI renders at most 20 items (slice below), so nothing visible changes.
  const [allReviews, reviewAgg] = await Promise.all([
    db.review.findMany({
      where: { productId: p.id, moderationState: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { votes: true } } },
    }),
    db.review.aggregate({
      where: { productId: p.id, moderationState: 'APPROVED' },
      _count: { _all: true },
      _avg: { rating: true },
    }),
  ])
  // Review sort parity with GET /api/products/[slug]: `helpful` orders by
  // votes (recency tie-break) before the top-20 slice; default is `recent`.
  const orderedReviews =
    opts?.reviewsSort === 'helpful'
      ? [...allReviews].sort((a, b) => b._count.votes - a._count.votes || +b.createdAt - +a.createdAt)
      : allReviews
  let topReviewId: string | null = null
  let topVotes = 0
  for (const r of allReviews) {
    if (r._count.votes > topVotes) { topVotes = r._count.votes; topReviewId = r.id }
  }
  // Helpfulness votes for the viewer — best-effort: getSessionUser needs the
  // cookie jar, which every caller (RSC + route) provides.
  const viewer = await getSessionUser().catch(() => null)
  const votedIds = viewer
    ? new Set(
        (
          await db.reviewVote
            .findMany({
              where: { userId: viewer.id, reviewId: { in: allReviews.map((r) => r.id) } },
              select: { reviewId: true },
            })
            .catch(() => [])
        ).map((v) => v.reviewId),
      )
    : new Set<string>()
  const avg = reviewAgg._avg.rating != null
    ? Math.round(reviewAgg._avg.rating * 10) / 10
    : 0

  const card = toProductCard(p, locale, promo)

  return {
    ...card,
    seoTitle: tLocale?.seoTitle ?? tEn?.seoTitle ?? null,
    seoDesc: tLocale?.seoDesc ?? tEn?.seoDesc ?? null,
    longDescription,
    variants,
    contributors,
    categories,
    gallery,
    related,
    promotion: promo
      ? {
          name: promo.name,
          badge: promoBadgeLabel(promo),
          noteEn: promo.noteEn,
          noteFa: promo.noteFa,
          excludedCount: promo.excludedProductIds.length,
        }
      : null,
    promoExcluded: isPromoExcluded(promo, p.id),
    reviews: {
      avg,
      count: reviewAgg._count._all,
      topReviewId,
      items: orderedReviews.slice(0, 20).map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        authorName: r.authorName,
        createdAt: r.createdAt.toISOString(),
        isVerifiedPurchase: r.isVerifiedPurchase,
        locale: r.locale,
        // Helpfulness votes (toggleable by signed-in customers).
        helpfulCount: r._count.votes,
        voted: votedIds.has(r.id),
      })),
    },
    safetyNote: p.safetyNote,
    fixedPrice: p.fixedPrice,
    audience: p.audience,
    publisher: p.publisher,
    series: p.series,
    seriesSlug: p.seriesSlug,
  }
}

export type ProductDetailDTO = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>
