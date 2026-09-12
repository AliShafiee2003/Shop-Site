// POST /api/analytics/event — consent-gated, first-party analytics (PRD 30.1).
// No cookies, no PII: an anonymous session key is generated client-side and rotated.
// Rate limited 60/min/IP; silently drops invalid/unknown types (analytics must never break UX).
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'
import { getSessionUser } from '@/lib/server/auth'
import { resolveConsent } from '@/lib/server/consent'

const ALLOWED_TYPES = [
  'view_product',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'search',
  'view_article',
] as const

const bodySchema = z.object({
  type: z.enum(ALLOWED_TYPES),
  path: z.string().max(300).optional(),
  locale: z.string().optional(),
  productSlug: z.string().max(200).optional(),
  valueMinor: z.number().int().min(0).max(100_000_00).optional(),
  sessionKey: z.string().max(64).optional(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:analytics`, 60, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many events')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const { type, path, productSlug, valueMinor, sessionKey } = parsed.data
  const locale = normalizeLocale(parsed.data.locale)

  // PRIV-001: the client gate is advisory — the server verifies consent. Read
  // the visitor's verified decision (sp_consent_id cookie → CookieConsent row,
  // fail-closed) and silently drop the event when the analytics category is
  // not granted. No decision at all → also a no-op. The 200 answer is identical
  // either way so the client never errors.
  const consent = await resolveConsent()
  if (!consent.decided || consent.categories.analytics !== true) return json({ ok: true })

  try {
    await db.analyticsEvent.create({
      data: {
        type,
        path: path?.slice(0, 300) ?? null,
        locale,
        productSlug: productSlug?.slice(0, 200) ?? null,
        valueMinor: valueMinor ?? null,
        sessionKey: sessionKey?.slice(0, 64) ?? null,
      },
    })
  } catch {
    // Analytics write failures must never surface to shoppers.
    return json({ ok: true })
  }

  // Personalization signal (view) — fire-and-forget, never blocks the response.
  // PRIV-001: taste signals are PERSONALIZATION data — written only when the
  // verified decision granted that category (mirrors personalizationSubject()).
  if (type === 'view_product' && productSlug && consent.categories.personalization) {
    try {
      const user = await getSessionUser()
      await db.tasteSignal.create({
        data: {
          userId: user?.id ?? null,
          sessionKey: sessionKey ? sessionKey.slice(0, 64) : null,
          productSlug: productSlug.slice(0, 200),
          kind: 'view',
        },
      })
    } catch {
      // ignore
    }
  }
  return json({ ok: true })
}
