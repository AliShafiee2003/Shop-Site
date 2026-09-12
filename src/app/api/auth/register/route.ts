// POST /api/auth/register — create CUSTOMER account, start session, merge guest cart.
// S13 residual: new local accounts start UNVERIFIED and receive a verification
// mail (sandbox outbox). Best-effort: a mail failure never blocks signup.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSession, hashPassword, publicUser } from '@/lib/server/auth'
import { mergeGuestCartOnLogin } from '@/lib/server/cart'
import { mintVerifyToken } from '@/lib/server/email-verification'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional().nullable(),
  locale: z.string().optional(),
})

export async function POST(req: NextRequest) {
  // SEC-007: signup was the one auth flow without an IP throttle — cap account
  // creation attempts (same 429 shape as login/forgot-password).
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:register`, 5, 15 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.')

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

  // Queue the verification mail for the fresh (unverified) address.
  let devVerifyUrl: string | undefined
  try {
    const { token } = await mintVerifyToken(user.id)
    const fa = locale === 'fa'
    const subject = fa ? 'تأیید نشانی ایمیل پرس‌پیکس' : 'Confirm your PersePix email address'
    const mailBody = fa
      ? `به پرس‌پیکس خوش آمدید! برای تأیید نشانی ایمیل حساب کاربری‌تان روی این پیوند کلیک کنید (۲۴ ساعت اعتبار دارد، یک‌بار مصرف):\n/verify-email?token=${token}\n\nاگر شما این حساب را نساخته‌اید، این ایمیل را نادیده بگیرید.`
      : `Welcome to PersePix! Click the link below to confirm the email address of your new account (valid for 24 hours, single use):\n/verify-email?token=${token}\n\nIf you didn't create this account, you can safely ignore this email.`
    await db.mailMessage.create({
      data: { to: user.email, subject, kind: 'EMAIL_VERIFY', bodyText: mailBody, locale },
    })
    // DEV ONLY: the token/link is exposed in the API response solely for
    // sandbox testing — production never exposes tokens, regardless of env.
    if (process.env.DEV_EXPOSE_RESET_LINK === '1' && process.env.NODE_ENV !== 'production') {
      devVerifyUrl = `/verify-email?token=${token}`
    }
  } catch {
    // Verification mail is best-effort — never block the signup response.
  }

  return json({ user: publicUser(user), ...(devVerifyUrl ? { devVerifyUrl } : {}) })
}
