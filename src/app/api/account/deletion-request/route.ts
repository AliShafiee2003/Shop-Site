// POST /api/account/deletion-request — anonymize the account immediately.
// C5: GDPR-grade scrub. The old version only nulled User.email/name, leaving
// PII in Order.email, shipping/billing address JSON, giftMessage, customerNote,
// Ticket contact fields + message bodies, Review.authorName and newsletter rows
// while claiming "anonymized". Everything customer-identifying is now wiped in
// ONE transaction; only the commercial skeleton of orders (amounts, statuses,
// item snapshots without recipient data) is retained as required by law.
// S11: sensitive operation → password re-auth for accounts WITH a local
// password (Google-only accounts have no password to re-verify).
import { db } from '@/lib/db'
import { destroySession, getSessionUser, verifyPassword } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, json } from '@/lib/server/utils'

const ANON_PLACEHOLDER = JSON.stringify({
  recipient: 'Removed (GDPR erasure)',
  line1: 'Removed',
  city: 'Removed',
  postalCode: 'Removed',
  countryCode: 'XX',
  phone: null,
})

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  // PRIV-002: erasure is destructive and irreversible — throttle per user (3/hour).
  const rl = rateLimit(`${user.id}:deletion-request`, 3, 60 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  // S11 re-auth: a stolen session cannot erase an account without the password.
  let password: string | undefined
  try {
    const body = (await req.json()) as { password?: unknown }
    password = typeof body?.password === 'string' ? body.password : undefined
  } catch {
    password = undefined
  }
  if (user.passwordHash) {
    if (!password || !verifyPassword(password, user.passwordHash)) {
      return apiError(401, 'AUTH_REQUIRED', 'Password confirmation failed')
    }
  }

  const email = user.email.toLowerCase()

  await db.$transaction([
    // 1) Account row → anonymous.
    db.user.update({
      where: { id: user.id },
      data: {
        status: 'ANONYMIZED',
        email: `deleted-${user.id}@example.invalid`,
        name: null,
        avatarUrl: null,
        googleSub: null,
        marketingConsent: false,
      },
    }),
    // 2) Revoke every session of this user.
    db.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    // 3) Orders: keep the commercial record, erase the person.
    //    Soft link nulled AND every customer-identifying field scrubbed.
    db.order.updateMany({
      where: { OR: [{ userId: user.id }, { email }] },
      data: {
        userId: null,
        email: `deleted-${user.id}@orders.invalid`,
        shippingAddressJson: ANON_PLACEHOLDER,
        billingAddressJson: ANON_PLACEHOLDER,
        giftMessage: null,
        customerNote: null,
      },
    }),
    db.address.deleteMany({ where: { userId: user.id } }),
    // 4) Support tickets: identity + conversation bodies (they quote addresses/emails).
    db.ticket.updateMany({
      where: { OR: [{ userId: user.id }, { email }] },
      data: { userId: null, email: `deleted-${user.id}@tickets.invalid`, name: null },
    }),
    // 5) Reviews: drop the display name (the rating text itself stays for integrity).
    db.review.updateMany({ where: { userId: user.id }, data: { authorName: null } }),
    // 6) Newsletter + consent ledger rows tied to this address.
    db.newsletterSubscriber.deleteMany({ where: { email } }),
    db.consentRecord.updateMany({
      where: { email },
      data: { email: `deleted-${user.id}@consents.invalid` },
    }),
    // 7) Back-in-stock requests (contain the email).
    db.backInStockSubscriber.deleteMany({ where: { email } }),
  ])

  await destroySession()

  return json({
    ok: true,
    note: 'Your account and all personal data (contact details, addresses, gift notes, support conversations, review names, newsletter and back-in-stock entries) have been erased. Order records are retained as required by commercial law but no longer contain personal data.',
  })
}
