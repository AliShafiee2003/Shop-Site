// GET /api/admin/reports?days=7|30|90 — daily orders/revenue, per-product, per-country,
// per-promotion attribution (from Order.promo* snapshots) + totals (Task 27: window selectable).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, parseJsonSafe, parseIntParam, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const days = parseIntParam(searchParams.get('days'), 30, 1, 365) ?? 30

  const now = new Date()
  const start = new Date(now.getTime() - days * 86400000)

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start } },
    include: {
      items: { include: { variant: { include: { product: { include: { translations: true } } } } } },
      refunds: true,
    },
  })

  const paidOrders = orders.filter((o) => o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED')

  // ── Daily series ──
  const dailyMap = new Map<string, { orders: number; revenueMinor: number }>()
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    dailyMap.set(d.toISOString().slice(0, 10), { orders: 0, revenueMinor: 0 })
  }
  for (const o of paidOrders) {
    const key = o.createdAt.toISOString().slice(0, 10)
    const entry = dailyMap.get(key)
    if (entry) {
      entry.orders += 1
      entry.revenueMinor += o.totalMinor
    }
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // ── Per product ──
  const byProductMap = new Map<string, { title: string; units: number; revenueMinor: number }>()
  for (const o of paidOrders) {
    for (const item of o.items) {
      const title = item.variant?.product
        ? (pickLocale(item.variant.product.translations, 'en')?.title ?? item.variant.product.slug)
        : item.titleEn
      const entry = byProductMap.get(title) ?? { title, units: 0, revenueMinor: 0 }
      entry.units += item.quantity
      entry.revenueMinor += item.totalMinor
      byProductMap.set(title, entry)
    }
  }
  const byProduct = [...byProductMap.values()].sort((a, b) => b.units - a.units)

  // ── Per country (from shipping address snapshot) ──
  const byCountryMap = new Map<string, { countryCode: string; orders: number; revenueMinor: number }>()
  for (const o of paidOrders) {
    const addr = parseJsonSafe<{ countryCode?: string } | null>(o.shippingAddressJson, null)
    const code = addr?.countryCode ?? '??'
    const entry = byCountryMap.get(code) ?? { countryCode: code, orders: 0, revenueMinor: 0 }
    entry.orders += 1
    entry.revenueMinor += o.totalMinor
    byCountryMap.set(code, entry)
  }
  const byCountry = [...byCountryMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)

  // ── Per promotion (attribution snapshots recorded at checkout) ──
  const byPromotionMap = new Map<string, { name: string; orders: number; savedMinor: number; revenueMinor: number }>()
  for (const o of paidOrders) {
    if (!o.promoName || o.promoSavedMinor <= 0) continue
    const entry = byPromotionMap.get(o.promoName) ?? { name: o.promoName, orders: 0, savedMinor: 0, revenueMinor: 0 }
    entry.orders += 1
    entry.savedMinor += o.promoSavedMinor
    entry.revenueMinor += o.totalMinor
    byPromotionMap.set(o.promoName, entry)
  }
  const byPromotion = [...byPromotionMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)

  // ── Totals ──
  const revenueMinor = paidOrders.reduce((s, o) => s + o.totalMinor, 0)
  const refundsMinor = orders.reduce((s, o) => s + o.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s2, r) => s2 + r.amountMinor, 0), 0)
  const taxMinor = paidOrders.reduce((s, o) => s + o.taxMinor, 0)
  const ordersCount = paidOrders.length
  const aovMinor = ordersCount > 0 ? Math.round(revenueMinor / ordersCount) : 0

  return json({
    daily,
    byProduct,
    byCountry,
    byPromotion,
    totals: { orders: ordersCount, revenueMinor, refundsMinor, taxMinor, aovMinor },
  })
}
