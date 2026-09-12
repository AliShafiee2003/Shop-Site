'use client'

import { useSyncExternalStore, useCallback, useEffect, useContext } from 'react'
import type { Locale } from './types'
import { parseRouteState, normalizePathShared, DEFAULT_SERVER_SNAPSHOT, type RouteState } from './route-state'
import { ServerRouteContext } from '@/components/storefront/SsrProviders'

export type { RouteState } from './route-state'

/**
 * Path-based router — REAL URLs, no hash.
 *
 * This app previously routed inside `location.hash` (`#/books/x`). It now
 * routes on the actual pathname + search string, powered by the History API:
 * `navigate()` uses history.pushState/replaceState, back/forward are observed
 * via `popstate`, and the catch-all SSR page (app/[...slug]) serves every
 * real URL directly — shareable, crawlable, one canonical form per page, with
 * per-page metadata AND (C3) a per-URL server-rendered body.
 *
 * Canonical URL policy (user-raised "link duality"): the default locale (EN)
 * is UNPREFIXED — `/books/x` — and only FA carries a prefix — `/fa/books/x`.
 * A legacy `/en` prefix is accepted for parsing (and doubles as the language
 * switcher's FORCE-EN marker) but is always normalized away, so `/en/books/x`
 * and `/books/x` are the same route with the same raw string. Legacy hash
 * deep links (`/#/fa/books/x`) are silently migrated to their real path on
 * load, so old shared links keep working without creating duplicate URLs.
 */

/** Path normalizer — shared implementation (legacy /en collapse). */
export function normalizePath(p: string): string {
  return normalizePathShared(p)
}

/** @deprecated hash-era alias of normalizePath. */
export const normalizeHashPath = normalizePath

/** Home path for a locale: EN keeps the bare root, FA is prefixed. */
export function homeHref(locale: Locale): string {
  return locale === 'fa' ? '/fa' : '/'
}

/** Canonical REAL href for a locale-scoped path — EN unprefixed, FA with /fa.
 *  Use for raw <Link href> attributes (logo, nav, breadcrumbs, cards): the
 *  address bar, shared links and crawlers now get clean paths, never a
 *  `#` form. */
export function localePath(locale: Locale, path: string): string {
  const clean = normalizePath(path)
  return locale === 'fa' && !clean.startsWith('/fa') ? `/fa${clean}` : clean
}

/** @deprecated hash-era alias of localePath (now returns a real path). */
export const localeHash = localePath

const listeners = new Set<() => void>()

function currentLoc(): string {
  return window.location.pathname + window.location.search
}

/** One-time migration: a legacy hash deep link (`#/fa/books/x`, `#/en/x`,
 *  `#/`) is silently rewritten to its real-path form BEFORE the first parse,
 *  so old shared links keep working while the address bar lands on the ONE
 *  canonical URL. Non-route hashes (#main, #section-3) are left untouched. */
function migrateLegacyHash() {
  const h = window.location.hash
  if (h.length > 1 && h.startsWith('#/')) {
    window.history.replaceState(null, '', normalizePath(h.slice(1)) + window.location.search)
  }
}

let snapshot = DEFAULT_SERVER_SNAPSHOT

function onChange() {
  snapshot = parseRouteState(currentLoc())
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  migrateLegacyHash()
  snapshot = parseRouteState(currentLoc())
  // pushState/replaceState above never fire popstate; browser back/forward do.
  window.addEventListener('popstate', onChange)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useRoute(): RouteState {
  // C3: the server snapshot is NO LONGER a hardcoded "homepage". The RSC
  // entry pages (app/page.tsx + app/[...slug]/page.tsx) parse the real URL
  // server-side and provide it via ServerRouteContext, so the SSR + hydration
  // render shows the ACTUAL page for the URL. After hydration the external
  // store (parsed from window.location) takes over — both agree by
  // construction, so there is no visible swap.
  const serverRoute = useContext(ServerRouteContext)
  return useSyncExternalStore(subscribe, () => snapshot, () => serverRoute ?? DEFAULT_SERVER_SNAPSHOT)
}

export function navigate(path: string, opts?: { replace?: boolean }) {
  if (typeof window === 'undefined') return
  // Locale-aware: a path without an /fa prefix inherits the CURRENT route
  // locale, so in-app links (filter chips, cart empty-states, admin "view"
  // buttons, …) never flip a Persian session back to English (PRD 19.2).
  // An explicit legacy `/en` prefix means FORCE-EN: it skips the inherit and
  // is then stripped, so the language switcher can request EN from a FA page
  // while the address bar still lands on the canonical unprefixed form.
  const raw = path.replace(/^#/, '')
  const forceEn = /^\/en(?=[/?]|$)/.test(raw)
  const clean = normalizePath(raw)
  const leading = clean.split('?')[0].split('/').filter(Boolean)
  const hasLocale = leading[0] === 'fa'
  const effective = !hasLocale && !forceEn && snapshot.locale === 'fa'
    ? `/fa${clean}`
    : clean
  if (opts?.replace) {
    window.history.replaceState(null, '', effective)
    onChange()
  } else {
    window.history.pushState(null, '', effective)
    onChange()
  }
}

/** Build a path for a locale, preserving current segments + query when
 *  switching language (PRD 19.2). EN targets carry an explicit (legacy-form)
 *  /en prefix which navigate() treats as force-EN and then strips — the bar
 *  lands on the canonical bare form (`/articles`), never an `/en/…` URL. */
export function useLocaleSwitch() {
  const route = useRoute()
  return useCallback(
    (locale: Locale) => {
      const qs = new URLSearchParams(route.query).toString()
      const segPath = route.segments.length ? `/${route.segments.join('/')}` : ''
      const tail = qs ? `?${qs}` : ''
      navigate(locale === 'fa' ? `/fa${segPath || '/'}${tail}` : `/en${segPath}${tail}`)
    },
    [route]
  ) as (locale: Locale) => void
}

/** Scroll to top when the path (not query) changes. */
export function useScrollTopOnNavigate(segments: string[]) {
  const key = segments.join('/')
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [key])
}
