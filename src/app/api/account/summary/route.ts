// GET /api/account/summary — dashboard tiles for the logged-in customer.
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, safeTrackingUrl } from '@/lib/server/utils'

/** A "current" order = still moving through fulfillment (user requirement:
 *  the dashboard's Recent orders tile lists ONLY current orders — history
 *  lives in the Orders section). */
const CURRENT_STATUSES = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED'] as const

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const [recentOrders, activeShipments, openReturns, openTickets] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id, status: { in: [...CURRENT_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { items: { orderBy: { id: 'asc' }, select: { coverUrl: true, titleEn: true, titleFa: true, quantity: true } }, _count: { select: { items: true } } },
    }),
    db.shipment.findMany({
      where: { order: { userId: user.id }, status: { not: 'DELIVERED' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: { order: { select: { orderNumber: true } } },
    }),
    db.returnRequest.count({
      where: { userId: user.id, status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
    }),
    db.ticket.count({
      where: { userId: user.id, status: { in: ['OPEN', 'AWAITING_SUPPORT', 'AWAITING_CUSTOMER'] } },
    }),
  ])

  const shipment = activeShipments[0] ?? null

  return json({
    recentOrders: recentOrders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      totalMinor: o.totalMinor,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
      firstCoverUrl: o.items[0]?.coverUrl ?? null,
      covers: o.items.slice(0, 4).map((i) => i.coverUrl).filter((c): c is string => Boolean(c)),
    })),
    activeShipment: shipment
      ? {
          orderNumber: shipment.order.orderNumber,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          trackingUrl: safeTrackingUrl(shipment.trackingUrl),
          status: shipment.status,
          estimatedDeliveryAt: shipment.estimatedDeliveryAt ? shipment.estimatedDeliveryAt.toISOString() : null,
        }
      : null,
    openReturns,
    openTickets,
  })
}
