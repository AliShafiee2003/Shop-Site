// POST /api/admin/orders/[id]/refund — OWNER only; records a sandbox refund (audited).
// S7: the whole operation runs in ONE interactive transaction. The refundable
// ceiling is recomputed from a fresh read inside the tx, so two concurrent
// refunds can never both pass the "remaining" check and over-refund. The order
// status machine is preserved too — a SHIPPED/DELIVERED order keeps its
// fulfilment status; only paymentStatus reflects the refund.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireOwner } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const refundSchema = z.object({
  amountMinor: z.number().int().min(1),
  reason: z.string().min(1).max(500),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireOwner()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = refundSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const amountMinor = parsed.data.amountMinor

  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 }, refunds: true },
    })
    if (!order) return { error: apiError(404, 'NOT_FOUND', 'Order not found') as Response }

    const payment = order.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
    if (!payment) {
      return { error: apiError(400, 'NO_PAYMENT', 'No successful payment to refund') as Response }
    }

    // Audit DB-001: on Postgres (Read Committed) two concurrent refunds could
    // both read the SAME already-refunded total here and both pass the ceiling
    // check → over-refund. Lock the order row for the rest of the tx so
    // concurrent refunds serialize on the cap computation. SQLite has a single
    // writer per database (writes already serialize); the lock is applied only
    // when a Postgres URL is detected, so nothing changes in the sandbox.
    if (process.env.DATABASE_URL?.startsWith('postgres')) {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
    }

    // Fresh ceiling computed INSIDE the tx — concurrent refunds serialize here.
    const alreadyRefunded = order.refunds
      .filter((r) => r.status === 'SUCCEEDED')
      .reduce((s, r) => s + r.amountMinor, 0)
    const refundable = order.totalMinor - alreadyRefunded
    if (amountMinor > refundable) {
      return { error: apiError(400, 'REFUND_EXCEEDS_TOTAL', `Only ${refundable} minor units remain refundable`) as Response }
    }

    const refund = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        amountMinor,
        reason: parsed.data.reason,
        providerRef: `re_sbx_${randomUUID()}`,
        status: 'SUCCEEDED',
        actorEmail: user.email,
      },
    })

    const totalRefunded = alreadyRefunded + amountMinor
    const paymentStatus = totalRefunded >= order.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED'

    await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } })
    // Preserve the fulfilment lifecycle: only mirror the refund into the order
    // status when the order has not progressed beyond PROCESSING.
    const fulfilmentStatuses = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'CANCELLED']
    const orderStatus = fulfilmentStatuses.includes(order.status)
      ? paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      : order.status
    await tx.order.update({ where: { id: order.id }, data: { status: orderStatus, paymentStatus } })

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'REFUND',
        message: `Refund of ${amountMinor} minor units (${parsed.data.reason})`,
        actor: user.email,
      },
    })

    return { refund, order: { status: orderStatus, paymentStatus }, orderNumber: order.orderNumber }
  })

  if ('error' in result && result.error) return result.error

  const ok = result as { refund: unknown; order: { status: string; paymentStatus: string }; orderNumber: string }
  await audit(user.email, 'REFUND', 'Order', id, `Refund ${amountMinor} on ${ok.orderNumber}: ${parsed.data.reason}`)

  return json({ refund: ok.refund, order: ok.order })
}
