// PATCH /api/admin/returns/[id] — the ReturnRequest decision state machine
// (COM-401: the return loop was a dead-end — customers could submit a request
// but no admin path existed to approve/receive/refund it).
//
// Guarded transitions (mirrors the admin order-cancel COM-409 pattern):
//   approve        REQUESTED → APPROVED
//   reject         REQUESTED → REJECTED (terminal)
//   mark-received  APPROVED → RECEIVED  + restock the returned units
//   refund         APPROVED|RECEIVED → REFUNDED + Refund row (ceiling-capped)
//                  + restock if not already done
// The status flip is a GUARDED updateMany on the pre-read status inside the tx,
// so two concurrent decisions can never both restock/double-refund: the loser
// sees count=0 and aborts with 409 RETURN_STATE_CHANGED. Restock is exactly-once
// per item via the ReturnItem.restocked flag (only flag=false rows increment).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'
import { queueReturnDecisionEmail } from '@/lib/server/order-mail'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject', 'mark-received', 'refund']),
  note: z.string().max(500).optional(),
})

/** Target status per action. */
const TARGET: Record<string, string> = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  'mark-received': 'RECEIVED',
  refund: 'REFUNDED',
}
/** Allowed source statuses per action — anything else is an invalid transition. */
const FROM: Record<string, string[]> = {
  approve: ['REQUESTED'],
  reject: ['REQUESTED'],
  'mark-received': ['APPROVED'],
  refund: ['APPROVED', 'RECEIVED'],
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { action, note } = parsed.data

  // Pre-read (also drives the friendly 400 before any tx work).
  const current = await db.returnRequest.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true, email: true, locale: true, status: true, totalMinor: true } },
      items: { include: { orderItem: { select: { id: true, unitPriceMinor: true } } } },
    },
  })
  if (!current) return apiError(404, 'NOT_FOUND', 'Return request not found')
  if (!FROM[action].includes(current.status)) {
    return apiError(
      400,
      'INVALID_TRANSITION',
      `Cannot ${action} a return request in status ${current.status}`,
    )
  }

  type Decision = {
    status: string
    restockedCount: number
    refundedMinor: number
    orderNumber: string
    orderEmail: string
    locale: string
    itemsTotalMinor: number
  }
  let decision: Decision

  try {
    decision = await db.$transaction<Decision>(async (tx) => {
      // Postgres parity with the owner refund route: serialize concurrent
      // decisions on the same return row (SQLite already single-writer).
      if (process.env.DATABASE_URL?.startsWith('postgres')) {
        await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${id} FOR UPDATE`
      }

      // Guarded flip — the loser of a race gets count=0 and aborts.
      const flip = await tx.returnRequest.updateMany({
        where: { id, status: { in: FROM[action] } },
        data: { status: TARGET[action], decidedBy: user.email, decidedAt: new Date() },
      })
      if (flip.count === 0) throw new Error('RETURN_STATE_CHANGED')

      // Restock: put returned units back on the shelf — the admin-cancel
      // pattern (increment stock, skip items whose variant row is gone).
      // Exactly-once: only ReturnItem rows not yet flagged restocked.
      // ONLY the goods-in-hand actions restock — approve/reject must never
      // touch inventory (the customer still physically holds the items).
      let restockedCount = 0
      if (action === 'mark-received' || action === 'refund') {
        const items = await tx.returnItem.findMany({
          where: { returnId: id, restocked: false, orderItem: { variantId: { not: null } } },
          include: { orderItem: { select: { id: true, variantId: true } } },
        })
        for (const item of items) {
          if (!item.orderItem.variantId) continue
          const variant = await tx.variant.findUnique({ where: { id: item.orderItem.variantId } })
          if (!variant) continue
          await tx.variant.update({
            where: { id: variant.id },
            data: { stock: { increment: item.quantity } },
          })
          await tx.returnItem.update({ where: { id: item.id }, data: { restocked: true } })
          restockedCount += 1
        }
      }

      // Refund: amount = the returned items' value, capped at what the order
      // still owes (totalMinor − prior SUCCEEDED refunds) — never over-refund.
      const order = await tx.order.findUniqueOrThrow({
        where: { id: current.orderId },
        select: {
          id: true, orderNumber: true, status: true, totalMinor: true,
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      })
      let refundedMinor = 0
      if (action === 'refund') {
        const itemsTotalMinor = current.items.reduce((s, i) => s + i.orderItem.unitPriceMinor * i.quantity, 0)
        const succeededRefunds = await tx.refund.findMany({ where: { orderId: order.id, status: 'SUCCEEDED' } })
        const alreadyRefunded = succeededRefunds.reduce((s, r) => s + r.amountMinor, 0)
        refundedMinor = Math.max(0, Math.min(itemsTotalMinor, order.totalMinor - alreadyRefunded))
        const payment = order.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
        if (refundedMinor > 0 && payment) {
          await tx.refund.create({
            data: {
              orderId: order.id,
              paymentId: payment.id,
              amountMinor: refundedMinor,
              reason: note ? `RETURN: ${note}` : 'RETURN',
              providerRef: `re_ret_${randomUUID()}`,
              status: 'SUCCEEDED',
              actorEmail: user.email,
            },
          })
          const totalRefunded = alreadyRefunded + refundedMinor
          const paymentStatus = totalRefunded >= order.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
          await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } })
          // Preserve the fulfilment lifecycle — mirror the refund into the
          // order status only when it has not progressed beyond PROCESSING
          // (same rule as the owner refund route).
          const fulfilmentStatuses = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'CANCELLED']
          const orderStatus = fulfilmentStatuses.includes(order.status)
            ? paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
            : order.status
          await tx.order.update({ where: { id: order.id }, data: { status: orderStatus, paymentStatus } })
        }
      }

      // Customer-visible timeline event (type RETURN / REFUND — both rendered).
      const eventMessage: Record<string, string> = {
        approve: 'Return request approved',
        reject: `Return request rejected${note ? ` — ${note}` : ''}`,
        'mark-received': `Returned goods received and restocked (${restockedCount} line item(s))`,
        refund:
          refundedMinor > 0
            ? `Refund of ${refundedMinor} minor units issued for the return`
            : 'Return closed as refunded — no refundable amount remained',
      }
      await tx.orderEvent.create({
        data: {
          orderId: current.orderId,
          type: action === 'refund' ? 'REFUND' : 'RETURN',
          message: `${eventMessage[action]} (${current.order.orderNumber})${note && action !== 'reject' ? ` — ${note}` : ''}`,
          actor: user.email,
        },
      })

      return {
        status: TARGET[action],
        restockedCount,
        refundedMinor,
        orderNumber: current.order.orderNumber,
        orderEmail: current.order.email,
        locale: current.order.locale,
        itemsTotalMinor: current.items.reduce((s, i) => s + i.orderItem.unitPriceMinor * i.quantity, 0),
      }
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'RETURN_STATE_CHANGED') {
      return apiError(409, 'RETURN_STATE_CHANGED', 'Return request was already changed by another decision — reload and retry')
    }
    // Contention hardening: under a parallel burst SQLite can abort a queued
    // tx with P1008 (socket timeout waiting for the write lock) or P2034
    // (write conflict). Nothing was committed — surface the same 409 the race
    // loser gets so the client retries instead of seeing a raw 500.
    if (
      e instanceof Error &&
      'code' in e &&
      ['P1008', 'P2034'].includes(String((e as { code: unknown }).code))
    ) {
      return apiError(409, 'RETURN_STATE_CHANGED', 'Return decision could not be applied under contention — reload and retry')
    }
    throw e
  }

  // Audit every decision (never throws).
  const auditAction: Record<string, string> = {
    approve: 'RETURN_APPROVED',
    reject: 'RETURN_REJECTED',
    'mark-received': 'RETURN_RECEIVED',
    refund: 'RETURN_REFUNDED',
  }
  const auditSummary: Record<string, string> = {
    approve: `Return approved on ${decision.orderNumber}`,
    reject: `Return rejected on ${decision.orderNumber}${note ? `: ${note}` : ''}`,
    'mark-received': `Return received; restocked ${decision.restockedCount} line item(s) on ${decision.orderNumber}`,
    refund: `Return refund ${decision.refundedMinor} on ${decision.orderNumber}: RETURN`,
  }
  await audit(user.email, auditAction[action], 'ReturnRequest', id, auditSummary[action])

  // Best-effort customer mail via the real outbox — a mail outage must never
  // fail an admin decision (same contract as the order lifecycle mails).
  await queueReturnDecisionEmail(
    { orderId: current.orderId, orderNumber: decision.orderNumber, email: decision.orderEmail, locale: decision.locale },
    { action, itemsTotalMinor: decision.itemsTotalMinor, refundedMinor: decision.refundedMinor },
  ).catch(() => undefined)

  return json({
    return: {
      id,
      status: decision.status,
      restockedCount: decision.restockedCount,
      refundedMinor: decision.refundedMinor,
    },
  })
}
