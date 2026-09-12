'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner, EmptyState } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { formatMoney, formatDateTime } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

export function AdminTickets() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [tickets, setTickets] = useState<{ id: string; ticketNumber: string; subject: string; email: string; name?: string | null; status: string; priority: string; category: string; relatedOrderNumber?: string | null; createdAt: string; lastMessagePreview?: string | null }[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  // Thread dialog (audit: the API returned the full conversation — the UI never called it)
  const [thread, setThread] = useState<{ id: string; ticketNumber: string; subject: string; email: string; name?: string | null; status: string; priority: string; relatedOrderNumber?: string | null; createdAt: string; messages: { id: string; senderType: string; senderName: string; body: string; createdAt: string }[]; relatedOrder?: { orderNumber: string; status: string; totalMinor: number; email: string } | null } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ items: NonNullable<typeof tickets> }>('/api/admin/tickets' + (statusFilter ? `?status=${statusFilter}` : '')).then((r) => setTickets(r.items)).catch(() => setTickets([]))
  }, [statusFilter])
  useEffect(() => { load() }, [load])

  const openThread = async (id: string) => {
    setReply('')
    try {
      const r = await apiGet<{ ticket: NonNullable<typeof thread> }>(`/api/admin/tickets/${id}`)
      setThread(r.ticket)
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  useEffect(() => {
    if (!thread) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setThread(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [thread])

  const send = async () => {
    if (!thread || !reply.trim()) return
    setBusy(true)
    try {
      await apiPost(`/api/admin/tickets/${thread.id}/messages`, { body: reply.trim() })
      setReply('')
      toast({ title: t.admin.replySaved.length ? t.admin.replySaved : t.admin.saved })
      await openThread(thread.id)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }
  const patchTicket = async (id: string, patch: { status?: string; priority?: string }) => {
    try {
      await apiPatch(`/api/admin/tickets/${id}`, patch)
      await openThread(id)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }

  const prioTone = (p: string) => (p === 'HIGH' ? 'error' : p === 'LOW' ? 'default' : 'brand') as 'error' | 'default' | 'brand'
  const STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_SUPPORT', 'CLOSED']

  if (!tickets) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-lg font-semibold text-ink">{t.admin.tickets}</h2>
        {['', ...STATUSES].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)}
            className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
            {s === '' ? t.admin.filterAll : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {tickets.length === 0 ? <EmptyState title={t.admin.tickets} /> : (
        <ul className="space-y-3">
          {tickets.map((tk) => (
            <li key={tk.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{tk.subject}</p>
                <Badge tone={tk.status === 'OPEN' ? 'warning' : tk.status === 'CLOSED' ? 'default' : 'brand'}>{tk.status.replace(/_/g, ' ')}</Badge>
                <Badge tone={prioTone(tk.priority)}>{tk.priority}</Badge>
                <span className="ms-auto text-xs text-ink-3 bdi" dir="ltr">{tk.ticketNumber} · {tk.email}</span>
              </div>
              {tk.lastMessagePreview && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{tk.lastMessagePreview}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openThread(tk.id)}>
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />{t.admin.viewThread}
                </Button>
                {tk.status === 'CLOSED' && (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => patchTicket(tk.id, { status: 'OPEN' })}>{t.admin.reopen}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {thread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t.admin.thread} onClick={() => setThread(null)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-ink">{thread.subject}</h3>
                  <p className="mt-0.5 text-xs text-ink-3 bdi" dir="ltr">{thread.ticketNumber} · {thread.name ?? thread.email}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setThread(null)}>✕</Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={thread.status} onChange={(e) => patchTicket(thread.id, { status: e.target.value })} className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={thread.priority} onChange={(e) => patchTicket(thread.id, { priority: e.target.value })} className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium">
                  <option value="LOW">{t.admin.prioLow}</option>
                  <option value="NORMAL">{t.admin.prioNormal}</option>
                  <option value="HIGH">{t.admin.prioHigh}</option>
                </select>
                {thread.relatedOrder && (
                  <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand bdi" dir="ltr">
                    {t.admin.relatedOrder}: {thread.relatedOrder.orderNumber} · {formatMoney(thread.relatedOrder.totalMinor, locale)}
                  </span>
                )}
              </div>
            </div>
            <div className="min-h-40 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-slim">
              {thread.messages.map((m) => {
                const mine = m.senderType === 'SUPPORT'
                return (
                  <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                    <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                      mine ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-line bg-soft/70 text-ink')}>
                      {m.body}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-3">{mine ? t.admin.you : t.admin.customer} · {formatDateTime(m.createdAt, locale)}</p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-line p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply} rows={2} onChange={(e) => setReply(e.target.value)} placeholder={t.admin.reply}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send() }}
                  className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                />
                <Button size="sm" className="h-9" disabled={busy || !reply.trim()} onClick={() => void send()}>{t.admin.sendReply}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
