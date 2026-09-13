import { NextResponse, type NextRequest } from 'next/server'

/**
 * Two jobs:
 *
 * 1. Exposes the real request pathname to the server components via the
 *    `x-sp-path` header. The storefront is a single catch-all route that
 *    server-renders the correct view per path (real URLs like /en/books/slug —
 *    no hash routing), so layout/page need a reliable way to read the path.
 *
 * 2. Audit SEC-003: issues the Content-Security-Policy header. In production
 *    script-src uses a per-request nonce + 'strict-dynamic' (NO 'unsafe-inline')
 *    — Next.js picks the nonce up from the CSP request header and applies it to
 *    its own bootstrap scripts. JSON-LD blocks are data blocks (never executed)
 *    and need no nonce. In development the policy keeps
 *    'unsafe-inline'/'unsafe-eval' for HMR/react-refresh (a nonce there would
 *    make browsers ignore 'unsafe-inline' and break next dev).
 *
 * Next ≥16 renamed the `middleware` file convention to `proxy` (same runtime
 * layer, same matcher config) — the old name logged a deprecation warning.
 */
const isProd = process.env.NODE_ENV === 'production'

function buildCsp(nonce?: string): string {
  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "'self' 'unsafe-inline' 'unsafe-eval'" // dev only: HMR / react-refresh
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'", // React inline styles
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ')
}

export default function proxy(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-sp-path', req.nextUrl.pathname + req.nextUrl.search)

  let csp: string
  if (isProd) {
    const nonce = btoa(crypto.randomUUID()).replace(/=+$/, '')
    // Request header → Next.js applies the nonce to its own <script> tags.
    headers.set('content-security-policy', buildCsp(nonce))
    csp = buildCsp(nonce)
  } else {
    csp = buildCsp()
  }

  const res = NextResponse.next({ request: { headers } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: [
    // Everything except API routes (they keep a static CSP from next.config),
    // Next internals and common static assets.
    '/((?!api/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|.*\\.[\\w]+$).*)',
  ],
}
