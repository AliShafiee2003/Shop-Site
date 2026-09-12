// S11 — email-change tokens. Trust model identical to the other one-time
// tokens: 32 random bytes shown ONCE in the mailed link, only sha256(token)
// persisted, single-use. The pending address lives on the token row, so
// User.email is untouched until the link is consumed (the confirm route
// performs the actual swap in a transaction).
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

const CHANGE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours, single-use

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Mint an email-change token binding the user to a NEW address. Any
 *  outstanding token for the user is superseded (one live link at a time).
 *  Returns the RAW token for the email link. */
export async function mintEmailChangeToken(userId: string, newEmail: string): Promise<{ token: string; expiresAt: Date }> {
  await db.emailChangeToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + CHANGE_TTL_MS)
  await db.emailChangeToken.create({ data: { userId, newEmail, tokenHash: sha256(token), expiresAt } })
  return { token, expiresAt }
}

/** Consume a change token → { userId, newEmail }, or null when unknown,
 *  expired, already used, or the account is not ACTIVE. Single-use (the row
 *  is marked used HERE; the caller still owns the swap + error handling). */
export async function consumeEmailChangeToken(token: string): Promise<{ userId: string; newEmail: string } | null> {
  const row = await db.emailChangeToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!row) return null
  if (row.usedAt) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  if (row.user.status !== 'ACTIVE') return null
  await db.emailChangeToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return { userId: row.userId, newEmail: row.newEmail }
}
