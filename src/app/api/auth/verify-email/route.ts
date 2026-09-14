// POST /api/auth/verify-email — consume a verification token and stamp the
// account's emailVerifiedAt. Public (the token IS the credential) but POST
// only: the /verify-email page calls this with the token it received in the
// mail link, so mail scanners that prefetch links cannot burn the token
// (they issue GETs, not POSTs). Single-use, 24-hour TTL.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { consumeVerifyToken } from '@/lib/server/email-verification'
import { audit, apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({ token: z.string().min(16).max(128) })

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const userId = await consumeVerifyToken(parsed.data.token)
  if (!userId) return apiError(400, 'TOKEN_INVALID', 'This verification link is invalid or has expired.')

  const user = await db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true },
  })
  await audit(user.email, 'EMAIL_VERIFIED', 'User', userId, 'Email address verified via mail link')
  return json({ ok: true, email: user.email })
}
