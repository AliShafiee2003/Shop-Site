// GET /api/products/[slug]?locale= — full product detail (published only).
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  productCardInclude,
  toProductCard,
  type ProductCardDTO,
} from '@/lib/server/catalog'
import { getActivePromotion, promoPriceFor, promoBadgeLabel, isPromoExcluded } from '@/lib/server/promotions'
import { apiError, json, normalizeLocale, parseJsonSafe, pickLocale } from '@/lib/server/utils'
import { getSessionUser } from '@/lib/server/auth'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

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
  if (!p) return apiError(404, 'NOT_FOUND')

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

  if (related.length < 4 && (p.seriesSlug || p.series)) {
    const sameSeries = await db.product.findMany({
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
    push(sameSeries)
  }
  if (related.length < 4) {
    const personIds = p.contributors.map((c) => c.personId)
    if (personIds.length > 0) {
      const byContributor = await db.product.findMany({
        where: {
          status: 'PUBLISHED',
          id: { not: p.id },
          contributors: { some: { personId: { in: personIds } } },
        },
        include: productCardInclude,
        take: 8,
      })
      push(byContributor)
    }
  }
  if (related.length < 4) {
    const categoryIds = p.categories.map((pc) => pc.categoryId)
    if (categoryIds.length > 0) {
      const byCategory = await db.product.findMany({
        where: {
          status: 'PUBLISHED',
          id: { not: p.id },
          categories: { some: { categoryId: { in: categoryIds } } },
        },
        include: productCardInclude,
        take: 8,
      })
      push(byCategory)
    }
  }

  // ── Reviews (approved only) ──
  const allReviews = await db.review.findMany({
    where: { productId: p.id, moderationState: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { votes: true } } },
  })
  // Review sort (R8): `helpful` orders by vote count (recency tie-break) BEFORE
  // the top-20 slice; `recent` (default) preserves the historical order.
  const reviewsSort = searchParams.get('reviewsSort') === 'helpful' ? 'helpful' : 'recent'
  const orderedReviews =
    reviewsSort === 'helpful'
      ? [...allReviews].sort((a, b) => b._count.votes - a._count.votes || +b.createdAt - +a.createdAt)
      : allReviews
  // The single most-helpful review (≥1 vote) is flagged regardless of sort so
  // the PDP can pin a "Most helpful" badge on it.
  let topReviewId: string | null = null
  let topVotes = 0
  for (const r of allReviews) {
    if (r._count.votes > topVotes) { topVotes = r._count.votes; topReviewId = r.id }
  }
  // Helpfulness votes: fresh counts come from the include; `voted` is only
  // resolved when a session exists (guests get the button in signed-out mode).
  const viewer = await getSessionUser()
  const votedIds = viewer
    ? new Set(
        (
          await db.reviewVote.findMany({
            where: { userId: viewer.id, reviewId: { in: allReviews.map((r) => r.id) } },
            select: { reviewId: true },
          })
        ).map((v) => v.reviewId),
      )
    : new Set<string>()
  const avg = allReviews.length
    ? Math.round((allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length) * 10) / 10
    : 0

  const card = toProductCard(p, locale, promo)

  return json({
    ...card,
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
      count: allReviews.length,
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
        // Press response (public, shown under the review when present).
        reply: r.reply,
        repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      })),
    },
    safetyNote: p.safetyNote,
    fixedPrice: p.fixedPrice,
    audience: p.audience,
    publisher: p.publisher,
    series: p.series,
    seriesSlug: p.seriesSlug,
  })
}
