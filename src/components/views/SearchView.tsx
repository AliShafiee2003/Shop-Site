'use client'

import { useEffect, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { track } from '@/lib/analytics'
import { getDict } from '@/lib/i18n'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import { Button } from '@/components/ui/button'
import type { SearchResults } from '@/lib/types'

export function SearchView({ q }: { q: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const [state, setState] = useState<{ key: string; results?: SearchResults } | null>(null)
  const key = `${locale}|${q}`
  const shortQuery = q.trim().length < 2
  const results = state && state.key === key
    ? (state.results ?? null)
    : shortQuery ? { query: '', products: [], people: [], articles: [] } : null

  useEffect(() => {
    if (shortQuery) return
    let alive = true
    apiGet<SearchResults>(`/api/search?locale=${locale}&q=${encodeURIComponent(q.trim())}`)
      .then((r) => {
        if (!alive) return
        setState({ key, results: r })
        track('search')
      })
      .catch(() => { if (alive) setState({ key, results: { query: q, products: [], people: [], articles: [] } }) })
    return () => { alive = false }
     
  }, [key])

  useEffect(() => {
    document.title = `${t.common.searchResults} “${q}” — PersePix`
  }, [q, t])

  const empty = results && results.products.length === 0 && results.people.length === 0 && results.articles.length === 0

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.nav.search }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {t.common.searchResults} <span className="text-brand">“{q}”</span>
      </h1>

      {!results ? (
        <Spinner label={t.common.loading} />
      ) : empty ? (
        <div className="mt-8">
          <EmptyState
            title={`${t.common.noResults} “${q}”`}
            body={t.common.suggested}
            action={<Button onClick={() => navigate('/books')}>{t.nav.books}</Button>}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {results.products.length > 0 && (
            <section aria-label={t.nav.books}>
              <h2 className="mb-5 text-lg font-semibold text-ink">{t.nav.books} <span className="text-sm font-normal text-ink-3">({results.products.length})</span></h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
                {results.products.map((p) => <ProductCard key={p.id} p={p} locale={locale} />)}
              </div>
            </section>
          )}
          {results.people.length > 0 && (
            <section aria-label={t.authors.title}>
              <h2 className="mb-5 text-lg font-semibold text-ink">{t.authors.title}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {results.people.map((p) => (
                  <button key={p.slug} type="button" onClick={() => navigate(`/authors/${p.slug}`)} className="group flex flex-col items-center gap-2 rounded-lg border border-line p-4 text-center transition hover:border-brand">
                    {p.portraitUrl ? (
                       
                      <img src={p.portraitUrl} alt={p.name} className="h-16 w-16 rounded-full border border-line object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-xl font-bold text-brand">{p.name[0]}</span>
                    )}
                    <span className="text-sm font-semibold text-ink group-hover:text-brand">{p.name}</span>
                    <span className="text-xs text-ink-3">{p.profession}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {results.articles.length > 0 && (
            <section aria-label={t.articles.title}>
              <h2 className="mb-5 text-lg font-semibold text-ink">{t.articles.title}</h2>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {results.articles.map((a) => (
                  <li key={a.slug}>
                    <button type="button" onClick={() => navigate(`/articles/${a.slug}`)} className="w-full px-4 py-3 text-start text-sm text-ink-2 hover:bg-soft hover:text-brand">
                      {a.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
