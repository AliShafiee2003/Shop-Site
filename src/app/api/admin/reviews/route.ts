// GET /api/admin/reviews?state= — moderation queue with product titles.
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, json, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')?.trim() || null

  const reviews = await db.review.findMany({
    where: state ? { moderationState: state.toUpperCase() } : {},
    orderBy: { createdAt: 'desc' },
    include: { product: { include: { translations: true } } },
  })

  return json({
    items: reviews.map((r) => ({
      id: r.id,
      productId: r.productId,
      productTitle: pickLocale(r.product.translations, 'en')?.title ?? r.product.slug,
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      locale: r.locale,
      isVerifiedPurchase: r.isVerifiedPurchase,
      moderationState: r.moderationState,
      moderationReason: r.moderationReason,
      reply: r.reply,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      reportedAbuse: r.reportedAbuse,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
