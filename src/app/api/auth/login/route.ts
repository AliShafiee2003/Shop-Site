// POST /api/auth/login — verify credentials, start session, merge guest cart (rate limited).
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSession, publicUser, verifyPassword } from '@/lib/server/auth'
import { mergeGuestCartOnLogin } from '@/lib/server/cart'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:login`, 10, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many login attempts. Please wait a minute.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const email = parsed.data.email.toLowerCase().trim()

  const user = await db.user.findUnique({ where: { email } })
  // S9: a Google-linked account and a wrong password produce the SAME code and
  // message — a distinct "use Google" response would confirm the email exists.
  // (The UI keeps offering the Google button unconditionally.)
  if (!user || !user.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
  }
  if (user.status !== 'ACTIVE') {
    return apiError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available')
  }

  await createSession(user.id, req.headers.get('user-agent'))
  await mergeGuestCartOnLogin(user.id)

  return json({ user: publicUser(user) })
}
