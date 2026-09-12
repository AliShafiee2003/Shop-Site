// Isomorphic route-state parsing — imported by BOTH the client router
// (lib/router.ts) and the RSC entry pages, so the server can build the exact
// same RouteState the client would parse from window.location.
// C3 fix: the catch-all page now seeds useRoute()'s server snapshot with this
// per-URL state instead of a hardcoded "homepage" — the SSR body matches the
// URL (title/canonical/JSON-LD/content all agree; no cloaking pattern).

export interface RouteState {
  locale: 'en' | 'fa'
  segments: string[]
  query: Record<string, string>
  raw: string
}

/** Query decoding with application/x-www-form-urlencoded semantics
 *  (URLSearchParams writes spaces as '+' — see lib/router.ts note). */
export function decodeQueryValue(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    return raw
  }
}

/**
 * Canonical path policy (mirrors lib/router.ts): default locale (EN) is
 * UNPREFIXED (`/books/x`), FA carries `/fa`, legacy `/en` is normalized away.
 */
export function normalizePathShared(p: string): string {
  let s = p.startsWith('/') ? p : '/' + p
  if (/^\/en(?=[/?]|$)/.test(s)) s = s.slice(3) || '/'
  return s.startsWith('/') ? s : '/' + s
}

/** Build a RouteState from a full path (pathname + optional search). */
export function parseRouteState(full: string): RouteState {
  const h = normalizePathShared(full)
  const [pathPart, queryPart] = h.split('?')
  const segs = pathPart.split('/').filter(Boolean)
  const locale: 'en' | 'fa' = segs[0] === 'fa' ? 'fa' : 'en'
  const rest = segs[0] === 'fa' || segs[0] === 'en' ? segs.slice(1) : segs
  const query: Record<string, string> = {}
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      const [k, v] = kv.split('=')
      if (k) query[decodeQueryValue(k)] = decodeQueryValue(v ?? '')
    }
  }
  return { locale, segments: rest, query, raw: h }
}

/** Server-side helper: assemble a full path from Next's catch-all params +
 *  searchParams (both decoded) exactly like the client's
 *  `location.pathname + location.search` would. */
export function routeStateFromParams(
  slugs: string[] | undefined,
  searchParams: Record<string, string | string[] | undefined> | undefined,
): RouteState {
  const pathname = slugs && slugs.length > 0 ? `/${slugs.join('/')}` : '/'
  const sp = new URLSearchParams()
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue
      if (Array.isArray(v)) v.forEach((item) => sp.append(k, item))
      else sp.append(k, v)
    }
  }
  const qs = sp.toString()
  return parseRouteState(qs ? `${pathname}?${qs}` : pathname)
}

export const DEFAULT_SERVER_SNAPSHOT: RouteState = { locale: 'en', segments: [], query: {}, raw: '/' }
