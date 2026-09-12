// Catalog helpers — shared product include shapes + ProductCardDTO mapping (server-side).
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { pickLocale } from './utils'
import { getActivePromotion, promoPriceFor, type ActivePromotion } from './promotions'

export type ProductCardDTO = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  shortDescription: string | null
  coverUrl: string | null
  /** effective (promotion-adjusted) price the customer pays */
  priceMinor: number | null
  /** original list price — present only while a promotion reduces this price */
  listPriceMinor: number | null
  format: string | null
  isFeatured: boolean
  inStock: boolean
  isLowStock: boolean
  rating: { avg: number; count: number }
  contributors: { name: string; slug: string; role: string }[]
  publicationDate: string | null
  series: string | null
  /** catalog-recency stamps — «New releases» orders by publishAt ?? createdAt */
  publishAt: string | null
  createdAt: string
}

/** Include shape used for every product → card mapping. */
export const productCardInclude = {
  translations: true,
  variants: true,
  contributors: { include: { person: { include: { translations: true } } } },
  reviews: { where: { moderationState: 'APPROVED' }, select: { rating: true } },
  categories: { include: { category: { include: { translations: true } } } },
} satisfies Prisma.ProductInclude

export type ProductWithCardRelations = Prisma.ProductGetPayload<{
  include: typeof productCardInclude
}>

export type ProductSort = 'featured' | 'newest' | 'bestselling' | 'price-asc' | 'price-desc'

/** Map a Product row (with card relations) to the public ProductCardDTO. */
export function toProductCard(
  p: ProductWithCardRelations,
  locale: string,
  promo?: ActivePromotion | null,
): ProductCardDTO {
  const t = pickLocale(p.translations, locale)
  const active = p.variants.filter((v) => v.isActive)
  const cheapest = active.length
    ? active.reduce((a, b) => (b.priceMinor < a.priceMinor ? b : a))
    : null
  const priced = cheapest ? promoPriceFor(promo ?? null, cheapest.priceMinor, p.id) : null
  const ratings = p.reviews.map((r) => r.rating)
  const avg = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : 0

  return {
    id: p.id,
    slug: p.slug,
    title: t?.title ?? p.slug,
    subtitle: t?.subtitle ?? null,
    shortDescription: t?.shortDescription ?? null,
    coverUrl: p.coverUrl,
    priceMinor: priced ? priced.salePriceMinor : null,
    listPriceMinor: priced ? priced.listPriceMinor : null,
    format: cheapest ? cheapest.format : null,
    isFeatured: p.isFeatured,
    inStock: active.some((v) => v.stock > 0),
    isLowStock: active.some((v) => v.stock > 0 && v.stock <= v.lowStockThreshold),
    rating: { avg, count: ratings.length },
    contributors: [...p.contributors]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({
        slug: c.person.slug,
        name: pickLocale(c.person.translations, locale)?.name ?? c.person.slug,
        role: c.role,
      })),
    publicationDate: p.publicationDate ? p.publicationDate.toISOString() : null,
    series: p.series,
    publishAt: p.publishAt ? p.publishAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }
}

function nullsLast<T>(value: (item: T) => number | null | undefined, dir: 1 | -1) {
  return (a: T, b: T): number => {
    const va = value(a)
    const vb = value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return (va - vb) * dir
  }
}

/** Sort card DTOs server-side (SQLite can't order by aggregates / nulls-last). */
export function sortCards(cards: ProductCardDTO[], sort: ProductSort): ProductCardDTO[] {
  const cards2 = [...cards]
  switch (sort) {
    case 'newest': {
      // «New releases» = freshest CATALOG entries first: publish moment (when it
      // went live) → else row creation. A just-added book with no publicationDate
      // must top the list, not sink under older titles with back-dated dates.
      const stamp = (c: ProductCardDTO): number | null => {
        const raw = c.publishAt ?? c.createdAt ?? c.publicationDate
        return raw ? Date.parse(raw) : null
      }
      return cards2.sort((a, b) => {
        const ta = stamp(a)
        const tb = stamp(b)
        if (ta == null && tb == null) return 0
        if (ta == null) return -1
        if (tb == null) return 1
        return tb - ta
      })
    }
    case 'bestselling':
      return cards2.sort((a, b) => b.rating.count - a.rating.count)
    case 'price-asc':
      return cards2.sort(nullsLast((c) => c.priceMinor, 1))
    case 'price-desc':
      return cards2.sort(nullsLast((c) => c.priceMinor, -1))
    case 'featured':
    default:
      return cards2.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
        const pa = a.publicationDate ? Date.parse(a.publicationDate) : null
        const pb = b.publicationDate ? Date.parse(b.publicationDate) : null
        if (pa == null && pb == null) return 0
        if (pa == null) return 1
        if (pb == null) return -1
        return pb - pa
      })
  }
}

/** Fetch products with card relations for an arbitrary where clause (promotion-aware). */
export async function fetchCards(
  where: Prisma.ProductWhereInput,
  locale: string,
): Promise<ProductCardDTO[]> {
  const [products, promo] = await Promise.all([db.product.findMany({ where, include: productCardInclude }), getActivePromotion()])
  return products.map((p) => toProductCard(p, locale, promo))
}
