'use client'

/**
 * First-party analytics tracker (PRD 30.1) — strictly consent-gated.
 * - No events are sent unless the server-verified consent decision is DECIDED
 *   and its granular `analytics` category is ON (audit PRIV-001).
 * - No cookies, no PII: an anonymous random session key is kept in localStorage
 *   and rotated every 24h. Failures are swallowed (analytics must never break UX).
 */
import { useApp } from '@/store/store'

const AID_KEY = 'sp_aid_v1'

function getSessionKey(): string {
  try {
    const raw = window.localStorage.getItem(AID_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { k: string; t: number }
      // Rotate the anonymous key daily.
      if (parsed && typeof parsed.k === 'string' && Date.now() - parsed.t < 24 * 3600_000) return parsed.k
    }
    const k = Math.random().toString(36).slice(2) + Date.now().toString(36)
    window.localStorage.setItem(AID_KEY, JSON.stringify({ k, t: Date.now() }))
    return k
  } catch {
    return 'anon'
  }
}

export type AnalyticsType =
  | 'view_product'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'search'
  | 'view_article'

export function track(
  type: AnalyticsType,
  payload: { productSlug?: string; valueMinor?: number } = {},
): void {
  if (typeof window === 'undefined') return
  // Granular consent gate (PRD 30.1 + audit PRIV-001): measurement requires a
  // DECIDED, server-verified consent whose analytics category is enabled —
  // the legacy consentAccepted boolean alone is NOT sufficient.
  const c = useApp.getState().consent
  if (!(c?.decided === true && c?.categories?.analytics === true)) return
  const body = JSON.stringify({
    type,
    path: window.location.pathname + window.location.search || '/',
    locale: useApp.getState().locale,
    sessionKey: getSessionKey(),
    ...payload,
  })
  try {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch { /* ignore */ }
}
