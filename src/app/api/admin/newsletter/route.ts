// GET /api/admin/newsletter — subscribers list + count (marketing console).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json } from '@/lib/server/utils'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const [subscribers, total, subscribedCount] = await Promise.all([
    db.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, email: true, locale: true, source: true, status: true, createdAt: true },
    }),
    db.newsletterSubscriber.count(),
    db.newsletterSubscriber.count({ where: { status: 'SUBSCRIBED' } }),
  ])

  return json({ items: subscribers, total, subscribedCount })
}

// DELETE /api/admin/newsletter?email=... — unsubscribe on behalf of a customer.
// API-408 (audit v4): the delete is now audit-logged like every other admin
// mutation. The subscriber's email is deliberately NOT written into the audit
// row (summary/actorEmail are scrubbed on GDPR erasure — mirror the
// customers/[id] pattern): the row is identified by its subscriber id.
export async function DELETE(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return apiError(400, 'VALIDATION_ERROR', 'email query param required')

  const subscriber = await db.newsletterSubscriber.findFirst({ where: { email }, select: { id: true } })
  const result = await db.newsletterSubscriber.updateMany({ where: { email }, data: { status: 'UNSUBSCRIBED' } })
  if (subscriber && result.count > 0) {
    await audit(user.email, 'NEWSLETTER_ADMIN_UNSUB', 'NewsletterSubscriber', subscriber.id, 'Admin unsubscribed a newsletter subscriber via the marketing console')
  }
  return json({ ok: true })
}
