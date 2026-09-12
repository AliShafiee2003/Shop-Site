// GET/POST /api/account/tickets — support ticket list + creation (creates first customer message).
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, nextTicketNumber, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  subject: z.string().min(1),
  category: z.enum(['GENERAL', 'ORDER', 'SHIPPING', 'RETURNS', 'PRESS']).default('GENERAL'),
  relatedOrderNumber: z.string().optional().nullable(),
  message: z.string().min(1),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  return json({
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      status: t.status,
      relatedOrderNumber: t.relatedOrderNumber,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lastMessage: t.messages[0] ? { body: t.messages[0].body, senderType: t.messages[0].senderType, createdAt: t.messages[0].createdAt.toISOString() } : null,
    })),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const count = await db.ticket.count()

  const ticket = await db.ticket.create({
    data: {
      ticketNumber: nextTicketNumber(count),
      userId: user.id,
      email: user.email,
      name: user.name,
      subject: parsed.data.subject,
      category: parsed.data.category,
      relatedOrderNumber: parsed.data.relatedOrderNumber || null,
      status: 'OPEN',
      messages: {
        create: {
          senderType: 'CUSTOMER',
          senderName: user.name ?? user.email,
          body: parsed.data.message,
        },
      },
    },
    include: { messages: true },
  })

  return json({ ticket })
}
