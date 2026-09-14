'use client'

import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, CircleAlert, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { apiPost } from '@/lib/api'
import { getDict } from '@/lib/i18n'

/** S13 residual — email-verification landing page (/verify-email?token=…).
 *  The mail link points here; the page POSTs the token to the API. POST (not
 *  GET) so mail-scanner prefetches cannot burn the single-use token. */
export function VerifyEmailView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const token = typeof route.query.token === 'string' ? route.query.token : ''

  // state: 'idle' (no token) | 'busy' | 'ok' | 'bad'
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>(token ? 'busy' : 'idle')
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    apiPost<{ ok: boolean }>('/api/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch(() => setState('bad'))
  }, [token])

  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-14 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        {/* icon medallion — mirrors the forgot/reset card visual */}
        <div className="flex justify-center">
          <span
            className={
              'flex h-14 w-14 items-center justify-center rounded-full border ' +
              (state === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                : state === 'bad'
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-brand/20 bg-brand-soft text-brand')
            }
            aria-hidden
          >
            {state === 'busy' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : state === 'ok' ? (
              <BadgeCheck className="h-6 w-6" />
            ) : state === 'bad' ? (
              <CircleAlert className="h-6 w-6" />
            ) : (
              <MailCheck className="h-6 w-6" />
            )}
          </span>
        </div>

        {state === 'busy' && (
          <p className="mt-5 text-center text-sm font-medium text-ink-2">{t.verify.checking}</p>
        )}

        {state === 'ok' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.verify.doneTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.verify.doneBody}</p>
            <Button onClick={() => navigate('/account')} className="mt-6 w-full">{t.verify.toAccount}</Button>
          </>
        )}

        {state === 'bad' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.verify.badTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.verify.badBody}</p>
            <div className="mt-6 grid gap-2">
              <Button onClick={() => navigate('/account/privacy')} variant="outline" className="w-full">{t.verify.toAccount}</Button>
            </div>
          </>
        )}

        {state === 'idle' && (
          <>
            <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{t.verify.idleTitle}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{t.verify.idleBody}</p>
            <Button onClick={() => navigate('/account/privacy')} className="mt-6 w-full">{t.verify.toAccount}</Button>
          </>
        )}

        <p className="mt-5 text-center text-xs text-ink-3">
          {isFa ? 'این صفحه یک‌بار مصرف است و پس از تأیید منقضی می‌شود.' : 'This one-time link expires after it has been used.'}
        </p>
      </div>
    </main>
  )
}
