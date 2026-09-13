// GET/PATCH /api/admin/orders/[id] — full detail + validated status transitions (audited).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, parseJsonSafe, zodMessage } from '@/lib/server/utils'

const ORDER_STATUSES = [
  'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED',
] as const
const FULFILLMENT_STATUSES = ['UNFULFILLED', 'PARTIAL', 'FULFILLED', 'DELIVERED'] as const

/** Allowed status transitions — e.g. a SHIPPED order can never be cancelled. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'SHIPPED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  DELIVERED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: { orderBy: { createdAt: 'desc' } },
      shipments: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'asc' } },
      refunds: true,
      returns: { include: { items: true } },
    },
  })
  if (!order) return apiError(404, 'NOT_FOUND', 'Order not found')

  return json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      userId: order.userId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      subtotalMinor: order.subtotalMinor,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      discountMinor: order.discountMinor,
      discountCode: order.discountCode,
      giftWrap: order.giftWrap,
      giftWrapMinor: order.giftWrapMinor,
      giftMessage: order.giftMessage,
      shippingMethodName: order.shippingMethodName,
      shippingZone: order.shippingZone,
      locale: order.locale,
      customerNote: order.customerNote,
      internalNote: order.internalNote,
      consents: parseJsonSafe<Record<string, unknown> | null>(order.consentsJson, null),
      shippingAddress: parseJsonSafe<Record<string, unknown> | null>(order.shippingAddressJson, null),
      billingAddress: parseJsonSafe<Record<string, unknown> | null>(order.billingAddressJson, null),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items,
      payments: order.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        providerIntentId: p.providerIntentId,
        amountMinor: p.amountMinor,
        status: p.status,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
        failureReason: p.failureReason,
        createdAt: p.createdAt.toISOString(),
      })),
      shipments: order.shipments,
      refunds: order.refunds,
      events: order.events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        actor: e.actor,
        createdAt: e.createdAt.toISOString(),
      })),
      returns: order.returns.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        details: r.details,
        resolution: r.resolution,
        createdAt: r.createdAt.toISOString(),
        items: r.items,
      })),
    },
  })
}

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
  noteInternal: z.string().optional().nullable(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const order = await db.order.findUnique({ where: { id } })
  if (!order) return apiError(404, 'NOT_FOUND', 'Order not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { status, fulfillmentStatus, noteInternal } = parsed.data

  if (status && status !== order.status) {
    const allowed = TRANSITIONS[order.status] ?? []
    if (!allowed.includes(status)) {
      return apiError(400, 'INVALID_TRANSITION', `Cannot change status from ${order.status} to ${status}`)
    }
  }

  const patchData = {
    ...(status ? { status } : {}),
    ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
    ...(noteInternal !== undefined ? { internalNote: noteInternal } : {}),
  }

  type UpdatedOrder = { id: string; status: string; fulfillmentStatus: string }
  let updated: UpdatedOrder

  if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
    // COM-004: an admin cancellation now mirrors the customer-cancel path —
    // status flip + restock + a FULL refund of the remaining refundable amount
    // all run in ONE transaction, so a failure mid-way can never leave a
    // CANCELLED order with paymentStatus stuck on SUCCEEDED.
    // COM-409: the flip is a GUARDED updateMany on the pre-read status — two
    // concurrent PATCHes can no longer both restock (the loser sees count=0
    // and aborts with 409 instead of double-restocking the shelf).
    let result: { order: UpdatedOrder; items: { id: string }[]; refundedMinor: number }
    try {
      result = await db.$transaction(async (tx) => {
        const flip = await tx.order.updateMany({
          where: { id, status: order.status },
          data: patchData,
        })
        if (flip.count === 0) throw new Error('ORDER_STATE_CHANGED')
        const o = (await tx.order.findUniqueOrThrow({
          where: { id },
          select: { id: true, status: true, fulfillmentStatus: true },
        })) as UpdatedOrder

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: `STATUS_${status}`,
          message: `Status changed ${order.status} → ${status}`,
          actor: user.email,
        },
      })

      // Restock: put the cancelled units back on the shelf (same behaviour as
      // before — items without a live variant skip).
      const items = await tx.orderItem.findMany({ where: { orderId: order.id, variantId: { not: null } } })
      for (const item of items) {
        if (!item.variantId) continue
        const variant = await tx.variant.findUnique({ where: { id: item.variantId } })
        if (!variant) continue
        await tx.variant.update({
          where: { id: variant.id },
          data: { stock: { increment: item.quantity } },
        })
      }

      // Full refund when a successful payment exists (ceiling recomputed from
      // fresh SUCCEEDED refund rows inside the tx — mirrors the owner refund
      // route so a prior partial refund is honoured, never over-refunded).
      let refundedMinor = 0
      const payment = (
        await tx.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' }, take: 1 })
      )[0]
      if (payment && (payment.status === 'SUCCEEDED' || payment.status === 'PARTIALLY_REFUNDED')) {
        const succeededRefunds = await tx.refund.findMany({ where: { orderId: order.id, status: 'SUCCEEDED' } })
        const alreadyRefunded = succeededRefunds.reduce((s, r) => s + r.amountMinor, 0)
        refundedMinor = Math.max(0, order.totalMinor - alreadyRefunded)
        if (refundedMinor > 0) {
          await tx.refund.create({
            data: {
              orderId: order.id,
              paymentId: payment.id,
              amountMinor: refundedMinor,
              reason: 'ADMIN_CANCELLATION',
              providerRef: `re_adm_cxl_${randomUUID()}`,
              status: 'SUCCEEDED',
              actorEmail: user.email,
            },
          })
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'REFUNDED' } })
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'REFUND',
              message: `Refund of ${refundedMinor} minor units (order cancelled by admin)`,
              actor: user.email,
            },
          })
        }
      }

      return { order: o as UpdatedOrder, items, refundedMinor }
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'ORDER_STATE_CHANGED') {
        return apiError(409, 'ORDER_STATE_CHANGED', 'Order was already changed by another request — reload and retry')
      }
      throw e
    }
    updated = result.order

    await audit(user.email, 'ORDER_STATUS', 'Order', order.id, `Status ${order.status} → ${status} (${order.orderNumber})`)
    if (result.items.length > 0) {
      await audit(user.email, 'STOCK_RESTORE', 'Order', order.id, `Cancel restored stock for ${result.items.length} line item(s) (${order.orderNumber})`)
    }
    if (result.refundedMinor > 0) {
      await audit(user.email, 'REFUND', 'Order', order.id, `Full refund ${result.refundedMinor} on ${order.orderNumber}: ADMIN_CANCELLATION`)
    }
  } else {
    updated = await db.order.update({ where: { id }, data: patchData })

    if (status && status !== order.status) {
      // Structured type (STATUS_<TO>) lets the CUSTOMER timeline render a
      // localized stepper stage — the raw message stays for the admin log.
      // (Legacy rows before this change carry type NOTE; the client falls back
      // to parsing "Status changed X → Y" messages for those.)
      await db.orderEvent.create({
        data: {
          orderId: order.id,
          type: `STATUS_${status}`,
          message: `Status changed ${order.status} → ${status}`,
          actor: user.email,
        },
      })
      await audit(user.email, 'ORDER_STATUS', 'Order', order.id, `Status ${order.status} → ${status} (${order.orderNumber})`)
    }
  }

  return json({ order: { id: updated.id, status: updated.status, fulfillmentStatus: updated.fulfillmentStatus } })
}
