// Shared store-settings composition — used by GET /api/settings and the
// boot-time GET /api/bootstrap (audit P2: one source of truth, no drift).
import { db } from '@/lib/db'
import { getSetting } from '@/lib/server/utils'
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

export type SettingsPayload = {
  store: StoreSettings
  shipping: ShippingSettings
  features: Record<string, unknown>
  giftWrap: Awaited<ReturnType<typeof loadGiftWrapConfig>>
  announcements: { id: string; textEn: string; textFa: string; href: string | null }[]
  series: { slug: string; name: string; nameFa: string }[]
  promotion: {
    name: string
    badge: string
    noteEn: string | null
    noteFa: string | null
    excludedCount: number
  } | null
}

/** Compose the full public settings payload (all parts individually resilient). */
export async function buildSettingsPayload(): Promise<SettingsPayload> {
  const [store, shipping, features, promotion, giftWrap, announcements] = await Promise.all([
    getSetting<StoreSettings>('store', {}),
    getSetting<ShippingSettings>('shipping', {}),
    getSetting<Record<string, unknown>>('features', {}),
    getActivePromotion(),
    loadGiftWrapConfig(),
    // Enabled admin messages only, bar order, capped — the bar is one line tall.
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
  const series = seriesRows.flatMap((r) =>
    r.seriesSlug
      ? [{ slug: r.seriesSlug, name: seriesLabel(r.series, 'en'), nameFa: seriesLabel(r.series, 'fa') }]
      : [],
  )

  return {
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
  }
}
