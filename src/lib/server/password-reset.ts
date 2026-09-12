// S13 — password reset tokens + per-account login throttle (S5).
// Tokens: 32 random bytes shown ONCE in the emailed link; only sha256(token)
// is persisted, so a database leak cannot be replayed against the API.
// Throttle: DB-backed failed-login counter keyed by the ATTEMPTED email —
// rows are recorded for non-existent addresses too, so a lockout message
// never confirms that an account exists (S9).
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

const RESET_TTL_MS = 30 * 60 * 1000 // 30 minutes, single-use
const MAX_FAILS = 8
const LOCK_MS = 15 * 60 * 1000

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Mint a reset token for the user. Returns the RAW token (goes in the email
 *  link only). Any previous outstanding tokens for the user are invalidated. */
export async function mintResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() }, // superseded, not reusable
  })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + RESET_TTL_MS)
  await db.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), expiresAt } })
  return { token, expiresAt }
}

/** Consume a reset token: returns the owning userId, or null when unknown,
 *  expired, already used, or the account is not ACTIVE. Single-use by design. */
export async function consumeResetToken(token: string): Promise<string | null> {
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!row) return null
  if (row.usedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  if (row.user.status !== 'ACTIVE') return null
  await db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}

export type ThrottleVerdict = { locked: boolean; retryAfterSec: number }

/** Read the lockout state for an attempted email (call BEFORE verifying). */
export async function loginThrottleCheck(email: string): Promise<ThrottleVerdict> {
  const row = await db.loginThrottle.findUnique({ where: { email } })
  if (!row?.lockedUntil) return { locked: false, retryAfterSec: 0 }
  const rest = row.lockedUntil.getTime() - Date.now()
  if (rest <= 0) return { locked: false, retryAfterSec: 0 }
  return { locked: true, retryAfterSec: Math.max(1, Math.ceil(rest / 1000)) }
}

/** Record a failed attempt for the ATTEMPTED email (existing or not). After
 *  MAX_FAILS the key is locked for LOCK_MS — long enough to blunt credential
 *  stuffing, short enough to not turn into a DoS lever for third parties. */
export async function loginThrottleFail(email: string): Promise<void> {
  const now = new Date()
  try {
    await db.$transaction(async (tx) => {
      const row = await tx.loginThrottle.findUnique({ where: { email } })
      if (!row) {
        await tx.loginThrottle.create({ data: { email, failCount: 1, lastFailAt: now } })
        return
      }
      const fails = row.failCount + 1
      if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
        // Already locked — keep the lock alive (each probe extends it slightly).
        await tx.loginThrottle.update({ where: { email }, data: { lastFailAt: now } })
        return
      }
      const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null
      await tx.loginThrottle.update({
        where: { email },
        data: { failCount: lock ? 0 : fails, lockedUntil: lock, lastFailAt: now },
      })
    })
  } catch {
    // Throttling must never take login down with it.
  }
}

/** Successful sign-in — clear the counter for this email. */
export async function loginThrottleReset(email: string): Promise<void> {
  try {
    await db.loginThrottle.delete({ where: { email } })
  } catch { /* row may not exist */ }
}
