'use client'

import { useEffect, useState } from 'react'
import { Trash2, ArrowRight, Loader2, Tag, BadgePercent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPatch, apiDelete, normalizeCart } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { formatMoney, faDigits } from '@/lib/format'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import { FreeShippingBar } from '@/components/storefront/FreeShippingBar'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { CartDTO } from '@/lib/types'

export function CartView() {
  const route = useRoute()
  const locale = route.locale
  const isFa = locale === 'fa'
  const t = getDict(locale)
  const { toast } = useToast()
  const setCartSummary = useApp((s) => s.setCartSummary)
  const [cart, setCart] = useState<CartDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => apiGet<CartDTO>('/api/cart').then((c) => { const n = normalizeCart(c); setCart(n); setCartSummary(n.count, n.subtotalMinor) }).catch(() => setCart(null))

  useEffect(() => {
    refresh()
    document.title = `${t.cart.title} — PersePix`
     
  }, [locale])

  const mutate = async (id: string, fn: () => Promise<CartDTO>) => {
    setBusyId(id)
    try {
      const c = normalizeCart(await fn())
      setCart(c)
      setCartSummary(c.count, c.subtotalMinor)
      if (c.count === 0) toast({ description: t.cart.itemRemoved })
    } catch { toast({ title: t.common.error, variant: 'destructive' }) } finally { setBusyId(null) }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.cart.title }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.cart.title}</h1>

      {!cart ? (
        <Spinner label={t.common.loading} />
      ) : cart.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t.cart.empty} action={<Button onClick={() => navigate('/books')}>{t.cart.emptyCta}</Button>} />
        </div>
      ) : (
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="mb-4"><FreeShippingBar subtotalMinor={cart.subtotalMinor} locale={locale} /></div>
            <ul className="divide-y divide-line rounded-lg border border-line">
            {cart.items.map((item) => (
              <li key={item.id} className="flex gap-4 p-4">
                <button type="button" onClick={() => navigate(`/books/${item.slug}`)} className="shrink-0" aria-label={item.title}>
                  { }
                  <img src={item.coverUrl ?? ''} alt="" className="h-28 w-20 rounded-sm border border-line object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => navigate(`/books/${item.slug}`)} className="text-start">
                    <h2 className="text-[15px] font-semibold text-ink hover:text-brand">{item.title}</h2>
                  </button>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {item.format} · {item.bookLanguage} ·{' '}
                    {item.listPriceMinor != null && item.listPriceMinor > item.unitPriceMinor ? (
                      <>
                        <span className="font-medium text-orange-dark"><span className="bdi">{formatMoney(item.unitPriceMinor, locale)}</span></span>
                        {' '}
                        <span className="line-through opacity-70"><span className="bdi">{formatMoney(item.listPriceMinor, locale)}</span></span>
                      </>
                    ) : (
                      <span className="bdi">{formatMoney(item.unitPriceMinor, locale)}</span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-md border border-line">
                      <button
                        type="button" disabled={busyId === item.id} aria-label="Decrease quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-s-md text-ink-2 hover:bg-soft disabled:opacity-40"
                        onClick={() => mutate(item.id, () => apiPatch<CartDTO>(`/api/cart/items/${item.id}`, { quantity: item.quantity - 1 }))}
                      >−</button>
                      <span className="flex h-9 min-w-9 items-center justify-center border-x border-line text-sm font-medium tabular-nums" aria-live="polite">{item.quantity}</span>
                      <button
                        type="button" disabled={busyId === item.id || item.quantity >= Math.min(10, item.stock)} aria-label="Increase quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-e-md text-ink-2 hover:bg-soft disabled:opacity-40"
                        onClick={() => mutate(item.id, () => apiPatch<CartDTO>(`/api/cart/items/${item.id}`, { quantity: item.quantity + 1 }))}
                      >+</button>
                    </div>
                    {item.quantity >= item.stock && (
                      <span className="text-xs text-warning">{t.common.lowStock.replace('{n}', locale === 'fa' ? faDigits(String(item.stock)) : String(item.stock))}</span>
                    )}
                    <button
                      type="button" disabled={busyId === item.id}
                      className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-3 hover:bg-soft hover:text-error disabled:opacity-40"
                      onClick={() => mutate(item.id, () => apiDelete<CartDTO>(`/api/cart/items/${item.id}`))}
                    >
                      {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                      {t.cart.remove}
                    </button>
                  </div>
                </div>
                <p className="text-[15px] font-semibold text-ink bdi">{formatMoney(item.lineTotalMinor, locale)}</p>
              </li>
            ))}
          </ul>
          </div>

          <aside className="h-fit rounded-lg border border-line bg-soft p-5 lg:sticky lg:top-28" aria-label={t.checkout.orderSummary}>
            <h2 className="text-base font-semibold text-ink">{t.checkout.orderSummary}</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-2">{t.common.subtotal}</dt>
                <dd className="font-medium text-ink bdi">{formatMoney(cart.subtotalMinor, locale)}</dd>
              </div>
              {cart.promotion && cart.promotion.savedMinor > 0 ? (
                <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/10 px-2.5 py-2">
                  <dt className="flex items-center gap-1.5 text-success">
                    <BadgePercent className="h-4 w-4 mirror-rtl" aria-hidden />
                    <span className="bdi">{isFa ? cart.promotion.noteFa ?? cart.promotion.name : cart.promotion.noteEn ?? cart.promotion.name}</span>
                  </dt>
                  <dd className="font-semibold text-success bdi">−{formatMoney(cart.promotion.savedMinor, locale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-2">{t.common.tax}</dt>
                <dd className="text-ink-3 bdi">{t.common.tax.includes('included') ? '—' : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">{t.common.shipping}</dt>
                <dd className="text-ink-3">{t.checkout.title}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{t.cart.estimateNote}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              <Tag className="h-3.5 w-3.5 mirror-rtl" aria-hidden />{t.promo.cartHint}
            </p>
            <Button size="lg" className="mt-4 h-12 w-full text-[15px]" onClick={() => navigate('/checkout')}>
              {t.common.goCheckout} <ArrowRight className="h-4 w-4 mirror-rtl" aria-hidden />
            </Button>
            <Button variant="ghost" className="mt-2 w-full text-sm text-ink-3" onClick={() => navigate('/books')}>
              {t.cart.keepShopping}
            </Button>
          </aside>
        </div>
      )}
    </main>
  )
}
