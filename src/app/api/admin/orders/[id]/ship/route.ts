// POST /api/admin/orders/[id]/ship — create shipment, mark order SHIPPED/FULFILLED (audited).
// S19: trackingUrl is now carrier-aware and encoded — the old version stored a
// literal `https://example.com/track/{{number}}` template with the placeholder
// braces unreplaced and an unencoded tracking number.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { queueShippingNoticeEmail } from '@/lib/server/order-mail'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const shipSchema = z.object({
  carrier: z.string().min(1).max(80),
  trackingNumber: z.string().max(80).optional().nullable(),
  noteCustomer: z.string().max(500).optional().nullable(),
})

/** Known carriers → public tracking URL builders. Unknown carriers get no URL
 *  (better than a fake example.com link); numbers are always URL-encoded. */
function trackingUrlFor(carrierRaw: string, trackingNumberRaw: string): string | null {
  const num = encodeURIComponent(trackingNumberRaw.trim())
  const carrier = carrierRaw.trim().toLowerCase()
  if (/(austrian|post\s*at|österreich|osterreich)/.test(carrier)) return `https://www.post.at/en/tracking/${num}`
  if (/\bdhl\b/.test(carrier)) return `https://www.dhl.com/en/express/tracking.html?AWB=${num}&brand=DHL`
  if (/\bdpd\b/.test(carrier)) return `https://www.dpd.com/tracking/${num}`
  if (/\bups\b/.test(carrier)) return `https://www.ups.com/track?tracknum=${num}`
  if (/\bgls\b/.test(carrier)) return `https://gls-group.com/en/parcel-tracking/?match=${num}`
  if (/fedex/.test(carrier)) return `https://www.fedex.com/fedextrack/?trknbr=${num}`
  if (/hermes|evri/.test(carrier)) return `https://www.evri.com/track/${num}`
  if (/dhl\s*packet|deutsche\s*post/.test(carrier)) return `https://www.deutschepost.de/sendung/simpleTracking.html?formKind=shipment&piececode=${num}`
  return null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = shipSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { carrier, trackingNumber, noteCustomer } = parsed.data

  if (!['PAID', 'PROCESSING'].includes(order.status)) {
    return apiError(400, 'INVALID_TRANSITION', `Cannot ship an order in status ${order.status}`)
  }

  const now = new Date()
  const trackingNumberNorm = trackingNumber?.trim() || null
  const shipment = await db.shipment.create({
    data: {
      orderId: order.id,
      carrier,
      trackingNumber: trackingNumberNorm,
      trackingUrl: trackingNumberNorm ? trackingUrlFor(carrier, trackingNumberNorm) : null,
      status: 'SHIPPED',
      shippedAt: now,
      noteCustomer: noteCustomer || null,
    },
  })

  await db.order.update({
    where: { id: order.id },
    data: { status: 'SHIPPED', fulfillmentStatus: 'FULFILLED' },
  })

  await db.orderEvent.createMany({
    data: [
      { orderId: order.id, type: 'SHIPPED', message: `Shipped via ${carrier}${trackingNumberNorm ? ` — tracking ${trackingNumberNorm}` : ''}`, actor: user.email },
      { orderId: order.id, type: 'EMAIL_QUEUED', message: 'Shipping confirmation email queued (sandbox)', actor: 'system' },
    ],
  })

  // R5: real SHIPPING_NOTICE row in the MailMessage outbox (SMTP seam).
  // Best-effort — the shipment must succeed even if the outbox is unhappy.
  try {
    const items = await db.orderItem.findMany({
      where: { orderId: order.id },
      select: { titleEn: true, titleFa: true, quantity: true, totalMinor: true },
    })
    await queueShippingNoticeEmail(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        publicRef: order.publicRef,
        email: order.email,
        locale: order.locale,
        subtotalMinor: order.subtotalMinor,
        discountCode: order.discountCode,
        discountMinor: order.discountMinor,
        shippingMinor: order.shippingMinor,
        giftWrap: order.giftWrap,
        giftWrapMinor: order.giftWrapMinor,
        totalMinor: order.totalMinor,
      },
      { carrier, trackingNumber: trackingNumberNorm, trackingUrl: shipment.trackingUrl },
      items,
      { headers: req.headers },
    )
  } catch { /* outbox is best-effort */ }

  await audit(user.email, 'ORDER_SHIPPED', 'Order', order.id, `Order ${order.orderNumber} shipped via ${carrier}`)

  return json({ shipment })
}
