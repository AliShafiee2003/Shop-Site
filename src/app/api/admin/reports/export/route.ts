// GET /api/admin/reports/export — CSV attachment (daily rows + per-product rows).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, csvCell, parseIntParam, parseJsonSafe, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const days = parseIntParam(searchParams.get('days'), 30, 1, 365) ?? 30
  const start = new Date(Date.now() - days * 86400000)
  const orders = await db.order.findMany({
    where: { createdAt: { gte: start } },
    include: { items: { include: { variant: { include: { product: { include: { translations: true } } } } } } },
  })
  const paid = orders.filter((o) => o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED')

  const dailyMap = new Map<string, { orders: number; revenueMinor: number }>()
  for (const o of paid) {
    const key = o.createdAt.toISOString().slice(0, 10)
    const entry = dailyMap.get(key) ?? { orders: 0, revenueMinor: 0 }
    entry.orders += 1
    entry.revenueMinor += o.totalMinor
    dailyMap.set(key, entry)
  }

  const byProductMap = new Map<string, { title: string; units: number; revenueMinor: number }>()
  for (const o of paid) {
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

  const addrCountry = (json: string | null): string =>
    parseJsonSafe<{ countryCode?: string } | null>(json, null)?.countryCode ?? '??'
  const byCountryMap = new Map<string, { orders: number; revenueMinor: number }>()
  for (const o of paid) {
    const code = addrCountry(o.shippingAddressJson)
    const entry = byCountryMap.get(code) ?? { orders: 0, revenueMinor: 0 }
    entry.orders += 1
    entry.revenueMinor += o.totalMinor
    byCountryMap.set(code, entry)
  }

  const byPromotionMap = new Map<string, { name: string; orders: number; savedMinor: number; revenueMinor: number }>()
  for (const o of paid) {
    if (!o.promoName || o.promoSavedMinor <= 0) continue
    const entry = byPromotionMap.get(o.promoName) ?? { name: o.promoName, orders: 0, savedMinor: 0, revenueMinor: 0 }
    entry.orders += 1
    entry.savedMinor += o.promoSavedMinor
    entry.revenueMinor += o.totalMinor
    byPromotionMap.set(o.promoName, entry)
  }

  const lines: string[] = []
  lines.push('section,date,country,title,orders,units,revenue_minor,saved_minor')
  for (const [date, v] of [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(['daily', date, '', '', v.orders, '', v.revenueMinor, ''].map(csvCell).join(','))
  }
  for (const [, v] of byProductMap) {
    lines.push(['by_product', '', '', v.title, '', v.units, v.revenueMinor, ''].map(csvCell).join(','))
  }
  for (const [code, v] of byCountryMap) {
    lines.push(['by_country', '', code, '', v.orders, '', v.revenueMinor, ''].map(csvCell).join(','))
  }
  for (const [, v] of byPromotionMap) {
    lines.push(['by_promotion', '', '', v.name, v.orders, '', v.revenueMinor, v.savedMinor].map(csvCell).join(','))
  }

  const csv = lines.join('\n')
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="persepix-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
