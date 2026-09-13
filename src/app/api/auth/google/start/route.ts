// GET /api/auth/google/start — begins the OAuth dance: CSRF state (nonce in a
// short-lived httpOnly cookie, HMAC-signed payload) then 302 to Google's
// consent screen. Query: ?locale=fa&intent=login|register&next=/path
import type { NextRequest } from 'next/server'
import { apiError, clientIp } from '@/lib/server/utils'
import { rateLimit } from '@/lib/server/rate-limit'
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_SCOPES,
  GOOGLE_STATE_MAX_AGE_SEC,
  createGoogleState,
  googleClientId,
  googleConfigured,
  googleRedirectUri,
  googleStateSetCookie,
  safeOAuthNext,
} from '@/lib/server/google'

export async function GET(req: NextRequest) {
  const rl = rateLimit(`${clientIp(req)}:google-start`, 20, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a minute.')

  if (!googleConfigured()) {
    return apiError(
      503,
      'NOT_CONFIGURED',
      'Google sign-in is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see GOOGLE-OAUTH-SETUP.md), then restart.',
    )
  }

  const sp = req.nextUrl.searchParams
  const locale = sp.get('locale') === 'fa' ? 'fa' : 'en'
  const intent = sp.get('intent') === 'register' ? 'register' : 'login'
  // SEC-405: shared validator — also rejects backslash trickery (/\evil.com).
  const next = safeOAuthNext(sp.get('next'))

  const state = createGoogleState({ locale, intent, next, ts: Date.now() })

  const url = new URL(GOOGLE_AUTH_ENDPOINT)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', googleClientId()!)
  url.searchParams.set('redirect_uri', googleRedirectUri(req))
  url.searchParams.set('scope', GOOGLE_SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'online') // we don't need Google API tokens afterwards — identity only
  url.searchParams.set('prompt', 'select_account') // always let the user pick the account explicitly
  url.searchParams.set('include_granted_scopes', 'true')

  const headers = new Headers({ Location: url.toString() })
  // SEC-407: single cookie builder — carries Secure in production.
  headers.append('Set-Cookie', googleStateSetCookie(state, GOOGLE_STATE_MAX_AGE_SEC))
  return new Response(null, { status: 302, headers })
}
