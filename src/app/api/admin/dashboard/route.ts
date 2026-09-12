// GET /api/admin/dashboard — KPI tiles + low stock + top products + recent orders
// + sitewide promotion attribution (snapshot data recorded at checkout).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, pickLocale } from '@/lib/server/utils'
import { getActivePromotion, promoBadgeLabel } from '@/lib/server/promotions'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const d7 = new Date(now.getTime() - 7 * 86400000)
  const d30 = new Date(now.getTime() - 30 * 86400000)

  const [
    newOrders7d,
    revenueToday,
    revenueMonth,
    awaitingShipment,
    failedPayments,
    openReturns,
    lowStockVariants,
    pendingReviews,
    unansweredTickets,
    orderItems30d,
    recentOrders,
    promoGroups,
    promoOrdersCount,
    paidOrdersCount,
    activePromotion,
    giftWrapStats,
    archivedHomepageVersions,
    lastHomepagePublish,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: d7 } } }),
    db.order.aggregate({
      where: { createdAt: { gte: startOfToday }, paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _sum: { totalMinor: true },
    }),
    db.order.aggregate({
      where: { createdAt: { gte: startOfMonth }, paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _sum: { totalMinor: true },
    }),
    db.order.count({ where: { status: { in: ['PAID', 'PROCESSING'] }, fulfillmentStatus: 'UNFULFILLED' } }),
    db.payment.count({ where: { status: 'FAILED' } }),
    db.returnRequest.count({ where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } } }),
    db.variant.findMany({
      where: { isActive: true, stock: { lte: 5 } },
      include: { product: { include: { translations: true } } },
      orderBy: { stock: 'asc' },
    }).then((rows) => rows.filter((v) => v.stock <= v.lowStockThreshold).slice(0, 8)),
    db.review.count({ where: { moderationState: 'PENDING' } }),
    db.ticket.count({ where: { status: { in: ['OPEN', 'AWAITING_SUPPORT'] } } }),
    db.orderItem.findMany({
      where: { order: { createdAt: { gte: d30 } } },
      include: { variant: { include: { product: { include: { translations: true } } } } },
    }),
    db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { orderNumber: true, email: true, totalMinor: true, status: true, createdAt: true },
    }),
    // Promotion attribution — snapshot fields recorded at checkout, grouped by promo name.
    db.order.groupBy({
      by: ['promoName'],
      where: { promoName: { not: null }, paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _count: { _all: true },
      _sum: { promoSavedMinor: true, totalMinor: true },
    }),
    db.order.count({ where: { promoName: { not: null }, paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } } }),
    db.order.count({ where: { paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } } }),
    getActivePromotion(),
    // Gift wrap attach analytics — paid orders with wrap + fees collected.
    db.order.aggregate({
      where: { giftWrap: true, paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _count: { _all: true },
      _sum: { giftWrapMinor: true, totalMinor: true },
    }),
    // R10: homepage restore points (dashboard teaser → version history panel).
    db.homepageVersion.count({ where: { status: 'ARCHIVED' } }),
    db.homepageVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    }),
  ])

  // Top products by units in the last 30 days (grouped in JS — SQLite).
  const unitsByProduct = new Map<string, { title: string; units: number }>()
  for (const item of orderItems30d) {
    const product = item.variant?.product
    const title = product
      ? (pickLocale(product.translations, 'en')?.title ?? product.slug)
      : item.titleEn
    const key = product?.id ?? item.titleEn
    const entry = unitsByProduct.get(key) ?? { title, units: 0 }
    entry.units += item.quantity
    unitsByProduct.set(key, entry)
  }
  const topProducts = [...unitsByProduct.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 5)
    .map((p) => ({ title: p.title, units: p.units }))

  return json({
    newOrders7d,
    revenueTodayMinor: revenueToday._sum.totalMinor ?? 0,
    revenueMonthMinor: revenueMonth._sum.totalMinor ?? 0,
    awaitingShipment,
    failedPayments,
    openReturns,
    lowStock: lowStockVariants.map((v) => ({
      productTitle: pickLocale(v.product.translations, 'en')?.title ?? v.product.slug,
      sku: v.sku,
      stock: v.stock,
    })),
    pendingReviews,
    unansweredTickets,
    topProducts,
    recentOrders: recentOrders.map((o) => ({
      orderNumber: o.orderNumber,
      email: o.email,
      totalMinor: o.totalMinor,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    activePromotion: activePromotion
      ? { name: activePromotion.name, badge: promoBadgeLabel(activePromotion), noteEn: activePromotion.noteEn, noteFa: activePromotion.noteFa }
      : null,
    giftWrap: {
      orders: giftWrapStats._count._all,
      paidOrders: paidOrdersCount,
      feesMinor: giftWrapStats._sum.giftWrapMinor ?? 0,
      revenueMinor: giftWrapStats._sum.totalMinor ?? 0,
    },
    homepageRestore: {
      archived: archivedHomepageVersions,
      lastPublishedAt: lastHomepagePublish?.publishedAt?.toISOString() ?? null,
    },
    promoImpact: {
      orders: promoOrdersCount,
      paidOrders: paidOrdersCount,
      savedMinor: promoGroups.reduce((s, g) => s + (g._sum.promoSavedMinor ?? 0), 0),
      revenueMinor: promoGroups.reduce((s, g) => s + (g._sum.totalMinor ?? 0), 0),
      perPromo: promoGroups
        .filter((g) => g.promoName)
        .map((g) => ({
          name: g.promoName as string,
          orders: g._count._all,
          savedMinor: g._sum.promoSavedMinor ?? 0,
          revenueMinor: g._sum.totalMinor ?? 0,
        }))
        .sort((a, b) => b.savedMinor - a.savedMinor),
    },
  })
}
