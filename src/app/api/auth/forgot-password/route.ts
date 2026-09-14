// POST /api/auth/forgot-password — begin the password-reset flow (S13).
// ALWAYS answers { ok: true } — the response never reveals whether the email
// exists (S9 anti-enumeration). For real local-password accounts we mint a
// single-use token and queue the reset mail (MailMessage sandbox outbox).
// DEV ONLY: when DEV_EXPOSE_RESET_LINK=1 the response carries `resetUrl` so
// the sandbox flow is testable without an SMTP provider. Never enable that in
// production — it would let anyone reset any account.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { mintResetToken } from '@/lib/server/password-reset'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json } from '@/lib/server/utils'

const bodySchema = z.object({ email: z.string().email().max(200) })

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  // Generous but bounded: 5 requests / 10 min / IP.
  const rl = rateLimit(`${ip}:forgot-pw`, 5, 10 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    // Same generic answer as "unknown email" — no schema oracle either.
    return json({ ok: true })
  }
  const email = parsed.data.email.toLowerCase().trim()
  const locale = req.headers.get('x-locale') === 'fa' ? 'fa' : 'en'

  let resetUrl: string | undefined
  try {
    const user = await db.user.findUnique({ where: { email } })
    if (user && user.passwordHash && user.status === 'ACTIVE') {
      const { token } = await mintResetToken(user.id)
      const fa = locale === 'fa'
      const subject = fa ? 'بازنشانی گذرواژهٔ پرس‌پیکس' : 'Reset your PersePix password'
      const bodyText = fa
        ? `برای بازنشانی گذرواژه روی این پیوند کلیک کنید (۳۰ دقیقه اعتبار دارد، یک‌بار مصرف):\n/forgot-password?token=${token}\n\nاگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید — گذرواژه‌تان بدون تغییر می‌ماند.`
        : `Click the link below to choose a new password (valid for 30 minutes, single use):\n/forgot-password?token=${token}\n\nIf you didn't request this, ignore this email — your password stays unchanged.`
      await db.mailMessage.create({
        data: { to: email, subject, kind: 'PASSWORD_RESET', bodyText, locale },
      })
      if (process.env.DEV_EXPOSE_RESET_LINK === '1' &&
      process.env.NODE_ENV === 'development') {
        resetUrl = `/forgot-password?token=${token}`
      }
    }
  } catch {
    // Swallow — the generic answer is the point.
  }

  return json({ ok: true, ...(resetUrl ? { resetUrl } : {}) })
}
