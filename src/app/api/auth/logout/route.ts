// POST /api/auth/logout — revoke session + clear cookie.
import { destroySession } from '@/lib/server/auth'
import { json } from '@/lib/server/utils'

export async function POST() {
  await destroySession()
  return json({ ok: true })
}
