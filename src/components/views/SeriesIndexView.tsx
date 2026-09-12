'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Library, Layers } from 'lucide-react'
import { navigate, useRoute } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { faDigits } from '@/lib/format'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import type { Locale } from '@/lib/types'
import type { SeriesIndexEntry } from '@/lib/server/series'

/** Public series index — /series (round 4). Lists every published series as a
 *  rich card: stacked cover collage, localized name, volume count, CTA.
 *  SSR: the RSC entry prefetches the payload; client fallback refetches. */
export function SeriesIndexView() {
  const route = useRoute()
  const locale: Locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const dig = (n: number) => (isFa ? faDigits(String(n)) : String(n))

  const ssr = useSsrPageData()
  const ssrIndex: SeriesIndexEntry[] | null =
    ssr && ssr.locale === locale && Array.isArray(ssr.seriesIndex) ? ssr.seriesIndex : null
  const [data, setData] = useState<SeriesIndexEntry[] | null>(ssrIndex)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (ssrIndex) return
    let live = true
    apiGet<{ series: SeriesIndexEntry[] }>(`/api/series?locale=${locale}`)
      .then((r) => { if (live) setData(r.series) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [locale, ssrIndex])

  if (!data && !failed) return <Spinner label={t.common.loading} />
  if (!data || data.length === 0) {
    return (
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <EmptyState title={t.series.empty} action={<button type="button" onClick={() => navigate('/books')} className="font-medium text-brand hover:underline">{t.nav.books}</button>} />
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
          { label: t.series.title, href: `/${locale}series` },
        ]}
      />

      {/* Index hero band — matches the series-detail band, tuned up a notch */}
      <header className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-white to-white p-6 sm:p-10">
        <div className="pointer-events-none absolute -end-10 -top-14 h-44 w-44 rounded-full bg-orange-accent/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -start-8 h-40 w-40 rounded-full bg-brand/10 blur-2xl" aria-hidden />
        <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
          <Library className="h-3.5 w-3.5" aria-hidden />
          {t.series.title}
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.series.indexTitle}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{t.series.indexSubtitle}</p>
      </header>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2" aria-label={t.series.title}>
        {data.map((s) => (
          <li key={s.slug}>
            <button
              type="button"
              onClick={() => navigate(`/series/${s.slug}`)}
              className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-white text-start shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl focus-visible:outline-brand sm:flex-row"
              aria-label={tf(t.series.booksIn, { n: s.count })}
            >
              {/* cover collage — stacked books with a slight fan */}
              <div className="relative flex h-40 w-full shrink-0 items-end justify-center gap-3 overflow-hidden bg-gradient-to-b from-brand-soft/70 to-white p-6 sm:h-auto sm:w-44" aria-hidden>
                <div className="pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full bg-orange-accent/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-70" />
                {s.covers.length > 0 ? (
                  <>
                    {s.covers.slice(0, 3).map((c, i) => (
                      <img
                        key={c}
                        src={c}
                        alt=""
                        width={112}
                        height={150}
                        loading="lazy"
                        className="rounded-[3px] border border-line/60 shadow-lg transition-transform duration-500 group-hover:-translate-y-1"
                        style={{
                          transform: `rotate(${(i - (Math.min(s.covers.length, 3) - 1) / 2) * 5}deg)`,
                          zIndex: 3 - i,
                          marginTop: i === 1 ? '-10px' : undefined,
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <span className="flex h-24 w-20 items-center justify-center rounded-md border border-line bg-white text-ink-3 shadow-sm">
                    <BookOpen className="h-7 w-7" />
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-snug tracking-tight text-ink transition-colors group-hover:text-brand">
                    {locale === 'fa' ? s.nameFa || s.name : s.nameEn || s.name}
                  </h2>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                    <Layers className="h-3 w-3" aria-hidden />
                    {dig(s.count)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">
                  {s.count === 1 ? t.series.booksInOne : tf(t.series.booksIn, { n: dig(s.count) })}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand">
                  {t.series.explore}
                  <span className="transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden>→</span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

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
