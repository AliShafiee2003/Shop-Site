'use client'

import { useEffect, useState } from 'react'
import { Heart, Trash2, CloudCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import { useApp } from '@/store/store'
import type { Locale, ProductCard as ProductCardDTO } from '@/lib/types'

export function FavoritesView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const favorites = useApp((s) => s.favorites)
  const favsLoaded = useApp((s) => s.favsLoaded)
  const favsSynced = useApp((s) => s.favsSynced)
  const user = useApp((s) => s.user)
  const initFavorites = useApp((s) => s.initFavorites)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const [items, setItems] = useState<ProductCardDTO[] | null>(null)

  const favKey = favsLoaded ? favorites.join(',') : ''

  useEffect(() => { initFavorites() }, [initFavorites])

  useEffect(() => {
    if (!favsLoaded) return
    document.title = `${t.favorites.title} — Persepix`
    if (favKey === '') return
    let alive = true
    apiGet<{ items: ProductCardDTO[] }>(`/api/products?locale=${locale}&slugs=${encodeURIComponent(favKey)}&pageSize=48`)
      .then((r) => { if (alive) setItems(r.items) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [favKey, favsLoaded, locale, t])

  if (!favsLoaded || (favorites.length > 0 && !items)) return <Spinner label={t.common.loading} />

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.favorites.title }]} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            <Heart className="h-6 w-6 fill-orange-accent text-orange-accent" aria-hidden />
            {t.favorites.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
            <span>{t.favorites.subtitle}{items ? ` · ${items.length}` : ''}</span>
            {user && favsSynced && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                <CloudCheck className="h-3 w-3" aria-hidden />{t.favorites.synced}
              </span>
            )}
          </p>
        </div>
        {items && items.length > 0 && (
          <Button
            variant="ghost" size="sm" className="h-9 gap-1.5 text-ink-3 hover:text-error"
            onClick={() => { items.forEach((i) => toggleFavorite(i.slug)) }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />{t.favorites.clearAll}
          </Button>
        )}
      </header>
      {!items || items.length === 0 ? (
        <EmptyState title={t.favorites.empty} body={t.favorites.emptyBody} action={<Button onClick={() => navigate('/books')}>{t.favorites.browse}</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((p, i) => <ProductCard key={p.slug} p={p} locale={locale} priority={i < 4} />)}
        </div>
      )}
    </main>
  )
}
