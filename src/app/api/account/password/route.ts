// PUT /api/account/password — change password while signed in (S13 + S11).
// Requires the CURRENT password (re-auth for a sensitive op: a stolen session
// cookie alone must not be able to take over the account). On success every
// OTHER session is revoked — the current device stays signed in.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getSessionUser, hashPassword, verifyPassword } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')
  if (!user.passwordHash) {
    // Google-only account: no local password to verify against.
    return apiError(409, 'NO_LOCAL_PASSWORD', 'This account signs in with Google and has no local password yet.')
  }

  const rl = rateLimit(`${clientIp(req)}:change-pw`, 5, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again in a minute.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return apiError(403, 'WRONG_PASSWORD', 'The current password is incorrect.')
  }
  if (verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return apiError(400, 'SAME_PASSWORD', 'The new password must be different from the current one.')
  }

  const jar = await cookies()
  const currentHash = jar.get('sp_session')?.value ? sha256(jar.get('sp_session')!.value) : null

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.data.newPassword) },
    }),
    // S11 rotation: everywhere else signs out; this device keeps its session.
    db.session.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
      },
      data: { revokedAt: new Date() },
    }),
    db.auditLog.create({
      data: {
        actorEmail: user.email,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        summary: 'Password changed from account settings; other sessions revoked',
      },
    }),
  ])

  return json({ ok: true })
}
