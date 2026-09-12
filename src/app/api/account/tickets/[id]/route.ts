// GET /api/account/tickets/[id] — own ticket with messages (404 otherwise).
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const { id } = await ctx.params
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket || ticket.userId !== user.id) return apiError(404, 'NOT_FOUND', 'Ticket not found')

  return json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      relatedOrderNumber: ticket.relatedOrderNumber,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderName: m.senderName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  })
}
