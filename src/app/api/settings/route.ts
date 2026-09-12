// GET /api/settings — public-safe store + shipping + feature settings,
// plus the active sitewide promotion and the enabled admin announcements
// (both drive the announcement bar rotation).
import { db } from '@/lib/db'
import { getSetting, json } from '@/lib/server/utils'
import { getActivePromotion, promoBadgeLabel } from '@/lib/server/promotions'
import { loadGiftWrapConfig } from '@/lib/server/giftwrap'
import { seriesLabel } from '@/lib/bookLabels'

export type StoreSettings = {
  name?: string
  nameFa?: string
  legalName?: string
  email?: string
  phone?: string
  address?: string
  currency?: string
  vatRatePct?: number
  vatIncluded?: boolean
  freeShippingThresholdMinor?: number
}

export type ShippingSettings = {
  customsNote?: string
  customsNoteFa?: string
  methods?: unknown[]
}

export async function GET() {
  const [store, shipping, features, promotion, giftWrap, announcements] = await Promise.all([
    getSetting<StoreSettings>('store', {}),
    getSetting<ShippingSettings>('shipping', {}),
    getSetting<Record<string, unknown>>('features', {}),
    getActivePromotion(),
    loadGiftWrapConfig(),
    // Enabled admin messages only, bar order, capped — the bar is one line tall.
    // (Typed client — the legacy raw-SQL workaround for a stale dev server is gone.)
    db.announcement
      .findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 10,
        select: { id: true, textEn: true, textFa: true, href: true },
      })
      .catch(() => []),
  ])
  // Footer navigation data: published series (slug + localized display name).
  const seriesRows = await db.product
    .groupBy({ by: ['seriesSlug', 'series'], where: { seriesSlug: { not: null }, status: 'PUBLISHED' } })
    .catch(() => [])
  const series = seriesRows
    .filter((r): r is typeof r & { seriesSlug: string } => Boolean(r.seriesSlug))
    .map((r) => ({ slug: r.seriesSlug, name: seriesLabel(r.series, 'en'), nameFa: seriesLabel(r.series, 'fa') }))

  return json({
    store,
    shipping,
    features,
    giftWrap,
    announcements,
    series,
    promotion: promotion
      ? {
          name: promotion.name,
          badge: promoBadgeLabel(promotion),
          noteEn: promotion.noteEn,
          noteFa: promotion.noteFa,
          excludedCount: promotion.excludedProductIds.length,
        }
      : null,
  })
}
