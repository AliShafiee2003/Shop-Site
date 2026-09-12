// GET /api/auth/google/callback — the redirect_uri target. Verifies the CSRF
// state (cookie ⇆ query), exchanges the authorization code for tokens, pulls
// the verified profile from Google's userinfo endpoint, upserts the local
// user (by googleSub → by email link → create), opens an app session
// (sp_session cookie) and redirects back into the storefront.
//
// Every failure path lands on the login page with ?google=<reason> so the
// AuthView can show a localized message (and clean the URL afterwards).
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createSession } from '@/lib/server/auth'
import { mergeGuestCartOnLogin } from '@/lib/server/cart'
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  googleClientId,
  googleClientSecret,
  googleConfigured,
  googleRedirectUri,
  verifyGoogleState,
  type GoogleProfile,
} from '@/lib/server/google'

function fail(locale: string, reason: string): Response {
  const headers = new Headers({
    Location: `/${locale === 'fa' ? 'fa/' : ''}login?google=${encodeURIComponent(reason)}`,
  })
  // Always clear the state cookie — the dance is over either way.
  headers.append('Set-Cookie', `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  return new Response(null, { status: 302, headers })
}

function succeed(locale: string, next?: string): Response {
  let target = next ?? (locale === 'fa' ? '/fa/account' : '/account')
  // Keep the user in their locale even when `next` was locale-less.
  if (locale === 'fa' && !target.startsWith('/fa')) target = `/fa${target}`
  const sep = target.includes('?') ? '&' : '?'
  const headers = new Headers({ Location: `${target}${sep}welcome=google` })
  headers.append('Set-Cookie', `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  return new Response(null, { status: 302, headers })
}

/** Cosmetic-only locale sniff from the state cookie payload, used solely to
 *  pick the language of the error redirect. NOT trusted for verification. */
function sniffStateLocale(cookieState: string | undefined): 'en' | 'fa' {
  try {
    const payloadB64 = cookieState?.split('.')[1]
    if (!payloadB64) return 'en'
    const p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { locale?: string }
    return p.locale === 'fa' ? 'fa' : 'en'
  } catch {
    return 'en'
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  // Pull the state cookie once — needed both for verification and for the
  // (cosmetic) error-redirect locale.
  const rawCookie = req.headers.get('cookie') ?? ''
  const stateCookie = rawCookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${GOOGLE_STATE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  const cookieLocale = sniffStateLocale(stateCookie)

  // User cancelled / Google returned an error — nothing to verify.
  if (sp.get('error')) {
    return fail(cookieLocale, sp.get('error') === 'access_denied' ? 'denied' : 'failed')
  }

  const payload = verifyGoogleState(sp.get('state'), stateCookie)
  if (!payload) return fail(cookieLocale, 'invalid_state')
  const { locale, next } = payload

  const code = sp.get('code')
  if (!googleConfigured()) return fail(locale, 'not_configured')
  if (!code) return fail(locale, 'failed')

  // 1) Authorization code → tokens.
  let accessToken: string | undefined
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId()!,
        client_secret: googleClientSecret()!,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return fail(locale, 'exchange_failed')
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    accessToken = tokenJson.access_token
  } catch {
    return fail(locale, 'exchange_failed')
  }
  if (!accessToken) return fail(locale, 'exchange_failed')

  // 2) Tokens → verified identity (userinfo claims).
  let profile: GoogleProfile
  try {
    const uiRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!uiRes.ok) return fail(locale, 'userinfo_failed')
    profile = (await uiRes.json()) as GoogleProfile
  } catch {
    return fail(locale, 'userinfo_failed')
  }
  if (!profile.sub || !profile.email) return fail(locale, 'userinfo_failed')
  // SEC-010: only an EXPLICITLY verified address is accepted — a missing
  // email_verified claim is treated as unverified, not verified.
  if (profile.email_verified !== true) return fail(locale, 'unverified_email')

  const email = profile.email.toLowerCase().trim()

  // 3) Upsert the local user — link by Google id, else by email, else create.
  let user = await db.user.findUnique({ where: { googleSub: profile.sub } })
  if (user && user.status !== 'ACTIVE') return fail(locale, 'unavailable')

  if (!user) {
    const byEmail = await db.user.findUnique({ where: { email } })
    if (byEmail) {
      if (byEmail.status !== 'ACTIVE') return fail(locale, 'unavailable')
      // Existing (password) account: LINK Google identity, keep the password.
      user = await db.user.update({
        where: { id: byEmail.id },
        data: {
          googleSub: profile.sub,
          avatarUrl: profile.picture ?? byEmail.avatarUrl,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        },
      })
    } else {
      user = await db.user.create({
        data: {
          email,
          passwordHash: null, // OAuth-only account (password sign-up can be added later)
          name: profile.name ?? ([profile.given_name, profile.family_name].filter(Boolean).join(' ') || null),
          googleSub: profile.sub,
          avatarUrl: profile.picture ?? null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          preferredLocale: locale,
          emailVerifiedAt: new Date(), // Google verified the address for us
          marketingConsent: false,
        },
      })
    }
  }

  // 4) Open an app session (same mechanism as password login) + guest-cart merge.
  await createSession(user.id, req.headers.get('user-agent'))
  await mergeGuestCartOnLogin(user.id)

  return succeed(locale, next)
}
