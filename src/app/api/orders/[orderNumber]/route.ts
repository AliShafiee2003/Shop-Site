// GET /api/orders/[orderNumber]?email= — guest order status lookup (rate limited).
//
// C6: the sequential order number (SP-YY-MM-DD-NNNN, restarts daily at 0001)
// plus a known email made status enumerable. Orders now also carry an
// unguessable `publicRef` (PR-…); a publicRef lookup needs NO email and
// returns the same payload. Number+email lookup stays for legacy links.
// giftMessage (private) is no longer part of the response, and the
// email-mismatch error is indistinguishable from not-found (S9).
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { getPublicOrderTimeline } from '@/lib/server/order-timeline'
import { apiError, clientIp, json, safeTrackingUrl } from '@/lib/server/utils'

/** PublicRef shape minted by checkout: PR-<base64url token>. */
function isPublicRef(raw: string): boolean {
  return /^PR-[A-Za-z0-9_-]{16,}$/.test(raw)
}

/** Customers quote the COMPACT code (SP2612130011); the DB stores SP-26-12-13-0011.
 *  Accept both — plus the legacy PPX shape — by re-dashing before the exact lookup. */
function normalizeOrderCode(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (t.includes('-')) return t
  const m = t.match(/^(?:SP)?(\d{2})(\d{2})(\d{2})(\d{4})$/)
  if (m) return `SP-${m[1]}-${m[2]}-${m[3]}-${m[4]}`
  const legacy = t.match(/^PPX(\d{4})(\d{5})$/)
  if (legacy) return `PPX-${legacy[1]}-${legacy[2]}`
  return t
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderNumber: string }> }) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:order-lookup`, 10, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many lookups. Please wait a minute.')

  const { orderNumber: rawCode } = await ctx.params
  const code = decodeURIComponent(rawCode).trim()
  const email = (req.nextUrl.searchParams.get('email') ?? '').toLowerCase().trim()

  let order: {
    id: string
    orderNumber: string
    publicRef: string | null
    status: string
    paymentStatus: string
    fulfillmentStatus: string
    totalMinor: number
    discountCode: string | null
    giftWrap: boolean
    giftWrapMinor: number
    currency: string
    createdAt: Date
    items: { titleEn: string; quantity: number; unitPriceMinor: number; coverUrl: string | null }[]
    shipments: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; estimatedDeliveryAt: Date | null }[]
  } | null = null

  if (isPublicRef(code)) {
    // Unguessable reference — no email required.
    order = await db.order.findUnique({
      where: { publicRef: code },
      include: { items: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
  } else {
    if (!email) return apiError(400, 'VALIDATION_ERROR', 'email query parameter is required')
    const candidate = await db.order.findUnique({
      where: { orderNumber: normalizeOrderCode(code) },
      include: { items: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    // S9: mismatch and not-found return the SAME error — an attacker must not
    // learn whether an order number exists for someone else's email.
    if (!candidate || candidate.email.toLowerCase() !== email) {
      return apiError(404, 'NOT_FOUND', 'Order not found')
    }
    order = candidate
  }

  if (!order) return apiError(404, 'NOT_FOUND', 'Order not found')

  const shipment = order.shipments[0] ?? null
  // Backend-driven lifecycle stages for the /track stepper ({stage, at} only
  // — internal event messages never cross the guest boundary).
  const timeline = await getPublicOrderTimeline(order.id)

  return json({
    order: {
      orderNumber: order.orderNumber,
      publicRef: order.publicRef,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalMinor: order.totalMinor,
      discountCode: order.discountCode,
      giftWrap: order.giftWrap,
      giftWrapMinor: order.giftWrapMinor,
      // C6: giftMessage removed — it is private content, not order status.
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      timeline,
      items: order.items.map((i) => ({
        title: i.titleEn,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        coverUrl: i.coverUrl,
      })),
      shipment: shipment
        ? {
            carrier: shipment.carrier,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: safeTrackingUrl(shipment.trackingUrl),
            status: shipment.status,
            estimatedDeliveryAt: shipment.estimatedDeliveryAt ? shipment.estimatedDeliveryAt.toISOString() : null,
          }
        : null,
    },
  })
}
