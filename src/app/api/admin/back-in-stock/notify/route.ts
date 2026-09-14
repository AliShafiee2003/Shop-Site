// POST /api/admin/back-in-stock/notify — queue a BACK_IN_STOCK mail for every
// waiting subscriber of a variant and mark them notified (used by the product
// editor "notify waiting customers" flow and the marketing panel's per-variant
// "notify all" action). Audited as one batch entry.
//
// COM-402: the old version only stamped `notifiedAt` — the audit-log said
// "Restock notice sent" while the mail dispatcher (which drains MailMessage
// rows only) had nothing to send, so waiting customers NEVER received an
// email. Mails + stamps now happen in ONE transaction (both or neither), so a
// retry after a partial failure can never mark someone notified whose mail was
// never queued.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { backInStockMail } from '@/lib/server/order-mail'
import { siteUrlFrom } from '@/lib/site'
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

  const waiting = await db.backInStockSubscriber.findMany({
    where: { variantId: variant.id, notifiedAt: null },
    select: { id: true, email: true, locale: true },
  })
  if (waiting.length === 0) return json({ notified: 0 })

  const titleEn =
    variant.product.translations.find((t) => t.locale === 'en')?.title ?? variant.product.slug
  const titleFa = variant.product.translations.find((t) => t.locale === 'fa')?.title ?? ''
  const origin = siteUrlFrom(null)

  let notified = 0
  try {
    const mails = waiting.map((s) =>
      backInStockMail(
        { email: s.email, locale: s.locale },
        { slug: variant.product.slug, titleEn, titleFa, sku: variant.sku },
        origin,
      ),
    )
    await db.$transaction([
      db.mailMessage.createMany({ data: mails }),
      db.backInStockSubscriber.updateMany({
        where: { id: { in: waiting.map((s) => s.id) } },
        data: { notifiedAt: new Date() },
      }),
    ])
    notified = waiting.length
  } catch {
    // Both-or-neither failed → nothing stamped; the admin can retry.
    return json({ notified: 0, error: 'MAIL_QUEUE_FAILED' }, 503)
  }

  await audit(
    user.email,
    'BACK_IN_STOCK_NOTIFY',
    'BackInStockSubscriber',
    variant.id,
    `Restock notice sent to ${notified} waiting customer${notified === 1 ? '' : 's'} — ${titleEn} (${variant.sku})`,
  )
  return json({ notified })
}
