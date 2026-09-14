// GET /api/auth/me — current session user or null.
import { getSessionUser, publicUser } from '@/lib/server/auth'
import { json } from '@/lib/server/utils'

export async function GET() {
  const user = await getSessionUser()
  return json({ user: user ? publicUser(user) : null })
}
