// GET /api/series/[slug]?locale= — published volumes of a book series.
// Backs the client-side fallback of /series/[slug] (SSR prefetches directly
// via lib/server/series — this route exists so SPA navigations work too).
import { getSeriesDetail } from '@/lib/server/series'
import { apiError, json, normalizeLocale } from '@/lib/server/utils'

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const series = await getSeriesDetail(slug, locale)
  if (!series) return apiError(404, 'NOT_FOUND')
  return json({ series })
}
