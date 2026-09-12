// Canonical deployment origin — single source of truth for metadata
// canonicals, OG URLs, JSON-LD and the sitemap (replaces the hardcoded
// `https://persepix.example` placeholder flagged by the audit).
// Priority: NEXT_PUBLIC_SITE_URL → APP_URL → request headers → localhost.
// SEC-002: the header-based fallback is DEV/SANDBOX ONLY. In production the
// origin MUST come from env — trusting Host/X-Forwarded-Host lets a spoofed
// header poison canonicals, OG URLs, the sitemap cache and OAuth redirect
// URIs, so production fails fast instead of guessing.
export function siteUrlFrom(req: { headers: Headers } | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim()
  if (env) return env.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Site origin is not configured: set NEXT_PUBLIC_SITE_URL (or APP_URL) in production. Host-header fallback is disabled there (audit SEC-002).',
    )
  }
  if (req) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (host) {
      const proto =
        req.headers.get('x-forwarded-proto') ??
        (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
      return `${proto}://${host}`
    }
  }
  return 'http://localhost:3000'
}
