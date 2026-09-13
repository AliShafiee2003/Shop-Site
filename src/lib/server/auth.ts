// Auth helpers — scrypt passwords, hashed session tokens, role guards.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { User } from '@prisma/client'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'sp_session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days (absolute)
// Audit SEC-004: sliding idle window. The absolute 30-day expiry stays, but a
// session that shows no activity for 7 days dies even if the cookie survives —
// a stolen cookie can no longer be parked for weeks.
export const SESSION_IDLE_MAX_AGE_SEC = 60 * 60 * 24 * 7 // 7 days idle
/** lastSeenAt is refreshed at most once per hour (write amplification guard). */
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Hash a password as `salt:hash` using scrypt (64-byte derived key). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

/** Verify a password against a `salt:hash` scrypt record (timing-safe). */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/** Session cookie options — `secure` flips on outside development (C4): the
 *  token must never travel over plaintext HTTP in production. Behind the
 *  gateway, trust x-forwarded-proto when NODE_ENV is not explicit. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    secure: process.env.NODE_ENV === 'production',
  }
}

/** Create a session row (stores sha256(token)) and set the sp_session cookie. Returns the raw token.
 *  Audit SEC-004: when the request already carried a valid session cookie, it
 *  is revoked first (token rotation) — a login mints a NEW session instead of
 *  keeping a possibly-stolen one alive alongside the new token. */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  await revokeCurrentSession()
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SEC * 1000),
      lastSeenAt: now,
      userAgent: userAgent ?? null,
    },
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SEC))
  return token
}

/** Revoke whatever session the incoming cookie carries (without touching the
 *  cookie itself — callers set the new one right after). Best-effort. */
async function revokeCurrentSession(): Promise<void> {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  } catch {
    // best effort — rotation must never block login
  }
}

/** Resolve the current session user (or null). Ignores revoked/expired/idle-out/anonymized. */
export async function getSessionUser(): Promise<User | null> {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    })
    if (!session) return null
    if (session.revokedAt) return null
    const now = Date.now()
    if (session.expiresAt.getTime() < now) return null
    // Audit SEC-004: idle timeout — sessions older than the sliding window
    // (lastSeenAt, falling back to createdAt for pre-migration rows) are dead.
    const lastSeen = (session.lastSeenAt ?? session.createdAt).getTime()
    if (now - lastSeen > SESSION_IDLE_MAX_AGE_SEC * 1000) return null
    if (session.user.status !== 'ACTIVE') return null
    // Slide the window forward — throttled to one write/hour/session.
    if (now - lastSeen > LAST_SEEN_REFRESH_MS) {
      await db.session
        .updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
        .catch(() => undefined)
    }
    return session.user
  } catch {
    return null
  }
}

/** Revoke the current session (if any) and clear the cookie. */
export async function destroySession(): Promise<void> {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (token) {
      await db.session.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    jar.set(SESSION_COOKIE, '', sessionCookieOptions(0))
  } catch {
    // best effort
  }
}

/** Role guard: returns the session user if their role is in the list, else null. */
export async function requireRole(roles: string[]): Promise<User | null> {
  const user = await getSessionUser()
  if (!user) return null
  if (!roles.includes(user.role)) return null
  return user
}

export const ADMIN_ROLES = ['OWNER', 'EDITOR', 'ORDER_SUPPORT'] as const

/** Admin guard for /api/admin/* — OWNER/EDITOR/ORDER_SUPPORT. */
export async function requireAdmin(): Promise<User | null> {
  return requireRole([...ADMIN_ROLES])
}

/** S10 RBAC matrix — content management roles.
 *  ORDER_SUPPORT is a SUPPORT role: it can work orders/tickets/customers but
 *  must not edit catalog content, marketing or legal pages. */
export const CONTENT_ROLES = ['OWNER', 'EDITOR'] as const

/** Guard for content-management routes (products, articles, homepage, legal…). */
export async function requireContentAdmin(): Promise<User | null> {
  return requireRole([...CONTENT_ROLES])
}

/** Owner-only guard (refunds, settings). */
export async function requireOwner(): Promise<User | null> {
  return requireRole(['OWNER'])
}

/** Public-safe user shape used in API responses. */
export function publicUser(user: User): {
  id: string
  email: string
  name: string | null
  role: string
  preferredLocale: string
  marketingConsent: boolean
  avatarUrl: string | null
  googleLinked: boolean
  emailVerified: boolean
} {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
    marketingConsent: user.marketingConsent,
    avatarUrl: user.avatarUrl,
    googleLinked: Boolean(user.googleSub),
    emailVerified: Boolean(user.emailVerifiedAt),
  }
}
