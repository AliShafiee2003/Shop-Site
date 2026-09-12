// GET /api/admin/analytics — consented first-party events summary (PRD 30.1).
// Funnel (views → carts → checkouts → purchases), top products, daily series, totals.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const since = new Date(Date.now() - 30 * 24 * 3600_000)

  const [byType, topViewed, daily, recentPurchases] = await Promise.all([
    db.analyticsEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.analyticsEvent.groupBy({
      by: ['productSlug'],
      where: { createdAt: { gte: since }, type: 'view_product', productSlug: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productSlug: 'desc' } },
      take: 8,
    }),
    db.analyticsEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since }, type: { in: ['view_product', 'add_to_cart', 'begin_checkout', 'purchase'] } },
      _count: { _all: true },
    }),
    db.analyticsEvent.findMany({
      where: { type: 'purchase' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, path: true, locale: true, valueMinor: true, createdAt: true },
    }),
  ])

  // Daily series per funnel stage for the last 30 days (SQLite: fetch raw + bucket in JS).
  const events = await db.analyticsEvent.findMany({
    where: { createdAt: { gte: since }, type: { in: ['view_product', 'add_to_cart', 'begin_checkout', 'purchase'] } },
    select: { type: true, createdAt: true },
  })
  const dayMap = new Map<string, Record<string, number>>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { view_product: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0 })
  }
  for (const ev of events) {
    const key = ev.createdAt.toISOString().slice(0, 10)
    const row = dayMap.get(key)
    if (row) row[ev.type] = (row[ev.type] ?? 0) + 1
  }

  const counts = Object.fromEntries(byType.map((r) => [r.type, r._count._all]))
  const dailyCounts = Object.fromEntries(daily.map((r) => [r.type, r._count._all]))

  // Top viewed with titles from catalog (fallback to slug).
  const slugs = topViewed.map((t) => t.productSlug).filter((s): s is string => !!s)
  const products = slugs.length
    ? await db.product.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, translations: { select: { locale: true, title: true } } },
      })
    : []
  const titleBySlug = new Map(products.map((p) => [p.slug, p.translations.find((tr) => tr.locale === 'en')?.title ?? p.slug]))

  return json({
    totals: {
      viewProduct: dailyCounts['view_product'] ?? 0,
      addToCart: dailyCounts['add_to_cart'] ?? 0,
      beginCheckout: dailyCounts['begin_checkout'] ?? 0,
      purchase: dailyCounts['purchase'] ?? 0,
      search: counts['search'] ?? 0,
      viewArticle: counts['view_article'] ?? 0,
    },
    topViewed: topViewed.map((t) => ({
      slug: t.productSlug ?? '',
      title: titleBySlug.get(t.productSlug ?? '') ?? t.productSlug ?? '',
      views: t._count._all,
    })),
    daily: Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v })),
    recentPurchases: recentPurchases.map((p) => ({
      id: p.id,
      path: p.path,
      locale: p.locale,
      valueMinor: p.valueMinor,
      createdAt: p.createdAt.toISOString(),
    })),
  })
}
