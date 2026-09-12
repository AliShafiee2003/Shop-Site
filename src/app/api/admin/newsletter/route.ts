// GET /api/admin/newsletter — subscribers list + count (marketing console).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

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
export async function DELETE(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return apiError(400, 'VALIDATION_ERROR', 'email query param required')

  await db.newsletterSubscriber.updateMany({ where: { email }, data: { status: 'UNSUBSCRIBED' } })
  return json({ ok: true })
}
