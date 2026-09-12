// GET /api/admin/tickets?status= — ticket list with last message preview.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')?.trim() || null

  const tickets = await db.ticket.findMany({
    where: status ? { status: status.toUpperCase() } : {},
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  return json({
    items: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      email: t.email,
      name: t.name,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      relatedOrderNumber: t.relatedOrderNumber,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lastMessagePreview: t.messages[0]?.body.slice(0, 140) ?? null,
      lastMessageSender: t.messages[0]?.senderType ?? null,
    })),
  })
}
