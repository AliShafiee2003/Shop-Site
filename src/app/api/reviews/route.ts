// POST /api/reviews — submit a review (PENDING moderation), rate limited 3/10min/IP.
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional().nullable(),
  body: z.string().min(10, 'Review must be at least 10 characters'),
  name: z.string().optional().nullable(),
  locale: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`${ip}:reviews`, 3, 10 * 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many reviews submitted. Please try later.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { productId, rating, title, body: reviewBody } = parsed.data
  const locale = normalizeLocale(parsed.data.locale)

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, status: true } })
  if (!product || product.status !== 'PUBLISHED') return apiError(404, 'NOT_FOUND', 'Product not found')

  const user = await getSessionUser()

  let authorName: string
  let userId: string | null = null
  let verified = false

  if (user) {
    // S13 residual — reviews are a public, attributed voice: an unverified
    // account must not post them (spam/throwaway barrier). Existing users
    // were grandfathered with emailVerifiedAt at rollout; only accounts that
    // never confirmed an address hit this.
    if (!user.emailVerifiedAt) {
      return apiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address before submitting a review.')
    }
    authorName = user.name ?? 'Persepix reader'
    userId = user.id
    // Verified purchase: a paid order by this user containing a variant of this product.
    const count = await db.order.count({
      where: {
        userId: user.id,
        paymentStatus: 'SUCCEEDED',
        items: { some: { variant: { productId } } },
      },
    })
    verified = count > 0
  } else {
    // Guests must give a display name; email is never stored on reviews.
    if (!parsed.data.name || parsed.data.name.trim().length === 0) {
      return apiError(400, 'NAME_REQUIRED', 'A display name is required to review as a guest')
    }
    authorName = parsed.data.name.trim()
  }

  await db.review.create({
    data: {
      productId,
      userId,
      authorName,
      rating,
      title: title?.trim() || null,
      body: reviewBody.trim(),
      locale,
      isVerifiedPurchase: verified,
      moderationState: 'PENDING',
    },
  })

  return json({ ok: true, moderation: 'PENDING' })
}
