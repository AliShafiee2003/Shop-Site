// PATCH /api/cart/items/[itemId] — set quantity (0 = remove), clamped to stock.
// DELETE /api/cart/items/[itemId] — remove item. Both return the updated cart payload.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCartPayload, getOrCreateCart } from '@/lib/server/cart'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  quantity: z.number().int().min(0).max(10),
})

async function loadOwnedItem(itemId: string, cartId: string) {
  return db.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: true } })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params
  // Audit SEC-005: soft cap on mutation storms (60 adds + 120 edits/min/IP is
  // far beyond any human checkout flow).
  const rl = rateLimit(`${clientIp(req)}:cart-item`, 120, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many cart updates. Please slow down.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { quantity } = parsed.data

  const cart = await getOrCreateCart()
  const item = await loadOwnedItem(itemId, cart.id)
  if (!item) return apiError(404, 'NOT_FOUND', 'Cart item not found')

  if (quantity === 0) {
    await db.cartItem.delete({ where: { id: item.id } })
    return json(await getCartPayload())
  }

  // Server-authoritative: clamp to current stock (stock 0 → item removed).
  const target = Math.min(quantity, Math.max(0, item.variant.stock))
  const clamped = target !== quantity
  if (target <= 0) {
    await db.cartItem.delete({ where: { id: item.id } })
    return json({ ...(await getCartPayload()), clamped: true })
  }
  if (target !== item.quantity) {
    await db.cartItem.update({ where: { id: item.id }, data: { quantity: target } })
  }
  const payload = await getCartPayload()
  return json(clamped ? { ...payload, clamped: true } : payload)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params
  const rl = rateLimit(`${clientIp(req)}:cart-item`, 120, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many cart updates. Please slow down.')
  const cart = await getOrCreateCart()
  const item = await loadOwnedItem(itemId, cart.id)
  if (!item) return apiError(404, 'NOT_FOUND', 'Cart item not found')
  await db.cartItem.delete({ where: { id: item.id } })
  return json(await getCartPayload())
}
