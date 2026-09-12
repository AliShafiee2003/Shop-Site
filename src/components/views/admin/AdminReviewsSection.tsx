'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, Spinner, EmptyState } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPatch } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

interface AdminReview { id: string; productTitle: string; authorName?: string | null; rating: number; title?: string; body: string; moderationState: string; moderationReason?: string | null; reply?: string | null; repliedAt?: string | null; createdAt: string; locale: string }

export function AdminReviews() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [reviews, setReviews] = useState<AdminReview[] | null>(null)
  const [state, setState] = useState('PENDING')
  // Per-review action state (Task 27: reject reason + public press reply)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [reasonOpen, setReasonOpen] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ items: AdminReview[] }>('/api/admin/reviews?state=' + state).then((r) => setReviews(r.items)).catch(() => setReviews([]))
  }, [state])
  useEffect(() => { load() }, [load])

  const moderate = async (id: string, moderationState: string, reason?: string | null) => {
    setBusy(true)
    try {
      await apiPatch(`/api/admin/reviews/${id}`, { moderationState, ...(reason !== undefined ? { reason } : {}) })
      toast({ title: t.admin.saved })
      setReasonOpen(null); setReasonText('')
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }
  const saveReply = async (id: string) => {
    const reply = (replyDraft[id] ?? '').trim()
    setBusy(true)
    try {
      await apiPatch(`/api/admin/reviews/${id}`, { reply: reply || null })
      toast({ title: t.admin.replySaved })
      setReplyDraft((d) => ({ ...d, [id]: '' }))
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  if (!reviews) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'SPAM'].map((s) => (
          <button key={s} type="button" onClick={() => setState(s)}
            className={cn('h-9 rounded-md border px-3 text-xs font-medium', state === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2')}>
            {s}
          </button>
        ))}
      </div>
      {reviews.length === 0 ? <EmptyState title={t.admin.reviews} /> : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-orange-accent" aria-hidden>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <p className="text-sm font-semibold text-ink">{r.title}</p>
                <Badge tone={r.moderationState === 'APPROVED' ? 'success' : r.moderationState === 'PENDING' ? 'warning' : 'default'}>{r.moderationState}</Badge>
                <span className="ms-auto text-xs text-ink-3">{r.authorName ?? '—'} · {formatDate(r.createdAt, locale)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{r.productTitle} · <span className="bdi" dir="ltr">{r.locale}</span></p>
              <p className="mt-2 text-sm text-ink-2">{r.body}</p>
              {r.reply && (
                <div className="mt-2 rounded-e-md border-s-2 border-brand/30 bg-soft/60 px-3 py-2" role="note">
                  <p className="text-[11px] font-semibold text-brand">{t.admin.replyLabel}{r.repliedAt ? ` · ${formatDate(r.repliedAt, locale)}` : ''}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{r.reply}</p>
                </div>
              )}
              {r.moderationReason && <p className="mt-1.5 text-[11px] text-ink-3">{t.admin.rejectReason}: {r.moderationReason}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-8" disabled={busy} onClick={() => moderate(r.id, 'APPROVED')}>{t.admin.approve}</Button>
                {reasonOpen === r.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder={t.admin.reasonPlaceholder} className="h-8 min-w-48 flex-1" autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') void moderate(r.id, 'REJECTED', reasonText.trim() || null) }} />
                    <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void moderate(r.id, 'REJECTED', reasonText.trim() || null)}>{t.admin.reject}</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setReasonOpen(null)}>{t.common.cancel}</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => { setReasonOpen(r.id); setReasonText(r.moderationReason ?? '') }}>{t.admin.reject}</Button>
                )}
                <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => moderate(r.id, 'SPAM')}>{t.admin.spam}</Button>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Label htmlFor={`rv-reply-${r.id}`} className="mb-1 text-xs text-ink-3">{t.admin.replyLabel}</Label>
                  <textarea
                    id={`rv-reply-${r.id}`} rows={2} value={replyDraft[r.id] ?? ''} maxLength={2000} placeholder={t.admin.replyPlaceholder}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8" disabled={busy || !(replyDraft[r.id] ?? '').trim()} onClick={() => void saveReply(r.id)}>
                  {t.admin.replySaved.length ? t.admin.saved : t.admin.saved}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
