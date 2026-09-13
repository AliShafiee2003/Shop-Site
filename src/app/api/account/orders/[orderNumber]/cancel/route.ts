// POST /api/account/orders/[orderNumber]/cancel — customer-initiated cancellation.
// A commerce flow the audit flagged as missing (§4.1): customers had no way to
// cancel an order that had not shipped yet.
//
// Rules:
// - Ownership required; not-found/not-owned = same 404 (no existence leak).
// - Only PAID / PROCESSING (not yet fulfilled) orders can be cancelled.
// - Everything happens in ONE transaction: guarded status flip (the updateMany
//   only matches the allowed statuses, so double-clicks / races cannot double
//   cancel), full sandbox refund, atomic restock, event log.
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, audit, json } from '@/lib/server/utils'

const bodySchema = z.object({
  reason: z.string().max(300).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ orderNumber: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const { orderNumber } = await ctx.params

  let reason = ''
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (parsed.success) reason = parsed.data.reason?.trim() ?? ''
  } catch {
    reason = ''
  }

  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNumber },
      include: { items: true, refunds: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!order || order.userId !== user.id) return { error: apiError(404, 'NOT_FOUND', 'Order not found') as Response }

    if (!['PAID', 'PROCESSING'].includes(order.status) || order.fulfillmentStatus === 'FULFILLED') {
      return { error: apiError(409, 'NOT_CANCELLABLE', 'This order can no longer be cancelled — contact support') as Response }
    }

    // Guarded status flip: only matches still-cancellable orders.
    const flipped = await tx.order.updateMany({
      where: { id: order.id, status: { in: ['PAID', 'PROCESSING'] } },
      data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
    })
    if (flipped.count === 0) {
      return { error: apiError(409, 'NOT_CANCELLABLE', 'This order can no longer be cancelled — contact support') as Response }
    }

    // Full sandbox refund of the successful payment.
    // COM-403: the refund amount is CAPPED at the actually-paid amount minus
    // prior SUCCEEDED refunds (the same ceiling the admin paths compute).
    // Today the status gate above makes this unreachable (a partially-refunded
    // order is PARTIALLY_REFUNDED and not cancellable), but the invariant is
    // now explicit: any future relaxation of the gate can never over-refund.
    const payment = order.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
    const refundedSoFar = order.refunds
      .filter((r) => r.status === 'SUCCEEDED')
      .reduce((s, r) => s + r.amountMinor, 0)
    const refundedMinor = Math.max(0, order.totalMinor - refundedSoFar)
    if (payment && refundedMinor > 0) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
      await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amountMinor: refundedMinor,
          reason: reason || 'Customer cancellation',
          providerRef: `re_cxl_${order.orderNumber}`,
          status: 'SUCCEEDED',
          actorEmail: 'customer:self-service',
        },
      })
    }

    // Atomic restock (soldCount only walks back when it stays ≥ 0).
    for (const item of order.items) {
      if (!item.variantId) continue
      await tx.variant.updateMany({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      })
      await tx.variant.updateMany({
        where: { id: item.variantId, soldCount: { gte: item.quantity } },
        data: { soldCount: { decrement: item.quantity } },
      })
    }

    // Best-effort discount usage rollback.
    if (order.discountCode) {
      await tx.discountCode.updateMany({
        where: { code: order.discountCode, timesUsed: { gt: 0 } },
        data: { timesUsed: { decrement: 1 } },
      })
    }

    await tx.orderEvent.createMany({
      data: [
        { orderId: order.id, type: 'CANCELLED', message: `Order cancelled by customer${reason ? ` — ${reason}` : ''}`, actor: 'customer:self-service' },
        { orderId: order.id, type: 'EMAIL_QUEUED', message: 'Cancellation confirmation email queued (sandbox)', actor: 'system' },
      ],
    })

    return { orderNumber: order.orderNumber, status: 'CANCELLED' as const, paymentStatus: 'REFUNDED' as const, refundedMinor }
  })

  if ('error' in result && result.error) return result.error
  const ok = result as { orderNumber: string; status: string; paymentStatus: string; refundedMinor: number }
  await audit(user.email, 'ORDER_CANCELLED', 'Order', ok.orderNumber, `Customer cancelled ${ok.orderNumber}${reason ? `: ${reason}` : ''}`)

  return json({ order: { orderNumber: ok.orderNumber, status: ok.status, paymentStatus: ok.paymentStatus }, refundedMinor: ok.refundedMinor })
}
