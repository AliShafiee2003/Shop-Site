'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { navigate, useRoute } from '@/lib/router'
import { api, apiPost } from '@/lib/api'
import { getDict } from '@/lib/i18n'

/** S13 — forgot / reset password surfaces (bilingual, one component).
 *  /forgot-password           → request a reset link
 *  /forgot-password?token=…   → choose a new password (consumes the token)
 *  /reset-password?token=…    → same surface, canonical alias
 *  The request form shows the SAME success message whether or not the email
 *  exists (S9 anti-enumeration); the sandbox may attach a dev-only resetUrl. */
export function PasswordResetView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const token = typeof route.query.token === 'string' ? route.query.token : ''

  // mode: null until the route query has settled (SSR-safe default = request).
  const [mode, setMode] = useState<'request' | 'reset'>(token ? 'reset' : 'request')
  useEffect(() => { setMode(token ? 'reset' : 'request') }, [token])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // ── Request a reset link ────────────────────────────────────────────────
  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await api<{ ok: boolean; resetUrl?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: { 'x-locale': locale },
      })
      setSent(true)
      // Sandbox convenience only (DEV_EXPOSE_RESET_LINK) — never in production.
      if (res.resetUrl) setDevResetUrl(res.resetUrl)
    } catch (err) {
      const e2 = err as { code?: string }
      setError(e2.code === 'RATE_LIMITED' ? (locale === 'fa' ? 'درخواست‌ها زیاد بود — کمی بعد دوباره تلاش کنید.' : 'Too many requests — please try again later.') : t.auth.resetLinkBad)
    } finally { setBusy(false) }
  }

  // ── Consume the token and set the new password ──────────────────────────
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError(t.account.passwordMismatch); return }
    setBusy(true); setError(null)
    try {
      await apiPost('/api/auth/reset-password', { token, password })
      setDone(true)
    } catch (err) {
      const e2 = err as { code?: string }
      if (e2.code === 'TOKEN_INVALID') setError(t.auth.resetLinkBad)
      else if (e2.code === 'RATE_LIMITED') setError(locale === 'fa' ? 'درخواست‌ها زیاد بود — کمی بعد دوباره تلاش کنید.' : 'Too many requests — please try again later.')
      else setError(locale === 'fa' ? 'ذخیرهٔ گذرواژه ناموفق بود — دوباره تلاش کنید.' : 'Could not save the password — please try again.')
    } finally { setBusy(false) }
  }

  const cardShell = 'mx-auto flex w-full max-w-md flex-col px-4 py-14 sm:px-6'
  const cardBox = 'rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8'

  if (mode === 'reset' && done) {
    return (
      <main id="main" className={cardShell}>
        <div className={`${cardBox} text-center`} role="status">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            <KeyRound className="h-6 w-6 text-brand" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink">{t.auth.resetTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.auth.resetDone}</p>
          <Button size="lg" className="mt-6 h-12 w-full" onClick={() => navigate('/login')}>
            {t.auth.backToLogin}
          </Button>
        </div>
      </main>
    )
  }

  if (mode === 'reset') {
    return (
      <main id="main" className={cardShell}>
        <div className={cardBox}>
          <h1 className="text-xl font-bold text-ink">{t.auth.resetTitle}</h1>
          <form onSubmit={submitReset} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="rp-pass" className="mb-1.5">{t.auth.newPassword}</Label>
              <Input id="rp-pass" type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rp-pass2" className="mb-1.5">{t.auth.confirmNewPassword}</Label>
              <Input id="rp-pass2" type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />}
              {t.auth.resetTitle}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <button type="button" onClick={() => { setMode('request'); setError(null) }} className="font-medium text-brand hover:underline">
              {t.auth.backToLogin}
            </button>
          </p>
        </div>
      </main>
    )
  }

  // ── Request mode ────────────────────────────────────────────────────────
  return (
    <main id="main" className={cardShell}>
      <div className={cardBox}>
        {sent ? (
          <div className="text-center" role="status">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
              <MailCheck className="h-6 w-6 text-brand" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold text-ink">{t.auth.forgotTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.auth.resetSent}</p>
            {devResetUrl && (
              <p className="mt-4 rounded-md bg-soft px-3 py-2 text-xs text-ink-3 bdi" dir="ltr">
                Dev outbox link:{' '}
                <a href={devResetUrl} className="font-medium text-brand underline">open reset page</a>
              </p>
            )}
            <Button variant="outline" className="mt-6 h-11 w-full" onClick={() => navigate('/login')}>
              {t.auth.backToLogin}
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-ink">{t.auth.forgotTitle}</h1>
            <p className="mt-1 text-sm leading-relaxed text-ink-3">{t.auth.forgotIntro}</p>
            <form onSubmit={submitRequest} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="fp-email" className="mb-1.5">{t.auth.email}</Label>
                <Input id="fp-email" type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-error">{error}</p>}
              <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />}
                {t.auth.sendResetLink}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <button type="button" onClick={() => navigate('/login')} className="font-medium text-brand hover:underline">
                {t.auth.backToLogin}
              </button>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
