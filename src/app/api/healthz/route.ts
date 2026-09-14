// GET /api/healthz — liveness + DB readiness probe (DevOps gap in the audit).
// OPS-004: the probe is now PURE — the housekeeping/scheduler body moved to
// src/lib/server/housekeeping.ts (runHousekeeping) and the real scheduler is
// GET /api/cron/tick (Bearer CRON_SECRET). The legacy side-effect behaviour is
// retained only behind HEALTHZ_OPS for single-process deployments that have no
// cron: SEC-015 (audit v2) — UNSET defaults to side-effect-free ('0') in
// PRODUCTION and to the historic '1' in dev, so a bare production deploy can
// never run write-ish ops inside its health probe.
import { db } from '@/lib/db'
import { json } from '@/lib/server/utils'
import { runHousekeeping } from '@/lib/server/housekeeping'

export async function GET() {
  const startedAt = Date.now()
  let dbOk = true
  try {
    await db.$queryRaw`SELECT 1`
    // Fire-and-forget so probe latency stays low (never awaited, never throws).
    // SEC-015 (audit v2): the default flipped to fail-closed — probes must be
    // side-effect-free unless housekeeping is EXPLICITLY requested. Old
    // behaviour (UNSET → '1') silently kept write-ish ops inside the health
    // probe; now UNSET means '1' in dev only and '0' (pure probe) in
    // production. Single-process deployments that still rely on probe-driven
    // housekeeping must set HEALTHZ_OPS=1 explicitly.
    const ops = (process.env.HEALTHZ_OPS ?? (process.env.NODE_ENV === 'production' ? '0' : '1')).trim()
    if (ops === '1') void runHousekeeping()
  } catch {
    dbOk = false
  }
  return json(
    { ok: dbOk, service: 'persepix-web', db: dbOk, latencyMs: Date.now() - startedAt, ts: new Date().toISOString() },
    dbOk ? 200 : 503,
  )
}
