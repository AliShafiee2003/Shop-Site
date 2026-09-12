// POST /api/discount/validate — validate a promo code against the current cart subtotal.
// Rate-limited: 10 attempts / minute / IP (brute-force protection).
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { getCartPayload } from '@/lib/server/cart'
import { toDiscountPublic, validateDiscount } from '@/lib/server/discounts'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({ code: z.string().min(2).max(40) })

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:discount-validate`, 10, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a minute.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const cart = await getCartPayload()
  const result = await validateDiscount(
    parsed.data.code,
    cart.subtotalMinor,
    undefined,
    cart.items.map((i) => ({ productId: i.productId, lineTotalMinor: i.lineTotalMinor })),
  )
  if (!result.ok) return apiError(422, `DISCOUNT_${result.reason}`, rejectionMessage(result.reason))

  return json({
    valid: true,
    discount: toDiscountPublic(result.dc, result.discountMinor),
    subtotalMinor: cart.subtotalMinor,
  })
}

function rejectionMessage(reason: string): string {
  switch (reason) {
    case 'INACTIVE': return 'This code is no longer active.'
    case 'NOT_STARTED': return 'This code is not active yet.'
    case 'EXPIRED': return 'This code has expired.'
    case 'MIN_SUBTOTAL': return 'Your order does not meet the minimum for this code.'
    case 'EXHAUSTED': return 'This code has reached its redemption limit.'
    case 'NO_ELIGIBLE_ITEMS': return 'This code does not apply to the items in your cart.'
    default: return 'This code is not valid.'
  }
}
