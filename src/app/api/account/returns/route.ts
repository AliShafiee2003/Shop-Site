// GET/POST /api/account/returns — list own return requests / create one for a paid order.
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const PAID_STATUSES = ['PAID', 'SHIPPED', 'DELIVERED']

const bodySchema = z.object({
  orderNumber: z.string().min(1),
  reason: z.string().min(1),
  details: z.string().optional().nullable(),
  resolution: z.enum(['REFUND', 'REPLACEMENT']).optional().nullable(),
  items: z
    .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .min(1),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const returns = await db.returnRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNumber: true } }, items: true },
  })

  return json({
    returns: returns.map((r) => ({
      id: r.id,
      orderNumber: r.order.orderNumber,
      status: r.status,
      reason: r.reason,
      resolution: r.resolution,
      createdAt: r.createdAt.toISOString(),
      itemCount: r.items.reduce((s, i) => s + i.quantity, 0),
    })),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { orderNumber, reason, details, resolution, items } = parsed.data

  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  })
  if (!order || order.userId !== user.id) return apiError(404, 'NOT_FOUND', 'Order not found')
  if (!PAID_STATUSES.includes(order.status)) {
    return apiError(400, 'ORDER_NOT_RETURNABLE', 'Only paid, shipped or delivered orders can be returned')
  }

  // All items must belong to the order with sufficient quantity.
  for (const item of items) {
    const orderItem = order.items.find((oi) => oi.id === item.orderItemId)
    if (!orderItem) return apiError(400, 'VALIDATION_ERROR', 'Return item does not belong to this order')
    if (item.quantity > orderItem.quantity) {
      return apiError(400, 'VALIDATION_ERROR', 'Return quantity exceeds purchased quantity')
    }
  }

  const returnRequest = await db.returnRequest.create({
    data: {
      orderId: order.id,
      userId: user.id,
      status: 'REQUESTED',
      reason,
      details: details ?? null,
      resolution: resolution ?? null,
      items: {
        create: items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
      },
    },
    include: { items: true },
  })

  await db.orderEvent.create({
    data: {
      orderId: order.id,
      type: 'RETURN',
      message: `Return requested (${returnRequest.items.length} line items): ${reason}`,
      actor: user.email,
    },
  })

  return json({ returnRequest })
}
