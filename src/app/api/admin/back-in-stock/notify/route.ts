// POST /api/admin/back-in-stock/notify — batch-mark every waiting subscriber of a
// variant as notified (used by the product editor "notify waiting customers" flow and
// the marketing panel's per-variant "notify all" action). Audited as one batch entry.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({ variantId: z.string().min(1) })

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const variant = await db.variant.findUnique({
    where: { id: parsed.data.variantId },
    include: { product: { include: { translations: true } } },
  })
  if (!variant) return apiError(404, 'NOT_FOUND', 'Variant not found')

  const updated = await db.backInStockSubscriber.updateMany({
    where: { variantId: variant.id, notifiedAt: null },
    data: { notifiedAt: new Date() },
  })

  if (updated.count > 0) {
    const title = variant.product.translations.find((t) => t.locale === 'en')?.title ?? variant.product.slug
    await audit(
      user.email,
      'BACK_IN_STOCK_NOTIFY',
      'BackInStockSubscriber',
      variant.id,
      `Restock notice sent to ${updated.count} waiting customer${updated.count === 1 ? '' : 's'} — ${title} (${variant.sku})`,
    )
  }
  return json({ notified: updated.count })
}
