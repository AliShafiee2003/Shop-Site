// POST /api/admin/tickets/[id]/messages — support reply (ticket → AWAITING_CUSTOMER).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({ body: z.string().min(1) })

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const message = await db.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderType: 'SUPPORT',
      senderName: user.name ?? user.email,
      body: parsed.data.body,
    },
  })

  await db.ticket.update({ where: { id: ticket.id }, data: { status: 'AWAITING_CUSTOMER' } })

  return json({
    message: { id: message.id, senderType: message.senderType, body: message.body, createdAt: message.createdAt.toISOString() },
    status: 'AWAITING_CUSTOMER',
  })
}
