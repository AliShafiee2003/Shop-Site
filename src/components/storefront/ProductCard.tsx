'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Heart, Loader2, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navigate, localePath } from '@/lib/router'
import { apiPost, normalizeCart } from '@/lib/api'
import { RatingStars, PriceTag, SalePriceTag, SaleRibbon } from './bits'
import { getDict, tf } from '@/lib/i18n'
import { faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { Locale, ProductCard as ProductCardDTO } from '@/lib/types'

export function ProductCard({ p, locale, className, priority }: {
  p: ProductCardDTO; locale: Locale; className?: string; priority?: boolean
}) {
  const t = getDict(locale)
  const { toast } = useToast()
  const href = `/books/${p.slug}`
  const favorites = useApp((s) => s.favorites)
  const favsLoaded = useApp((s) => s.favsLoaded)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const setCartSummary = useApp((s) => s.setCartSummary)
  const [favBusy, setFavBusy] = useState(false)
  const [quickBusy, setQuickBusy] = useState(false)
  const isFav = favsLoaded && favorites.includes(p.slug)
  const signedIn = Boolean(useApp((st) => st.user))

  const onToggleFav = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (favBusy) return
    setFavBusy(true)
    const added = toggleFavorite(p.slug)
    toast({ title: added ? t.favorites.added : t.favorites.removed })
    setFavBusy(false)
  }

  /** Quick add: fetch detail once, add first in-stock variant. */
  const quickAdd = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (quickBusy || !p.inStock) return
    setQuickBusy(true)
    try {
      const detail = await fetch(`/api/products/${p.slug}?locale=${locale}`).then((r) => r.json())
      const variant = (detail.variants ?? []).find((v: { stock: number }) => v.stock > 0)
      if (!variant) throw new Error('NO_VARIANT')
      const raw = await apiPost('/api/cart/items', { variantId: variant.id, quantity: 1 })
      const cart = normalizeCart(raw)
      setCartSummary(cart.count, cart.subtotalMinor)
      toast({ title: t.common.added, description: `${p.title}` })
    } catch {
      toast({ title: t.common.error, variant: 'destructive' })
    } finally { setQuickBusy(false) }
  }

  const onSale = p.listPriceMinor != null && p.priceMinor != null && p.listPriceMinor > p.priceMinor
  const salePct = onSale && p.listPriceMinor ? Math.round((1 - (p.priceMinor as number) / p.listPriceMinor) * 100) : 0

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <Link
        href={localePath(locale, href)}
        onClick={(e) => { e.preventDefault(); navigate(href) }}
        aria-label={p.title}
        className="relative block overflow-hidden rounded-lg border border-line bg-soft focus-visible:outline-brand"
      >
        <div className="aspect-[3/4] w-full">
          {p.coverUrl ? (
             
            <img
              src={p.coverUrl}
              alt={`${p.title} — ${t.nav.books}`}
              loading={priority ? 'eager' : 'lazy'}
              sizes="(max-width: 640px) 45vw, 220px"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-soft text-brand">✦</div>
          )}
        </div>
        {onSale && <SaleRibbon badge={`−${salePct}%`} locale={locale} />}
        {!p.inStock && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/85 px-2 py-1.5 text-center text-xs font-medium text-white">
            {t.common.outOfStock}
          </div>
        )}
        {/* Quick add on hover (desktop) */}
        {p.inStock && (
          <button
            type="button"
            onClick={quickAdd}
            disabled={quickBusy}
            aria-label={`${t.common.addToCart}: ${p.title}`}
            className={cn(
              'absolute inset-x-2.5 bottom-2.5 flex h-10 translate-y-1 items-center justify-center gap-1.5 rounded-md bg-white/95 text-[13px] font-semibold text-ink shadow-sm backdrop-blur transition-all duration-200 hover:bg-brand hover:text-white',
              'opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100',
              quickBusy && 'opacity-100'
            )}
          >
            {quickBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
            {t.common.addToCart}
          </button>
        )}
      </Link>

      {/* Wishlist heart — hidden for guests */}
      {signedIn && (
      <button
        type="button"
        onClick={onToggleFav}
        aria-pressed={isFav}
        aria-label={isFav ? t.favorites.removed : t.favorites.added}
        className={cn(
          'absolute end-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition',
          isFav
            ? 'border-orange-accent/40 bg-orange-accent text-white'
            : 'border-line/70 bg-white/90 text-ink-3 hover:text-orange-accent'
        )}
      >
        <Heart className={cn('h-4 w-4', isFav && 'fill-current')} aria-hidden />
      </button>
      )}

      <div className="mt-2.5 flex flex-1 flex-col gap-1">
        {p.contributors && p.contributors.length > 0 ? (
          <p className="text-xs leading-snug text-ink-3">
            {p.contributors.filter(c => c.role === 'AUTHOR').slice(0, 2).map((c, i) => (
              <span key={c.slug}>
                {i > 0 && ' · '}
                <Link
                  href={localePath(locale, `/authors/${c.slug}`)}
                  onClick={(e) => { e.preventDefault(); navigate(`/authors/${c.slug}`) }}
                  className="hover:text-brand hover:underline"
                >
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        <h3 className="text-sm font-semibold leading-snug text-ink">
          <Link
            href={localePath(locale, href)}
            onClick={(e) => { e.preventDefault(); navigate(href) }}
            className="hover:text-brand"
          >
            {p.title}
          </Link>
        </h3>
        {p.rating && p.rating.count > 0 ? <RatingStars value={p.rating.avg} count={p.rating.count} locale={locale} /> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {onSale ? (
            <SalePriceTag minor={p.priceMinor as number} listMinor={p.listPriceMinor} locale={locale} className="text-[15px]" />
          ) : (
            <PriceTag minor={p.priceMinor as number} locale={locale} className="text-[15px]" />
          )}
          {p.isLowStock && p.inStock ? (
            <span className="text-[11px] font-medium text-warning">{tf(t.common.lowStock, { n: locale === 'fa' ? faDigits('1–3') : '1–3' })}</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
