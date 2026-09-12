// GET /api/products/facets — filter options extracted from live catalog data.
// Returns the languages/formats that published books actually have, the
// publishers that exist, and the real price bounds — so the catalog filter UI
// never shows a dead option. No locale needed: values are stored raw (EN) and
// localized client-side via bookLabels helpers.
import { db } from '@/lib/db'
import { json } from '@/lib/server/utils'
import { getActivePromotion, promoPriceFor } from '@/lib/server/promotions'

export async function GET() {
  const variantWhere = {
    isActive: true,
    product: { status: 'PUBLISHED' as const },
  }

  const [languages, formats, publishers, variants] = await Promise.all([
    db.variant.groupBy({
      by: ['bookLanguage'],
      where: variantWhere,
      _count: { bookLanguage: true },
      orderBy: { bookLanguage: 'asc' },
    }),
    db.variant.groupBy({
      by: ['format'],
      where: variantWhere,
      _count: { format: true },
      orderBy: { format: 'asc' },
    }),
    db.product.groupBy({
      by: ['publisher'],
      where: { status: 'PUBLISHED' as const },
      _count: { publisher: true },
      orderBy: { publisher: 'asc' },
    }),
    // Only the columns needed for the price domain (fixedPrice → COM-005:
    // Buchpreisbindung titles are exempt from the sitewide promotion).
    db.variant.findMany({
      where: variantWhere,
      select: { priceMinor: true, productId: true, product: { select: { fixedPrice: true } } },
    }),
  ])

  // Price domain = the books' FINAL prices (promotion-adjusted), per product's
  // displayed price (cheapest active variant) — auto span from the cheapest to
  // the most expensive item, so the slider can never "start above" a book the
  // store actually sells for less (user requirement).
  const promo = await getActivePromotion()
  const cheapestByProduct = new Map<string, number>()
  for (const v of variants) {
    const cur = cheapestByProduct.get(v.productId)
    if (cur == null || v.priceMinor < cur) cheapestByProduct.set(v.productId, v.priceMinor)
  }

  let effMin: number | null = null
  let effMax: number | null = null
  const fixedByProduct = new Map<string, boolean>()
  for (const v of variants) if (!fixedByProduct.has(v.productId)) fixedByProduct.set(v.productId, v.product.fixedPrice)
  for (const [productId, listPrice] of cheapestByProduct) {
    const effective = promoPriceFor(promo, listPrice, productId, fixedByProduct.get(productId) ?? false).salePriceMinor
    if (effMin == null || effective < effMin) effMin = effective
    if (effMax == null || effective > effMax) effMax = effective
  }

  return json({
    languages: languages
      .filter((l): l is typeof l & { bookLanguage: string } => Boolean(l.bookLanguage))
      .map((l) => ({ value: l.bookLanguage, count: l._count.bookLanguage })),
    formats: formats.map((f) => ({ value: f.format, count: f._count.format })),
    publishers: publishers
      .filter((p): p is typeof p & { publisher: string } => Boolean(p.publisher))
      .map((p) => ({ value: p.publisher, count: (p._count as { publisher: number }).publisher })),
    // Whole-euro bounds for the dual-range slider (null-safe fallbacks).
    price: {
      min: effMin != null ? Math.floor(effMin / 100) : 0,
      max: effMax != null ? Math.ceil(effMax / 100) : 100,
    },
  })
}
