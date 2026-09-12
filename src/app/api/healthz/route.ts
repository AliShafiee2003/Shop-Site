// GET /api/healthz — liveness + DB readiness probe (DevOps gap in the audit).
// OPS-004: the probe is now PURE — the housekeeping/scheduler body moved to
// src/lib/server/housekeeping.ts (runHousekeeping) and the real scheduler is
// GET /api/cron/tick (Bearer CRON_SECRET). The legacy side-effect behaviour is
// retained only behind HEALTHZ_OPS for single-process deployments that have no
// cron: UNSET/'' defaults to '1' (sandbox keeps working exactly as before);
// production sets HEALTHZ_OPS=0 so probes stay free of side effects.
import { db } from '@/lib/db'
import { json } from '@/lib/server/utils'
import { runHousekeeping } from '@/lib/server/housekeeping'

export async function GET() {
  const startedAt = Date.now()
  let dbOk = true
  try {
    await db.$queryRaw`SELECT 1`
    // Fire-and-forget so probe latency stays low (never awaited, never throws).
    // Sandbox default: when HEALTHZ_OPS is UNSET we keep the historic
    // behaviour ('1') so nothing regresses; production should set '0'.
    const ops = process.env.HEALTHZ_OPS ?? '1'
    if (ops === '1') void runHousekeeping()
  } catch {
    dbOk = false
  }
  return json(
    { ok: dbOk, service: 'persepix-web', db: dbOk, latencyMs: Date.now() - startedAt, ts: new Date().toISOString() },
    dbOk ? 200 : 503,
  )
}
