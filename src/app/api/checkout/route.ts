// POST /api/checkout — place an order with the "Persepix Secure Pay" sandbox payment.
// ⚠️ SANDBOX PAYMENT SIMULATION: no real charge happens, and the full card number is
// NEVER stored — only brand + last4 on the Payment row (PCI-safe by design).
// C6: every order also gets an unguessable publicRef (PR-…) for guest tracking.
// Idempotency: an `Idempotency-Key` header (or body idempotencyKey) dedupes
// double-clicks / retries within a 15-minute window — the same key replays the
// FIRST response instead of minting a second order.
import { randomBytes, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCartPayload, getOrCreateCart, type CartPayloadDTO } from '@/lib/server/cart'
import { validateDiscount } from '@/lib/server/discounts'
import { loadGiftWrapConfig } from '@/lib/server/giftwrap'
import { computeTax } from '@/lib/server/money'
import { queueOrderConfirmationEmail, type OrderMailItem, type OrderMailOrder } from '@/lib/server/order-mail'
import { rateLimit } from '@/lib/server/rate-limit'
import { loadShippingSettings, methodServesCountry } from '@/lib/server/shipping'
import { getActivePromotion, promoPriceFor } from '@/lib/server/promotions'
import { apiError, clientIp, json, nextOrderNumber, tehranDayParts, zodMessage } from '@/lib/server/utils'

const addressSchema = z.object({
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  region: z.string().optional().nullable(),
  postalCode: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  phone: z.string().optional().nullable(),
})

const bodySchema = z.object({
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingSame: z.boolean(),
  billingAddress: addressSchema.optional().nullable(),
  shippingMethodId: z.string().min(1),
  discountCode: z.string().max(40).optional().nullable(),
  locale: z.string().default('en'),
  customerNote: z.string().optional().nullable(),
  giftWrap: z.boolean().optional().nullable(),
  giftMessage: z.string().max(300).optional().nullable(),
  consents: z.object({ terms: z.literal(true) }),
  idempotencyKey: z.string().max(100).optional().nullable(),
  card: z.object({
    number: z.string().min(4),
    holder: z.string().min(1),
    expiry: z.string().min(3),
    cvc: z.string().min(3),
  }),
})

type CardResult =
  | { status: 'SUCCEEDED'; brand: string; last4: string }
  | { status: 'FAILED'; reason: string }

// ── Idempotency store (per-process, 15-minute TTL) ──────────────────────────
// A distributed store would be needed for multi-instance deployments; for the
// single-process sandbox this closes the double-click duplicate-order hole.
const idempotencyCache = new Map<string, { expiresAt: number; status: number; body: unknown }>()
const IDEMPOTENCY_TTL_MS = 15 * 60_000

function idempotencyReplay(key: string): { status: number; body: unknown } | null {
  const hit = idempotencyCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    idempotencyCache.delete(key)
    return null
  }
  return { status: hit.status, body: hit.body }
}

function idempotencyRemember(key: string, status: number, body: unknown): void {
  // Bound the map so it can never grow unbounded.
  if (idempotencyCache.size > 1000) {
    const now = Date.now()
    for (const [k, v] of idempotencyCache) if (v.expiresAt < now) idempotencyCache.delete(k)
    if (idempotencyCache.size > 1000) {
      const first = idempotencyCache.keys().next().value
      if (first) idempotencyCache.delete(first)
    }
  }
  idempotencyCache.set(key, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, status, body })
}

/** C6: unguessable public tracking reference. */
function newPublicRef(): string {
  return `PR-${randomBytes(15).toString('base64url')}`
}

/** Sandbox card rules: 4242… → Visa, 5555…4444 → Mastercard, 4000…0002 → declined, any other 16-digit → generic Card. */
function simulatePayment(numberRaw: string): CardResult {
  const digits = numberRaw.replace(/\D/g, '')
  if (digits === '4242424242424242') return { status: 'SUCCEEDED', brand: 'Visa', last4: '4242' }
  if (digits === '5555555555554444') return { status: 'SUCCEEDED', brand: 'Mastercard', last4: '5454' }
  if (digits === '4000000000000002') return { status: 'FAILED', reason: 'card_declined' }
  if (digits.length === 16) return { status: 'SUCCEEDED', brand: 'Card', last4: digits.slice(-4) }
  return { status: 'FAILED', reason: 'invalid_card_number' }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:checkout`, 5, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many checkout attempts. Please wait a minute.')

  // COM-001: the simulation below accepts ANY 16-digit number — acceptable in
  // the sandbox only. Fail closed when a real provider is configured but not
  // integrated: PAYMENT_PROVIDER unset/'' defaults to 'SANDBOX' (historic
  // behaviour); production MUST set PAYMENT_PROVIDER (e.g. stripe) and wire
  // the PSP before this endpoint may take money.
  const paymentProvider = (process.env.PAYMENT_PROVIDER ?? 'SANDBOX').trim().toUpperCase()
  if (paymentProvider !== 'SANDBOX') {
    return apiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', `Payment provider "${paymentProvider}" is not integrated — checkout is disabled until the PSP is wired`)
  }

  // Idempotency: header first, body field as fallback (both accepted).
  const idemKeyRaw = req.headers.get('idempotency-key')?.trim()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const data = parsed.data

  // Replay protection AFTER validation (so a malformed repeat still 400s) but
  // BEFORE any state mutation.
  const idemKey = (idemKeyRaw || data.idempotencyKey || '').slice(0, 100)
  if (idemKey) {
    const replay = idempotencyReplay(idemKey)
    if (replay) return NextResponse.json(replay.body, { status: replay.status })
  }

  if (!data.billingSame && !data.billingAddress) {
    return apiError(400, 'VALIDATION_ERROR', 'billingAddress is required when billingSame is false')
  }

  // ── a. Cart (server-authoritative payload: fresh prices/stock) ──
  const cart: CartPayloadDTO = await getCartPayload()
  if (cart.items.length === 0) return apiError(400, 'EMPTY_CART', 'Your cart is empty')

  // ── c. Shipping method from settings, validated for country ──
  const { methods } = await loadShippingSettings()
  const method = methods.find((m) => m.id === data.shippingMethodId)
  if (!method) return apiError(400, 'SHIPPING_METHOD_INVALID', 'Unknown shipping method')
  const country = data.shippingAddress.countryCode.toUpperCase()
  if (!methodServesCountry(method, country)) {
    return apiError(400, 'COUNTRY_NOT_SERVED', 'The selected shipping method does not serve this country')
  }
  const freeApplied = method.freeOverMinor != null && cart.subtotalMinor >= method.freeOverMinor
  const shippingMinor = freeApplied ? 0 : method.priceMinor
  const shippingMethodLabel = method.labelEn ?? method.id
  const shippingZone = method.zone ?? null

  // ── b/d. Server-side totals ──
  const subtotalMinor = cart.items.reduce((s, i) => s + i.lineTotalMinor, 0)

  // Discount — authoritative re-validation (an invalid/expired code here is a hard 422,
  // so the customer can remove it and retry instead of being silently overcharged).
  let discountCode: string | null = null
  let discountMinor = 0
  if (data.discountCode) {
    const check = await validateDiscount(
      data.discountCode,
      subtotalMinor,
      undefined,
      cart.items.map((i) => ({ productId: i.productId, lineTotalMinor: i.lineTotalMinor })),
    )
    if (!check.ok) return apiError(422, `DISCOUNT_${check.reason}`, 'The discount code is no longer valid — please remove it and try again.')
    discountCode = check.dc.code
    discountMinor = check.discountMinor
  }

  const totalMinorPreGift = subtotalMinor - discountMinor + shippingMinor

  // Gift wrap — server-authoritative fee; silently ignored when the service is disabled.
  const giftWrapConfig = await loadGiftWrapConfig()
  const giftWrap = data.giftWrap === true && giftWrapConfig.enabled
  const giftWrapMinor = giftWrap ? giftWrapConfig.priceMinor : 0
  const giftMessage = giftWrap && data.giftMessage ? data.giftMessage.trim().slice(0, 300) || null : null

  const totalMinor = totalMinorPreGift + giftWrapMinor
  const taxMinor = computeTax(totalMinor)

  // Sitewide promotion snapshot — attributed for analytics/revenue reporting.
  const promoName = cart.promotion && cart.promotion.savedMinor > 0 ? cart.promotion.name : null
  const promoSavedMinor = promoName ? cart.promotion!.savedMinor : 0

  const shippingAddressJson = JSON.stringify({ ...data.shippingAddress, countryCode: country })
  const billingAddressJson = JSON.stringify(
    data.billingSame
      ? { ...data.shippingAddress, countryCode: country }
      : { ...data.billingAddress, countryCode: (data.billingAddress?.countryCode ?? country).toUpperCase() },
  )

  // ── g. Payment simulation BEFORE any stock mutation ──
  const payment = simulatePayment(data.card.number)

  const cartRow = await getOrCreateCart()

  type OrderWithNumber = { orderNumber: string; publicRef: string; status: string; paymentStatus: string; totalMinor: number }
  type PersistResult = { client: OrderWithNumber; mail: OrderMailOrder & { items: OrderMailItem[] } }

  async function persistOrder(paid: boolean, result: CardResult, attempt: number): Promise<PersistResult> {
    return db.$transaction(async (tx) => {
      // Daily sequence (Tehran day) → SP-YY-MM-DD-NNNN; retry bumps the seq past any race collision.
      const { dayStartUTC } = tehranDayParts(new Date())
      const count = await tx.order.count({ where: { createdAt: { gte: dayStartUTC } } })
      const orderNumber = nextOrderNumber(count + attempt)
      const publicRef = newPublicRef()

      // TOCTOU guard: re-read the LIVE variant prices inside the transaction —
      // the cart payload was read before the payment step and prices/promos
      // may have changed. Any drift aborts the whole order (409 to retry).
      // COM-fix: the comparison uses the PROMO-AWARE live price — cart lines
      // are priced through promoPriceFor, so a bare variant price would false-
      // alarm PRICE_CHANGED for every order while a sitewide promotion runs.
      const liveVariants = await tx.variant.findMany({
        where: { id: { in: cart.items.map((i) => i.variantId) } },
        select: {
          id: true,
          priceMinor: true,
          isActive: true,
          product: { select: { id: true, fixedPrice: true } },
        },
      })
      const livePromo = await getActivePromotion()
      const liveById = new Map(liveVariants.map((v) => [v.id, v]))
      for (const item of cart.items) {
        const live = liveById.get(item.variantId)
        const liveSale = live ? promoPriceFor(livePromo, live.priceMinor, live.product.id, live.product.fixedPrice).salePriceMinor : -1
        if (!live || !live.isActive || liveSale !== item.unitPriceMinor) {
          throw new Error('PRICE_CHANGED')
        }
      }

      const order = await tx.order.create({
        data: {
          orderNumber,
          publicRef,
          userId: cartRow.userId,
          email: data.email.toLowerCase().trim(),
          status: paid ? 'PAID' : 'PENDING_PAYMENT',
          paymentStatus: paid ? 'SUCCEEDED' : 'FAILED',
          fulfillmentStatus: 'UNFULFILLED',
          currency: 'EUR',
          subtotalMinor,
          shippingMinor,
          taxMinor,
          totalMinor,
          discountMinor,
          discountCode,
          promoName,
          promoSavedMinor,
          giftWrap,
          giftWrapMinor,
          giftMessage,
          shippingMethodName: shippingMethodLabel,
          shippingZone,
          shippingAddressJson,
          billingAddressJson,
          locale: data.locale,
          customerNote: data.customerNote ?? null,
          consentsJson: JSON.stringify({ terms: '1.0-draft', privacy: '1.0-draft' }),
        },
      })

      await tx.orderItem.createMany({
        data: cart.items.map((i) => ({
          orderId: order.id,
          variantId: i.variantId,
          titleEn: i.titleEn ?? i.title,
          titleFa: i.titleFa ?? i.titleEn ?? i.title,
          sku: i.sku,
          isbn: i.isbn13,
          coverUrl: i.coverUrl,
          format: i.format,
          bookLanguage: i.bookLanguage,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
          taxMinor: computeTax(i.lineTotalMinor),
          totalMinor: i.lineTotalMinor,
        })),
      })

      // Payment row — brand + last4 only, never the full number.
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: 'PERSEPIX_SANDBOX',
          providerIntentId: `pi_sbx_${randomUUID()}`,
          amountMinor: totalMinor,
          currency: 'EUR',
          status: paid ? 'SUCCEEDED' : 'FAILED',
          cardBrand: result.status === 'SUCCEEDED' ? result.brand : null,
          cardLast4: result.status === 'SUCCEEDED' ? result.last4 : null,
          failureReason: result.status === 'FAILED' ? result.reason : null,
        },
      })

      await tx.consentRecord.createMany({
        data: [
          { userId: cartRow.userId, email: data.email.toLowerCase().trim(), checkoutRef: orderNumber, policyType: 'TERMS', policyVersion: '1.0-draft', locale: data.locale, accepted: true, source: 'checkout' },
          { userId: cartRow.userId, email: data.email.toLowerCase().trim(), checkoutRef: orderNumber, policyType: 'PRIVACY', policyVersion: '1.0-draft', locale: data.locale, accepted: true, source: 'checkout' },
        ],
      })

      await tx.orderEvent.createMany({
        data: [
          { orderId: order.id, type: 'CREATED', message: 'Order created', actor: 'system' },
          paid
            ? { orderId: order.id, type: 'PAID', message: `Payment succeeded (${result.status === 'SUCCEEDED' ? result.brand : 'Card'} •••• ${result.status === 'SUCCEEDED' ? result.last4 : ''})`, actor: 'system' }
            : { orderId: order.id, type: 'PAYMENT_FAILED', message: `Payment failed: ${result.status === 'FAILED' ? result.reason : 'unknown'}`, actor: 'system' },
          ...(discountCode
            ? [{ orderId: order.id, type: 'NOTE' as const, message: `Discount code ${discountCode} applied (−${(discountMinor / 100).toFixed(2)} EUR)`, actor: 'system' }]
            : []),
          ...(promoName
            ? [{ orderId: order.id, type: 'NOTE' as const, message: `Sitewide promotion "${promoName}" applied (−${(promoSavedMinor / 100).toFixed(2)} EUR)`, actor: 'system' }]
            : []),
          ...(giftWrap
            ? [{ orderId: order.id, type: 'NOTE' as const, message: `Gift wrap requested${giftMessage ? ' with a hand-written note' : ''} (+${(giftWrapMinor / 100).toFixed(2)} EUR)`, actor: 'system' }]
            : []),
          { orderId: order.id, type: 'EMAIL_QUEUED', message: 'Order confirmation email queued (sandbox)', actor: 'system' },
        ],
      })

      if (paid) {
        // ── e. Atomic stock decrement (rolls back the whole tx on any miss) ──
        for (const item of cart.items) {
          const updated = await tx.variant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity }, soldCount: { increment: item.quantity } },
          })
          if (updated.count === 0) throw new Error('OUT_OF_STOCK')
        }
        // Discount redemption counter (inside the same tx — rolls back with the order).
        // COM-002: the increment is guarded by `timesUsed < maxRedemptions` re-read
        // INSIDE the tx, so two concurrent checkouts can never both pass the cap
        // (the loser's updateMany matches 0 rows → tx aborts with DISCOUNT_EXHAUSTED).
        if (discountCode) {
          const dc = await tx.discountCode.findUnique({
            where: { code: discountCode },
            select: { maxRedemptions: true },
          })
          const bumped = await tx.discountCode.updateMany({
            where: {
              code: discountCode,
              ...(dc?.maxRedemptions != null ? { timesUsed: { lt: dc.maxRedemptions } } : {}),
            },
            data: { timesUsed: { increment: 1 } },
          })
          if (bumped.count === 0) throw new Error('DISCOUNT_EXHAUSTED')
        }
        // ── h. Convert cart ──
        await tx.cart.update({ where: { id: cartRow.id }, data: { status: 'CONVERTED' } })
        await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } })
        // ── i. Personalization purchase signals (best-effort) ──
        try {
          const slugRows = await tx.variant.findMany({
            where: { id: { in: cart.items.map((it) => it.variantId) } },
            select: { product: { select: { slug: true } } },
          })
          for (const row of slugRows) {
            await tx.tasteSignal.create({
              data: {
                userId: cartRow.userId ?? null,
                sessionKey: cartRow.userId ? null : `cart-${cartRow.id}`,
                productSlug: row.product.slug,
                kind: 'purchase',
              },
            })
          }
        } catch {
          // personalization is optional — never block checkout
        }
      }

      // R5: the payload the REAL outbox mail is built from (returned out of
      // the tx, queued after commit — a mail failure must not roll back the
      // order, and the client response shape stays unchanged).
      const mail: PersistResult['mail'] = {
        id: order.id,
        orderNumber,
        publicRef,
        email: order.email,
        locale: order.locale,
        subtotalMinor,
        discountCode,
        discountMinor,
        shippingMinor,
        giftWrap,
        giftWrapMinor,
        totalMinor,
        items: cart.items.map((i) => ({
          titleEn: i.titleEn,
          titleFa: i.titleFa,
          quantity: i.quantity,
          totalMinor: i.lineTotalMinor,
        })),
      }

      return {
        client: { orderNumber, publicRef, status: order.status, paymentStatus: order.paymentStatus, totalMinor },
        mail,
      }
    })
  }

  try {
    if (payment.status === 'FAILED') {
      // Declined: order recorded as PENDING_PAYMENT/FAILED, stock untouched, cart kept for retry.
      await persistOrder(false, payment, 0)
      if (idemKey) idempotencyRemember(idemKey, 402, { error: 'CARD_DECLINED', message: `Payment declined: ${payment.reason}` })
      return apiError(402, 'CARD_DECLINED', `Payment declined: ${payment.reason}`)
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const order = await persistOrder(true, payment, attempt)
        // R5: real ORDER_CONFIRMATION row in the MailMessage outbox (the
        // seam a production SMTP provider consumes). Best-effort — a mail
        // outage must never fail a paid order, but it must be visible.
        try {
          await queueOrderConfirmationEmail(order.mail, order.mail.items, { headers: req.headers })
        } catch (mailErr) {
          console.error('outbox: order confirmation mail failed', mailErr)
        }
        if (idemKey) idempotencyRemember(idemKey, 200, order.client)
        return json(order.client)
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code === 'P2002' && attempt < 3) continue // order-number collision → retry
        throw err
      }
    }
    return apiError(500, 'ORDER_NUMBER_EXHAUSTED', 'Could not allocate an order number')
  } catch (err) {
    if ((err as Error)?.message === 'OUT_OF_STOCK') {
      const res = apiError(409, 'OUT_OF_STOCK', 'One or more items went out of stock while placing your order')
      if (idemKey) idempotencyRemember(idemKey, 409, { error: 'OUT_OF_STOCK' })
      return res
    }
    if ((err as Error)?.message === 'PRICE_CHANGED') {
      if (idemKey) idempotencyRemember(idemKey, 409, { error: 'PRICE_CHANGED' })
      return apiError(409, 'PRICE_CHANGED', 'Prices changed while placing your order — please review your cart and retry')
    }
    if ((err as Error)?.message === 'DISCOUNT_EXHAUSTED') {
      // COM-002: redemption cap hit between validation and the tx — same 422
      // contract (and message) as the other DISCOUNT_* failures above.
      if (idemKey) idempotencyRemember(idemKey, 422, { error: 'DISCOUNT_EXHAUSTED' })
      return apiError(422, 'DISCOUNT_EXHAUSTED', 'The discount code is no longer valid — please remove it and try again.')
    }
    console.error('checkout failed', err)
    return apiError(500, 'INTERNAL_ERROR', 'Could not place the order')
  }
}
