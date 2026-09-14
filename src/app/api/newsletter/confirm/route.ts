// POST /api/newsletter/confirm — the double opt-in confirmation step.
// The /newsletter-confirm page (opened from the mail link) calls this with the
// email + HMAC signature. GETs never confirm — mail-scanner prefetches cannot
// complete the opt-in. Flips PENDING → SUBSCRIBED and stamps confirmedAt.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { newsletterSigValid } from '@/lib/server/newsletter'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email().max(200),
  sig: z.string().min(16).max(128),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit(`${clientIp(req)}:nl-confirm`, 20, 10 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please try later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const email = parsed.data.email.trim().toLowerCase()
  if (!newsletterSigValid('confirm', email, parsed.data.sig)) {
    return apiError(400, 'BAD_SIGNATURE', 'This confirmation link is invalid.')
  }

  const row = await db.newsletterSubscriber.findUnique({ where: { email } })
  if (!row) return apiError(404, 'NOT_FOUND', 'No subscription request found for this address.')

  if (row.status === 'SUBSCRIBED') return json({ ok: true, alreadyConfirmed: true })

  await db.newsletterSubscriber.update({
    where: { email },
    data: { status: 'SUBSCRIBED', confirmedAt: new Date() },
  })
  return json({ ok: true })
}
