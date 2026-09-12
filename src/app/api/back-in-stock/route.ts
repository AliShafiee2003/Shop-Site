// POST /api/back-in-stock — customer asks to be emailed when an out-of-stock
// variant returns. Idempotent per (variant,email); re-subscribing clears the
// notified flag so the next restock re-alerts. Rate-limited, no PII beyond the
// email the customer explicitly provided.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, clientIp, json, zodMessage } from '@/lib/server/utils'
import { rateLimit } from '@/lib/server/rate-limit'

const bodySchema = z.object({
  variantId: z.string().min(1),
  email: z.string().email().max(200),
  locale: z.string().max(5).default('en'),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:backinstock`, 5, 600_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { variantId, email, locale } = parsed.data

  const variant = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, isActive: true } })
  if (!variant || !variant.isActive) return apiError(404, 'VARIANT_NOT_FOUND', 'Unknown edition')

  await db.backInStockSubscriber.upsert({
    where: { variantId_email: { variantId, email: email.toLowerCase().trim() } },
    create: { variantId, email: email.toLowerCase().trim(), locale: locale === 'fa' ? 'fa' : 'en' },
    update: { notifiedAt: null, locale: locale === 'fa' ? 'fa' : 'en' },
  })

  return json({ ok: true })
}
