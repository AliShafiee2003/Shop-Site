// GET /api/products/[slug]?locale= — full product detail (published only).
// Audit QUALITY-001: this route used to carry a near-copy of getProductDetail
// that had drifted (different helpful-sort strategy, missing reply/repliedAt,
// different related-product query plan) — SSR HTML and the API response could
// render different review sets/orders. The route is now a THIN DELEGATE: one
// source of truth for both the server-rendered page and client fetches.
import { getProductDetail } from '@/lib/server/product-detail'
import { apiError, json, normalizeLocale } from '@/lib/server/utils'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))
  // R8: `helpful` orders by vote count (recency tie-break) BEFORE the top-20
  // slice; `recent` (default) is a bounded createdAt-desc query.
  const reviewsSort = searchParams.get('reviewsSort') === 'helpful' ? 'helpful' : 'recent'

  const detail = await getProductDetail(slug, locale, { reviewsSort })
  if (!detail) return apiError(404, 'NOT_FOUND')
  return json(detail)
}
