// POST /api/newsletter — public subscribe (footer). Rate limited 5/10min/IP.
// Double opt-in (GDPR best practice, audit §5): a NEW or previously
// unsubscribed address is stored as PENDING and receives a signed confirmation
// link (/newsletter-confirm). Only clicking that link flips the row to
// SUBSCRIBED — nobody can sign third parties up for mail they never confirmed.
// Legacy rows that were already SUBSCRIBED stay subscribed (grandfathered) and
// get their manage link by EMAIL ONLY. SEC-009: every successful submit returns
// the SAME response `{ ok: true }` — no alreadySubscribed/pending distinction
// (enumeration oracle) and no manageUrl in the API (it must never leave the
// private email channel). S14: unsubscribe remains a signed one-click link; the
// confirm signature uses the same HMAC secret.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { newsletterSig } from '@/lib/server/newsletter'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  email: z.string().email().max(200),
  locale: z.string().optional(),
  source: z.enum(['footer', 'checkout', 'account']).optional(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:newsletter`, 5, 10 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please try later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const email = parsed.data.email.trim().toLowerCase()
  const locale = normalizeLocale(parsed.data.locale)

  const existing = await db.newsletterSubscriber.findUnique({ where: { email } })

  // Grandfathered subscribers re-entering their address: no new confirmation
  // round — their signed manage (unsubscribe) link goes to THEIR inbox only.
  if (existing?.status === 'SUBSCRIBED') {
    const origin = req.nextUrl.origin
    const sig = newsletterSig('unsub', email)
    const manageUrl = `${origin}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&sig=${encodeURIComponent(sig)}`
    const fa = locale === 'fa'
    const subject = fa ? 'مدیریت عضویت شما در نامهٔ پرس‌پیکس' : 'Manage your Persepix letter subscription'
    const bodyText = fa
      ? `شما پیش‌تر عضو نامهٔ پرس‌پیکس هستید. برای خروج از نامه از این پیوند یک‌کلیکی استفاده کنید:\n${manageUrl}\n\nاگر شما این درخواست را نداده‌اید، کافیست این ایمیل را نادیده بگیرید — عضویت‌تان بدون تغییر می‌ماند.`
      : `You are already subscribed to the Persepix letter. To leave it, use this one-click link:\n${manageUrl}\n\nIf you didn't request this, simply ignore this email — your subscription stays unchanged.`
    await db.mailMessage.create({
      data: { to: email, subject, kind: 'NEWSLETTER_CONFIRM', bodyText, locale },
    })
    return json({ ok: true })
  }

  await db.newsletterSubscriber.upsert({
    where: { email },
    create: { email, locale, source: parsed.data.source ?? 'footer', status: 'PENDING' },
    // Re-subscribing (previously UNSUBSCRIBED) or re-confirming (PENDING):
    // both go back through the confirmation step.
    update: { status: 'PENDING', locale, confirmedAt: null },
  })

  // Signed double opt-in link → /newsletter-confirm page → POST /api/newsletter/confirm.
  const sig = newsletterSig('confirm', email)
  const fa = locale === 'fa'
  const subject = fa ? 'عضویت در نامهٔ پرس‌پیکس را تأیید کنید' : 'Confirm your Persepix letter subscription'
  const bodyText = fa
    ? `برای تأیید عضویت در نامهٔ پرس‌پیکس روی این پیوند کلیک کنید:\n/newsletter-confirm?email=${encodeURIComponent(email)}&sig=${encodeURIComponent(sig)}\n\nاگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید — هیچ ایمیلی برایتان فرستاده نمی‌شود.`
    : `Click the link below to confirm your subscription to the Persepix letter:\n/newsletter-confirm?email=${encodeURIComponent(email)}&sig=${encodeURIComponent(sig)}\n\nIf you didn't request this, ignore this email — nothing will be sent to you.`
  await db.mailMessage.create({
    data: { to: email, subject, kind: 'NEWSLETTER_CONFIRM', bodyText, locale },
  })

  // Identical success response for ALL submits (SEC-009 — no oracle).
  return json({ ok: true })
}
