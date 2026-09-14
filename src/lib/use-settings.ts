'use client'

import { useEffect, useState } from 'react'
import { apiGet } from './api'
import type { ShippingSettings, StoreSettings } from './types'

export interface SettingsPayload {
  store: StoreSettings
  shipping: ShippingSettings
  features?: Record<string, unknown>
  promotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null; excludedCount?: number } | null
  giftWrap?: { enabled: boolean; priceMinor: number } | null
  announcements?: { id: string; textEn: string; textFa: string; href?: string | null }[]
}

let cache: SettingsPayload | null = null
let inflight: Promise<SettingsPayload> | null = null

/** Shared, module-cached settings loader (store + shipping config). */
export function useSettings(): SettingsPayload | null {
  const [data, setData] = useState<SettingsPayload | null>(cache)

  useEffect(() => {
    if (cache) return // initialized via useState; nothing to fetch
    if (!inflight) {
      inflight = apiGet<SettingsPayload>('/api/settings')
        .then((r) => { cache = r; return r })
        .catch(() => { inflight = null; return null as unknown as SettingsPayload })
    }
    inflight.then((r) => { if (r) setData(r) })
  }, [])

  return data
}
