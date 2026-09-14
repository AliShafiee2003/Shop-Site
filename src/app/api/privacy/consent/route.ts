// GET  /api/privacy/consent — verified consent state for the current visitor (fail-closed).
// PUT  /api/privacy/consent — save a decision (append-only record + cookie rotation).
// The server forces necessary=true and ignores client-side consent flags.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { CONSENT_POLICY_VERSION, resolveConsent, saveConsentDecision } from '@/lib/server/consent'
import { getSessionUser } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const putSchema = z.object({
  action: z.enum(['accept_all', 'reject_optional', 'custom']),
  source: z.enum(['banner', 'preference_center', 'footer']),
  locale: z.string().optional(),
  categories: z.object({
    preferences: z.boolean(),
    analytics: z.boolean(),
    personalization: z.boolean(),
    marketing: z.boolean(),
  }),
})

export async function GET() {
  const state = await resolveConsent()
  return json({ ...state, currentPolicyVersion: CONSENT_POLICY_VERSION })
}

export async function PUT(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:consent`, 20, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many consent changes')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const user = await getSessionUser()
  const state = await saveConsentDecision(
    {
      action: parsed.data.action,
      categories: parsed.data.categories,
      locale: normalizeLocale(parsed.data.locale),
      source: parsed.data.source,
    },
    user?.id ?? null,
  )
  return json({ ...state, currentPolicyVersion: CONSENT_POLICY_VERSION })
}
