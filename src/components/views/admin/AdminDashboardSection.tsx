'use client'

import { useEffect, useState } from 'react'
import { BarChart3, History, ShieldAlert, Inbox, Tag, PieChart, Gift, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { Card } from '@/components/views/admin/shared'

interface DashData {
  newOrders7d: number; revenueTodayMinor: number; revenueMonthMinor: number
  awaitingShipment: number; failedPayments: number; openReturns: number
  lowStock: { productTitle: string; sku: string; stock: number }[]
  pendingReviews: number; unansweredTickets: number
  topProducts: { title: string; units: number }[]
  recentOrders: { orderNumber: string; email: string; totalMinor: number; status: string; createdAt: string }[]
  activePromotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null } | null
  promoImpact?: { orders: number; paidOrders: number; savedMinor: number; revenueMinor: number; perPromo: { name: string; orders: number; savedMinor: number; revenueMinor: number }[] }
  giftWrap?: { orders: number; paidOrders: number; feesMinor: number; revenueMinor: number }
  homepageRestore?: { archived: number; lastPublishedAt: string | null }
  mailQueue?: { queued: number; queuedDigests: number; providerConfigured: boolean }
}

export function AdminDashboard() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<DashData | null>(null)

  useEffect(() => { apiGet<DashData>('/api/admin/dashboard').then(setData).catch(() => setData(null)) }, [])

  if (!data) return <Spinner label={t.common.loading} />
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={t.admin.newOrders} value={data.newOrders7d} />
        <Card title={t.admin.revenueToday} value={formatMoney(data.revenueTodayMinor, locale)} />
        <Card title={t.admin.revenueMonth} value={formatMoney(data.revenueMonthMinor, locale)} />
        <Card title={t.admin.awaitingShipment} value={data.awaitingShipment} tone={data.awaitingShipment > 0 ? 'text-orange-dark' : 'text-ink'} />
        <Card title={t.admin.failedPayments} value={data.failedPayments} tone={data.failedPayments > 0 ? 'text-error' : 'text-ink'} />
        <Card title={t.admin.openReturns} value={data.openReturns} />
        <Card title={t.admin.pendingReviews} value={data.pendingReviews} tone={data.pendingReviews > 0 ? 'text-orange-dark' : 'text-ink'} />
        <Card title={t.admin.unansweredTickets} value={data.unansweredTickets} tone={data.unansweredTickets > 0 ? 'text-orange-dark' : 'text-ink'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line" aria-label={t.admin.recentOrders}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.recentOrders}</h2>
          <ul className="divide-y divide-line">
            {data.recentOrders.map((o) => (
              <li key={o.orderNumber} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-brand bdi" dir="ltr">{o.orderNumber}</span>
                <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
                <Badge tone={o.status === 'PAID' || o.status === 'DELIVERED' ? 'success' : o.status === 'PENDING_PAYMENT' ? 'warning' : 'brand'}>{o.status}</Badge>
                <span className="font-semibold text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <PromoImpactCard data={data} />
          <GiftWrapCard data={data} />
          <RestorePointsCard data={data} />
          <MailDispatchCard data={data} />
          <section className="rounded-lg border border-line" aria-label={t.admin.topProducts}>
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topProducts}</h2>
            <ul className="divide-y divide-line">
              {data.topProducts.slice(0, 5).map((p, i) => (
                <li key={p.title} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{p.title}</span>
                  <span className="font-semibold text-ink bdi">{p.units} {t.admin.units}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-line" aria-label={t.admin.lowStock}>
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.lowStock}</h2>
            <ul className="divide-y divide-line">
              {data.lowStock.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">—</li> : data.lowStock.map((p) => (
                <li key={p.sku} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink-2">{p.productTitle}</span>
                  <span className="font-mono text-xs text-ink-3 bdi" dir="ltr">{p.sku}</span>
                  <span className="font-bold text-warning">{p.stock}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Promotion attribution — savings & adoption from checkout-time promo snapshots. */
function PromoImpactCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const impact = data.promoImpact
  const promo = data.activePromotion
  if (!impact) return null
  const share = impact.paidOrders > 0 ? Math.round((impact.orders / impact.paidOrders) * 100) : 0

  return (
    <section
      className="overflow-hidden rounded-lg border border-orange-accent/25 bg-gradient-to-br from-orange-accent/[0.07] via-transparent to-brand-soft/40"
      aria-label={t.admin.promoImpact}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/15 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><PieChart className="h-3.5 w-3.5" aria-hidden /></span>
          {t.admin.promoImpact}
        </h2>
        {promo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <span className="promo-dot inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            <span className="bdi" dir="ltr">{promo.badge}</span>
            <span className="opacity-80">{locale === 'fa' ? promo.noteFa ?? promo.name : promo.noteEn ?? promo.name}</span>
          </span>
        ) : null}
      </div>
      {impact.orders === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3">{t.admin.promoImpactNone}</p>
      ) : (
        <div className="px-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">−{formatMoney(impact.savedMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactSaved}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink">{impact.orders}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactOrders}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(impact.revenueMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactRevenue}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-3">
              <span>{t.admin.promoImpactShare}</span>
              <span className="font-bold text-orange-dark tabular-nums">{share}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-line" role="img" aria-label={`${share}%`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-accent to-orange-dark transition-all"
                style={{ width: `${Math.max(share, 2)}%` }}
              />
            </div>
          </div>
          {impact.perPromo.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {impact.perPromo.slice(0, 3).map((p) => (
                <li key={p.name} className="flex items-center gap-2 text-xs text-ink-2">
                  <Tag className="h-3 w-3 shrink-0 text-orange-dark mirror-rtl" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium bdi" dir="ltr">{p.name}</span>
                  <span className="text-ink-3 tabular-nums">{p.orders}×</span>
                  <span className="font-semibold text-error bdi">−{formatMoney(p.savedMinor, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** Gift wrap attach rate — orders with wrap, share of paid orders, fees collected. */
function GiftWrapCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const gw = data.giftWrap
  if (!gw) return null
  const attach = gw.paidOrders > 0 ? Math.round((gw.orders / gw.paidOrders) * 100) : 0

  return (
    <section
      className="overflow-hidden rounded-lg border border-orange-accent/20 bg-gradient-to-br from-brand-soft/30 via-transparent to-orange-accent/[0.06]"
      aria-label={t.admin.giftAttach}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><Gift className="h-3.5 w-3.5" aria-hidden /></span>
          {t.admin.giftAttach}
        </h2>
        <span className="font-mono text-xs font-bold tabular-nums text-orange-dark bdi" dir="ltr">{attach}%</span>
      </div>
      {gw.orders === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3">{t.admin.giftAttachNone}</p>
      ) : (
        <div className="px-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold tabular-nums text-ink">{gw.orders}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.giftAttachOrders}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(gw.feesMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.giftAttachRevenue}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(gw.revenueMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.revenue}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-3">
              <span>{t.admin.giftAttachRate}</span>
              <span className="font-bold text-orange-dark tabular-nums">{attach}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-line" role="img" aria-label={`${attach}%`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-orange-accent transition-all"
                style={{ width: `${Math.max(attach, 2)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** R10 (round-9 item d): dashboard teaser for the homepage version history —
 *  surfaces that restore points exist and deep-links into the panel. */
function RestorePointsCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const hr = data.homepageRestore
  if (!hr) return null
  return (
    <section
      className="overflow-hidden rounded-lg border border-brand/20 bg-gradient-to-br from-brand-soft/40 via-transparent to-brand-soft/20 transition-shadow hover:shadow-[0_0_0_3px_rgba(1,75,116,0.06)]"
      aria-label={t.admin.restorePointsTitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-brand"><History className="h-3.5 w-3.5" aria-hidden /></span>
          {t.admin.restorePointsTitle}
        </h2>
        {hr.archived > 0 && <Badge tone="brand">{locale === 'fa' ? faDigits(hr.archived) : hr.archived}</Badge>}
      </div>
      <div className="px-4 py-4">
        <p className="text-sm text-ink-2">
          {hr.archived > 0
            ? tf(t.admin.restorePointsSub, {
                n: locale === 'fa' ? faDigits(hr.archived) : hr.archived,
                date: hr.lastPublishedAt ? formatDate(hr.lastPublishedAt, locale) : '—',
              })
            : t.admin.restorePointsSubNone}
        </p>
        <Button variant="outline" size="sm" className="mt-3 h-8 gap-1.5 text-xs" onClick={() => navigate('/admin/homepage')}>
          <History className="h-3.5 w-3.5" aria-hidden />
          {t.admin.restorePointsCta}
          <span className="text-brand mirror-rtl" aria-hidden>→</span>
        </Button>
      </div>
    </section>
  )
}

/** R11 (round-10 item d): mail-dispatch status on the dashboard — parity with
 *  the Marketing panel's dispatch bar (queued transactional mails + queued
 *  report digests + provider state), with a deep link into the outbox. */
function MailDispatchCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const mq = data.mailQueue
  if (!mq) return null
  const on = mq.providerConfigured
  const transactional = Math.max(0, mq.queued - mq.queuedDigests)
  const num = (n: number) => (locale === 'fa' ? faDigits(n) : n)
  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-gradient-to-br from-brand-soft/25 via-transparent to-transparent transition-shadow hover:shadow-[0_0_0_3px_rgba(1,75,116,0.06)]"
      aria-label={t.admin.mailQueueTitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', on ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
            <Send className="h-3.5 w-3.5" aria-hidden />
          </span>
          {t.admin.mailQueueTitle}
        </h2>
        <span
          className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            on ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning')}
        >
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', on ? 'bg-success' : 'bg-warning')} aria-hidden />
          {on ? t.admin.mailQueueProviderOn : t.admin.mailQueueProviderOff}
        </span>
      </div>
      <div className="px-4 py-4">
        <ul className="space-y-1.5 text-sm">
          {transactional > 0 ? (
            <li className="flex items-center gap-2 text-ink-2">
              <Inbox className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
              {tf(t.admin.mailQueueTransactional, { n: num(transactional) })}
            </li>
          ) : mq.queuedDigests === 0 ? (
            <li className="flex items-center gap-2 text-ink-3">
              <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.admin.mailQueueNone}
            </li>
          ) : null}
          {mq.queuedDigests > 0 && (
            <li className="flex items-center gap-2 text-ink-2">
              <BarChart3 className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              {tf(t.admin.mailQueueDigests, { n: num(mq.queuedDigests) })}
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => navigate('/admin/marketing')}
          className="mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand transition-colors hover:text-orange-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t.admin.mailQueueOpenOutbox}
        </button>
      </div>
    </section>
  )
}
