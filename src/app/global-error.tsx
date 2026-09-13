'use client'

/**
 * Global error boundary (audit ARCH-401): last resort when the ROOT LAYOUT
 * itself throws (error.tsx only covers render throws below the layout, which
 * still render the layout's <html>). Must render its own <html>/<body>. Kept
 * dependency-free and inline-style-free-ish so it survives even a broken
 * global CSS load.
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#FFFFFF',
          color: '#172026',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <p style={{ fontSize: '2.5rem', margin: 0 }} aria-hidden="true">
          📚
        </p>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Something went wrong / خطایی رخ داد</h1>
        <p style={{ margin: 0, maxWidth: '28rem', lineHeight: 1.6, color: '#47545D' }}>
          An unexpected error interrupted the site. / مشکلی در نمایش سایت پیش آمد.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: '44px',
            padding: '0.6rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#014B74',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again / تلاش دوباره
        </button>
        {error.digest ? <p style={{ fontSize: '0.75rem', color: '#5F6B76' }}>{error.digest}</p> : null}
      </body>
    </html>
  )
}
