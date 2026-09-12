// POST /api/auth/register — create CUSTOMER account, start session, merge guest cart.
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, hashPassword, publicUser } from '@/lib/server/auth'
import { mergeGuestCartOnLogin } from '@/lib/server/cart'
import { apiError, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional().nullable(),
  locale: z.string().optional(),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const email = parsed.data.email.toLowerCase().trim()
  const locale = normalizeLocale(parsed.data.locale)

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    // A Google-only account (no local password) can't be "re-registered" —
    // tell the user to sign in with Google instead.
    if (!existing.passwordHash && existing.googleSub) {
      return apiError(409, 'OAUTH_ACCOUNT', 'This email is registered with Google sign-in. Use “Continue with Google” below.')
    }
    return apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
  }

  const user = await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(parsed.data.password),
      name: parsed.data.name?.trim() || null,
      role: 'CUSTOMER',
      preferredLocale: locale,
    },
  })

  await createSession(user.id, req.headers.get('user-agent'))
  await mergeGuestCartOnLogin(user.id)

  return json({ user: publicUser(user) })
}
