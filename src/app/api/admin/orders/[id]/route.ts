// GET/PATCH /api/admin/orders/[id] — full detail + validated status transitions (audited).
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

  const updated = await db.order.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
      ...(noteInternal !== undefined ? { internalNote: noteInternal } : {}),
    },
  })

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

  // Cancelling an order puts its units back on the shelf (audit P1: stock was
  // silently lost on cancellation). Items without a live variant (deleted) skip.
  if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
    const items = await db.orderItem.findMany({ where: { orderId: order.id, variantId: { not: null } } })
    for (const item of items) {
      if (!item.variantId) continue
      const variant = await db.variant.findUnique({ where: { id: item.variantId } })
      if (!variant) continue
      await db.variant.update({
        where: { id: variant.id },
        data: { stock: { increment: item.quantity } },
      })
    }
    if (items.length > 0) {
      await audit(user.email, 'STOCK_RESTORE', 'Order', order.id, `Cancel restored stock for ${items.length} line item(s) (${order.orderNumber})`)
    }
  }

  return json({ order: { id: updated.id, status: updated.status, fulfillmentStatus: updated.fulfillmentStatus } })
}
