// POST /api/auth/reset-password — finish the password-reset flow (S13).
// Consumes a single-use token, sets the new password and REVOKES EVERY
// session of the account (S11 rotation: a reset is the moment an attacker
// holding an old cookie must lose it). Rate limited per IP.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { consumeResetToken } from '@/lib/server/password-reset'
import { hashPassword } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(128),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:reset-pw`, 10, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const userId = await consumeResetToken(parsed.data.token)
  if (!userId) return apiError(400, 'TOKEN_INVALID', 'This reset link is invalid or has expired. Please request a new one.')

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    }),
    // S11: rotation on credential change — no session survives a reset.
    db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.auditLog.create({
      data: {
        actorEmail: 'password-reset@persepix.system',
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: userId,
        summary: 'Password reset via single-use email token; all sessions revoked',
      },
    }),
  ])

  return json({ ok: true })
}
