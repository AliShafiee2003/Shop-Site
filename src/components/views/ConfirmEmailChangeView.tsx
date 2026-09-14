'use client'

import { useEffect, useRef, useState } from 'react'
import { AtSign, BadgeCheck, CircleAlert, Loader2, MailX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { apiPost } from '@/lib/api'
import { getDict } from '@/lib/i18n'

/** S11 — email-change landing page (/confirm-email-change?token=…).
 *  The mail link points here; the page POSTs the token to the API. POST (not
 *  GET) so mail-scanner prefetches cannot burn the single-use token — the
 *  exact model of the /verify-email page. */
export function ConfirmEmailChangeView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const token = typeof route.query.token === 'string' ? route.query.token : ''

  // state: 'idle' (no token) | 'busy' | 'ok' | 'bad' | 'in_use'
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad' | 'in_use'>(token ? 'busy' : 'idle')
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    apiPost<{ ok: boolean }>('/api/auth/confirm-email-change', { token })
      .then(() => setState('ok'))
      .catch((err) => {
        const code = (err as { code?: string }).code
        setState(code === 'EMAIL_IN_USE' ? 'in_use' : 'bad')
      })
  }, [token])

  const tone =
    state === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : state === 'bad' || state === 'in_use'
        ? 'border-red-200 bg-red-50 text-red-600'
        : 'border-brand/20 bg-brand-soft text-brand'

  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-14 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        {/* icon medallion — mirrors the verify/forgot card visual */}
        <div className="flex justify-center">
          <span className={'flex h-14 w-14 items-center justify-center rounded-full border ' + tone} aria-hidden>
            {state === 'busy' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : state === 'ok' ? (
              <BadgeCheck className="h-6 w-6" />
            ) : state === 'bad' || state === 'in_use' ? (
              <CircleAlert className="h-6 w-6" />
            ) : (
              <AtSign className="h-6 w-6" />
            )}
          </span>
        </div>

        {state === 'busy' && <p className="mt-5 text-center text-sm font-medium text-ink-2">{t.emailChange.checking}</p>}

        {state === 'ok' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.emailChange.doneTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.emailChange.doneBody}</p>
            <Button onClick={() => navigate('/login')} className="mt-6 w-full">{t.emailChange.toLogin}</Button>
          </>
        )}

        {state === 'bad' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.emailChange.badTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.emailChange.badBody}</p>
            <Button onClick={() => navigate('/account/privacy')} variant="outline" className="mt-6 w-full">{t.emailChange.toAccount}</Button>
          </>
        )}

        {state === 'in_use' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.emailChange.inUseTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.emailChange.inUseBody}</p>
            <Button onClick={() => navigate('/account/privacy')} variant="outline" className="mt-6 w-full">{t.emailChange.toAccount}</Button>
          </>
        )}

        {state === 'idle' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">
              <MailX className="me-2 inline h-5 w-5 text-ink-3" aria-hidden />
              {t.emailChange.idleTitle}
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.emailChange.idleBody}</p>
            <Button onClick={() => navigate('/account/privacy')} className="mt-6 w-full">{t.emailChange.toAccount}</Button>
          </>
        )}

        <p className="mt-5 text-center text-xs text-ink-3">
          {locale === 'fa'
            ? 'این پیوند یک‌بارمصرف است و پس از تأیید منقضی می‌شود.'
            : 'This one-time link expires after it has been used.'}
        </p>
      </div>
    </main>
  )
}
