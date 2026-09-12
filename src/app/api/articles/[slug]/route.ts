// GET /api/articles/[slug]?locale= — article detail with related products/people/articles.
// Logic lives in lib/server/article-detail.ts (shared with the RSC SSR prefetch).
import { getArticleDetail } from '@/lib/server/article-detail'
import { apiError, json, normalizeLocale } from '@/lib/server/utils'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const article = await getArticleDetail(slug, locale)
  if (!article) return apiError(404, 'NOT_FOUND')
  return json(article)
}
