// GET /api/admin/tickets?status=&page=&pageSize= — ticket list with last message preview.
// API-405 (audit v4): bounded list — page/pageSize via the shared parseListQuery
// (default 50, hard cap 100). Body shape unchanged ({items} — the admin UI reads
// `items`); the full row count is exposed as `total` + `X-Total-Count` so a
// future pager needs no API change.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, jsonWithTotal, parseListQuery } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')?.trim() || null
  const { page, pageSize, skip, take } = parseListQuery(searchParams)

  const where = status ? { status: status.toUpperCase() } : {}
  const [tickets, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      skip,
      take,
    }),
    db.ticket.count({ where }),
  ])

  return jsonWithTotal(
    {
      total,
      page,
      pageSize,
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
    },
    total,
  )
}
