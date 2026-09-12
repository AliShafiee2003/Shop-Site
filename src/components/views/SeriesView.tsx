'use client'

import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { navigate, useRoute } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { faDigits } from '@/lib/format'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import type { Locale, ProductCard as ProductCardDTO } from '@/lib/types'

type SeriesData = { slug: string; name: string; count: number; books: ProductCardDTO[] }

/** Public series landing page — /series/[slug] (audit §8.10).
 *  SSR: the RSC entry prefetches the full payload (getSeriesDetail) so the
 *  HTML carries the whole shelf. Client fallback refetches on demand. */
export function SeriesView({ slug }: { slug: string }) {
  const route = useRoute()
  const locale: Locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const dig = (n: number) => (isFa ? faDigits(String(n)) : String(n))

  const ssr = useSsrPageData()
  const ssrSeries: SeriesData | null =
    ssr && ssr.locale === locale && ssr.series && ssr.series.slug === slug ? ssr.series : null
  const [data, setData] = useState<SeriesData | null>(ssrSeries)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (ssrSeries) return
    let live = true
    apiGet<{ series: SeriesData | null }>(`/api/series/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((r) => { if (live) setData(r.series) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [slug, locale, ssrSeries])

  if (!data && !failed) return <Spinner label={t.common.loading} />
  if (!data) {
    return (
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <EmptyState title={t.errors.notFound} body={t.errors.notFoundBody} action={<button type="button" onClick={() => navigate('/books')} className="font-medium text-brand hover:underline">{t.errors.goHome}</button>} />
      </main>
    )
  }

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: t.nav.home, href: `/${locale}` },
          { label: t.nav.books, href: `/${locale}books` },
          { label: data.name, href: `/${locale}series/${data.slug}` },
        ]}
      />

      {/* Series hero band — a quiet shelf entrance, no photo needed */}
      <header className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-white to-white p-6 sm:p-10">
        <div className="pointer-events-none absolute -end-10 -top-14 h-44 w-44 rounded-full bg-orange-accent/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -start-8 h-40 w-40 rounded-full bg-brand/10 blur-2xl" aria-hidden />
        <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {t.series.title}
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{data.name}</h1>
        <p className="mt-2 text-sm font-medium text-ink-2" aria-label={tf(t.series.booksIn, { n: data.count })}>
          {data.count === 1 ? t.series.booksInOne : tf(t.series.booksIn, { n: dig(data.count) })}
        </p>
      </header>

      {data.books.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={t.series.empty} />
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4" aria-label={data.name}>
          {data.books.map((p) => (
            <li key={p.id}>
              <ProductCard p={p} locale={locale} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center">
        <button
          type="button"
          onClick={() => navigate('/books')}
          className="text-sm font-medium text-brand hover:underline"
        >
          {t.nav.books} →
        </button>
      </p>
    </main>
  )
}
