// GET /api/cart — current cart payload. DELETE /api/cart — clear all items.
import { clearCartItems, getCartPayload, getOrCreateCart } from '@/lib/server/cart'
import { json } from '@/lib/server/utils'

export async function GET() {
  const payload = await getCartPayload()
  return json(payload)
}

export async function DELETE() {
  const cart = await getOrCreateCart()
  await clearCartItems(cart.id)
  const payload = await getCartPayload()
  return json(payload)
}
