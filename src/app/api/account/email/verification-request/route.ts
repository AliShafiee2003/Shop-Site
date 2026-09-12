// POST /api/account/email/verification-request — signed-in user asks for a
// verification mail (S13 residual). Rate limited; re-sending supersedes any
// previous token. If the address is already verified the endpoint answers
// ALREADY_VERIFIED so the UI can hide the control, and the mail is skipped.
// Sandbox: the mail lands in the MailMessage outbox (admin → Outbox); DEV-only
// `verifyUrl` in the response mirrors the forgot-password flow (never in prod).
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { mintVerifyToken } from '@/lib/server/email-verification'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, json } from '@/lib/server/utils'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const rl = rateLimit(`${user.id}:verify-email`, 4, 60 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  if (user.emailVerifiedAt) return apiError(400, 'ALREADY_VERIFIED', 'This email address is already verified.')

  const locale = req.headers.get('x-locale') === 'fa' ? 'fa' : 'en'
  const { token } = await mintVerifyToken(user.id)
  const fa = locale === 'fa'
  const subject = fa ? 'تأیید نشانی ایمیل پرس‌پیکس' : 'Confirm your PersePix email address'
  const bodyText = fa
    ? `برای تأیید نشانی ایمیل حساب کاربری‌تان روی این پیوند کلیک کنید (۲۴ ساعت اعتبار دارد، یک‌بار مصرف):\n/verify-email?token=${token}\n\nاگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.`
    : `Click the link below to confirm the email address of your PersePix account (valid for 24 hours, single use):\n/verify-email?token=${token}\n\nIf you didn't request this, you can safely ignore this email.`

  await db.mailMessage.create({
    data: { to: user.email, subject, kind: 'EMAIL_VERIFY', bodyText, locale },
  })

  const devExpose =
    process.env.DEV_EXPOSE_RESET_LINK === '1' && process.env.NODE_ENV !== 'production'
  return json({ ok: true, ...(devExpose ? { verifyUrl: `/verify-email?token=${token}` } : {}) })
}
