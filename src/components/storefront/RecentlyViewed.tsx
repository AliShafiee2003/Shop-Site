'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { useRoute } from '@/lib/router'
import { readRecent } from '@/lib/recent'
import { ProductRow } from './ProductRow'
import { Reveal } from './bits'
import { getDict } from '@/lib/i18n'
import type { ProductCard as ProductCardDTO } from '@/lib/types'

/**
 * "Recently viewed" shelf — reads slugs from localStorage, fetches cards in one
 * batch request (order-preserving via `?slugs=`), renders nothing when empty.
 * Renders nothing while loading to avoid layout shift for visitors without
 * history. Renders through the shared ProductRow so it slides exactly like
 * the other book sliders (user: «باید مثل بقیه اسلایدر باشن»).
 */
export function RecentlyViewed({ excludeSlug, className, title, limit }: { excludeSlug?: string; className?: string; title?: string; limit?: number }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const [state, setState] = useState<{ key: string; items: ProductCardDTO[] } | null>(null)

  const key = `${locale}:${excludeSlug ?? ''}`
  const items = state && state.key === key ? state.items : null

  useEffect(() => {
    let alive = true
    const slugs = readRecent().filter((s) => s !== excludeSlug).slice(0, limit ?? 12)
    if (slugs.length === 0) return // nothing to show — no state, no fetch
    apiGet<{ items: ProductCardDTO[] }>(`/api/products?locale=${locale}&slugs=${encodeURIComponent(slugs.join(','))}`)
      .then((r) => {
        if (!alive) return
        // Preserve recency order from localStorage.
        const bySlug = new Map(r.items.map((i) => [i.slug, i]))
        const ordered = slugs.map((s) => bySlug.get(s)).filter((x): x is ProductCardDTO => !!x)
        if (ordered.length > 0) setState({ key, items: ordered })
      })
      .catch(() => { /* stay hidden */ })
    return () => { alive = false }
  }, [excludeSlug, locale, key, limit])

  if (!items || items.length === 0) return null

  return (
    <section className={className} aria-label={t.common.recentlyViewed}>
      {/* Whole-module reveal — heading + slider surface together as one set. */}
      <Reveal>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          <History className="h-5 w-5 text-brand" aria-hidden />
          {title ?? t.common.recentlyViewed}
        </h2>
        <ProductRow products={items} locale={locale} label={t.common.recentlyViewed} />
      </Reveal>
    </section>
  )
}
