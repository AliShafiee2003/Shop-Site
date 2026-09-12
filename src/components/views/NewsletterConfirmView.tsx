'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Loader2, MailCheck, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { apiPost } from '@/lib/api'
import { getDict } from '@/lib/i18n'

/** Newsletter double opt-in landing page (/newsletter-confirm?email=…&sig=…).
 *  The mail link points here; the page POSTs email+sig to the API. POST (not
 *  GET) so mail-scanner prefetches cannot complete the opt-in. */
export function NewsletterConfirmView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const email = typeof route.query.email === 'string' ? route.query.email : ''
  const sig = typeof route.query.sig === 'string' ? route.query.sig : ''

  // state: 'idle' (missing params) | 'busy' | 'ok' | 'already' | 'bad'
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'already' | 'bad'>(
    email && sig ? 'busy' : 'idle',
  )
  const attempted = useRef(false)

  useEffect(() => {
    if (!email || !sig || attempted.current) return
    attempted.current = true
    apiPost<{ ok: boolean; alreadyConfirmed?: boolean }>('/api/newsletter/confirm', { email, sig })
      .then((r) => setState(r.alreadyConfirmed ? 'already' : 'ok'))
      .catch(() => setState('bad'))
  }, [email, sig])

  const titles: Record<typeof state, string> = {
    idle: t.nlConfirm.idleTitle,
    busy: t.nlConfirm.checking,
    ok: t.nlConfirm.doneTitle,
    already: t.nlConfirm.alreadyTitle,
    bad: t.nlConfirm.badTitle,
  }
  const bodies: Record<typeof state, string> = {
    idle: t.nlConfirm.idleBody,
    busy: '',
    ok: t.nlConfirm.doneBody,
    already: t.nlConfirm.alreadyBody,
    bad: t.nlConfirm.badBody,
  }
  const tone =
    state === 'ok' || state === 'already'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : state === 'bad'
        ? 'border-red-200 bg-red-50 text-red-600'
        : 'border-brand/20 bg-brand-soft text-brand'

  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-14 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        <div className="flex justify-center">
          <span className={'flex h-14 w-14 items-center justify-center rounded-full border ' + tone} aria-hidden>
            {state === 'busy' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : state === 'ok' ? (
              <PartyPopper className="h-6 w-6" />
            ) : state === 'already' ? (
              <MailCheck className="h-6 w-6" />
            ) : state === 'bad' ? (
              <CircleAlert className="h-6 w-6" />
            ) : (
              <MailCheck className="h-6 w-6" />
            )}
          </span>
        </div>

        <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink">{titles[state]}</h1>
        {bodies[state] && <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">{bodies[state]}</p>}

        {state === 'ok' && (
          <Button onClick={() => navigate('/')} className="mt-6 w-full">{t.nlConfirm.toHome}</Button>
        )}
        {state === 'already' && (
          <Button onClick={() => navigate('/')} className="mt-6 w-full">{t.nlConfirm.toHome}</Button>
        )}
        {state === 'bad' && (
          <Button onClick={() => navigate('/')} variant="outline" className="mt-6 w-full">{t.nlConfirm.toHome}</Button>
        )}
        {state === 'idle' && (
          <Button onClick={() => navigate('/')} className="mt-6 w-full">{t.nlConfirm.toHome}</Button>
        )}
      </div>
    </main>
  )
}
