// PATCH  /api/admin/back-in-stock/[id] — mark a request as notified (sandbox:
// the email lands in the admin outbox pattern rather than a real provider).
// DELETE /api/admin/back-in-stock/[id] — remove a request.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({ notified: z.boolean() })

async function loadWithProduct(id: string) {
  return db.backInStockSubscriber.findUnique({
    where: { id },
    include: { variant: { include: { product: { include: { translations: true } } } } },
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const sub = await loadWithProduct(id)
  if (!sub) return apiError(404, 'NOT_FOUND')

  const updated = await db.backInStockSubscriber.update({
    where: { id },
    data: { notifiedAt: parsed.data.notified ? new Date() : null },
  })

  if (parsed.data.notified) {
    const title = sub.variant.product.translations.find((t) => t.locale === 'en')?.title ?? sub.variant.product.slug
    await audit(user.email, 'BACK_IN_STOCK_NOTIFY', 'BackInStockSubscriber', id, `Restock notice sent to ${updated.email} — ${title} (${sub.variant.sku})`)
  }
  return json({ ok: true, notifiedAt: updated.notifiedAt?.toISOString() ?? null })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  const sub = await db.backInStockSubscriber.findUnique({ where: { id } })
  if (!sub) return apiError(404, 'NOT_FOUND')

  await db.backInStockSubscriber.delete({ where: { id } })
  await audit(user.email, 'BACK_IN_STOCK_DELETE', 'BackInStockSubscriber', id, `Deleted back-in-stock request for ${sub.email}`)
  return json({ ok: true })
}
