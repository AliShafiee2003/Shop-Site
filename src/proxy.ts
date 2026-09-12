import { NextResponse, type NextRequest } from 'next/server'

/**
 * Exposes the real request pathname to the server components via the
 * `x-sp-path` header. The storefront is a single catch-all route that
 * server-renders the correct view per path (real URLs like /en/books/slug —
 * no hash routing), so layout/page need a reliable way to read the path.
 *
 * Next ≥16 renamed the `middleware` file convention to `proxy` (same runtime
 * layer, same matcher config) — the old name logged a deprecation warning.
 */
export default function proxy(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-sp-path', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and common static assets.
    '/((?!api/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[\\w]+$).*)',
  ],
}
