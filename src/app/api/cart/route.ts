// GET /api/cart — current cart payload. DELETE /api/cart — clear all items.
// Audit SEC-005: read paths use getCartPayloadReadOnly()/findActiveCart() —
// a GET must NEVER mint a Cart row + guest cookie (bots hit this constantly).
import { clearCartItems, getCartPayloadReadOnly, findActiveCart } from '@/lib/server/cart'
import { json } from '@/lib/server/utils'

export async function GET() {
  const payload = await getCartPayloadReadOnly()
  return json(payload)
}

export async function DELETE() {
  const cart = await findActiveCart()
  if (cart) await clearCartItems(cart.id)
  return json(await getCartPayloadReadOnly())
}
