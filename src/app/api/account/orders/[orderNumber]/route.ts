// GET /api/account/orders/[orderNumber] — full order detail with ownership check.
// Items carry resolved author names (title+author is what a customer needs —
// raw book IDs/SKUs are not human information), the raw timeline events the
// "Updates" list renders, and the derived canonical `timeline` (same
// {stage, at}[] shape as the guest /track endpoint) that the shared
// OrderStepper component consumes.
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { getPublicOrderTimeline } from '@/lib/server/order-timeline'
import { apiError, json, parseJsonSafe, safeTrackingUrl } from '@/lib/server/utils'

export async function GET(_req: Request, ctx: { params: Promise<{ orderNumber: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const { orderNumber } = await ctx.params
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      shipments: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'asc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      returns: { include: { items: true } },
    },
  })
  // Not found OR not owned → same 404 (no existence leak).
  if (!order || order.userId !== user.id) return apiError(404, 'NOT_FOUND', 'Order not found')

  const payment = order.payments[0] ?? null
  const shipment = order.shipments[0] ?? null
  // Derived canonical stages (PENDING_PAYMENT→DELIVERED with real timestamps)
  // — ONE source of truth shared with /track; the client stepper never parses
  // event strings itself.
  const timeline = await getPublicOrderTimeline(order.id)

  // Resolve authors for every item in ONE query: orderItem.variantId →
  // variant.product.contributors (AUTHOR role) → person bilingual names.
  const variantIds = [...new Set(order.items.map((i) => i.variantId).filter((v): v is string => Boolean(v)))]
  const variants = variantIds.length > 0
    ? await db.variant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          product: {
            select: {
              contributors: {
                orderBy: { displayOrder: 'asc' },
                where: { role: 'AUTHOR' },
                select: { person: { select: { translations: { select: { locale: true, name: true } } } } },
              },
            },
          },
        },
      })
    : []
  const authorsByVariant = new Map<string, { en: string[]; fa: string[] }>()
  for (const v of variants) {
    const names = v.product.contributors.flatMap((c) => {
      const en = c.person.translations.find((tr) => tr.locale === 'en')?.name
        ?? c.person.translations[0]?.name
      const fa = c.person.translations.find((tr) => tr.locale === 'fa')?.name ?? en
      return en ? [{ en, fa }] : []
    })
    authorsByVariant.set(v.id, { en: names.map((n) => n.en), fa: names.map((n) => n.fa) })
  }

  return json({
    order: {
      orderNumber: order.orderNumber,
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
      locale: order.locale,
      customerNote: order.customerNote,
      createdAt: order.createdAt.toISOString(),
      email: order.email,
      items: order.items.map((i) => {
        const authors = i.variantId ? authorsByVariant.get(i.variantId) : undefined
        return {
          id: i.id,
          titleEn: i.titleEn,
          titleFa: i.titleFa,
          authorsEn: authors?.en ?? [],
          authorsFa: authors?.fa ?? [],
          sku: i.sku,
          isbn: i.isbn,
          coverUrl: i.coverUrl,
          format: i.format,
          bookLanguage: i.bookLanguage,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
          taxMinor: i.taxMinor,
          totalMinor: i.totalMinor,
        }
      }),
      shippingAddress: parseJsonSafe<Record<string, unknown> | null>(order.shippingAddressJson, null),
      billingAddress: parseJsonSafe<Record<string, unknown> | null>(order.billingAddressJson, null),
      payment: payment
        ? { brand: payment.cardBrand, last4: payment.cardLast4, status: payment.status }
        : null,
      refunds: order.refunds.map((r) => ({
        amountMinor: r.amountMinor,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      shipment: shipment
        ? {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: safeTrackingUrl(shipment.trackingUrl),
            status: shipment.status,
            shippedAt: shipment.shippedAt ? shipment.shippedAt.toISOString() : null,
            estimatedDeliveryAt: shipment.estimatedDeliveryAt ? shipment.estimatedDeliveryAt.toISOString() : null,
            noteCustomer: shipment.noteCustomer,
          }
        : null,
      events: order.events.map((e) => ({
        type: e.type,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
      timeline,
      returns: order.returns.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        resolution: r.resolution,
        createdAt: r.createdAt.toISOString(),
        items: r.items.map((ri) => ({ orderItemId: ri.orderItemId, quantity: ri.quantity })),
      })),
    },
  })
}
