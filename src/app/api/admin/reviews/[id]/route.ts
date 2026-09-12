// PATCH /api/admin/reviews/[id] — moderation decision (audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  moderationState: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SPAM']).optional(),
  reason: z.string().optional().nullable(),
  // Public press response shown under the review on the PDP (Task 27).
  reply: z.string().max(2000).nullable().optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const review = await db.review.findUnique({ where: { id } })
  if (!review) return apiError(404, 'NOT_FOUND', 'Review not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const updated = await db.review.update({
    where: { id },
    data: {
      ...(parsed.data.moderationState ? { moderationState: parsed.data.moderationState } : {}),
      ...(parsed.data.reason !== undefined ? { moderationReason: parsed.data.reason ?? null } : {}),
      ...(parsed.data.reply !== undefined
        ? { reply: parsed.data.reply?.trim() || null, repliedAt: parsed.data.reply?.trim() ? new Date() : null, repliedBy: parsed.data.reply?.trim() ? user.email : null }
        : {}),
    },
  })

  await audit(
    user.email,
    'REVIEW_MODERATION',
    'Review',
    id,
    `Review ${id} → ${parsed.data.moderationState}${parsed.data.reason ? ` (${parsed.data.reason})` : ''}`,
  )

  return json({ review: { id: updated.id, moderationState: updated.moderationState } })
}
