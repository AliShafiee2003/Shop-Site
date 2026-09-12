// Gift wrap service — server-authoritative pricing from the 'features' settings row
// (defaults live here so a missing/legacy settings row can never disable the fee math).
import { getSetting } from '@/lib/server/utils'

export interface GiftWrapConfig {
  enabled: boolean
  priceMinor: number
}

export const GIFT_WRAP_DEFAULTS: GiftWrapConfig = { enabled: true, priceMinor: 250 }

/** Load the gift wrap config; clamps price to a sane range and honours the enabled flag. */
export async function loadGiftWrapConfig(): Promise<GiftWrapConfig> {
  const features = await getSetting<Record<string, unknown>>('features', {})
  const raw = (features?.giftWrap ?? {}) as Partial<GiftWrapConfig> | undefined
  const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : GIFT_WRAP_DEFAULTS.enabled
  const price =
    typeof raw?.priceMinor === 'number' && Number.isFinite(raw.priceMinor)
      ? Math.min(Math.max(Math.round(raw.priceMinor), 0), 5000)
      : GIFT_WRAP_DEFAULTS.priceMinor
  return { enabled, priceMinor: price }
}
