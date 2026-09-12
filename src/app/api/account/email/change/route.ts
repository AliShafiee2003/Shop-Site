// POST /api/account/email/change — signed-in user requests an email change
// (S11 residual). Flow mirrors the audit's "sensitive ops need re-auth" rule:
//
//   1. Requires the CURRENT password (a stolen session cookie must not be
//      able to redirect order history to an attacker's inbox). Google-only
//      accounts get NO_LOCAL_PASSWORD — there is no re-auth factor to check.
//   2. Validates + normalizes the NEW address and rejects one that is already
//      registered (the requester proved the account password, so a specific
//      answer leaks nothing to third parties).
//   3. Mints a single-use EmailChangeToken and queues the confirmation mail
//      to the NEW address (proof of ownership). User.email is NOT touched
//      until the mailed link is consumed by /api/auth/confirm-email-change.
//
// Sandbox: the mail lands in the MailMessage outbox; DEV-only `confirmUrl`
// mirrors the forgot-password / verify-email flows (never in production).
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, verifyPassword } from '@/lib/server/auth'
import { mintEmailChangeToken } from '@/lib/server/email-change'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  newEmail: z.string().email().max(254),
  password: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const rl = rateLimit(`${user.id}:email-change`, 3, 60 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const newEmail = parsed.data.newEmail.trim().toLowerCase()
  const currentEmail = user.email.toLowerCase()

  if (newEmail === currentEmail) {
    return apiError(400, 'SAME_EMAIL', 'That is already the address on this account.')
  }

  const full = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, status: true } })
  if (!full || full.status !== 'ACTIVE') return apiError(403, 'FORBIDDEN')
  if (!full.passwordHash) return apiError(400, 'NO_LOCAL_PASSWORD', 'This account signs in with Google and has no password to re-authenticate against. Contact support to change the address.')
  if (!parsed.data.password || !verifyPassword(parsed.data.password, full.passwordHash)) {
    return apiError(401, 'AUTH_REQUIRED', 'Current password is required to change the email address.')
  }

  const taken = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } })
  if (taken && taken.id !== user.id) {
    return apiError(409, 'EMAIL_IN_USE', 'That email address is already registered.')
  }

  const locale = req.headers.get('x-locale') === 'fa' ? 'fa' : 'en'
  const fa = locale === 'fa'
  const { token } = await mintEmailChangeToken(user.id, newEmail)
  const subject = fa ? 'تغییر نشانی ایمیل پرس‌پیکس' : 'Confirm your new Persepix email address'
  const bodyText = fa
    ? `برای تأیید تغییر نشانی ایمیل حساب پرس‌پیکس‌تان به این نشانی روی پیوند کلیک کنید (۱۲ ساعت اعتبار دارد، یک‌بار مصرف):\n/confirm-email-change?token=${token}\n\nاگر شما این درخواست را نداده‌اید، نشانی ایمیل شما تغییری نکرده و می‌توانید این نامه را نادیده بگیرید.`
    : `Click the link below to confirm this address as the new email for your Persepix account (valid for 12 hours, single use):\n/confirm-email-change?token=${token}\n\nIf you didn't request this, your email address has NOT been changed and you can safely ignore this email.`

  await db.mailMessage.create({
    data: { to: newEmail, subject, kind: 'EMAIL_CHANGE', bodyText, locale },
  })

  const devExpose =
    process.env.DEV_EXPOSE_RESET_LINK === '1' && process.env.NODE_ENV !== 'production'
  return json({
    ok: true,
    pendingEmail: newEmail,
    ...(devExpose ? { confirmUrl: `/confirm-email-change?token=${token}` } : {}),
  })
}
