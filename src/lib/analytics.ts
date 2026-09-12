'use client'

/**
 * First-party analytics tracker (PRD 30.1) — strictly consent-gated.
 * - No events are sent unless the visitor accepted the cookie notice.
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
  // Consent gate (PRD 30.1: no measurement without consent).
  if (!useApp.getState().consentAccepted) return
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
