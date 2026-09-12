'use client'

import { Truck } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import { useSettings } from '@/lib/use-settings'
import type { Locale } from '@/lib/types'

/** Free-shipping progress (PRD 15.1 free-threshold) — shown in cart & mini-cart. */
export function FreeShippingBar({ subtotalMinor, locale }: { subtotalMinor: number; locale: Locale }) {
  const settings = useSettings()
  if (!settings) return null
  const threshold = settings.store.freeShippingThresholdMinor ?? 0
  if (!threshold || subtotalMinor >= threshold) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3.5 py-2.5 text-[13px] font-medium text-success">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        {locale === 'fa' ? 'پاداش دارید! ارسال رایگان به اتحادیهٔ اروپا فعال شد.' : 'You’ve unlocked free EU shipping.'}
      </div>
    )
  }
  const remaining = threshold - subtotalMinor
  const pct = Math.min(100, Math.round((subtotalMinor / threshold) * 100))
  return (
    <div className="rounded-lg border border-brand/20 bg-brand-soft px-3.5 py-2.5" role="status">
      <p className="flex items-center gap-2 text-[13px] text-brand">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        {locale === 'fa'
          ? <>تنها <b className="bdi">{formatMoney(remaining, locale)}</b> تا ارسال رایگان اتحادیهٔ اروپا</>
          : <><b className="bdi">{formatMoney(remaining, locale)}</b> away from free EU shipping</>}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand/15" aria-hidden>
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  )
}
