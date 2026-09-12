// Sitewide auto-promotion (season sale) — server-authoritative price decoration.
// A promotion applies to EVERY published product's variants unless the product
// is explicitly excluded (Promotion.excludedProductIds — fixed-price / new
// arrivals). Only one promotion may be active at a time. Prices stay
// VAT-inclusive (like the whole store).
import type { Promotion } from '@prisma/client'
import { db } from '@/lib/db'
import { parseJsonSafe } from './utils'

export type ActivePromotion = Pick<
  Promotion,
  'id' | 'name' | 'type' | 'value' | 'noteEn' | 'noteFa'
> & {
  /** Product ids exempted from this promotion (never discounted by it). */
  excludedProductIds: string[]
  /** When the promotion window closes (null = open-ended) — drives the
   *  homepage "Flash deals" module (products API `flashHours` filter). */
  endsAt: Date | null
}

export type PromoPrice = {
  /** effective price the customer pays (VAT incl.) */
  salePriceMinor: number
  /** original list price, present only when the promo actually reduces it */
  listPriceMinor: number | null
}

const MIN_SALE_PRICE = 100 // never sell below €1.00

/** Fetch the currently active, in-window promotion (or null). Cheap single query. */
export async function getActivePromotion(): Promise<ActivePromotion | null> {
  const now = new Date()
  const promo = await db.promotion.findFirst({
    where: { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
  })
  if (!promo) return null
  if (promo.endsAt && promo.endsAt < now) return null
  return {
    id: promo.id,
    name: promo.name,
    type: promo.type as 'PERCENT' | 'FIXED',
    value: promo.value,
    noteEn: promo.noteEn,
    noteFa: promo.noteFa,
    excludedProductIds: parseJsonSafe<string[]>(promo.excludedProductIds, []),
    endsAt: promo.endsAt,
  }
}

/** True when the promotion explicitly exempts this product. */
export function isPromoExcluded(
  promo: ActivePromotion | null,
  productId?: string | null,
): boolean {
  if (!promo || !productId) return false
  return promo.excludedProductIds.includes(productId)
}

/** Apply a promotion to a list price. FIXED promos apply per unit.
 *  Pass productId to honour per-product exclusions. */
export function promoPriceFor(
  promo: ActivePromotion | null,
  listPriceMinor: number,
  productId?: string | null,
): PromoPrice {
  if (!promo || listPriceMinor <= 0 || isPromoExcluded(promo, productId)) {
    return { salePriceMinor: listPriceMinor, listPriceMinor: null }
  }
  const raw =
    promo.type === 'PERCENT'
      ? Math.round((listPriceMinor * (100 - promo.value)) / 100)
      : listPriceMinor - promo.value
  const sale = Math.max(MIN_SALE_PRICE, raw)
  if (sale >= listPriceMinor) {
    return { salePriceMinor: listPriceMinor, listPriceMinor: null }
  }
  return { salePriceMinor: sale, listPriceMinor }
}

/** Short human label for badges, e.g. "−10%" or "−€2.00". */
export function promoBadgeLabel(promo: ActivePromotion): string {
  return promo.type === 'PERCENT'
    ? `−${promo.value}%`
    : `−€${(promo.value / 100).toFixed(2)}`
}

/** Parse the stored excludedProductIds JSON column safely. */
export function parseExcludedIds(raw: string | null | undefined): string[] {
  return parseJsonSafe<string[]>(raw, [])
}
