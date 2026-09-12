'use client'

import { useEffect, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Spinner, EmptyState, Breadcrumbs, ProseBlocks } from '@/components/storefront/bits'
import { Button } from '@/components/ui/button'
import type { Block, Locale, PersonDTO, PersonDetail } from '@/lib/types'

export function AuthorsView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const [people, setPeople] = useState<PersonDTO[] | null>(null)

  useEffect(() => {
    apiGet<PersonDTO[]>('/api/people?locale=' + locale).then(setPeople).catch(() => setPeople([]))
    document.title = `${t.authors.title} — Persepix`
  }, [locale, t])

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.authors.title }]} />
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.authors.title}</h1>
        <p className="mt-1 text-sm text-ink-3">{t.authors.subtitle}</p>
      </header>
      {!people ? (
        <Spinner label={t.common.loading} />
      ) : people.length === 0 ? (
        <EmptyState title={t.common.empty} />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {people.map((p) => (
            <button
              key={p.slug} type="button" onClick={() => navigate(`/authors/${p.slug}`)}
              className="group text-start focus-visible:outline-brand"
            >
              <div className="overflow-hidden rounded-lg border border-line bg-soft">
                {p.portraitUrl ? (
                   
                  <img src={p.portraitUrl} alt={p.name} loading="lazy" className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center text-3xl font-bold text-brand">{p.name[0]}</div>
                )}
              </div>
              <h2 className="mt-3 text-[15px] font-semibold leading-snug text-ink group-hover:text-brand">{p.name}</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {p.profession}{p.roles.length > 0 ? ` · ${p.roles.slice(0, 2).join(', ')}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

export function AuthorView({ slug }: { slug: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const [state, setState] = useState<{ key: string; person?: PersonDetail; failed?: boolean } | null>(null)
  const key = `${locale}|${slug}`
  const person = state && state.key === key ? (state.person ?? null) : null
  const failed = state?.key === key && !!state.failed

  useEffect(() => {
    let alive = true
    apiGet<PersonDetail>(`/api/people/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((r) => {
        if (!alive) return
        setState({ key, person: r })
        document.title = `${r.name} — Persepix`
      })
      .catch(() => { if (alive) setState({ key, failed: true }) })
    return () => { alive = false }
     
  }, [key])

  if (failed) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState title={t.errors.notFound} action={<Button onClick={() => navigate('/authors')}>{t.authors.title}</Button>} />
      </main>
    )
  }
  if (!person) return <Spinner label={t.common.loading} />

  const quote = isFa ? person.quote : person.quote
  const bio = (isFa ? person.fullBio : person.fullBio) ?? person.shortBio ?? ''

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.authors.title, href: '/authors' }, { label: person.name }]} />
      <div className="grid gap-8 md:grid-cols-[260px_1fr] md:gap-12">
        <div>
          <div className="overflow-hidden rounded-lg border border-line bg-soft">
            {person.portraitUrl ? (
               
              <img src={person.portraitUrl} alt={person.name} className="aspect-[3/4] w-full object-cover" fetchPriority="high" />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center text-5xl font-bold text-brand">{person.name[0]}</div>
            )}
          </div>
          {person.roles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {person.roles.map((r) => (
                <span key={r} className="rounded-full border border-brand/25 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                  {r === 'AUTHOR' ? t.authors.author : r === 'TRANSLATOR' ? t.authors.translator : r === 'EDITOR' ? t.authors.editor : r}
                </span>
              ))}
            </div>
          )}
          <dl className="mt-4 space-y-1.5 text-sm text-ink-3">
            {person.profession && <div>{person.profession}</div>}
            {person.birthYear && <div className="bdi">{person.birthYear}{typeof person.birthYear === 'number' ? '–' : ''}</div>}
            {person.nationality && <div>{person.nationality}</div>}
          </dl>
          {person.socialLinks.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {person.socialLinks.map((l) => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline bdi">{l.platform}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{person.name}</h1>
          {bio && (
            <ProseBlocks measure={false} locale={locale} blocks={bio.split('\n\n').map((p): Block => ({ type: 'p', text: p }))} />
          )}
          {quote && (
            <blockquote className="prose-measure mt-6 rounded-e-md border-s-4 border-orange-accent bg-soft/60 px-5 py-4 text-[16px] italic text-ink-2">
              <p>&ldquo;{quote}&rdquo;</p>
              {person.quoteSource && <footer className="mt-2 text-sm not-italic text-ink-3">— {person.quoteSource}</footer>}
            </blockquote>
          )}
        </div>
      </div>

      {person.books.length > 0 && (
        <section className="mt-12 border-t border-line pt-10" aria-label={t.authors.booksBy}>
          <h2 className="mb-6 text-lg font-semibold text-ink">{t.authors.booksBy}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
            {person.books.map((b) => <ProductCard key={b.product.id} p={b.product} locale={locale} />)}
          </div>
        </section>
      )}

      {person.articles.length > 0 && (
        <section className="mt-12 border-t border-line pt-10" aria-label={t.authors.mentions}>
          <h2 className="mb-6 text-lg font-semibold text-ink">{t.authors.mentions}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {person.articles.map((a) => (
              <li key={a.slug}>
                <button type="button" onClick={() => navigate(`/articles/${a.slug}`)} className="flex w-full items-center gap-4 px-4 py-3 text-start hover:bg-soft">
                  {a.heroUrl && (
                     
                    <img src={a.heroUrl} alt="" className="h-14 w-20 shrink-0 rounded border border-line object-cover" loading="lazy" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{a.title}</span>
                    <span className="block text-xs text-ink-3">{formatDate(a.publishedAt, locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
