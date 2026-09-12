// Shared housekeeping + scheduler — OPS-004 separates the periodic ops work
// (formerly inlined in the /api/healthz probe) from the liveness check so the
// probe stays pure, and gives the external scheduler (GET /api/cron/tick) a
// single entry point. BUG-005 also lives here: SCHEDULED products whose
// publishAt has passed are auto-promoted to PUBLISHED (nothing else in the
// codebase ever promoted them, so a scheduled title never appeared).
import { db } from '@/lib/db'
import { dispatchQueuedMails } from '@/lib/server/mail-dispatch'
import { queueSalesDigestIfDue } from '@/lib/server/report-mail'

const HOUSEKEEPING_INTERVAL_MS = 6 * 60 * 60 * 1000
const globalForHousekeeping = globalThis as unknown as { lastSweepAt?: number }

/**
 * Run every maintenance sweep, but at most once every 6 hours per process
 * (global timestamp guard — the same behaviour the healthz probe always had).
 * Every step is bounded and individually caught: housekeeping must NEVER throw.
 */
export async function runHousekeeping(): Promise<void> {
  const now = Date.now()
  if (globalForHousekeeping.lastSweepAt && now - globalForHousekeeping.lastSweepAt < HOUSEKEEPING_INTERVAL_MS) return
  globalForHousekeeping.lastSweepAt = now
  try {
    // Sessions expired more than 7 days ago → delete (kept briefly for forensics).
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 24 * 3600 * 1000) } } })
  } catch {
    // never fail the caller
  }
  try {
    // Guest carts idle >60 days → ABANDONED (no longer counted as active state).
    await db.cart.updateMany({
      where: { status: 'ACTIVE', userId: null, updatedAt: { lt: new Date(now - 60 * 24 * 3600 * 1000) } },
      data: { status: 'ABANDONED' },
    })
    // R8: EMPTY guest carts are pure clutter (one row is created per visitor —
    // 300+ accumulated in the sandbox in two days). Drop ones idle >7 days.
    await db.cart.deleteMany({
      where: { status: 'ACTIVE', userId: null, updatedAt: { lt: new Date(now - 7 * 24 * 3600 * 1000) }, items: { none: {} } },
    })
  } catch {
    // never fail the caller
  }
  try {
    // Password-reset tokens: expired ones are useless (single-use, 30 min) —
    // keep them 7 days for forensics, then delete.
    await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 24 * 3600 * 1000) } } })
    // Login throttles: entries not touched for 30 days (released locks included).
    await db.loginThrottle.deleteMany({ where: { lastFailAt: { lt: new Date(now - 30 * 24 * 3600 * 1000) } } })
    // Sandbox outbox: delivered mail older than 30 days.
    await db.mailMessage.deleteMany({ where: { sentAt: { lt: new Date(now - 30 * 24 * 3600 * 1000) } } })
  } catch {
    // never fail the caller
  }
  try {
    // BUG-005: scheduled publishing. A product left in SCHEDULED with a past
    // publishAt was never promoted by anything (the admin had to do it by
    // hand). Promote it here, exactly as the admin PATCH would. (Articles have
    // a `publishedAt` too, but that column holds the EDITORIAL date, not a
    // schedule trigger, and no code path ever sets Article status SCHEDULED —
    // so articles are intentionally NOT auto-promoted here.)
    await db.product.updateMany({
      where: { status: 'SCHEDULED', publishAt: { lte: new Date() } },
      data: { status: 'PUBLISHED' },
    })
  } catch {
    // never fail the caller
  }
  try {
    // Mail dispatch: with SMTP_* configured, drain up to 10 queued mails per
    // sweep. Unconfigured → no-op (rows stay queued). Never throws.
    await dispatchQueuedMails(10).catch(() => undefined)
    // R10: automatic weekly sales digest — the 7-day freshness guard inside
    // makes this fire exactly once per week; every other sweep is a cheap
    // no-op query. Never throws.
    await queueSalesDigestIfDue()
  } catch {
    // never fail the caller
  }
}
