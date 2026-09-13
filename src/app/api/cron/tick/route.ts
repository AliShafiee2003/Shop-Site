// GET /api/cron/tick — the external scheduler seam (OPS-004 / BUG-005).
// A cron daemon (system crontab, Caddy/host scheduler, Vercel Cron…) calls this
// every few minutes with `Authorization: Bearer $CRON_SECRET` and the app does
// its periodic work WITHOUT piggybacking on the health probe:
//   1. runHousekeeping()   — session/cart/token sweeps + scheduled publishing
//                            (6h global guard inside; extra calls are no-ops)
//   2. cancelStalePendingPayments — COM-414: PENDING_PAYMENT orders older than
//                            24 h → CANCELLED (guarded flip, idempotent, cheap
//                            enough to run every tick)
//   3. dispatchQueuedMails — drain up to 20 queued outbox mails per tick
//   4. queueSalesDigestIfDue — weekly digest (freshness guard inside)
// Disabled unless CRON_SECRET is set: 403 DISABLED keeps the endpoint closed
// in sandboxes that never opted in.
import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { cancelStalePendingPayments, runHousekeeping } from '@/lib/server/housekeeping'
import { dispatchQueuedMails } from '@/lib/server/mail-dispatch'
import { queueSalesDigestIfDue } from '@/lib/server/report-mail'
import { apiError, json } from '@/lib/server/utils'

/** Constant-time string compare (equal-length guard first — lengths are not secret). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return apiError(403, 'DISABLED', 'CRON_SECRET is not configured')

  const auth = req.headers.get('authorization') ?? ''
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return apiError(403, 'FORBIDDEN', 'Invalid scheduler credentials')
  }

  await runHousekeeping()
  const cancelledStalePending = await cancelStalePendingPayments()
  await dispatchQueuedMails(20).catch(() => undefined)
  await queueSalesDigestIfDue().catch(() => undefined)

  return json({ ok: true, cancelledStalePending, ts: new Date().toISOString() })
}
