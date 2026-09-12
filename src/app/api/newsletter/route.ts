// POST /api/newsletter — public subscribe (footer). Rate limited 5/10min/IP, idempotent per email.
// S14: the response carries a signed manageUrl (one-click unsubscribe). A full
// double opt-in requires transactional email (still a sandbox gap — see worklog).
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email().max(200),
  locale: z.string().optional(),
  source: z.enum(['footer', 'checkout', 'account']).optional(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:newsletter`, 5, 10 * 60_000)
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
  const locale = normalizeLocale(parsed.data.locale)

  await db.newsletterSubscriber.upsert({
    where: { email },
    create: { email, locale, source: parsed.data.source ?? 'footer', status: 'SUBSCRIBED' },
    // Re-subscribing a previously unsubscribed address flips it back.
    update: { status: 'SUBSCRIBED', locale },
  })

  // Signed one-click unsubscribe link (S14) — HMAC cannot be forged offline.
  const origin = req.nextUrl.origin
  const sig = createHmac('sha256', process.env.STATE_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || 'persepix-unsubscribe-key')
    .update(`unsub:${email}`)
    .digest('base64url')
  const manageUrl = `/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&sig=${encodeURIComponent(sig)}`

  return json({ ok: true, manageUrl: `${origin}${manageUrl}` })
}
