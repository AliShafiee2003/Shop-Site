// GET /api/admin/returns — the ReturnRequest queue (COM-401).
// Customers could always submit return requests (account/returns POST), but the
// admin had NO path to see or act on them — every request stayed REQUESTED
// forever. This list route pairs with PATCH /api/admin/returns/[id], which
// walks each request through the guarded state machine
// (REQUESTED → APPROVED → RECEIVED → REFUNDED; REQUESTED → REJECTED terminal).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

const RETURN_QUEUE_CAP = 100

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const returns = await db.returnRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: RETURN_QUEUE_CAP,
    include: {
      order: { select: { orderNumber: true, email: true, status: true, totalMinor: true } },
      items: {
        include: { orderItem: { select: { titleEn: true, titleFa: true, quantity: true, unitPriceMinor: true } } },
      },
    },
  })

  return json({
    returns: returns.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      details: r.details,
      resolution: r.resolution,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      orderNumber: r.order.orderNumber,
      orderEmail: r.order.email,
      orderStatus: r.order.status,
      items: r.items.map((i) => ({
        id: i.id,
        titleEn: i.orderItem.titleEn,
        titleFa: i.orderItem.titleFa,
        quantity: i.quantity,
        lineTotalMinor: i.orderItem.unitPriceMinor * i.quantity,
        restocked: i.restocked,
      })),
      itemsTotalMinor: r.items.reduce((s, i) => s + i.orderItem.unitPriceMinor * i.quantity, 0),
    })),
  })
}
