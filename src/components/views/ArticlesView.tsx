'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { track } from '@/lib/analytics'
import { getDict } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { Spinner, EmptyState, Breadcrumbs, ProseBlocks } from '@/components/storefront/bits'
import { Share2, Link2, Check } from 'lucide-react'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/store'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import type { ArticleListItem, ArticleDetail, Block, Locale } from '@/lib/types'

function ArticleCard({ a, locale, featured }: { a: ArticleListItem; locale: Locale; featured?: boolean }) {
  const isFa = locale === 'fa'
  return (
    <button
      type="button" onClick={() => navigate(`/articles/${a.slug}`)}
      className="group flex w-full flex-col text-start focus-visible:outline-brand"
    >
      <div className="overflow-hidden rounded-lg border border-line bg-soft">
        {a.heroUrl ? (
           
          <img src={a.heroUrl} alt={a.title} width={840} height={480} loading="lazy" className={cn('w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]', featured ? 'aspect-[7/4]' : 'aspect-[16/10]')} />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center bg-brand-soft text-brand">✎</div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs text-ink-3">
          {a.categories.map((c) => c.name).join(' · ')}
          {a.readingMinutes ? ` · ${a.readingMinutes} ${getDict(locale).common.minutes}` : ''}
        </p>
        <h2 className={cn('mt-1 font-semibold leading-snug text-ink group-hover:text-brand', featured ? 'text-lg' : 'text-[15px]')}>{a.title}</h2>
        {a.excerpt ? <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-2">{a.excerpt}</p> : null}
        <p className="mt-2 text-xs text-ink-3">{formatDate(a.publishedAt, isFa ? 'fa' : 'en')}</p>
      </div>
    </button>
  )
}

export function ArticlesView({ category }: { category?: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  // C3: seed from the server-prefetched list when the RSC entry already loaded
  // this exact category in this locale (SSR HTML carries the real grid).
  const ssr = useSsrPageData()
  const ssrList = ssr && ssr.locale === locale && ssr.articles && (ssr.articlesCategory ?? null) === (category ?? null) ? ssr.articles : null
  const [articles, setArticles] = useState<ArticleListItem[] | null>(ssrList)
  const ssrConsumed = useRef(Boolean(ssrList))

  useEffect(() => {
    if (ssrConsumed.current) {
      ssrConsumed.current = false
      document.title = `${t.articles.title} — Persepix`
      return
    }
    const url = '/api/articles?locale=' + locale + (category ? `&category=${encodeURIComponent(category)}` : '')
    apiGet<ArticleListItem[]>(url).then((r) => setArticles(Array.isArray(r) ? r : [])).catch(() => setArticles([]))
    document.title = `${t.articles.title} — Persepix`
  }, [locale, category, t])

  const featured = useMemo(() => articles?.find((a) => a.featured), [articles])
  const rest = useMemo(() => articles?.filter((a) => a !== featured) ?? [], [articles, featured])

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.articles.title }]} />
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.articles.title}</h1>
        <p className="mt-1 text-sm text-ink-3">{t.articles.subtitle}</p>
      </header>
      {!articles ? (
        <Spinner label={t.common.loading} />
      ) : articles.length === 0 ? (
        <EmptyState title={t.common.empty} />
      ) : (
        <>
          {featured && !category && (
            <div className="mb-10"><ArticleCard a={featured} locale={locale} featured /></div>
          )}
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((a) => <ArticleCard key={a.slug} a={a} locale={locale} />)}
          </div>
        </>
      )}
    </main>
  )
}

export function ArticleView({ slug }: { slug: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const [copied, setCopied] = useState(false)
  // C3: seed from the server-prefetched article (full body in the SSR HTML).
  const ssr = useSsrPageData()
  const ssrArticle = ssr && ssr.locale === locale && ssr.article && ssr.article.slug === slug ? ssr.article : null
  // Deterministic share URL (no bare `window` during SSR — C3 follow-up).
  const shareUrl = `${ssr?.siteOrigin ?? ''}${route.raw}`
  const [state, setState] = useState<{ key: string; article?: ArticleDetail; failed?: boolean } | null>(
    ssrArticle ? { key: `${locale}|${slug}`, article: ssrArticle } : null,
  )
  const ssrConsumed = useRef(Boolean(ssrArticle))
  const key = `${locale}|${slug}`
  const article = state && state.key === key ? (state.article ?? null) : null
  const failed = state?.key === key && !!state.failed

  useEffect(() => {
    let alive = true
    if (ssrConsumed.current) {
      ssrConsumed.current = false
      const a = article
      if (a) {
        document.title = `${a.title} — Persepix Journal`
        track('view_article')
      }
      return
    }
    apiGet<ArticleDetail>(`/api/articles/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((r) => {
        if (!alive) return
        setState({ key, article: r })
        document.title = `${r.title} — Persepix Journal`
        track('view_article')
      })
      .catch(() => { if (alive) setState({ key, failed: true }) })
    return () => { alive = false }
     
  }, [key])

  if (failed) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState title={t.errors.notFound} action={<Button onClick={() => navigate('/articles')}>{t.articles.title}</Button>} />
      </main>
    )
  }
  if (!article) return <Spinner label={t.common.loading} />

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const headings = (article.body ?? []).filter((b): b is Extract<Block, { type: 'h2' }> => b.type === 'h2')
  const hIndex = new Map<string, number>()
  let hi = 0
  for (const b of article.body ?? []) {
    if (b.type === 'h2') { hIndex.set(b.text, hi); hi++ }
  }
  const bodyWithIds = (article.body ?? []).map((b, i) => b.type === 'h2' ? { ...b, id: `section-${hIndex.get(b.text) ?? i}` } : b)

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.articles.title, href: '/articles' }, { label: article.title }]} />
      <article className="mx-auto max-w-3xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-dark">
            {article.categories.map((c) => c.name).join(' · ')}
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">{article.title}</h1>
          {article.excerpt && <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{article.excerpt}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-ink-3">
              {article.byline ? `${t.articles.byline} ${article.byline} · ` : ''}
              {formatDate(article.publishedAt, isFa ? 'fa' : 'en')}
              {article.readingMinutes ? ` · ${article.readingMinutes} ${t.common.minutes}` : ''}
            </p>
            <span className="ms-auto flex items-center gap-1.5">
              <a
                href={`mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(shareUrl)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-ink-3 hover:border-brand/40 hover:text-brand"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />{t.share.email}
              </a>
              <button
                type="button" onClick={copyLink}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition',
                  copied ? 'border-success/40 bg-success/10 text-success' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand')}
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
                {copied ? t.share.copied : t.share.copy}
              </button>
            </span>
          </div>
        </header>

        {article.heroUrl && (
          <figure className="mt-8">
            { }
            <img src={article.heroUrl} alt={article.title} width={1120} height={640} className="aspect-[7/4] w-full rounded-lg border border-line object-cover" fetchPriority="high" />
          </figure>
        )}

        {headings.length > 2 && (
          <nav aria-label={t.articles.toc} className="mt-8 rounded-lg border border-line bg-soft px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.articles.toc}</p>
            <ol className="list-decimal space-y-1 ps-5 text-sm">
              {headings.map((h) => (
                <li key={h.text}>
                  <a href={`#section-${hIndex.get(h.text)}`} className="text-brand hover:underline">{h.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className={cn('mt-8', !isFa && 'dropcap')}>
          <ProseBlocks blocks={bodyWithIds} locale={locale} />
        </div>
      </article>

      {(article.relatedProducts.length > 0 || article.relatedPeople.length > 0) && (
        <section className="mx-auto mt-12 max-w-3xl border-t border-line pt-10" aria-label={t.articles.relatedBooks}>
          <h2 className="mb-6 text-lg font-semibold text-ink">{t.articles.relatedBooks}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {article.relatedProducts.slice(0, 3).map((p) => <ProductCard key={p.id} p={p} locale={locale} />)}
          </div>
          {article.relatedPeople.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {article.relatedPeople.map((p) => (
                <button key={p.slug} type="button" onClick={() => navigate(`/authors/${p.slug}`)} className="flex items-center gap-2.5 rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand">
                  {p.portraitUrl ? (
                     
                    <img src={p.portraitUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{p.name[0]}</span>}
                  <span className="text-ink-2">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {article.relatedArticles.length > 0 && (
        <section className="mx-auto mt-12 max-w-3xl border-t border-line pt-10" aria-label={t.articles.related}>
          <h2 className="mb-6 text-lg font-semibold text-ink">{t.articles.related}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {article.relatedArticles.map((a) => (
              <li key={a.slug}>
                <button type="button" onClick={() => navigate(`/articles/${a.slug}`)} className="w-full px-4 py-3 text-start text-sm font-medium text-ink-2 hover:bg-soft hover:text-brand">
                  {a.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
