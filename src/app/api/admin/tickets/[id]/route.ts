// GET/PATCH /api/admin/tickets/[id] — ticket detail with messages + related order; status update.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      order: { select: { orderNumber: true, status: true, totalMinor: true, email: true } },
    },
  })
  if (!ticket) return apiError(404, 'NOT_FOUND', 'Ticket not found')

  return json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      email: ticket.email,
      name: ticket.name,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
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
      relatedOrder: ticket.order,
    },
  })
}

const patchSchema = z.object({
  status: z.enum(['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_SUPPORT', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return apiError(404, 'NOT_FOUND', 'Ticket not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const updated = await db.ticket.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    },
  })

  if (parsed.data.status && parsed.data.status !== ticket.status) {
    await audit(user.email, 'TICKET_STATUS', 'Ticket', id, `Ticket ${ticket.ticketNumber} ${ticket.status} → ${parsed.data.status}`)
  }

  return json({ ticket: { id: updated.id, status: updated.status, priority: updated.priority } })
}
