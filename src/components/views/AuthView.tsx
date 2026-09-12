'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPost } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import type { UserDTO } from '@/lib/types'

/** Official multicolor Google "G" mark (brand guidelines: white button, 20px G). */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="18" height="18" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function AuthView({ mode }: { mode: 'login' | 'register' }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const setUser = useApp((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [gBusy, setGBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cleanedCallbackParam = useRef(false)

  // Results of the Google round-trip land here as ?google=<reason> (failure)
  // or ?welcome=google (success, on /account). Show a localized message, then
  // silently strip the parameter so refreshes/shares stay clean.
  useEffect(() => {
    const g = route.query.google
    if (g && !cleanedCallbackParam.current) {
      cleanedCallbackParam.current = true
      const map: Record<string, string> = {
        denied: t.auth.googleDenied,
        invalid_state: t.auth.googleInvalidState,
        not_configured: t.auth.googleNotConfigured,
        exchange_failed: t.auth.googleFailed,
        userinfo_failed: t.auth.googleFailed,
        unverified_email: t.auth.googleFailed,
        unavailable: t.auth.googleFailed,
        failed: t.auth.googleFailed,
      }
      setError(map[g] ?? t.auth.googleFailed)
      navigate(`${mode === 'register' ? '/register' : '/login'}`, { replace: true })
    }
  }, [route.query.google])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await apiPost<{ user: UserDTO }>(`/api/auth/${mode}`, mode === 'register' ? { email, password, name, locale } : { email, password })
      setUser(res.user)
      void useApp.getState().syncWishlistOnLogin()
      navigate('/account')
    } catch (err) {
      const e2 = err as { code?: string }
      setError(e2.code === 'EMAIL_TAKEN' ? t.auth.emailTaken : e2.code === 'OAUTH_ACCOUNT' ? t.auth.oauthAccount : t.auth.invalid)
    } finally { setBusy(false) }
  }

  /** Full-page navigation into the OAuth flow (cookie + 302 chain — must not
   *  go through the SPA fetch layer). Config is checked first so an
   *  un-configured deployment shows a clear message instead of a 503 page. */
  const startGoogle = async () => {
    setGBusy(true); setError(null)
    try {
      const status = await apiGet<{ configured: boolean }>('/api/auth/google/status')
      if (!status.configured) {
        setError(t.auth.googleNotConfigured)
        setGBusy(false)
        return
      }
      window.location.href = `/api/auth/google/start?locale=${locale}&intent=${mode}`
    } catch {
      setError(t.auth.googleFailed)
      setGBusy(false)
    }
  }

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col px-4 py-14 sm:px-6">
      <div className="rounded-lg border border-line p-6 sm:p-8">
        <h1 className="text-xl font-bold text-ink">{mode === 'login' ? t.auth.loginTitle : t.auth.registerTitle}</h1>
        <p className="mt-1 text-sm text-ink-3">{mode === 'login' ? t.auth.haveAccount : t.auth.noAccount}</p>

        {/* Google OAuth — same flow for sign-in and sign-up (Google matches by
            email; existing accounts get linked, new ones are created). */}
        <button
          type="button"
          onClick={startGoogle}
          disabled={gBusy || busy}
          className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-md border border-line bg-white text-sm font-semibold text-ink-2 shadow-sm transition hover:border-ink-3/40 hover:bg-soft hover:text-ink focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
          dir={locale === 'fa' ? 'rtl' : 'ltr'}
        >
          {gBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleG />}
          <span>{t.auth.googleContinue}</span>
        </button>

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t.auth.or}</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <Label htmlFor="auth-name" className="mb-1.5">{t.auth.name}</Label>
              <Input id="auth-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="auth-email" className="mb-1.5">{t.auth.email}</Label>
            <Input id="auth-email" type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="auth-pass" className="mb-1.5">{t.auth.password}</Label>
            <Input id="auth-pass" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'login' ? t.auth.login : t.auth.register}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-3">
          {mode === 'login' ? t.auth.noAccount : t.auth.haveAccount}{' '}
          <button type="button" onClick={() => navigate(mode === 'login' ? '/register' : '/login')} className="font-medium text-brand hover:underline">
            {mode === 'login' ? t.auth.register : t.auth.login}
          </button>
        </p>
        {mode === 'login' && <p className="mt-4 rounded-md bg-soft px-3 py-2 text-center text-[11px] text-ink-3">{t.auth.demoNote}</p>}
      </div>
    </main>
  )
}
