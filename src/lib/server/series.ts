// Series detail — server loader for the public /series/[slug] pages
// (audit §8.10: seriesSlug existed in the schema but had no page → orphan).
// Series identity lives denormalized on Product (series + seriesSlug); the
// display name is localized via bookLabels' SERIES_FA map.
import { db } from '@/lib/db'
import { seriesLabel } from '@/lib/bookLabels'
import { fetchCards, type ProductCardDTO } from './catalog'

export type SeriesDetail = {
  slug: string
  /** localized display name */
  name: string
  /** volumes in the series (published) */
  count: number
  /** volume order follows the catalog default (featured → publication recency) */
  books: ProductCardDTO[]
}

/** Localized series metadata for <head> (title/description + CollectionPage). */
export async function seriesMeta(
  slug: string,
): Promise<{ name: string; description: string } | null> {
  const sample = await db.product.findFirst({
    where: { seriesSlug: slug, status: 'PUBLISHED' },
    select: { series: true },
  })
  if (!sample) return null
  const name = seriesLabel(sample.series, 'en')
  const nameFa = seriesLabel(sample.series, 'fa')
  const count = await db.product.count({ where: { seriesSlug: slug, status: 'PUBLISHED' } })
  return {
    name,
    description: `${name} — a Persepix book series with ${count} published volume${count === 1 ? '' : 's'}. The complete collection, in English and bilingual editions.` + (nameFa !== name ? ` (فارسی: ${nameFa})` : ''),
  }
}

/** Full page payload: localized name + every published volume as a card. */
export async function getSeriesDetail(slug: string, locale: string): Promise<SeriesDetail | null> {
  const sample = await db.product.findFirst({
    where: { seriesSlug: slug, status: 'PUBLISHED' },
    select: { series: true },
  })
  if (!sample) return null
  const books = await fetchCards({ seriesSlug: slug, status: 'PUBLISHED' }, locale)
  return {
    slug,
    name: seriesLabel(sample.series, locale),
    count: books.length,
    books,
  }
}

/** Every published series slug (sitemap + footer navigation). */
export async function listSeriesSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const rows = await db.product.groupBy({
    by: ['seriesSlug'],
    where: { seriesSlug: { not: null }, status: 'PUBLISHED' },
    _max: { updatedAt: true },
  })
  return rows
    .filter((r): r is typeof r & { seriesSlug: string } => Boolean(r.seriesSlug))
    .map((r) => ({ slug: r.seriesSlug, updatedAt: r._max.updatedAt ?? new Date() }))
}
