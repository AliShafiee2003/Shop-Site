'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { formatMoney, formatDateTime } from '@/lib/format'
import { useApp } from '@/store/store'
import { Card } from '@/components/views/admin/shared'

// ───────────────────────── Analytics (PRD 30.1) ─────────────────────────

interface AnalyticsData {
  totals: { viewProduct: number; addToCart: number; beginCheckout: number; purchase: number; search: number; viewArticle: number }
  topViewed: { slug: string; title: string; views: number }[]
  daily: { date: string; view_product: number; add_to_cart: number; begin_checkout: number; purchase: number }[]
  recentPurchases: { id: string; path?: string; locale: string; valueMinor?: number; createdAt: string }[]
}

function FunnelCard({ label, value, prev, icon }: { label: string; value: number; prev?: number; icon?: React.ReactNode }) {
  const pct = prev && prev > 0 ? Math.round((value / prev) * 100) : null
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
        {icon}{label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {pct !== null && <p className="mt-0.5 text-xs text-ink-3 bdi">→ {pct}%</p>}
    </div>
  )
}

export function AdminAnalytics() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<AnalyticsData | null>(null)

  useEffect(() => { apiGet<AnalyticsData>('/api/admin/analytics').then(setData).catch(() => setData(null)) }, [])

  if (!data) return <Spinner label={t.common.loading} />

  const stages = [data.totals.viewProduct, data.totals.addToCart, data.totals.beginCheckout, data.totals.purchase]
  const maxStage = Math.max(...stages, 1)
  const maxDaily = Math.max(...data.daily.map((d) => Math.max(d.view_product, d.add_to_cart, d.begin_checkout, d.purchase)), 1)
  const stageColors: Record<string, string> = {
    view_product: 'bg-brand',
    add_to_cart: 'bg-orange-accent',
    begin_checkout: 'bg-success',
    purchase: 'bg-ink',
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">{t.admin.analytics}</h2>

      {/* Funnel */}
      <section aria-label={t.admin.funnel}>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t.admin.funnel}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FunnelCard label={t.admin.stageViews} value={data.totals.viewProduct} icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />} />
          <FunnelCard label={t.admin.stageCarts} value={data.totals.addToCart} prev={data.totals.viewProduct} />
          <FunnelCard label={t.admin.stageCheckout} value={data.totals.beginCheckout} prev={data.totals.addToCart} />
          <FunnelCard label={t.admin.stagePurchases} value={data.totals.purchase} prev={data.totals.beginCheckout} />
        </div>
        {/* Relative bar overview */}
        <div className="mt-3 space-y-1.5">
          {([
            [t.admin.stageViews, data.totals.viewProduct, 'bg-brand'],
            [t.admin.stageCarts, data.totals.addToCart, 'bg-orange-accent'],
            [t.admin.stageCheckout, data.totals.beginCheckout, 'bg-success'],
            [t.admin.stagePurchases, data.totals.purchase, 'bg-ink'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-ink-3">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(2, (value / maxStage) * 100)}%` }} />
              </div>
              <span className="w-10 text-end text-xs font-semibold tabular-nums text-ink-2">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Daily grouped bars */}
      <section className="rounded-lg border border-line p-4" aria-label={t.admin.eventsByDay}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t.admin.eventsByDay}</h3>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
            {([['view_product', t.admin.stageViews], ['add_to_cart', t.admin.stageCarts], ['begin_checkout', t.admin.stageCheckout], ['purchase', t.admin.stagePurchases]] as [string, string][]).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-sm', stageColors[k])} aria-hidden />{label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-36 items-end gap-1">
          {data.daily.map((d) => (
            <div
              key={d.date}
              className="group relative flex flex-1 items-end justify-center gap-px"
              title={`${d.date}: ${d.view_product} / ${d.add_to_cart} / ${d.begin_checkout} / ${d.purchase}`}
            >
              <div className={cn('w-1/4 rounded-t-sm', stageColors.view_product, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.view_product / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.add_to_cart, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.add_to_cart / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.begin_checkout, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.begin_checkout / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.purchase, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.purchase / maxDaily) * 130)}px` }} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top viewed */}
        <section className="rounded-lg border border-line" aria-label={t.admin.topViewed}>
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topViewed}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.topViewed.length === 0 ? <li className="px-4 py-3 text-ink-3">—</li> : data.topViewed.map((p, i) => (
              <li key={p.slug} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{p.title}</span>
                <span className="text-xs font-semibold tabular-nums text-ink">{p.views} 👁</span>
              </li>
            ))}
          </ul>
        </section>
        {/* Secondary totals */}
        <section className="grid content-start gap-3 sm:grid-cols-2" aria-label={t.admin.searches}>
          <Card title={t.admin.searches} value={data.totals.search} />
          <Card title={t.admin.articleViews} value={data.totals.viewArticle} />
          <div className="sm:col-span-2 rounded-lg border border-line">
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.stagePurchases}</h3>
            <ul className="divide-y divide-line text-sm">
              {data.recentPurchases.length === 0 ? <li className="px-4 py-3 text-ink-3">—</li> : data.recentPurchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-ink-3">{formatDateTime(p.createdAt, locale)}</span>
                  {p.valueMinor != null && <span className="text-xs font-semibold bdi">{formatMoney(p.valueMinor, locale)}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
