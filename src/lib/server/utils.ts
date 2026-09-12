// Server-side shared utilities — Persepix backend (Task 4)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** JSON response helper (success = 200 + payload) */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/** Error response: proper status + { error: 'MACHINE_CODE', message? } */
export function apiError(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json(
    message ? { error: code, message } : { error: code },
    { status },
  )
}

/** Parse stored JSON safely with a fallback (never throws). */
export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

/** Read a Settings row by key and parse its JSON value. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.findUnique({ where: { key } })
    return parseJsonSafe<T>(row?.valueJson, fallback)
  } catch {
    return fallback
  }
}

/** Merge-patch a JSON Settings row (create if missing). Returns the new value. */
export async function setSetting<T extends object>(key: string, patch: Partial<T>): Promise<T> {
  const current = await getSetting<T>(key, {} as T)
  const next = { ...current, ...patch }
  await db.settings.upsert({
    where: { key },
    create: { key, valueJson: JSON.stringify(next) },
    update: { valueJson: JSON.stringify(next) },
  })
  return next
}

/** Structured order number (user spec, Task 49-10): SP-YY-MM-DD-NNNN —
 *  e.g. an order placed 13 Dec 2026 → SP-26-12-13-0011. The date is the
 *  TEHRAN calendar day (store HQ timezone), the sequence restarts daily and
 *  is 4 digits. Customers are shown the COMPACT form (SP2612130011 — dashes
 *  stripped, see compactOrderNumber in lib/format). */
const ORDER_TZ = 'Asia/Tehran' // UTC+03:30 year-round (no DST)

/** Gregorian Y/M/D of an instant in the store timezone + the UTC instant of that day's midnight. */
export function tehranDayParts(d: Date): { yy: string; mm: string; dd: string; dayStartUTC: Date } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: ORDER_TZ, year: '2-digit', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  const yy = parts.year ?? '00'
  const mm = parts.month ?? '01'
  const dd = parts.day ?? '01'
  const dayStartUTC = new Date(Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd)) - 210 * 60 * 1000)
  return { yy, mm, dd, dayStartUTC }
}

export function formatOrderNumber(d: Date, seq: number): string {
  const { yy, mm, dd } = tehranDayParts(d)
  return `SP-${yy}-${mm}-${dd}-${String(Math.max(1, seq)).padStart(4, '0')}`
}

/** Kept name/signature for the checkout retry loop: count = orders already
 *  created TODAY (Tehran) — the new order becomes count + attempt + 1. */
export function nextOrderNumber(count: number, now: Date = new Date()): string {
  return formatOrderNumber(now, count + 1)
}

/** Human readable ticket number: TK-NNNN. */
export function nextTicketNumber(count: number): string {
  return `TK-${String(count + 1).padStart(4, '0')}`
}

/** IPv4 (strict octets) / IPv6 (hex groups incl. :: compression) shape check —
 *  garbage in proxy headers must never become a rate-limit key (audit SEC-003). */
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6_RE = /^(?:[0-9A-Fa-f]{0,4}:){1,7}[0-9A-Fa-f]{0,4}$/

/** Best-effort client IP for rate limiting.
 *  SEC-003: X-Forwarded-For is client-spoofable unless a TRUSTED proxy overwrites
 *  it. TRUST_PROXY=0 (direct exposure, no proxy) → XFF is never read; the socket
 *  peer (`req.ip` when available) or the stable 'direct' key is used instead.
 *  Default (sandbox sits behind Caddy, which overwrites XFF): only the FIRST XFF
 *  entry — the one our own proxy appended — is considered, and only when it
 *  parses as an IP; otherwise fall back to x-real-ip, else 'unknown'. */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === '0') {
    const peer = (req as Request & { ip?: string }).ip?.trim()
    return peer || 'direct'
  }
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0].trim()
    if (IPV4_RE.test(first) || IPV6_RE.test(first)) return first
  }
  const real = req.headers.get('x-real-ip')?.trim()
  if (real && (IPV4_RE.test(real) || IPV6_RE.test(real))) return real
  return 'unknown'
}

/** Write an audit log row (never throws — auditing must not break requests). */
export async function audit(
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
): Promise<void> {
  try {
    await db.auditLog.create({ data: { actorEmail, action, entityType, entityId, summary } })
  } catch {
    // ignore audit failures
  }
}

/** Page param parsing (1-based). */
export function parsePage(searchParams: URLSearchParams, def = 1): number {
  const p = Number.parseInt(searchParams.get('page') ?? '', 10)
  return Number.isFinite(p) && p > 0 ? p : def
}

/** Integer param parsing with bounds. */
export function parseIntParam(
  raw: string | null,
  def: number | null,
  min?: number,
  max?: number,
): number | null {
  if (raw === null || raw === '') return def
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return def
  let out = n
  if (typeof min === 'number') out = Math.max(min, out)
  if (typeof max === 'number') out = Math.min(max, out)
  return out
}

/** Normalize a locale param to 'en' | 'fa' (default 'en'). */
export function normalizeLocale(raw: string | null | undefined): 'en' | 'fa' {
  return (raw ?? 'en').toLowerCase().startsWith('fa') ? 'fa' : 'en'
}

/** Pick a translation row for the requested locale with 'en' (then any) fallback. */
export function pickLocale<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'en') ?? rows[0]
}

/** Zod error → first human message. */
export function zodMessage(err: { issues: { message: string }[] }): string {
  return err.issues[0]?.message ?? 'Invalid request body'
}
