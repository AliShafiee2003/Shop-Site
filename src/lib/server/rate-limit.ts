// Simple in-memory fixed-window rate limiter (per-process; fine for sandbox).
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

let lastPrune = Date.now()
function prune(now: number): void {
  if (now - lastPrune < 60_000) return
  lastPrune = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

// API-402 (audit v4): the limiter computes the reset window, but the 429 call
// sites only see `ok:false` — the value used to be thrown away and 429
// responses shipped without a `Retry-After` header. The blocked window of the
// MOST RECENT rateLimit() call is remembered here so `apiError(429, …)` (the
// single funnel every 429 goes through) can attach the header without touching
// the 24 route files. Safe because `rateLimit()` and the `apiError(429, …)`
// return are adjacent synchronous statements (no await between them), so no
// other request can interleave and overwrite the value in between.
let lastBlocked: { retryAfterSec: number; at: number } = { retryAfterSec: 0, at: 0 }

/** Seconds until the most recently hit limiter window resets (0 = unknown). */
export function lastBlockedRetryAfterSec(): number {
  // Freshness guard: a 429 built long after the rateLimit() call (or one from
  // an unrelated path) must not emit a stale hint. 10s is generous — the two
  // calls are adjacent in every call site.
  if (Date.now() - lastBlocked.at > 10_000) return 0
  return lastBlocked.retryAfterSec
}

/**
 * Fixed-window limiter keyed by arbitrary string (usually `ip:route`).
 * Usage: const rl = rateLimit(`${ip}:search`, 30, 60_000); if (!rl.ok) return 429.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1, retryAfterSec: 0 }
  }
  if (bucket.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    lastBlocked = { retryAfterSec, at: now }
    return { ok: false, remaining: 0, retryAfterSec }
  }
  bucket.count += 1
  return { ok: true, remaining: max - bucket.count, retryAfterSec: 0 }
}
