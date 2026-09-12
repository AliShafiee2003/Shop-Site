'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, PieChart, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, formatDateTime, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { Card } from '@/components/views/admin/shared'

export function AdminReports() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<{
    daily: { date: string; orders: number; revenueMinor: number }[]
    byProduct: { title: string; units: number; revenueMinor: number }[]
    byCountry: { countryCode: string; orders: number; revenueMinor: number }[]
    byPromotion: { name: string; orders: number; savedMinor: number; revenueMinor: number }[]
    totals: { orders: number; revenueMinor: number; refundsMinor: number; taxMinor: number; aovMinor: number }
  } | null>(null)

  const [days, setDays] = useState(30)
  // R10/R11: manual digest send (queues through the outbox like the automatic
  // healthz queueing; ?force=1 bypasses the per-window guard, days=7|30
  // selects the weekly/monthly window — the two guards are independent).
  const { toast } = useToast()
  const [digestWindow, setDigestWindow] = useState<7 | 30>(7)
  const [digestBusy, setDigestBusy] = useState(false)
  type DigestWin = { lastDigestAt: string | null; lastDigestSent: string | null; lastTo: string | null; queuedUnsent: number }
  const [digestStatus, setDigestStatus] = useState<{ weekly: DigestWin; monthly: DigestWin } | null>(null)
  const loadDigestStatus = useCallback(() => {
    apiGet<NonNullable<typeof digestStatus>>('/api/admin/reports/digest').then(setDigestStatus).catch(() => setDigestStatus(null))
  }, [])
  useEffect(() => { loadDigestStatus() }, [loadDigestStatus])
  const sendDigest = async () => {
    setDigestBusy(true)
    try {
      const r = await apiPost<{ queued: boolean; skipped?: string; to?: string }>(`/api/admin/reports/digest?force=1&days=${digestWindow}`)
      if (r.queued) {
        toast({ title: t.admin.digestQueued })
      } else if (r.skipped === 'no-recipient') {
        toast({ title: t.admin.digestSkipped, variant: 'destructive' })
      } else {
        toast({ title: t.admin.digestSkipped })
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally {
      setDigestBusy(false)
      loadDigestStatus()
    }
  }
  useEffect(() => { apiGet<typeof data>(`/api/admin/reports?days=${days}`).then(setData).catch(() => setData(null)) }, [days])

  if (!data) return <Spinner label={t.common.loading} />
  const maxRevenue = Math.max(...data.daily.map((d) => d.revenueMinor), 1)
  const maxPromoRevenue = Math.max(...data.byPromotion.map((p) => p.revenueMinor), 1)
  const promoOrdersTotal = data.byPromotion.reduce((s, p) => s + p.orders, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{t.admin.reports}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-line bg-white p-0.5" role="group" aria-label={t.admin.digestWindowLabel}>
            {([7, 30] as const).map((w) => (
              <button
                key={w} type="button" aria-pressed={digestWindow === w}
                onClick={() => setDigestWindow(w)}
                title={w === 7 ? t.admin.digestHint : t.admin.digestHint30}
                className={cn('h-7 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                  digestWindow === w ? 'bg-brand text-white shadow-sm' : 'text-ink-3 hover:text-brand')}
              >
                {w === 7 ? t.admin.digestWindowWeekly : t.admin.digestWindowMonthly}
              </button>
            ))}
          </div>
          {([7, 30, 90] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={cn('h-8 rounded-md border px-3 text-xs font-medium', days === d ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
              {locale === 'fa' ? faDigits(d) : d} {locale === 'fa' ? 'روز' : 'd'}
            </button>
          ))}
          <a href={`/api/admin/reports/export?days=${days}`} className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink-2 hover:bg-soft">{t.admin.exportCsv}</a>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={digestBusy} onClick={sendDigest} title={digestWindow === 7 ? t.admin.digestHint : t.admin.digestHint30}>
            {digestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
            {t.admin.digestSend}
          </Button>
        </div>
      </div>
      {digestStatus && (
        <div className="space-y-1" role="status">
          {([['weekly', 7 as const], ['monthly', 30 as const]] as const).map(([key, w]) => {
            const st = digestStatus[key]
            return (
              <p key={key} className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <span
                  className={cn('inline-block h-2 w-2 shrink-0 rounded-full', st.lastDigestSent ? 'bg-success' : st.lastDigestAt ? 'bg-warning' : 'bg-ink-3/40')}
                  aria-hidden
                />
                <span className="font-semibold text-ink-2">{w === 7 ? t.admin.digestWindowWeekly : t.admin.digestWindowMonthly}</span>
                {st.lastDigestAt
                  ? tf(st.lastDigestSent ? t.admin.digestLastSent : t.admin.digestLastQueued, {
                      date: formatDate(st.lastDigestAt, locale),
                      to: st.lastTo ?? '—',
                    })
                  : (w === 7 ? t.admin.digestNever : t.admin.digestNeverMonthly)}
              </p>
            )
          })}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={t.admin.orders} value={data.totals.orders} />
        <Card title={t.admin.revenue} value={formatMoney(data.totals.revenueMinor, locale)} />
        <Card title="AOV" value={formatMoney(data.totals.aovMinor, locale)} />
        <Card title="VAT" value={formatMoney(data.totals.taxMinor, locale)} />
      </div>
      <section className="rounded-lg border border-line p-4" aria-label={t.admin.daily}>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t.admin.daily}</h3>
        <div className="flex h-36 items-end gap-1">
          {data.daily.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${formatMoney(d.revenueMinor, locale)}`}>
              <div className="rounded-t bg-brand/80 transition group-hover:bg-brand" style={{ height: `${Math.max(3, (d.revenueMinor / maxRevenue) * 130)}px` }} />
            </div>
          ))}
        </div>
      </section>

      {/* Promotion performance — attribution from order snapshots */}
      <section className="overflow-hidden rounded-lg border border-orange-accent/25 bg-gradient-to-b from-orange-accent/[0.04] to-white" aria-label={t.admin.byPromotion}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/20 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-accent" aria-hidden><PieChart className="h-3.5 w-3.5" /></span>
            {t.admin.byPromotion}
          </h3>
          {data.byPromotion.length > 0 && <Badge tone="warning">{tf(t.admin.discountOrders, { n: promoOrdersTotal })}</Badge>}
        </div>
        {data.byPromotion.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-3">{t.admin.promoImpactNone}</p>
        ) : (
          <ul className="divide-y divide-orange-accent/10">
            {data.byPromotion.map((p) => {
              const share = data.totals.orders > 0 ? Math.round((p.orders / data.totals.orders) * 100) : 0
              return (
                <li key={p.name} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-accent/15 text-xs font-bold text-orange-accent" aria-hidden>%</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                    <Badge>{p.orders} {t.admin.discountOrders}</Badge>
                    <span className="text-xs text-ink-3">{t.admin.promoSavedCol}: <span className="font-semibold text-success bdi">−{formatMoney(p.savedMinor, locale)}</span></span>
                    <span className="text-sm font-semibold text-ink bdi">{formatMoney(p.revenueMinor, locale)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 ps-9">
                    <div className="h-1.5 max-w-64 flex-1 overflow-hidden rounded-full bg-soft" role="presentation">
                      <div className="h-full rounded-full bg-gradient-to-r from-orange-accent/70 to-orange-accent" style={{ width: `${Math.max(4, (p.revenueMinor / maxPromoRevenue) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-ink-3 bdi">{share}% {t.admin.promoShareCol.toLowerCase()}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line" aria-label="By product">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topProducts}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.byProduct.slice(0, 8).map((p) => (
              <li key={p.title} className="flex justify-between px-4 py-2.5">
                <span className="min-w-0 truncate text-ink-2">{p.title}</span>
                <span className="shrink-0 ps-3 bdi">{p.units} {t.admin.units} · {formatMoney(p.revenueMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-line" aria-label="By country">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.country}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.byCountry.map((c) => (
              <li key={c.countryCode} className="flex justify-between px-4 py-2.5">
                <span className="bdi" dir="ltr">{c.countryCode}</span>
                <span className="bdi">{c.orders} · {formatMoney(c.revenueMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function AdminAudit() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [entries, setEntries] = useState<{ id: string; actorEmail: string; action: string; entityType: string; entityId: string; summary: string; createdAt: string }[] | null>(null)
  const [limit, setLimit] = useState(50)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    apiGet<{ items: NonNullable<typeof entries> }>(`/api/admin/audit-log?limit=${limit}`)
      .then((r) => { setEntries(r.items); setExhausted(r.items.length < limit) })
      .catch(() => setEntries([]))
  }, [limit])

  if (!entries) return <Spinner label={t.common.loading} />
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">{t.admin.auditLog}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-2.5">
            <p className="text-ink-2">{e.summary}</p>
            <p className="mt-0.5 text-xs text-ink-3 bdi" dir="ltr">{e.action} · {e.actorEmail} · {formatDateTime(e.createdAt, locale)}</p>
          </li>
        ))}
      </ul>
      {!exhausted && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setLimit((l) => Math.min(200, l + 50))}>
            {t.admin.loadMore} ({entries.length})
          </Button>
        </div>
      )}
    </div>
  )
}
