'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tag, Gift, Ban, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, formatDateTime, compactOrderNumber } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

interface AdminOrder { id: string; orderNumber: string; email: string; status: string; totalMinor: number; createdAt: string; fulfillmentStatus: string }

export function AdminOrders() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [carrier, setCarrier] = useState('Austria Post')
  const [tracking, setTracking] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const user = useApp((s) => s.user)
  const PAGE_SIZE = 20

  const load = useCallback(() => {
    apiGet<{ items: AdminOrder[]; total: number }>(`/api/admin/orders?page=${page}&pageSize=${PAGE_SIZE}` + (statusFilter ? `&status=${statusFilter}` : '') + (q ? `&q=${encodeURIComponent(q)}` : ''))
      .then((r) => { setOrders(r.items); setTotal(r.total ?? r.items.length) }).catch(() => setOrders([]))
  }, [q, statusFilter, page])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [q, statusFilter])

  const open = async (id: string) => {
    const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
    setDetail(r.order)
    setNote(String((r.order.internalNote as string) ?? ''))
  }
  // Escape closes the hand-rolled dialog (audit UX: it used to trap the keyboard).
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const ship = async (id: string) => {
    try {
      await apiPost(`/api/admin/orders/${id}/ship`, { carrier, trackingNumber: tracking || undefined })
      toast({ title: t.admin.shippedOk })
      setDetail(null); setTracking('')
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  const refund = async (id: string, total: number) => {
    try {
      await apiPost(`/api/admin/orders/${id}/refund`, { amountMinor: Math.round(Number(refundAmount) * 100) || total, reason: refundReason || undefined })
      toast({ title: t.admin.refundOk })
      setDetail(null); setRefundAmount(''); setRefundReason('')
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  /** Stage approval — writes the REAL order status + an OrderEvent row, which
   *  is exactly what the customer dashboard timeline renders (user requirement:
   *  the timeline must be backend-driven, not visual-only). */
  const advance = async (id: string, status: 'PROCESSING' | 'DELIVERED') => {
    try {
      await apiPatch(`/api/admin/orders/${id}`, { status })
      toast({ title: status === 'PROCESSING' ? t.admin.startProcessing : t.admin.markDelivered })
      const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
      setDetail(r.order)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  /** Cancel (audit P1: the API matrix always allowed it — the button was missing).
   *  Server restores stock and the timeline shows CANCELLED to the customer. */
  const cancelOrder = async (id: string) => {
    if (!window.confirm(t.admin.cancelConfirm)) return
    setCancelBusy(true)
    try {
      await apiPatch(`/api/admin/orders/${id}`, { status: 'CANCELLED' })
      toast({ title: t.admin.orderCancelled })
      const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
      setDetail(r.order)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setCancelBusy(false) }
  }
  const saveNote = async (id: string) => {
    setNoteBusy(true)
    try {
      await apiPatch(`/api/admin/orders/${id}`, { noteInternal: note.trim() || null })
      toast({ title: t.admin.noteSaved })
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setNoteBusy(false) }
  }

  if (!orders) return <Spinner label={t.common.loading} />
  const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']
  const payments = (detail?.payments as { id: string; provider: string; amountMinor: number; status: string; cardBrand: string | null; cardLast4: string | null; failureReason: string | null; createdAt: string }[] | undefined) ?? []
  const refunds = (detail?.refunds as { id: string; amountMinor: number; reason: string | null; status: string; createdAt: string }[] | undefined) ?? []
  const returns = (detail?.returns as { id: string; status: string; reason: string; resolution: string | null; createdAt: string }[] | undefined) ?? []
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t.admin.orders}</h2>
        <Input placeholder="SP2612130011 / SP-26-12-13-0011 / email / phone" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-72" />
      </div>
      {/* Status filter chips (audit: the API filter existed, the UI never used it) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setStatusFilter('')} className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === '' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
          {t.admin.filterAll}
        </button>
        {ORDER_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-brand bdi" dir="ltr">{o.orderNumber}</span>
              <button
                type="button"
                title={`${t.admin.copyCustomerCode}: ${compactOrderNumber(o.orderNumber)}`}
                aria-label={`${t.admin.copyCustomerCode} ${compactOrderNumber(o.orderNumber)}`}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-3 transition hover:bg-soft hover:text-brand"
                onClick={(e) => {
                  e.stopPropagation()
                  void navigator.clipboard?.writeText(compactOrderNumber(o.orderNumber))
                }}
              >
                <Copy className="h-3 w-3" aria-hidden />
              </button>
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
            <Badge tone={o.status === 'PAID' || o.status === 'DELIVERED' ? 'success' : o.status === 'PENDING_PAYMENT' ? 'warning' : o.status === 'REFUNDED' ? 'default' : 'brand'}>{o.status}</Badge>
            <span className="text-xs text-ink-3">{formatDate(o.createdAt, locale)}</span>
            <span className="font-semibold text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
            <Button size="sm" variant="outline" className="h-8" onClick={() => open(o.id)}>{t.admin.view}</Button>
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
          <span>{tf(t.admin.pageInfo, { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total: String(total) })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t.admin.pagePrev}</Button>
            <span className="tabular-nums">{page} / {Math.ceil(total / PAGE_SIZE)}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>{t.admin.pageNext}</Button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t.admin.orders} onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 scrollbar-slim" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-ink bdi" dir="ltr">{String(detail.orderNumber)}</h3>
              <button
                type="button"
                title={`${t.admin.copyCustomerCode}: ${compactOrderNumber(String(detail.orderNumber))}`}
                aria-label={`${t.admin.copyCustomerCode} ${compactOrderNumber(String(detail.orderNumber))}`}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition hover:bg-soft hover:text-brand"
                onClick={() => void navigator.clipboard?.writeText(compactOrderNumber(String(detail.orderNumber)))}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(null)}>✕</Button>
            </div>
            <p className="mt-1 text-sm text-ink-3 bdi" dir="ltr">{String(detail.email)}</p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <p className="mb-1 font-semibold">{t.checkout.step2}</p>
                <p className="text-ink-2">{String((detail.shippingAddress as Record<string, string>)?.recipient)}</p>
                <p className="text-ink-3 bdi">{String((detail.shippingAddress as Record<string, string>)?.line1)}, {String((detail.shippingAddress as Record<string, string>)?.postalCode)} {String((detail.shippingAddress as Record<string, string>)?.city)}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="mb-1 font-semibold">{t.common.total}</p>
                <p className="text-xl font-bold bdi">{formatMoney(Number(detail.totalMinor), locale)}</p>
                <p className="text-xs text-ink-3">{String(detail.paymentStatus)} · {String(detail.fulfillmentStatus)}</p>
                {Number(detail.discountMinor) > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                    <Tag className="h-3 w-3" aria-hidden />{String(detail.discountCode ?? '')} −{formatMoney(Number(detail.discountMinor), locale)}
                  </p>
                )}
                {detail.giftWrap === true && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-orange-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-accent">
                    <Gift className="h-3 w-3" aria-hidden />{t.admin.giftWrapCol}{Number(detail.giftWrapMinor) > 0 ? ` · ${formatMoney(Number(detail.giftWrapMinor), locale)}` : ''}
                  </p>
                )}
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
              {(detail.items as { title: string; quantity: number; totalMinor: number }[]).map((it, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span>{it.title} × {it.quantity}</span>
                  <span className="bdi">{formatMoney(it.totalMinor, locale)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Stage approval row — PAID → PROCESSING → (ship) → SHIPPED → DELIVERED.
                  Each action persists a status transition + timeline event. */}
              <div className="space-y-2 rounded-lg border border-line p-3 sm:col-span-2">
                <p className="text-sm font-semibold">{t.account.timeline}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {detail.status === 'PENDING_PAYMENT' && <Badge tone="warning">{String(detail.status)}</Badge>}
                  {detail.status === 'PAID' && (
                    <Button size="sm" className="h-8" onClick={() => advance(String(detail.id), 'PROCESSING')}>
                      {t.admin.startProcessing}
                    </Button>
                  )}
                  {detail.status === 'PROCESSING' && (
                    <p className="text-xs text-ink-3">{t.admin.fulfill} ↓ — {t.admin.ship} → SHIPPED</p>
                  )}
                  {detail.status === 'SHIPPED' && (
                    <Button size="sm" variant="outline" className="h-8 border-brand/40 text-brand hover:bg-brand/10" onClick={() => advance(String(detail.id), 'DELIVERED')}>
                      {t.admin.markDelivered}
                    </Button>
                  )}
                  {['DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(String(detail.status)) && (
                    <Badge tone={detail.status === 'DELIVERED' ? 'success' : 'default'}>{String(detail.status)}</Badge>
                  )}
                  {['PENDING_PAYMENT', 'PAID', 'PROCESSING'].includes(String(detail.status)) && (
                    <Button size="sm" variant="ghost" className="ms-auto h-8 text-error hover:bg-error/10" disabled={cancelBusy} onClick={() => cancelOrder(String(detail.id))}>
                      <Ban className="h-3.5 w-3.5" aria-hidden />{t.admin.cancelOrder}
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{t.admin.fulfill}</p>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={t.admin.carrier} className="h-9" />
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t.admin.tracking} dir="ltr" className="h-9" />
                <Button size="sm" className="w-full" onClick={() => ship(String(detail.id))}>{t.admin.ship}</Button>
              </div>
              {user?.role === 'OWNER' && (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <p className="text-sm font-semibold">{t.admin.refund}</p>
                  <Input type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={t.admin.amount} className="h-9" />
                  <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t.admin.reasonCol} className="h-9" />
                  <Button size="sm" variant="outline" className="w-full border-error/40 text-error hover:bg-error/10" onClick={() => refund(String(detail.id), Number(detail.totalMinor))}>{t.admin.refund}</Button>
                </div>
              )}
            </div>

            {/* Payments / refunds / returns — the API always returned these, the dialog threw them away (audit). */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="mb-2 font-semibold">{t.admin.payments}</p>
                {payments.length === 0 ? <p className="text-xs text-ink-3">{t.admin.noPaymentData}</p> : (
                  <ul className="space-y-2">
                    {payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'error' : 'default'}>{p.status}</Badge>
                        <span className="font-semibold text-ink bdi">{formatMoney(p.amountMinor, locale)}</span>
                        <span className="text-ink-3 bdi" dir="ltr">{p.provider}</span>
                        {p.cardBrand && p.cardLast4 && <span className="text-ink-3 bdi" dir="ltr">{p.cardBrand} ••••{p.cardLast4}</span>}
                        {p.failureReason && <span className="text-error bdi" dir="ltr">{p.failureReason}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(p.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="mb-2 font-semibold">{t.admin.refunds}</p>
                {refunds.length === 0 ? <p className="text-xs text-ink-3">—</p> : (
                  <ul className="space-y-2">
                    {refunds.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                        <Badge tone={r.status === 'SUCCEEDED' ? 'success' : 'error'}>{r.status}</Badge>
                        <span className="font-semibold text-error bdi">−{formatMoney(r.amountMinor, locale)}</span>
                        {r.reason && <span className="text-ink-3">{r.reason}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(r.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {returns.length > 0 && (
                <div className="rounded-lg border border-line p-3 text-sm sm:col-span-2">
                  <p className="mb-2 font-semibold">{t.admin.returns}</p>
                  <ul className="space-y-2">
                    {returns.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                        <Badge tone={r.status === 'REQUESTED' ? 'warning' : r.status === 'REJECTED' ? 'error' : 'success'}>{r.status}</Badge>
                        <span className="text-ink-2">{r.reason}</span>
                        {r.resolution && <span className="text-ink-3">{t.admin.resolution}: {r.resolution}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(r.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-line p-3 sm:col-span-2">
                <p className="mb-2 text-sm font-semibold">{t.admin.internalNote}</p>
                <textarea
                  value={note} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t.admin.notePlaceholder}
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" className="h-8" disabled={noteBusy} onClick={() => saveNote(String(detail.id))}>{noteBusy ? t.common.saving : t.admin.saveNote}</Button>
                </div>
              </div>
            </div>
            {(detail.events as { type: string; message: string; createdAt: string }[])?.length > 0 && (
              <div className="mt-4 rounded-lg border border-line p-3">
                <p className="mb-2 text-sm font-semibold">{t.account.timeline}</p>
                <ol className="space-y-1.5">
                  {(detail.events as { type: string; message: string; createdAt: string }[]).map((ev, i) => (
                    <li key={i} className="text-xs text-ink-3"><span className="font-medium text-ink-2">{formatDateTime(ev.createdAt, locale)}</span> — {ev.message}</li>
                  ))}
                </ol>
              </div>
            )}
            {detail.giftWrap === true && typeof detail.giftMessage === 'string' && detail.giftMessage && (
              <div className="mt-4 rounded-lg border border-dashed border-orange-accent/40 bg-orange-accent/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-accent"><Gift className="h-4 w-4" aria-hidden />{t.admin.giftMessageCol}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">“{String(detail.giftMessage)}”</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
