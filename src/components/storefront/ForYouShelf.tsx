'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import type { Locale, ProductCard as ProductCardDTO } from '@/lib/types'
import { ProductRow } from './ProductRow'
import { Reveal } from './bits'

/** Personal shelf — ranked from the visitor's own view/cart/purchase signals
 *  (TasteSignal). Hidden until there are at least 3 suggestions, and only for
 *  visitors who accepted the consent banner. As a homepage module it can be
 *  placed/reordered by the admin; `title` overrides the dict heading.
 *  Renders through the shared ProductRow so it slides exactly like the other
 *  book sliders (user: «باید مثل بقیه اسلایدر باشن»). */
export function ForYouShelf({ locale, className, title, limit }: { locale: Locale; className?: string; title?: string; limit?: number }) {
  const t = getDict(locale)
  const consent = useApp((s) => s.consentAccepted)
  const [items, setItems] = useState<ProductCardDTO[] | null>(null)

  useEffect(() => {
    if (!consent) return
    let sk = ''
    try {
      const raw = window.localStorage.getItem('sp_aid_v1')
      if (raw) sk = String(JSON.parse(raw)?.k ?? '')
    } catch {
      sk = ''
    }
    const cap = limit ?? 12
    const params = new URLSearchParams({ locale, take: String(Math.min(12, Math.max(3, cap))) })
    if (sk) params.set('sk', sk)
    apiGet<{ items: ProductCardDTO[] }>(`/api/for-you?${params.toString()}`)
      .then((r) => setItems((r.items ?? []).slice(0, cap)))
      .catch(() => setItems([]))
  }, [consent, locale, limit])

  if (!consent || !items || items.length < 3) return null

  return (
    <section className={className ?? 'mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12'} aria-label={t.home.forYou}>
      {/* Whole-module reveal — heading + slider surface together as one set. */}
      <Reveal>
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Sparkles className="h-5 w-5 text-orange-accent" aria-hidden />
            {title ?? t.home.forYou}
          </h2>
          <p className="mt-1 text-sm text-ink-3">{t.home.forYouHint}</p>
        </div>
        <ProductRow products={items} locale={locale} label={t.home.forYou} />
      </Reveal>
    </section>
  )
}
