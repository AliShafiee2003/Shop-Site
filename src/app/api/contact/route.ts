// POST /api/contact — guest contact form → Ticket OPEN + first CUSTOMER message (rate limited).
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, nextTicketNumber, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  // BUG-004: length caps mirror the DB columns and stop multi-MB bodies from
  // being validated, stored and rendered (min rules unchanged).
  name: z.string().min(1).max(120),
  email: z.string().email().max(320),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  orderNumber: z.string().max(40).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:contact`, 5, 10 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many messages. Please try again later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const user = await getSessionUser()

  // Ticket numbers are sequential (TK-NNNN) — counting outside a transaction
  // races under concurrency. Retry on the unique violation with a fresh count.
  let ticket: { ticketNumber: string } | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const count = await db.ticket.count()
      ticket = await db.ticket.create({
        data: {
          ticketNumber: nextTicketNumber(count + attempt),
          userId: user?.id ?? null,
          email: parsed.data.email.toLowerCase().trim(),
          name: parsed.data.name,
          subject: parsed.data.subject,
          category: 'GENERAL',
          relatedOrderNumber: parsed.data.orderNumber || null,
          status: 'OPEN',
          messages: {
            create: {
              senderType: 'CUSTOMER',
              senderName: parsed.data.name,
              body: parsed.data.message,
            },
          },
        },
        select: { ticketNumber: true },
      })
      break
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002' && attempt < 3) continue
      throw err
    }
  }

  return json({ ticketNumber: ticket!.ticketNumber })
}
