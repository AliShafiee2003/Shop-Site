'use client'

/**
 * Root error boundary (audit ARCH-401): until now a client-side render throw
 * hit Next's missing boundary and produced an unbranded blank page with no
 * recovery path. This renders the storefront chrome-free branded error card
 * with a retry (reset) and a way home. The FA variant is picked from the real
 * request path (same /fa prefix convention as the router) — this component
 * only renders client-side after a throw, so window.location is safe.
 */
import { useEffect } from 'react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Next.js already logs the error server-side in dev; this captures the
    // client-render context (the only diagnostics trail in production).
    console.error('[error-boundary]', error)
  }, [error])

  // error.tsx only renders client-side after a throw (never SSR'd), so the
  // real request path is readable synchronously — no state/effect needed.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const fa = pathname === '/fa' || pathname.startsWith('/fa/')

  return (
    <main
      dir={fa ? 'rtl' : 'ltr'}
      className="flex min-h-[70vh] w-full flex-col items-center justify-center px-4 py-16 text-center"
      role="alert"
    >
      <p className="text-5xl" aria-hidden="true">
        📚
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {fa ? 'خطایی رخ داد' : 'Something went wrong'}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-ink-2">
        {fa
          ? 'مشکلی در نمایش این صفحه پیش آمد. دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.'
          : 'An unexpected error interrupted this page. Try again, or head back to the homepage.'}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-hover"
        >
          {fa ? 'تلاش دوباره' : 'Try again'}
        </button>
        <a
          href={fa ? '/fa' : '/'}
          className="min-h-[44px] rounded-lg border border-line px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-soft"
        >
          {fa ? 'صفحهٔ اصلی' : 'Back to home'}
        </a>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-ink-3">
          {fa ? 'کد خطا: ' : 'Error code: '}
          {error.digest}
        </p>
      ) : null}
    </main>
  )
}
