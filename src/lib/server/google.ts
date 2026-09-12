// Google OAuth 2.0 (authorization-code flow) — server-side helpers.
//
// Flow: /api/auth/google/start → 302 accounts.google.com (state = one-time
// nonce mirrored into a short-lived httpOnly cookie) → /api/auth/google/
// callback → code exchanged at oauth2.googleapis.com/token → userinfo pulled
// from openidconnect.googleapis.com/v1/userinfo → user upserted (googleSub /
// email link / create) → app session (sp_session) via createSession().
//
// Configuration (env, see GOOGLE-OAUTH-SETUP.md):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — from Google Cloud Console.
//   APP_URL — optional public origin override for redirect_uri (behind a
//   proxy/gateway the request headers usually carry the public host already).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
export const GOOGLE_SCOPES = 'openid email profile'

export const GOOGLE_STATE_COOKIE = 'sp_g_state'
export const GOOGLE_STATE_MAX_AGE_SEC = 600 // 10 minutes to finish the dance

/** Google userinfo claims we consume and where they land in our User row. */
export interface GoogleProfile {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

export function googleClientId(): string | undefined {
  const v = process.env.GOOGLE_CLIENT_ID?.trim()
  return v ? v : undefined
}

export function googleClientSecret(): string | undefined {
  const v = process.env.GOOGLE_CLIENT_SECRET?.trim()
  return v ? v : undefined
}

export function googleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret())
}

/** Public origin of THIS deployment — used to build the OAuth redirect_uri.
 *  Priority: APP_URL env → x-forwarded-proto/x-forwarded-host (gateway) →
 *  request origin. Trailing slashes stripped. */
export function googleRedirectUri(req: NextRequest): string {
  const base =
    process.env.APP_URL?.trim() ||
    (req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl.origin)
  return `${base.replace(/\/+$/, '')}/api/auth/google/callback`
}

/** Fallback signing key when no client secret is set (state only guards CSRF —
 *  the cookie-vs-query comparison is the real check; the HMAC hardens it).
 *  S12: dedicated STATE_SECRET env first; DATABASE_URL is NOT used as key
 *  material (it leaks with the repo); per-boot random keeps dev functional. */
function stateSigningKey(): string {
  const dedicated = process.env.STATE_SECRET?.trim()
  if (dedicated) return dedicated
  return randomBytes(32).toString('hex')
}

/** Signed one-time state: `nonce.payload.hmac` — payload carries locale,
 *  intent and optional `next` path so the callback can restore context
 *  without trusting the query string. */
export function createGoogleState(payload: { locale: string; intent: string; next?: string; ts?: number }): string {
  const nonce = randomBytes(24).toString('hex')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', stateSigningKey()).update(`${nonce}.${payloadB64}`).digest('base64url')
  return `${nonce}.${payloadB64}.${mac}`
}

/** Verify state coming from the query against the browser's cookie value.
 *  Returns the decoded payload, or null on any mismatch/tamper/expiry. */
export function verifyGoogleState(
  queryState: string | null,
  cookieState: string | undefined,
): { locale: string; intent: string; next?: string } | null {
  if (!queryState || !cookieState || queryState !== cookieState) return null
  const parts = queryState.split('.')
  if (parts.length !== 3) return null
  const [nonce, payloadB64, mac] = parts
  const expected = createHmac('sha256', stateSigningKey()).update(`${nonce}.${payloadB64}`).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      locale?: string
      intent?: string
      next?: string
      ts?: number
    }
    if (typeof payload.ts === 'number' && Date.now() - payload.ts > GOOGLE_STATE_MAX_AGE_SEC * 1000) return null
    return {
      locale: payload.locale === 'fa' ? 'fa' : 'en',
      intent: payload.intent === 'register' ? 'register' : 'login',
      next: typeof payload.next === 'string' && payload.next.startsWith('/') ? payload.next : undefined,
    }
  } catch {
    return null
  }
}
