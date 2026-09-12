// POST /api/cart/items — add { variantId, quantity } (server-authoritative stock clamping).
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCartPayload, getOrCreateCart, MAX_QTY_PER_ITEM } from '@/lib/server/cart'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { variantId, quantity } = parsed.data

  const variant = await db.variant.findUnique({
    where: { id: variantId },
    include: { product: { select: { status: true } } },
  })
  if (!variant || !variant.isActive || variant.product.status !== 'PUBLISHED') {
    return apiError(404, 'NOT_FOUND', 'Variant not available')
  }
  if (variant.stock === 0) return apiError(409, 'OUT_OF_STOCK', 'This item is out of stock')

  const cart = await getOrCreateCart()
  const target = Math.min(quantity, MAX_QTY_PER_ITEM, variant.stock)
  const clamped = target !== quantity

  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  })

  if (existing) {
    const merged = Math.min(existing.quantity + target, MAX_QTY_PER_ITEM, variant.stock)
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } })
  } else {
    await db.cartItem.create({ data: { cartId: cart.id, variantId, quantity: target } })
  }

  const payload = await getCartPayload()
  return json(clamped ? { ...payload, clamped: true } : payload)
}
