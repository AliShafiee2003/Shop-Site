// Cart helpers — guest cookie cart + user cart ("u:{userId}"), server-authoritative totals.
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from './auth'
import { computeTax, VAT_RATE_PCT } from './money'
import { getActivePromotion, promoBadgeLabel, promoPriceFor, type ActivePromotion } from './promotions'
import { pickLocale } from './utils'

export const CART_COOKIE = 'sp_cart'
export const CART_MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days
export const MAX_QTY_PER_ITEM = 10

export type CartRow = Awaited<ReturnType<typeof getOrCreateCart>>

export type CartItemDTO = {
  id: string
  variantId: string
  productId: string
  slug: string
  title: string
  titleEn: string | null
  titleFa: string | null
  subtitle: string | null
  coverUrl: string | null
  sku: string
  isbn13: string | null
  format: string
  bookLanguage: string
  unitPriceMinor: number
  /** original list price — present only while a promotion reduces this item's price */
  listPriceMinor: number | null
  quantity: number
  lineTotalMinor: number
  stock: number
  inStock: boolean
  isLowStock: boolean
  maxQuantity: number
}

export type CartPayloadDTO = {
  id: string
  /** canonical item count — `itemsCount` kept as a deprecated alias (one release) */
  count: number
  itemsCount: number
  items: CartItemDTO[]
  subtotalMinor: number
  taxMinor: number
  vatRatePct: number
  currency: string
  /** sitewide promotion currently applied to prices, if any */
  promotion: { name: string; badge: string; noteEn: string | null; noteFa: string | null; savedMinor: number } | null
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    // C4: the guest cart token must not cross plaintext HTTP in production.
    secure: process.env.NODE_ENV === 'production',
  }
}

/** Resolve the cart token for the current request context. */
async function resolveCartToken(): Promise<{ token: string; isGuest: boolean }> {
  const user = await getSessionUser()
  if (user) return { token: `u:${user.id}`, isGuest: false }
  const jar = await cookies()
  const existing = jar.get(CART_COOKIE)?.value
  if (existing) return { token: existing, isGuest: true }
  return { token: randomBytes(24).toString('hex'), isGuest: true }
}

/** Audit SEC-005: resolve the EXISTING cart for the session user or guest
 *  cookie WITHOUT creating anything (no row, no cookie). Read paths (GET
 *  /api/cart, /api/bootstrap) used to mint a Cart row + cookie for every
 *  anonymous visitor — including bots — ballooning the table. */
export async function findActiveCart(): Promise<CartRow | null> {
  try {
    const user = await getSessionUser().catch(() => null)
    if (user) {
      const cart = await db.cart.findUnique({ where: { token: `u:${user.id}` } })
      return cart && cart.status === 'ACTIVE' ? cart : null
    }
    const jar = await cookies()
    const token = jar.get(CART_COOKIE)?.value
    if (!token) return null
    const cart = await db.cart.findUnique({ where: { token } })
    return cart && cart.status === 'ACTIVE' ? cart : null
  } catch {
    return null
  }
}

/** Get the ACTIVE cart for the session user or guest cookie; create (and set cookie) if needed. */
export async function getOrCreateCart() {
  const { token, isGuest } = await resolveCartToken()
  let cart = await db.cart.findUnique({ where: { token } })
  if (!cart) {
    cart = await db.cart.create({
      data: { token, userId: isGuest ? null : token.slice(2), status: 'ACTIVE' },
    })
    if (isGuest) {
      const jar = await cookies()
      jar.set(CART_COOKIE, token, cookieOptions(CART_MAX_AGE_SEC))
    }
  } else if (cart.status !== 'ACTIVE') {
    // e.g. previously converted cart — reactivate it (items were cleared on conversion)
    cart = await db.cart.update({ where: { id: cart.id }, data: { status: 'ACTIVE' } })
  }
  return cart
}

const cartItemInclude = {
  variant: { include: { product: { include: { translations: true } } } },
} satisfies Prisma.CartItemInclude
type CartItemWithVariant = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>

/** Full cart DTO — recomputes everything server-side; drops stale (inactive/unpublished) rows. */
export async function getCartPayload(): Promise<CartPayloadDTO> {
  const cart = await getOrCreateCart()
  return buildCartPayload(cart)
}

/** Payload for a cart row that ALREADY exists. Shared by getCartPayload and
 *  the read-only path so the two can never drift. */
async function buildCartPayload(cart: CartRow): Promise<CartPayloadDTO> {
  // Remove stale items: inactive variants or unpublished products can't be purchased.
  await db.cartItem.deleteMany({
    where: {
      cartId: cart.id,
      OR: [
        { variant: { isActive: false } },
        { variant: { product: { status: { not: 'PUBLISHED' } } } },
      ],
    },
  })

  const rows = await db.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
    include: cartItemInclude,
  }) as CartItemWithVariant[]

  const promo: ActivePromotion | null = await getActivePromotion()

  const items: CartItemDTO[] = rows.map((row) => {
    const v = row.variant
    const p = v.product
    const t = pickLocale(p.translations, 'en')
    const tFa = p.translations.find((x) => x.locale === 'fa')
    const stock = v.stock
    const priced = promoPriceFor(promo, v.priceMinor, p.id, p.fixedPrice)
    return {
      id: row.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      title: t?.title ?? p.slug,
      titleEn: p.translations.find((x) => x.locale === 'en')?.title ?? null,
      titleFa: tFa?.title ?? null,
      subtitle: t?.subtitle ?? null,
      coverUrl: p.coverUrl,
      sku: v.sku,
      isbn13: v.isbn13,
      format: v.format,
      bookLanguage: v.bookLanguage,
      unitPriceMinor: priced.salePriceMinor,
      listPriceMinor: priced.listPriceMinor,
      quantity: row.quantity,
      lineTotalMinor: priced.salePriceMinor * row.quantity,
      stock,
      inStock: stock > 0,
      isLowStock: stock > 0 && stock <= v.lowStockThreshold,
      maxQuantity: Math.max(0, Math.min(MAX_QTY_PER_ITEM, stock)),
    }
  })

  const subtotalMinor = items.reduce((sum, i) => sum + i.lineTotalMinor, 0)
  const itemsCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const listSubtotalMinor = items.reduce((sum, i) => sum + (i.listPriceMinor ?? i.unitPriceMinor) * i.quantity, 0)
  const savedMinor = listSubtotalMinor - subtotalMinor

  return {
    id: cart.id,
    count: itemsCount, // canonical (client contract) — itemsCount kept as deprecated alias
    itemsCount,
    items,
    subtotalMinor,
    taxMinor: computeTax(subtotalMinor),
    vatRatePct: VAT_RATE_PCT,
    currency: 'EUR',
    promotion:
      promo && savedMinor > 0
        ? {
            name: promo.name,
            badge: promoBadgeLabel(promo),
            noteEn: promo.noteEn,
            noteFa: promo.noteFa,
            savedMinor,
          }
        : null,
  }
}

/** Empty cart shape for the read-only path (no row is ever created for it). */
function emptyCartPayload(): CartPayloadDTO {
  return {
    id: '',
    count: 0,
    itemsCount: 0,
    items: [],
    subtotalMinor: 0,
    taxMinor: 0,
    vatRatePct: VAT_RATE_PCT,
    currency: 'EUR',
    promotion: null,
  }
}

/** Audit SEC-005: read-only cart payload — NEVER creates a Cart row or sets
 *  the guest cookie. Used by GET /api/cart and the /api/bootstrap cart leg:
 *  an anonymous visitor with no cart gets the empty shape (guests WITH a
 *  cart cookie still get their real items). */
export async function getCartPayloadReadOnly(): Promise<CartPayloadDTO> {
  const cart = await findActiveCart()
  if (!cart) return emptyCartPayload()
  try {
    return await buildCartPayload(cart)
  } catch {
    return emptyCartPayload()
  }
}

/** Merge the guest cart (cookie) into the user cart after login/registration. */
export async function mergeGuestCartOnLogin(userId: string): Promise<void> {
  try {
    const jar = await cookies()
    const guestToken = jar.get(CART_COOKIE)?.value
    if (!guestToken || guestToken === `u:${userId}`) return

    const guestCart = await db.cart.findUnique({
      where: { token: guestToken },
      include: { items: true },
    })
    if (!guestCart || guestCart.items.length === 0) {
      jar.set(CART_COOKIE, '', cookieOptions(0))
      return
    }

    const userToken = `u:${userId}`
    let userCart = await db.cart.findUnique({ where: { token: userToken } })
    if (!userCart) {
      userCart = await db.cart.create({ data: { token: userToken, userId, status: 'ACTIVE' } })
    } else if (userCart.status !== 'ACTIVE') {
      userCart = await db.cart.update({
        where: { id: userCart.id },
        data: { status: 'ACTIVE' },
      })
    }

    // N+1 fix: one batched variant lookup instead of findUnique per item.
    const variantIds = [...new Set(guestCart.items.map((i) => i.variantId))]
    const variantRows = await db.variant.findMany({ where: { id: { in: variantIds } } })
    const variantById = new Map(variantRows.map((v) => [v.id, v]))

    for (const item of guestCart.items) {
      const variant = variantById.get(item.variantId)
      if (!variant || !variant.isActive) continue
      const maxQty = Math.max(0, Math.min(MAX_QTY_PER_ITEM, variant.stock))
      if (maxQty === 0) continue
      const existing = await db.cartItem.findUnique({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      })
      const target = Math.min(maxQty, (existing?.quantity ?? 0) + item.quantity)
      if (existing) {
        if (target !== existing.quantity) {
          await db.cartItem.update({ where: { id: existing.id }, data: { quantity: target } })
        }
      } else {
        await db.cartItem.create({
          data: { cartId: userCart.id, variantId: item.variantId, quantity: target },
        })
      }
    }

    await db.cart.delete({ where: { id: guestCart.id } }) // items cascade
    jar.set(CART_COOKIE, '', cookieOptions(0))
  } catch {
    // Cart merge is best-effort; never block login.
  }
}

/** Remove every item from a cart. */
export async function clearCartItems(cartId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } })
}
