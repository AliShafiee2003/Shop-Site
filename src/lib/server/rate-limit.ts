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
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count += 1
  return { ok: true, remaining: max - bucket.count, retryAfterSec: 0 }
}
