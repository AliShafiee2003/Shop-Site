// GET /api/series — the /series index payload (one entry per published
// series, with volume counts + covers). Client-side fallback for the
// SSR-seeded SeriesIndexView.
import { db } from '@/lib/db'
import { getSeriesIndex } from '@/lib/server/series'
import { json, normalizeLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const locale = normalizeLocale(url.searchParams.get('locale'))

  // Cheap emptiness probe first — mirrors seriesMeta's "no sample, no series".
  const any = await db.product.findFirst({
    where: { seriesSlug: { not: null }, status: 'PUBLISHED' },
    select: { id: true },
  })
  if (!any) return json({ series: [] })

  const series = await getSeriesIndex(locale)
  return json({ series })
}
