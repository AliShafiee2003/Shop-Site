// GET  /api/auth/sessions — list the signed-in user's active sessions (S11).
// DELETE /api/auth/sessions — revoke every session EXCEPT the current one
//                             (?all=1 also revokes the current session).
// S11 partial: stolen-cookie containment + a visible "sign out everywhere"
// control. (Full rotation/idle-timeout remains on the roadmap.)
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
