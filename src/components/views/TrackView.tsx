'use client'

import { useEffect, useState } from 'react'
import { PackageSearch, Truck, ExternalLink, Loader2, Tag, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { navigate, useRoute } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, compactOrderNumber } from '@/lib/format'
import { Breadcrumbs, Badge } from '@/components/storefront/bits'
import { OrderStepper } from '@/components/storefront/OrderStepper'
import type { OrderPublicDTO } from '@/lib/types'

type TrackOrder = OrderPublicDTO & { discountCode?: string | null }

/** Localized status badge — mirrors the AccountView labels so guests and
 *  account holders see the SAME wording for the same state (FA previously
 *  leaked a raw English status like "partially refunded" here). */
const STATUS_LABELS: Record<string, { en: string; fa: string; tone: 'success' | 'brand' | 'warning' | 'error' | 'default' }> = {
  PENDING_PAYMENT: { en: 'Pending payment', fa: 'در انتظار پرداخت', tone: 'warning' },
  PAID: { en: 'Paid', fa: 'پرداخت‌شده', tone: 'success' },
  PROCESSING: { en: 'Processing', fa: 'در حال آماده‌سازی', tone: 'brand' },
  SHIPPED: { en: 'Shipped', fa: 'ارسال شده', tone: 'brand' },
  DELIVERED: { en: 'Delivered', fa: 'تحویل شده', tone: 'success' },
  CANCELLED: { en: 'Cancelled', fa: 'لغو شده', tone: 'error' },
  REFUNDED: { en: 'Refunded', fa: 'بازپرداخت شده', tone: 'default' },
  PARTIALLY_REFUNDED: { en: 'Partially refunded', fa: 'بازپرداخت جزئی', tone: 'default' },
}

export function TrackView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const [orderNumber, setOrderNumber] = useState(route.query.order ?? '')
  const [email, setEmail] = useState(route.query.email ?? '')
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<TrackOrder | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { document.title = `${t.track.title} — PersePix` }, [locale, t])

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const code = orderNumber.trim()
    if (!code) return
    // C6: PR-… references are unguessable → email is NOT required for them.
    const isRef = /^PR-[A-Za-z0-9_-]{16,}$/.test(code.toUpperCase())
    if (!isRef && !/.+@.+\..+/.test(email)) return
    setBusy(true)
    setNotFound(false)
    setOrder(null)
    try {
      const suffix = isRef ? '' : `?email=${encodeURIComponent(email.trim())}`
      const r = await apiGet<{ order: OrderPublicDTO }>(`/api/orders/${encodeURIComponent(code)}${suffix}`)
      setOrder(r.order)
    } catch {
      setNotFound(true)
    } finally { setBusy(false) }
  }

  // Auto-run when arriving from checkout success (order+email, or a ref link)
  useEffect(() => {
    if ((route.query.order && route.query.email) || route.query.ref) {
      if (route.query.ref) {
        setOrderNumber(route.query.ref)
        apiGet<{ order: OrderPublicDTO }>(`/api/orders/${encodeURIComponent(route.query.ref)}`)
          .then((r) => setOrder(r.order))
          .catch(() => setNotFound(true))
      } else {
        void lookup()
      }
    }
     
  }, [])

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.track.title }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.track.title}</h1>
      <p className="mt-2 text-sm text-ink-2">{t.track.intro}</p>

      <form onSubmit={lookup} className="mt-6 grid gap-3 rounded-lg border border-line p-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="tr-order" className="mb-1.5">{t.track.orderNumber}</Label>
          <Input id="tr-order" dir="ltr" placeholder="SP2612130011" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="tr-email" className="mb-1.5">{t.track.email}</Label>
          <Input id="tr-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isFa ? 'برای کد PR- لازم نیست' : 'Not needed for PR- refs'} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11 w-full sm:w-auto sm:px-8" disabled={busy || !orderNumber.trim() || (!/^PR-[A-Za-z0-9_-]{16,}$/i.test(orderNumber.trim()) && !/.+@.+\..+/.test(email))}>
            {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden /> : <PackageSearch className="me-2 h-4 w-4" aria-hidden />}
            {t.track.find}
          </Button>
        </div>
      </form>

      {notFound && (
        <div role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {t.track.notFound}
        </div>
      )}

      {order && (
        <section className="mt-6 rounded-lg border border-line fade-up" aria-label={order.orderNumber}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <p className="font-mono text-sm font-bold text-ink bdi" dir="ltr">{compactOrderNumber(order.orderNumber)}</p>
              <p className="mt-0.5 text-xs text-ink-3">{t.track.placedOn}: {formatDate(order.createdAt, locale)}</p>
              {order.publicRef && (
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {isFa ? 'کد پیگیری:' : 'Tracking ref:'}{' '}
                  <span className="font-mono bdi" dir="ltr">{order.publicRef}</span>
                </p>
              )}
            </div>
            {(() => {
              const s = STATUS_LABELS[order.status]
              return s
                ? <Badge tone={s.tone}>{isFa ? s.fa : s.en}</Badge>
                : <Badge>{order.status.replaceAll('_', ' ').toLowerCase()}</Badge>
            })()}
          </div>
          {/* R6 — backend-driven lifecycle stepper (real OrderEvent rows). */}
          <div className="border-b border-line px-5">
            <OrderStepper
              status={order.status}
              timeline={order.timeline}
              createdAt={order.createdAt}
              eta={order.shipment?.estimatedDeliveryAt ?? null}
              locale={locale}
            />
          </div>
          <ul className="divide-y divide-line px-5">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                { }
                <img src={item.coverUrl ?? ''} alt="" className="h-14 w-10 rounded-sm border border-line object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{item.title} × {item.quantity}</span>
                <span className="tabular text-sm font-medium text-ink bdi">{formatMoney(item.unitPriceMinor, locale)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 border-t border-line px-5 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.common.total}</p>
              <p className="mt-1 text-lg font-bold text-ink bdi tabular">{formatMoney(order.totalMinor, locale)}</p>
              {order.discountCode && (
                <p className="mt-1 inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                  <Tag className="h-3 w-3" aria-hidden /><span className="font-mono bdi" dir="ltr">{order.discountCode}</span> · {t.promo.discount}
                </p>
              )}
              {order.giftWrap && (
                <p className="mt-1 inline-flex items-center gap-1 rounded bg-orange-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-dark">
                  <Gift className="h-3 w-3" aria-hidden />{t.checkout.giftWrapRow}
                  {typeof order.giftWrapMinor === 'number' && <span className="bdi">· {formatMoney(order.giftWrapMinor, locale)}</span>}
                </p>
              )}
            </div>
            {order.shipment ? (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  <Truck className="h-3.5 w-3.5" aria-hidden />{t.track.carrier}
                </p>
                <p className="mt-1 text-sm text-ink-2 bdi" dir="ltr">{order.shipment.carrier} · {order.shipment.trackingNumber}</p>
                {order.shipment.trackingUrl && (
                  <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                    {t.track.trackParcel} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            ) : (
              <div className="text-ink-3">{tf(t.common.deliveryEstimate, { min: 2, max: 7 })}</div>
            )}
          </div>
          {order.giftWrap && order.giftMessage && (
            <div className="border-t border-line bg-gradient-to-r from-orange-accent/[0.06] to-transparent px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-dark"><Gift className="h-3.5 w-3.5" aria-hidden />{t.checkout.giftMessage}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">“{order.giftMessage}”</p>
            </div>
          )}
        </section>
      )}

      <p className="mt-6 text-center text-xs text-ink-3">{t.track.guestHint}</p>
      <div className="mt-3 flex justify-center">
        <Button variant="outline" size="sm" className="h-9" onClick={() => navigate('/account/orders')}>{t.nav.account}</Button>
      </div>
    </main>
  )
}
