// GET  /api/wishlist — current user's saved product slugs (order-preserving).
// PUT  /api/wishlist — replace-all sync from the client (merge handled client-side).
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const MAX_ITEMS = 48

const putSchema = z.object({
  slugs: z.array(z.string().min(1).max(120)).max(MAX_ITEMS),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const items = await db.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { addedAt: 'asc' },
  })
  return json({ slugs: items.map((w) => w.productSlug) })
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const slugs = Array.from(new Set(parsed.data.slugs)).slice(0, MAX_ITEMS)

  // Replace-all in a transaction (diff-based: delete missing, create new).
  await db.$transaction(async (tx) => {
    const existing = await tx.wishlistItem.findMany({ where: { userId: user.id } })
    const existingSet = new Set(existing.map((w) => w.productSlug))
    const nextSet = new Set(slugs)
    const toDelete = existing.filter((w) => !nextSet.has(w.productSlug)).map((w) => w.id)
    if (toDelete.length > 0) {
      await tx.wishlistItem.deleteMany({ where: { id: { in: toDelete } } })
    }
    const toAdd = slugs.filter((s) => !existingSet.has(s))
    if (toAdd.length > 0) {
      await tx.wishlistItem.createMany({
        data: toAdd.map((productSlug) => ({ userId: user.id, productSlug })),
      })
    }
  })

  const items = await db.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { addedAt: 'asc' },
  })
  return json({ slugs: items.map((w) => w.productSlug) })
}
