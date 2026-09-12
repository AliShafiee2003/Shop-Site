'use client'

import { useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useRoute } from '@/lib/router'
import { HomeSections } from '@/components/storefront/HomeSections'
import { EmptyState, Skeleton } from '@/components/storefront/bits'
import { getDict } from '@/lib/i18n'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import type { HomeSection } from '@/lib/types'

export function HomeView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  // Sections are kept rendered across locale switches: settingsJson carries both
  // languages, so headings re-render instantly via the `locale` prop while each
  // shelf refetches its own products (per-shelf skeletons, no full-page blank).
  // C3: the RSC entry may have prefetched the section list — seed from it so
  // the homepage body carries real content in the SSR HTML.
  const ssr = useSsrPageData()
  const ssrSections = ssr && ssr.locale === locale && ssr.home ? ssr.home : null
  const [sections, setSections] = useState<HomeSection[] | null>(ssrSections)
  const [failed, setFailed] = useState(false)
  const loadedRef = useRef(Boolean(ssrSections))
  const ssrConsumed = useRef(Boolean(ssrSections))

  useEffect(() => {
    if (ssrConsumed.current) {
      ssrConsumed.current = false
      return
    }
    let alive = true
    apiGet<HomeSection[] | { sections: HomeSection[] }>('/api/homepage?locale=' + locale)
      .then((r) => {
        if (!alive) return
        loadedRef.current = true
        setSections(Array.isArray(r) ? r : (r.sections ?? []))
        setFailed(false)
      })
      .catch(() => { if (alive && !loadedRef.current) setFailed(true) })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    document.title = locale === 'fa' ? 'پرس‌پیکس — کتاب‌های مستقل از تهران و وین' : 'Persepix — Independent books from Tehran & Vienna'
  }, [locale])

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState title={t.common.error} action={
          <button onClick={() => location.reload()} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">{t.common.retry}</button>
        } />
      </div>
    )
  }
  if (!sections) {
    // First paint: a tall, page-shaped skeleton (hero + shelf) instead of a bare
    // "Loading…" line, so the layout keeps its real height while data arrives.
    return (
      <div data-home-skeleton aria-hidden>
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Skeleton className="h-[300px] w-full rounded-xl sm:h-[380px]" />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
          <Skeleton className="mb-5 h-6 w-52" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-28 shrink-0 rounded-full" />)}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <Skeleton className="mb-5 h-6 w-44" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (sections.length === 0) {
    return <div className="mx-auto max-w-6xl px-4 py-20"><EmptyState title={t.common.empty} /></div>
  }
  // ForYouShelf / RecentlyViewed / Articles are admin-placeable HomeSections
  // now (FOR_YOU / RECENTLY_VIEWED / ARTICLES types) — the homepage renders
  // exactly the module list the admin arranged, in the admin's order.
  return (
    <>
      {/* SEO/a11y: the hero is a rotating multi-slide slider (per-slide h2s),
          so the page-level h1 lives here — visually hidden, layout-safe. */}
      <h1 className="sr-only">
        {locale === 'fa'
          ? 'پرس‌پیکس — کتاب‌های مستقل از تهران و وین'
          : 'Persepix — Independent books from Tehran & Vienna'}
      </h1>
      <HomeSections sections={sections} locale={locale} />
    </>
  )
}
