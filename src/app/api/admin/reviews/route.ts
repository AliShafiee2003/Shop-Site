// GET /api/admin/reviews?state=&page=&pageSize= — moderation queue with product titles.
// API-405 (audit v4): bounded list — page/pageSize via the shared parseListQuery
// (default 50, hard cap 100). Body shape unchanged ({items} — the admin UI reads
// `items`); the full row count is exposed as `total` + `X-Total-Count` so a
// future pager needs no API change.
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, jsonWithTotal, parseListQuery, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')?.trim() || null
  const { page, pageSize, skip, take } = parseListQuery(searchParams)

  const where = state ? { moderationState: state.toUpperCase() } : {}
  const [reviews, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { product: { include: { translations: true } } },
      skip,
      take,
    }),
    db.review.count({ where }),
  ])

  return jsonWithTotal(
    {
      total,
      page,
      pageSize,
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
    },
    total,
  )
}
