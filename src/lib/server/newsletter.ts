// Signed newsletter mail links (double opt-in confirm + one-click unsubscribe).
// HMAC with STATE_SECRET — links cannot be forged offline for arbitrary
// addresses. Shared by /api/newsletter (subscribe), /api/newsletter/confirm
// and /api/newsletter/unsubscribe so the key chain lives in exactly one place.
import { createHmac, timingSafeEqual } from 'node:crypto'

function signingKey(): string {
  return (
    process.env.STATE_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    'persepix-unsubscribe-key'
  )
}

export function newsletterSig(kind: 'confirm' | 'unsub', email: string): string {
  return createHmac('sha256', signingKey()).update(`${kind}:${email.toLowerCase()}`).digest('base64url')
}

/** Constant-time signature check (length-guarded). */
export function newsletterSigValid(kind: 'confirm' | 'unsub', email: string, sig: string): boolean {
  const expected = Buffer.from(newsletterSig(kind, email))
  const given = Buffer.from(sig)
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}
