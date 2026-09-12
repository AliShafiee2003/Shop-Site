// Signed newsletter mail links (double opt-in confirm + one-click unsubscribe).
// HMAC with STATE_SECRET — links cannot be forged offline for arbitrary
// addresses. Shared by /api/newsletter (subscribe), /api/newsletter/confirm
// and /api/newsletter/unsubscribe so the key chain lives in exactly one place.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// SEC-006: no hardcoded fallback key. Production REQUIRES STATE_SECRET (fail
// fast — a guessable key would let anyone forge unsubscribe/confirm links).
// Dev/sandbox without config gets a random per-process key so links keep
// working within one server boot (regenerated on restart, which is fine there).
const DEV_FALLBACK_KEY = randomBytes(32).toString('hex')

function signingKey(): string {
  const secret = process.env.STATE_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STATE_SECRET is required in production (newsletter link signing)')
  }
  return DEV_FALLBACK_KEY
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
