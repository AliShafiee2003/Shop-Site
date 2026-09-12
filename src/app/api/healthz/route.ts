// GET /api/healthz — liveness + DB readiness probe (DevOps gap in the audit).
// Also doubles as the lazy housekeeping tick: expired sessions and long
// abandoned carts are swept at most once every 6 hours, bounded and safe.
import { db } from '@/lib/db'
import { json } from '@/lib/server/utils'
import { dispatchQueuedMails } from '@/lib/server/mail-dispatch'

const HOUSEKEEPING_INTERVAL_MS = 6 * 60 * 60 * 1000
const globalForHousekeeping = globalThis as unknown as { lastSweepAt?: number }

async function housekeeping(): Promise<void> {
  const now = Date.now()
  if (globalForHousekeeping.lastSweepAt && now - globalForHousekeeping.lastSweepAt < HOUSEKEEPING_INTERVAL_MS) return
  globalForHousekeeping.lastSweepAt = now
  try {
    // Sessions expired more than 7 days ago → delete (kept briefly for forensics).
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 24 * 3600 * 1000) } } })
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
    // Password-reset tokens: expired ones are useless (single-use, 30 min) —
    // keep them 7 days for forensics, then delete.
    await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 24 * 3600 * 1000) } } })
    // Login throttles: entries not touched for 30 days (released locks included).
    await db.loginThrottle.deleteMany({ where: { lastFailAt: { lt: new Date(now - 30 * 24 * 3600 * 1000) } } })
    // Sandbox outbox: delivered mail older than 30 days.
    await db.mailMessage.deleteMany({ where: { sentAt: { lt: new Date(now - 30 * 24 * 3600 * 1000) } } })
    // Mail dispatch: with SMTP_* configured, drain up to 10 queued mails per
    // sweep. Unconfigured → no-op (rows stay queued). Never throws.
    await dispatchQueuedMails(10).catch(() => undefined)
  } catch {
    // housekeeping must never fail the health probe
  }
}

export async function GET() {
  const startedAt = Date.now()
  let dbOk = true
  try {
    await db.$queryRaw`SELECT 1`
    void housekeeping()
  } catch {
    dbOk = false
  }
  return json(
    { ok: dbOk, service: 'persepix-web', db: dbOk, latencyMs: Date.now() - startedAt, ts: new Date().toISOString() },
    dbOk ? 200 : 503,
  )
}
