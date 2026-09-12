// GET  /api/auth/sessions — list the signed-in user's active sessions (S11).
// DELETE /api/auth/sessions — revoke sessions:
//   ?id=<sessionId>  revoke ONE session (must belong to the caller)
//   (no params)      revoke every session EXCEPT the current one
//   ?all=1           also revoke the current session
// S11: stolen-cookie containment + a visible per-device sign-out control.
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const jar = await cookies()
  const currentHash = jar.get('sp_session')?.value ? sha256(jar.get('sp_session')!.value) : null

  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, createdAt: true, expiresAt: true, tokenHash: true },
  })

  return json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: currentHash ? s.tokenHash === currentHash : false,
    })),
  })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const jar = await cookies()
  const currentHash = jar.get('sp_session')?.value ? sha256(jar.get('sp_session')!.value) : null
  const includeCurrent = req.nextUrl.searchParams.get('all') === '1'
  const singleId = req.nextUrl.searchParams.get('id')

  if (singleId) {
    // Revoke exactly one of the caller's own sessions (per-device sign-out).
    const target = await db.session.findFirst({
      where: { id: singleId, userId: user.id, revokedAt: null },
      select: { id: true, tokenHash: true },
    })
    if (!target) return apiError(404, 'NOT_FOUND', 'Session not found (or already signed out).')
    await db.session.update({ where: { id: target.id }, data: { revokedAt: new Date() } })
    // If the browser revoked its OWN row, drop the cookie so it stops sending
    // a dead token on every request.
    if (currentHash && target.tokenHash === currentHash) {
      jar.set('sp_session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
    }
    return json({ ok: true, revoked: 1 })
  }

  const revoked = await db.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(includeCurrent || !currentHash ? {} : { tokenHash: { not: currentHash } }),
    },
    data: { revokedAt: new Date() },
  })

  return json({ ok: true, revoked: revoked.count })
}
