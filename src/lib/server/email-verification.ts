// S13 residual — email-verification tokens. Same trust model as the password
// reset: 32 random bytes shown ONCE in the emailed link, only sha256(token)
// persisted (a DB leak cannot be replayed), single-use, 24-hour expiry.
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours, single-use

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Mint a verification token for the user. Returns the RAW token (goes into
 *  the email link only). Any outstanding token for the user is superseded so
 *  at most one live link exists per account at a time. */
export async function mintVerifyToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  await db.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS)
  await db.emailVerificationToken.create({ data: { userId, tokenHash: sha256(token), expiresAt } })
  return { token, expiresAt }
}

/** Consume a verification token → the owning userId, or null when unknown,
 *  expired, already used, or the account is not ACTIVE. Single-use. */
export async function consumeVerifyToken(token: string): Promise<string | null> {
  const row = await db.emailVerificationToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!row) return null
  if (row.usedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  if (row.user.status !== 'ACTIVE') return null
  await db.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return row.userId
}
