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

/** COM-414: a PENDING_PAYMENT order older than this is auto-cancelled. */
export const PENDING_PAYMENT_EXPIRY_HOURS = 24

/**
 * COM-414 — sweep stale unpaid orders. Every failed payment leaves an
 * Order+Payment row in PENDING_PAYMENT/FAILED that nothing ever cleaned up;
 * they accumulate and add dashboard/revenue-report noise. Orders past the
 * cutoff are flipped to CANCELLED with a guarded `updateMany` on the still-
 * PENDING status (idempotent: a concurrent cron/tick loser matches 0 rows),
 * plus an OrderEvent so the audit trail shows WHY it closed.
 *
 * NOTE — deliberately NO restock here: checkout records PENDING_PAYMENT orders
 * with stock UNTOUCHED (the atomic decrement only runs inside `if (paid)`), so
 * restocking on cancel would create inventory out of thin air. This deviates
 * from the generic "cancel ⇒ restock" pattern on purpose.
 * Never throws — housekeeping must not take the caller down.
 */
export async function cancelStalePendingPayments(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_EXPIRY_HOURS * 3600 * 1000)
  let cancelled = 0
  try {
    const stale = await db.order.findMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
      select: { id: true, orderNumber: true },
      take: 50, // bounded — the rest catch the next tick
    })
    for (const order of stale) {
      try {
        await db.$transaction(async (tx) => {
          const flip = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING_PAYMENT' },
            data: { status: 'CANCELLED' },
          })
          if (flip.count === 0) return // already cancelled by a concurrent sweep
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: 'CANCELLED',
              message: `Unpaid order auto-cancelled after ${PENDING_PAYMENT_EXPIRY_HOURS} h (housekeeping)`,
              actor: 'system',
            },
          })
          cancelled += 1
        })
      } catch {
        // one bad row must not stop the sweep
      }
    }
  } catch {
    // never fail the caller
  }
  return cancelled
}

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
