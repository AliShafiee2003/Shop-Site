// POST /api/auth/confirm-email-change — consume an email-change token and
// perform the address swap. Public (the token IS the credential) but POST
// only, mirroring /api/auth/verify-email: mail-scanner prefetches issue GETs
// and cannot burn the single-use token.
//
// On success the swap is one transaction: uniqueness is RE-CHECKED inside
// (the address may have been registered after the request was minted),
// `emailVerifiedAt` is stamped for the new address (ownership proven), and
// ALL sessions are revoked — an email change is an identity change, so every
// device starts a fresh sign-in. A notice mail is queued to the OLD address
// (account-takeover early warning: "if this wasn't you, …").
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { consumeEmailChangeToken } from '@/lib/server/email-change'
import { audit, apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({ token: z.string().min(16).max(128) })

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const claim = await consumeEmailChangeToken(parsed.data.token)
  if (!claim) return apiError(400, 'TOKEN_INVALID', 'This confirmation link is invalid or has expired.')

  const fa = req.headers.get('x-locale') === 'fa'
  const swapOutcome = await db
    .$transaction(async (tx) => {
      const clash = await tx.user.findUnique({ where: { email: claim.newEmail }, select: { id: true } })
      if (clash && clash.id !== claim.userId) throw new Error('EMAIL_IN_USE')
      await tx.user.update({
        where: { id: claim.userId },
        data: { email: claim.newEmail, emailVerifiedAt: new Date() },
      })
      // Identity changed → every existing session is invalid from now on.
      await tx.session.updateMany({
        where: { userId: claim.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return 'SWAPPED' as const
    })
    .catch((e: unknown) => {
      if (e instanceof Error && e.message === 'EMAIL_IN_USE') return 'EMAIL_IN_USE' as const
      throw e
    })

  if (swapOutcome === ('EMAIL_IN_USE' as const)) {
    return apiError(409, 'EMAIL_IN_USE', 'That email address was registered in the meantime. Please start the change again.')
  }

  // Takeover notice goes to the NEW address (the old one may belong to the
  // attacker at this point — notifying it would leak the account's new
  // status). The request-time mail to the new address + the password
  // re-auth are the primary guards; this row completes the audit trail.
  const user = await db.user.findUnique({
    where: { id: claim.userId },
    select: { email: true, preferredLocale: true },
  })
  if (user) {
    const mailFa = user.preferredLocale === 'fa'
    const subject = mailFa ? 'نشانی ایمیل حساب شما تغییر کرد' : 'Your Persepix email address was changed'
    const bodyText = mailFa
      ? `نشانی ایمیل حساب پرس‌پیکس شما به این نشانی تغییر کرد و تأیید شد. از همه دستگاه‌ها خارج شده‌اید — با نشانی تازه دوباره وارد شوید.\n\nاگر شما این تغییر را انجام نداده‌اید، فوراً گذرواژه را بازنشانی کنید و با پشتیبانی تماس بگیرید.`
      : `The email address of your Persepix account was changed to this address and verified. You have been signed out everywhere — sign in again with the new address.\n\nIf you did NOT make this change, reset your password immediately and contact support.`
    await db.mailMessage.create({
      data: { to: user.email, subject, kind: 'EMAIL_CHANGE_NOTICE', bodyText, locale: mailFa ? 'fa' : 'en' },
    })
    await audit(user.email, 'EMAIL_CHANGED', 'User', claim.userId, `Email address changed + verified via confirmation link${fa ? ' (fa)' : ''}`)
  }

  return json({ ok: true, email: claim.newEmail })
}
