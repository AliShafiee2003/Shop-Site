// POST /api/reviews/[id]/helpful — toggle a "helpful" vote on an APPROVED
// review (signed-in customers only, one vote per user per review). The
// response carries the fresh count + the caller's state so the PDP can render
// the button optimistically-correctly without a refetch.
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { rateLimit } from '@/lib/server/rate-limit'
import { apiError, clientIp, json } from '@/lib/server/utils'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED', 'Sign in to mark reviews as helpful.')

  const rl = rateLimit(`${clientIp(req)}:rev-vote`, 30, 60_000)
  if (!rl.ok) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  const { id } = await ctx.params
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, moderationState: true, userId: true },
  })
  if (!review || review.moderationState !== 'APPROVED') return apiError(404, 'NOT_FOUND', 'Review not found')
  // No self-votes — the author inflating their own review defeats the signal.
  if (review.userId === user.id) return apiError(400, 'SELF_VOTE', 'You cannot vote on your own review.')

  const existing = await db.reviewVote.findUnique({
    where: { reviewId_userId: { reviewId: id, userId: user.id } },
    select: { id: true },
  })

  if (existing) {
    await db.reviewVote.delete({ where: { id: existing.id } })
  } else {
    // Toggling fast can race the unique constraint — a P2002 on create means
    // the concurrent insert won: the vote exists, treat it as voted.
    try {
      await db.reviewVote.create({ data: { reviewId: id, userId: user.id } })
    } catch (e) {
      if (!(e as { code?: string }).code?.startsWith('P20')) throw e
    }
  }

  const [count, voted] = await Promise.all([
    db.reviewVote.count({ where: { reviewId: id } }),
    db.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: id, userId: user.id } }, select: { id: true } }),
  ])

  return json({ helpfulCount: count, voted: Boolean(voted) })
}
