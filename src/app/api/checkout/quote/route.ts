// POST /api/checkout/quote — shipping methods + prices for a country and current cart.
// Accepts an optional discountCode to preview the discounted totals.
import { z } from 'zod'
import { getCartPayload } from '@/lib/server/cart'
import { validateDiscount } from '@/lib/server/discounts'
import { loadGiftWrapConfig } from '@/lib/server/giftwrap'
import { VAT_RATE_PCT } from '@/lib/server/money'
import { loadShippingSettings, methodServesCountry } from '@/lib/server/shipping'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  shippingCountry: z.string().length(2),
  methodId: z.string().optional().nullable(),
  discountCode: z.string().max(40).optional().nullable(),
  giftWrap: z.boolean().optional().nullable(),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const shippingCountry = parsed.data.shippingCountry.toUpperCase()
  const methodId = parsed.data.methodId ?? null
  const rawDiscountCode = parsed.data.discountCode ?? null

  const cart = await getCartPayload()
  const { methods } = await loadShippingSettings()
  const giftWrapConfig = await loadGiftWrapConfig()
  const wantGiftWrap = parsed.data.giftWrap === true && giftWrapConfig.enabled
  const giftWrapMinor = wantGiftWrap ? giftWrapConfig.priceMinor : 0

  let eligible = methods.filter((m) => methodServesCountry(m, shippingCountry))
  if (methodId) eligible = eligible.filter((m) => m.id === methodId)
  if (eligible.length === 0) {
    return apiError(400, 'COUNTRY_NOT_SERVED', `We do not ship to ${shippingCountry} (or unknown method).`)
  }

  // Discount preview (soft-fail: an invalid code simply yields no discount here;
  // the authoritative re-check happens at POST /api/checkout).
  let discount: { code: string; type: 'PERCENT' | 'FIXED'; value: number; discountMinor: number; minSubtotalMinor: number; noteEn: string | null; noteFa: string | null } | null = null
  if (rawDiscountCode) {
    const result = await validateDiscount(
      rawDiscountCode,
      cart.subtotalMinor,
      undefined,
      cart.items.map((i) => ({ productId: i.productId, lineTotalMinor: i.lineTotalMinor })),
    )
    if (result.ok) {
      discount = {
        code: result.dc.code,
        type: result.dc.type as 'PERCENT' | 'FIXED',
        value: result.dc.value,
        discountMinor: result.discountMinor,
        minSubtotalMinor: result.dc.minSubtotalMinor,
        noteEn: result.dc.noteEn,
        noteFa: result.dc.noteFa,
      }
    }
  }
  const discountMinor = discount?.discountMinor ?? 0

  const quoteMethods = eligible.map((m) => {
    const freeOverMinor = m.freeOverMinor ?? null
    const freeApplied = freeOverMinor !== null && cart.subtotalMinor >= freeOverMinor
    const minDays = m.minDays ?? 5
    const maxDays = m.maxDays ?? 10
    return {
      id: m.id,
      label: m.labelEn ?? m.id,
      labelFa: m.labelFa ?? null,
      desc: m.descEn ?? null,
      descFa: m.descFa ?? null,
      zone: m.zone ?? null,
      priceMinor: m.priceMinor,
      freeOverMinor,
      freeApplied,
      effectivePriceMinor: freeApplied ? 0 : m.priceMinor,
      etaDays: { min: minDays, max: maxDays },
      etaLabel: `${minDays}–${maxDays} days`,
    }
  })

  return json({
    methods: quoteMethods,
    subtotalMinor: cart.subtotalMinor,
    promotion: cart.promotion,
    discount,
    discountMinor,
    giftWrapMinor,
    totalMinor: cart.subtotalMinor - discountMinor + giftWrapMinor + (quoteMethods[0]?.effectivePriceMinor ?? 0),
    itemsCount: cart.itemsCount,
    count: cart.count, // canonical client contract (itemsCount kept as alias)
    vatRatePct: VAT_RATE_PCT,
    currency: 'EUR',
  })
}
