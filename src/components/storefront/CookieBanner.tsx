'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cookie, Settings2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/store'
import { getDict } from '@/lib/i18n'
import {
  ACCEPT_ALL_OPTIONAL,
  REJECT_ALL_OPTIONAL,
  fetchAndAdoptConsent,
  saveConsentDecision,
} from '@/lib/consent-client'

const noopSubscribe = () => () => {}

/** Footer "Cookie settings" dispatches this to re-open the banner. */
export const COOKIE_SETTINGS_EVENT = 'sp:cookie-settings'

export function CookieBanner() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const setConsentAccepted = useApp((s) => s.setConsentAccepted)
  const openPrefs = useApp((s) => s.setCookiePrefsOpen)
  // A server-verified decision (adopted on mount, or written by the
  // preference center) always outranks the legacy localStorage flag.
  const serverDecided = useApp((s) => s.consent?.decided ?? false)

  // Hydration-safe "persisted decision" read: '1' accepted · '0' rejected · null undecided.
  const decided = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        const v = window.localStorage.getItem('sp_consent_v1')
        return v === '1' || v === '0'
      } catch {
        return true
      }
    },
    () => true // hide during SSR & first hydration pass
  )

  // Adopt the SERVER-verified decision (append-only log behind the httpOnly
  // sp_consent_id cookie) once per mount: when one exists — even if this
  // browser never wrote the legacy localStorage flag — the banner stays
  // hidden and the granular state lands in the store for the dialog/analytics.
  useEffect(() => {
    let on = true
    fetchAndAdoptConsent()
      .then((state) => {
        if (!on || !state.decided) return
        try { window.localStorage.setItem('sp_consent_v1', '1') } catch { /* private mode */ }
        setConsentAccepted(true)
      })
      .catch(() => { /* API unreachable → banner follows localStorage only */ })
    return () => { on = false }
  }, [setConsentAccepted])

  // Footer "Cookie settings" reopens the banner regardless of the stored choice.
  const [reopen, setReopen] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const onSettings = () => setReopen(true)
    window.addEventListener(COOKIE_SETTINGS_EVENT, onSettings)
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, onSettings)
  }, [])

  /** Banner-level quick decision: optimistic local write first (snappy UI,
   *  works offline), then the append-only server record becomes the verified
   *  state — GET-side reads join on its sp_consent_id cookie. */
  const choose = async (accepted: boolean) => {
    try {
      window.localStorage.setItem('sp_consent_v1', accepted ? '1' : '0')
    } catch { /* private mode — session-only consent */ }
    setConsentAccepted(accepted)
    setReopen(false)
    setGone(true)
    try {
      await saveConsentDecision(
        accepted ? 'accept_all' : 'reject_optional',
        accepted ? ACCEPT_ALL_OPTIONAL : REJECT_ALL_OPTIONAL,
        'banner',
      )
    } catch { /* offline → the local decision stands for this session */ }
  }

  if ((decided && !reopen) || gone || (serverDecided && !reopen)) return null

  return (
    <div
      role="region"
      aria-label={t.cookie.link}
      className="fade-up fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl overflow-hidden rounded-xl border border-line bg-white shadow-2xl"
    >
      {/* brand top hairline */}
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-brand via-brand to-orange-accent" />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-accent/10 text-orange-accent" aria-hidden>
          <Cookie className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t.cookie.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.cookie.text}</p>
          <div className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-success">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <span>{t.cookie.essentialNote}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-9 px-4" onClick={() => choose(true)}>{t.cookie.acceptAll}</Button>
            <Button size="sm" variant="outline" className="h-9" onClick={() => choose(false)}>{t.cookie.reject}</Button>
            <button
              type="button"
              onClick={() => openPrefs(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              {t.cookie.settings}
            </button>
            <button
              type="button"
              onClick={() => navigate('/legal/cookies')}
              className="ms-auto text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {t.cookie.link}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
