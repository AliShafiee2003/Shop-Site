import { cache } from 'react'

/**
 * Per-request bridge for the real request pathname.
 *
 * `src/app/layout.tsx` (server) reads the `x-sp-path` header set by
 * `src/middleware.ts` and stores it here; the isomorphic router
 * (`src/lib/router.ts`) reads it during server rendering so SSR output
 * matches the requested URL (real per-path HTML, no hash routing).
 * React `cache()` keeps this request-scoped and concurrency-safe.
 */
const store = cache((): { path: string } => ({ path: '/' }))

export function setSpPath(path: string) {
  store().path = path
}

export function getSpPath(): string {
  return store().path
}
