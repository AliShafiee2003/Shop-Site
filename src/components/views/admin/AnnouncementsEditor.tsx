'use client'

/**
 * Admin · Custom announcement builder (P0-4).
 * Create / edit / reorder / enable / delete the admin-authored messages that
 * rotate in the storefront's top announcement bar, ahead of the system
 * messages (promo · free shipping · gift wrap · newsletter).
 * Self-contained section component — mounted by AdminView (announcements tab).
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Megaphone, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EmptyState, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

interface AnnRow {
  id: string
  enabled: boolean
  sortOrder: number
  textEn: string
  textFa: string
  href: string | null
  createdAt: string
  updatedAt: string
}

export function AdminAnnouncements() {
  const locale = useApp((s) => s.locale)
  const { toast } = useToast()

  // Bilingual inline labels (locale-scoped; i18n.ts untouched by design).
  const L = locale === 'fa'
    ? {
        title: 'اطلاعیه‌های سفارشی',
        hint: 'این پیام‌ها بالای سایت، پیش از پیام‌های سیستمی نمایش داده می‌شوند.',
        new: 'اطلاعیهٔ جدید',
        create: 'افزودن اطلاعیه',
        cancel: 'انصراف',
        textEn: 'متن انگلیسی',
        textFa: 'متن فارسی',
        href: 'پیوند (اختیاری)',
        hrefHint: 'مثال: /books?sale=1 — /en link only',
        enabled: 'فعال',
        disabled: 'غیرفعال',
        moveUp: 'جابه‌جایی به بالا',
        moveDown: 'جابه‌جایی به پایین',
        delete: 'حذف اطلاعیه',
        deleteConfirm: 'این اطلاعیه حذف شود؟',
        required: 'متن انگلیسی و متن فارسی لازم است.',
        created: 'اطلاعیه ساخته شد.',
        saved: 'ذخیره شد.',
        deleted: 'اطلاعیه حذف شد.',
        enabledToast: 'اطلاعیه فعال شد.',
        disabledToast: 'اطلاعیه غیرفعال شد.',
        emptyTitle: 'هنوز اطلاعیه‌ای ساخته نشده است',
        emptyBody: 'برای نمایش یک پیام سفارشی در نوار بالای سایت، اطلاعیهٔ جدیدی بسازید.',
        loading: 'در حال بارگذاری…',
        error: 'خطا',
      }
    : {
        title: 'Custom announcements',
        hint: 'These messages rotate in the top announcement bar ahead of the system messages.',
        new: 'New announcement',
        create: 'Add announcement',
        cancel: 'Cancel',
        textEn: 'English text',
        textFa: 'Persian text',
        href: 'Link (optional)',
        hrefHint: 'e.g. /books?sale=1 — /en link only',
        enabled: 'Enabled',
        disabled: 'Disabled',
        moveUp: 'Move up',
        moveDown: 'Move down',
        delete: 'Delete announcement',
        deleteConfirm: 'Delete this announcement?',
        required: 'English and Persian text are required.',
        created: 'Announcement created.',
        saved: 'Saved.',
        deleted: 'Announcement deleted.',
        enabledToast: 'Announcement enabled.',
        disabledToast: 'Announcement disabled.',
        emptyTitle: 'No announcements yet',
        emptyBody: 'Create one to show a custom message in the top announcement bar.',
        loading: 'Loading…',
        error: 'Error',
      }

  const [rows, setRows] = useState<AnnRow[] | null>(null)
  // Server baseline per row id — source of truth for the blur-diff PATCHes.
  const [baseline, setBaseline] = useState<Map<string, AnnRow>>(new Map())
  const [showForm, setShowForm] = useState(false)
  const [newEn, setNewEn] = useState('')
  const [newFa, setNewFa] = useState('')
  const [newHref, setNewHref] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ announcements: AnnRow[] }>('/api/admin/announcements')
      .then((r) => {
        setRows(r.announcements)
        setBaseline(new Map<string, AnnRow>(r.announcements.map((a) => [a.id, a])))
      })
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const err = (e: unknown) => (e as { message?: string }).message ?? L.error

  /** Optimistic local edit (typing); server truth re-lands via PATCH or load(). */
  const patchLocal = (id: string, data: Partial<AnnRow>) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...data } : r)) ?? prev)
  }

  /** PATCH one field, merge the result into rows + baseline (no full reload so
   *  uncommitted edits in other rows survive). */
  const patchField = async (id: string, data: Record<string, unknown>, local: Partial<AnnRow>) => {
    try {
      await apiPatch(`/api/admin/announcements/${id}`, data)
      patchLocal(id, local)
      setBaseline((prev) => {
        const m = new Map(prev)
        const cur = m.get(id)
        if (cur) m.set(id, { ...cur, ...local })
        return m
      })
      toast({ title: L.saved })
    } catch (e) {
      toast({ title: err(e), variant: 'destructive' })
      const orig = baseline.get(id)
      if (orig) patchLocal(id, orig)
    }
  }

  /** Text/href inputs save on blur — only when the value actually changed. */
  const saveBlur = async (r: AnnRow, field: 'textEn' | 'textFa' | 'href') => {
    const orig = baseline.get(r.id)
    if (!orig) return
    const raw = (r[field] ?? '').trim()

    if (field === 'href') {
      const next = raw === '' ? null : raw
      if (next === orig.href) { patchLocal(r.id, { href: next }); return }
      if (next !== null && !next.startsWith('/')) {
        toast({ title: L.hrefHint, variant: 'destructive' })
        patchLocal(r.id, { href: orig.href })
        return
      }
      await patchField(r.id, { href: next }, { href: next })
      return
    }

    if (raw === '') {
      toast({ title: L.required, variant: 'destructive' })
      patchLocal(r.id, { [field]: orig[field] })
      return
    }
    if (raw === orig[field]) { patchLocal(r.id, { [field]: raw }); return }
    await patchField(r.id, { [field]: raw }, { [field]: raw })
  }

  const toggle = async (r: AnnRow) => {
    try {
      await apiPatch(`/api/admin/announcements/${r.id}`, { enabled: !r.enabled })
      toast({ title: r.enabled ? L.disabledToast : L.enabledToast })
      load()
    } catch (e) {
      toast({ title: err(e), variant: 'destructive' })
    }
  }

  // Mirror AdminCategories: swap sortOrder with the neighbour, then reload.
  const move = async (index: number, dir: -1 | 1) => {
    if (!rows) return
    const j = index + dir
    if (j < 0 || j >= rows.length) return
    const a = rows[index]
    const b = rows[j]
    try {
      await Promise.all([
        apiPatch(`/api/admin/announcements/${a.id}`, { sortOrder: b.sortOrder }),
        apiPatch(`/api/admin/announcements/${b.id}`, { sortOrder: a.sortOrder }),
      ])
      load()
    } catch (e) {
      toast({ title: err(e), variant: 'destructive' })
    }
  }

  const create = async () => {
    if (!newEn.trim() || !newFa.trim()) { toast({ title: L.required, variant: 'destructive' }); return }
    const href = newHref.trim()
    if (href && !href.startsWith('/')) { toast({ title: L.hrefHint, variant: 'destructive' }); return }
    setBusy(true)
    try {
      await apiPost('/api/admin/announcements', {
        textEn: newEn.trim(),
        textFa: newFa.trim(),
        href: href || null,
      })
      toast({ title: L.created })
      setNewEn(''); setNewFa(''); setNewHref(''); setShowForm(false)
      load()
    } catch (e) {
      toast({ title: err(e), variant: 'destructive' })
    } finally { setBusy(false) }
  }

  // Confirmation FIRST — the admin audit explicitly flagged unconfirmed deletes.
  const remove = async (r: AnnRow) => {
    const snippet = r.textEn.length > 60 ? `${r.textEn.slice(0, 60)}…` : r.textEn
    if (!window.confirm(`${L.deleteConfirm} “${snippet}”`)) return
    try {
      await apiDelete(`/api/admin/announcements/${r.id}`)
      toast({ title: L.deleted })
      load()
    } catch (e) {
      toast({ title: err(e), variant: 'destructive' })
    }
  }

  if (!rows) return <Spinner label={L.loading} />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{L.title}</h2>
          <p className="text-xs text-ink-3">{L.hint}</p>
        </div>
        <Button
          size="sm"
          variant={showForm ? 'outline' : 'default'}
          className="h-9 gap-1.5"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />{L.new}
        </Button>
      </div>

      {showForm && (
        <form className="mb-4 rounded-lg border border-line bg-soft/40 p-4" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-new-en" className="text-xs text-ink-2">{L.textEn}</Label>
              <Input id="ann-new-en" value={newEn} onChange={(e) => setNewEn(e.target.value)} maxLength={300} dir="ltr" className="h-9" placeholder="Now shipping worldwide from Vienna" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-new-fa" className="text-xs text-ink-2">{L.textFa}</Label>
              <Input id="ann-new-fa" value={newFa} onChange={(e) => setNewFa(e.target.value)} maxLength={300} dir="rtl" lang="fa" className="h-9" placeholder="ارسال جهانی از وین آغاز شد" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="ann-new-href" className="text-xs text-ink-2">{L.href}</Label>
            <Input id="ann-new-href" value={newHref} onChange={(e) => setNewHref(e.target.value)} maxLength={300} dir="ltr" className="h-9 font-mono text-xs" placeholder="/books?sale=1" />
            <p className="text-[11px] text-ink-3" dir="ltr">{L.hrefHint}</p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={busy}>
              <Plus className="h-3.5 w-3.5" aria-hidden />{L.create}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setShowForm(false)}>{L.cancel}</Button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={L.emptyTitle}
          body={L.emptyBody}
          action={
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />{L.new}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', r.enabled ? 'bg-brand-soft text-brand' : 'bg-soft text-ink-3')}
                    aria-hidden
                  >
                    <Megaphone className="h-3.5 w-3.5" />
                  </span>
                  <Switch checked={r.enabled} onCheckedChange={() => void toggle(r)} aria-label={`${r.enabled ? L.enabled : L.disabled}: ${r.textEn}`} />
                  <span className={cn('text-xs font-medium', r.enabled ? 'text-ink-2' : 'text-ink-3')}>
                    {r.enabled ? L.enabled : L.disabled}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="bdi me-1 text-[10px] font-medium text-ink-3" dir="ltr">#{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => void move(i, -1)}
                    disabled={i === 0}
                    aria-label={L.moveUp}
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={L.moveDown}
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-error hover:bg-error/10 hover:text-error"
                    onClick={() => void remove(r)}
                    aria-label={`${L.delete}: ${r.textEn}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`ann-en-${r.id}`} className="text-xs text-ink-2">{L.textEn}</Label>
                  <Input
                    id={`ann-en-${r.id}`}
                    value={r.textEn}
                    onChange={(e) => patchLocal(r.id, { textEn: e.target.value })}
                    onBlur={() => void saveBlur(r, 'textEn')}
                    maxLength={300}
                    dir="ltr"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ann-fa-${r.id}`} className="text-xs text-ink-2">{L.textFa}</Label>
                  <Input
                    id={`ann-fa-${r.id}`}
                    value={r.textFa}
                    onChange={(e) => patchLocal(r.id, { textFa: e.target.value })}
                    onBlur={() => void saveBlur(r, 'textFa')}
                    maxLength={300}
                    dir="rtl"
                    lang="fa"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor={`ann-href-${r.id}`} className="text-xs text-ink-2">{L.href}</Label>
                <Input
                  id={`ann-href-${r.id}`}
                  value={r.href ?? ''}
                  onChange={(e) => patchLocal(r.id, { href: e.target.value })}
                  onBlur={() => void saveBlur(r, 'href')}
                  maxLength={300}
                  dir="ltr"
                  className="h-9 font-mono text-xs"
                  placeholder="/books?sale=1"
                />
                <p className="text-[11px] text-ink-3" dir="ltr">{L.hrefHint}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
