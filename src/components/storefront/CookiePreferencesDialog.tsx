'use client'

import { useEffect, useState } from 'react'
import { Cookie, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { useApp } from '@/store/store'
import { getDict } from '@/lib/i18n'
import {
  ACCEPT_ALL_OPTIONAL,
  REJECT_ALL_OPTIONAL,
  saveConsentDecision,
  type OptionalCategories,
} from '@/lib/consent-client'
import type { Locale } from '@/lib/types'

/**
 * Cookie preference center (spec §6.5) — granular toggles for the four optional
 * categories; necessary is locked. Openable from the banner, the footer link and
 * the cookie notice page; initialized from the verified saved decision.
 */
export function CookiePreferencesDialog() {
  const route = useRoute()
  const locale: Locale = route.locale
  const t = getDict(locale)
  const open = useApp((s) => s.cookiePrefsOpen)
  const setOpen = useApp((s) => s.setCookiePrefsOpen)
  const consent = useApp((s) => s.consent)

  const [sel, setSel] = useState<OptionalCategories>(REJECT_ALL_OPTIONAL)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<'saved' | 'failed' | null>(null)

  // Initialize toggles from the verified decision each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setResult(null)
    if (consent?.decided) {
      setSel({
        preferences: consent.categories.preferences,
        analytics: consent.categories.analytics,
        personalization: consent.categories.personalization,
        marketing: consent.categories.marketing,
      })
    } else {
      // No prior decision → optional categories default to OFF (spec §6.5).
      setSel(REJECT_ALL_OPTIONAL)
    }
  }, [open, consent])

  const persist = async (action: 'accept_all' | 'reject_optional' | 'custom', cats: OptionalCategories) => {
    setBusy(action)
    setResult(null)
    try {
      await saveConsentDecision(action, cats, 'preference_center')
      setResult('saved')
      // Keep the quick-decision surfaces consistent: a verified server
      // decision means the bottom banner never needs to come back.
      try { window.localStorage.setItem('sp_consent_v1', '1') } catch { /* private mode */ }
      useApp.getState().setConsentAccepted(true)
      window.setTimeout(() => setOpen(false), 600)
    } catch {
      setResult('failed')
    } finally {
      setBusy(null)
    }
  }

  const rows: { key: keyof OptionalCategories | 'necessary'; label: string; desc: string; locked?: boolean }[] = [
    { key: 'necessary', label: t.cookie.cats.necessary, desc: t.cookie.cats.necessaryDesc, locked: true },
    { key: 'preferences', label: t.cookie.cats.preferences, desc: t.cookie.cats.preferencesDesc },
    { key: 'analytics', label: t.cookie.cats.analytics, desc: t.cookie.cats.analyticsDesc },
    { key: 'personalization', label: t.cookie.cats.personalization, desc: t.cookie.cats.personalizationDesc },
    { key: 'marketing', label: t.cookie.cats.marketing, desc: t.cookie.cats.marketingDesc },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88svh] max-w-lg gap-0 overflow-y-auto p-0">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft" aria-hidden>
            <Cookie className="h-4.5 w-4.5 text-brand" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-ink">{t.cookie.settings}</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {t.cookie.text}
            </DialogDescription>
          </div>
        </div>

        <div className="divide-y divide-line px-5">
          {rows.map((row) => {
            const checked = row.locked ? true : sel[row.key as keyof OptionalCategories]
            return (
              <div key={row.key} className="flex items-start justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {row.label}
                    {row.locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        {t.cookie.alwaysActive}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">{row.desc}</p>
                </div>
                <Switch
                  checked={checked}
                  disabled={row.locked || busy !== null}
                  onCheckedChange={(v) => { setSel((s) => ({ ...s, [row.key]: v })); setResult(null) }}
                  aria-label={row.label}
                  className="mt-0.5 shrink-0 data-[state=checked]:bg-brand"
                />
              </div>
            )
          })}
        </div>

        <div className="px-5 pb-4 pt-3">
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/legal/cookies') }}
            className="text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            {t.cookie.link} →
          </button>
        </div>

        <div className="border-t border-line bg-soft px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11 flex-1" disabled={busy !== null} onClick={() => persist('custom', sel)}>
              {busy === 'custom' ? '…' : t.cookie.savePrefs}
            </Button>
            <Button variant="outline" className="h-11 flex-1" disabled={busy !== null} onClick={() => persist('accept_all', ACCEPT_ALL_OPTIONAL)}>
              {busy === 'accept_all' ? '…' : t.cookie.acceptAll}
            </Button>
            <Button variant="ghost" className="h-11 flex-1 text-ink-3" disabled={busy !== null} onClick={() => persist('reject_optional', REJECT_ALL_OPTIONAL)}>
              {busy === 'reject_optional' ? '…' : t.cookie.rejectNon}
            </Button>
          </div>
          <p aria-live="polite" className="mt-2 min-h-5 text-center text-xs">
            {result === 'saved' ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{t.cookie.saved}
              </span>
            ) : result === 'failed' ? (
              <span role="alert" className="font-medium text-error">{t.cookie.saveFailed}</span>
            ) : (
              ''
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
