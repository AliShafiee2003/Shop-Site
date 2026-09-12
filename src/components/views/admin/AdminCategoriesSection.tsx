'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, ChevronUp, ChevronDown, Trash2, X, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { AdminCategoryRow, Dict } from '@/components/views/admin/shared'

/* ───────────────────────── Admin: categories & contributors ───────────────────────── */

/** Same icon set the storefront homepage circles use (HomeSections ICONS). */
const HOME_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  BookOpen: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>,
  Feather: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" /><path d="M16 8 2 22" /><path d="M17.5 15H9" /></svg>,
  NotebookPen: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6a2 2 0 0 0-.6-1.4l-4.6-4.6a2 2 0 0 0-1.4-.6z" /><path d="M9 13a1 1 0 0 0-1 1v2h1l4.6-4.6-1-1z" /></svg>,
  Shapes: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" /><rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" /></svg>,
  Camera: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>,
  UserRound: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>,
}

const CATEGORY_ICON_NAMES = ['BookOpen', 'Feather', 'NotebookPen', 'Shapes', 'Camera', 'UserRound'] as const
const CATEGORY_COLORS = ['#014B74', '#E87524', '#0F766E', '#A16207', '#9F1239', '#44403C']

export function AdminCategories() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminCategoryRow[] | null>(null)
  // Server baseline per row id — the source of truth for dirty checks / Save diffs.
  const [baseline, setBaseline] = useState<Map<string, AdminCategoryRow>>(new Map())
  const [newName, setNewName] = useState('')
  const [newFa, setNewFa] = useState('')
  const [newIcon, setNewIcon] = useState<string>('BookOpen')
  const [newIconUrl, setNewIconUrl] = useState<string | null>(null)
  const [newColor, setNewColor] = useState<string>('#014B74')
  const [busy, setBusy] = useState(false)
  // Custom PNG icon upload — per-row spinner key ('__new__' = create form)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ categories: AdminCategoryRow[] }>('/api/admin/categories').then((r) => {
      setRows(r.categories)
      setBaseline(new Map(r.categories.map((c) => [c.id, c])))
    }).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (id: string, data: Partial<AdminCategoryRow>) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...data } : r)) ?? prev)
  }
  const rowDirty = (r: AdminCategoryRow) => {
    const orig = baseline.get(r.id)
    if (!orig) return false
    return r.nameEn !== orig.nameEn || r.nameFa !== orig.nameFa || r.isActive !== orig.isActive || r.icon !== orig.icon || r.iconUrl !== orig.iconUrl || r.color !== orig.color
      || r.descriptionEn !== orig.descriptionEn || r.descriptionFa !== orig.descriptionFa
  }

  const save = async (r: AdminCategoryRow) => {
    const orig = baseline.get(r.id)
    if (!orig) return
    const data: Record<string, unknown> = { isActive: r.isActive }
    if (r.nameEn !== orig.nameEn) data.nameEn = r.nameEn
    if (r.nameFa !== orig.nameFa) data.nameFa = r.nameFa
    if (r.icon !== orig.icon) data.icon = r.icon
    if (r.iconUrl !== orig.iconUrl) data.iconUrl = r.iconUrl
    if (r.color !== orig.color) data.color = r.color
    if (r.descriptionEn !== orig.descriptionEn) data.descriptionEn = r.descriptionEn
    if (r.descriptionFa !== orig.descriptionFa) data.descriptionFa = r.descriptionFa
    try {
      await apiPatch(`/api/admin/categories/${r.id}`, data)
      toast({ title: t.admin.catSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!rows) return
    const j = index + dir
    if (j < 0 || j >= rows.length) return
    const a = rows[index]
    const b = rows[j]
    try {
      await Promise.all([
        apiPatch(`/api/admin/categories/${a.id}`, { sortOrder: b.sortOrder }),
        apiPatch(`/api/admin/categories/${b.id}`, { sortOrder: a.sortOrder }),
      ])
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  /** Upload a custom PNG icon via the shared admin media endpoint, then wire
   *  the returned URL into the row (or the create form when r === null). */
  const uploadIcon = async (r: AdminCategoryRow | null, file: File) => {
    const key = r?.id ?? '__new__'
    setUploadingId(key)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`)
      }
      const { url } = (await res.json()) as { url: string }
      if (r) {
        patch(r.id, { iconUrl: url })
        toast({ title: t.admin.catIconUploaded })
      } else {
        setNewIconUrl(url)
        toast({ title: t.admin.catIconUploaded })
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally {
      setUploadingId(null)
    }
  }

  const create = async () => {
    if (newName.trim().length < 2) { toast({ title: t.admin.catNameRequired, variant: 'destructive' }); return }
    setBusy(true)
    try {
      await apiPost('/api/admin/categories', {
        nameEn: newName.trim(),
        ...(newFa.trim() ? { nameFa: newFa.trim() } : {}),
        icon: newIcon,
        ...(newIconUrl ? { iconUrl: newIconUrl } : {}),
        color: newColor,
      })
      toast({ title: t.admin.catCreated })
      setNewName(''); setNewFa(''); setNewIconUrl(null)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const remove = async (r: AdminCategoryRow) => {
    if (!window.confirm(`${t.admin.catDeleteConfirm} (${r.slug})`)) return
    await apiDelete(`/api/admin/categories/${r.id}`)
    toast({ title: t.admin.catDeleted })
    load()
  }

  if (!rows) return <Spinner label={t.common.loading} />

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t.admin.catsTitle}</h2>
        <p className="text-xs text-ink-3">{t.admin.catsHint}</p>
      </div>

      <form className="mb-4 rounded-lg border border-line bg-soft/40 p-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.admin.catNewName} className="h-9 w-52" maxLength={60} dir="ltr" />
          <Input value={newFa} onChange={(e) => setNewFa(e.target.value)} placeholder={t.admin.catNameFa} className="h-9 w-44" maxLength={60} dir="rtl" lang="fa" />
          <div role="radiogroup" aria-label={t.admin.catIcon} className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
            {CATEGORY_ICON_NAMES.map((name) => {
              const Icon = HOME_ICONS[name]
              return (
                <button
                  key={name} type="button" role="radio" aria-checked={newIcon === name} aria-label={name}
                  onClick={() => setNewIcon(name)}
                  className={cn('flex h-7 w-7 items-center justify-center rounded transition', newIcon === name ? 'bg-brand text-white' : 'text-ink-3 hover:bg-soft hover:text-ink')}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              )
            })}
            {/* Custom PNG icon upload (user: white glyph on the colored disc) */}
            <label
              className={cn('flex h-7 cursor-pointer items-center gap-1 rounded px-1.5 text-[11px] font-medium text-ink-3 transition hover:bg-soft hover:text-ink', uploadingId === '__new__' && 'pointer-events-none opacity-60')}
              title={t.admin.catUploadIcon}
              aria-label={uploadingId === '__new__' ? t.admin.catUploading : t.admin.catUploadIcon}
            >
              {uploadingId === '__new__' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
              {uploadingId === '__new__' ? '' : t.admin.catUploadIcon}
              <input
                type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadIcon(null, f); e.currentTarget.value = '' }}
              />
            </label>
          </div>
          <div role="radiogroup" aria-label={t.admin.catColor} className="flex items-center gap-1.5 rounded-md border border-line bg-white p-1.5">
            {CATEGORY_COLORS.map((hex) => (
              <button
                key={hex} type="button" role="radio" aria-checked={newColor === hex} aria-label={hex}
                onClick={() => setNewColor(hex)}
                className={cn('h-6 w-6 rounded-full border-2 transition', newColor === hex ? 'border-ink scale-110' : 'border-transparent hover:scale-105')}
                style={{ backgroundColor: hex }}
              />
            ))}
            {/* Free colour choice — native picker + live hex (user: آزادانه رنگ را انتخاب کنم) */}
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
            <input
              type="color" value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label={t.admin.catCustomColor} title={t.admin.catCustomColor}
              className="h-6 w-8 cursor-pointer rounded border border-line bg-white p-0.5"
            />
            <span className="font-mono text-[10px] uppercase text-ink-3 bdi" dir="ltr">{newColor}</span>
          </div>
          {/* live preview chip — mirrors the storefront disc (custom square PNG covers the whole disc as a circle) */}
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: newIconUrl ? newColor : `${newColor}1A` }}>
              {newIconUrl ? (
                <img src={newIconUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (() => { const Icon = HOME_ICONS[newIcon] ?? HOME_ICONS.BookOpen; return <Icon className="h-4 w-4" style={{ color: newColor }} aria-hidden /> })()}
            </span>
          </span>
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={busy}>
            <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.catAdd}
          </Button>
        </div>
      </form>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <CategoryEditorRow
            key={r.id} r={r} isDirty={rowDirty(r)} index={i} count={rows.length} t={t}
            patch={patch} save={save} move={move} remove={remove}
            uploading={uploadingId === r.id}
            onUpload={(f) => void uploadIcon(r, f)}
          />
        ))}
      </ul>
    </div>
  )
}


function CategoryEditorRow({ r, isDirty, index, count, t, patch, save, move, remove, uploading, onUpload }: {
  r: AdminCategoryRow; isDirty: boolean; index: number; count: number; t: Dict
  patch: (id: string, data: Partial<AdminCategoryRow>) => void
  save: (r: AdminCategoryRow) => void
  move: (index: number, dir: -1 | 1) => void
  remove: (r: AdminCategoryRow) => void
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(r.color ?? '') ? (r.color as string) : '#014B74'
  return (
    <li className={cn('rounded-lg border bg-white p-3 transition', isDirty ? 'border-brand/40 bg-brand-soft/20' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="flex h-5 w-6 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === count - 1} aria-label="Move down" className="flex h-5 w-6 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
        <Switch checked={r.isActive} onCheckedChange={(v) => patch(r.id, { isActive: v })} aria-label={`${r.nameEn ?? r.slug} ${r.isActive ? t.admin.catVisible : t.admin.catHidden}`} />
        {/* Disc preview — custom square PNG fills the disc as a circular badge,
            exactly like the storefront TiltCircle renders it (Task 51) */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-inset ring-black/5"
          style={{ backgroundColor: safeColor }}
          aria-hidden
        >
          {r.iconUrl ? (
            <img src={r.iconUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (() => { const Icon = HOME_ICONS[r.icon ?? ''] ?? HOME_ICONS.BookOpen; return <Icon className="h-4 w-4 text-white" /> })()}
        </span>
        {/* Shelf look — icon + disc color, mirrored live on the storefront circles */}
        <div role="radiogroup" aria-label={`${t.admin.catIcon} (${r.slug})`} className="flex items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
          {CATEGORY_ICON_NAMES.map((name) => {
            const Icon = HOME_ICONS[name]
            const active = !r.iconUrl && (r.icon ?? 'BookOpen') === name
            return (
              <button
                key={name} type="button" role="radio" aria-checked={active} aria-label={name}
                onClick={() => patch(r.id, { icon: name })}
                className={cn('flex h-6 w-6 items-center justify-center rounded transition', active ? 'bg-brand text-white' : 'text-ink-3 hover:bg-soft hover:text-ink')}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            )
          })}
          {/* Custom PNG icon — upload replaces the preset mark on the storefront disc */}
          <label
            className={cn('flex h-6 w-6 cursor-pointer items-center justify-center rounded transition',
              r.iconUrl ? 'bg-success/10 text-success' : 'text-ink-3 hover:bg-soft hover:text-ink',
              uploading && 'pointer-events-none opacity-60')}
            title={uploading ? t.admin.catUploading : t.admin.catUploadIcon}
            aria-label={uploading ? t.admin.catUploading : t.admin.catUploadIcon}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
            <input
              type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onUpload(f); e.currentTarget.value = '' }}
            />
          </label>
          {r.iconUrl && (
            <button
              type="button" onClick={() => patch(r.id, { iconUrl: null })}
              aria-label={t.admin.catRemoveIcon} title={t.admin.catRemoveIcon}
              className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition hover:bg-error/10 hover:text-error"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label={`${t.admin.catColor} (${r.slug})`} className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
          {CATEGORY_COLORS.map((hex) => (
            <button
              key={hex} type="button" role="radio" aria-checked={(r.color ?? '#014B74') === hex} aria-label={hex}
              onClick={() => patch(r.id, { color: hex })}
              className={cn('h-5 w-5 rounded-full border-2 transition', (r.color ?? '#014B74') === hex ? 'border-ink scale-110' : 'border-transparent hover:scale-105')}
              style={{ backgroundColor: hex }}
            />
          ))}
          {/* Free colour choice — native picker + hex field (user: آزادانه رنگ را انتخاب کنم) */}
          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <input
            type="color" value={safeColor}
            onChange={(e) => patch(r.id, { color: e.target.value })}
            aria-label={`${t.admin.catCustomColor} (${r.slug})`} title={t.admin.catCustomColor}
            className="h-5 w-7 cursor-pointer rounded border border-line bg-white p-0"
          />
          <Input
            value={r.color ?? ''}
            onChange={(e) => patch(r.id, { color: e.target.value })}
            aria-label={`${t.admin.catCustomColor} hex (${r.slug})`}
            className="h-6 w-[4.5rem] rounded font-mono text-[11px] uppercase"
            dir="ltr" maxLength={7} placeholder="#014B74" spellCheck={false}
          />
        </div>
        <Input
          value={r.nameEn ?? ''} onChange={(e) => patch(r.id, { nameEn: e.target.value })} dir="ltr"
          aria-label={t.admin.catNameEn} className="h-9 w-44 text-sm" maxLength={60}
        />
        <Input
          value={r.nameFa ?? ''} onChange={(e) => patch(r.id, { nameFa: e.target.value })} dir="rtl" lang="fa"
          aria-label={t.admin.catNameFa} className="h-9 w-36 text-sm" maxLength={60}
        />
        <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{r.slug}</span>
        <span className="text-xs text-ink-3">{r.productCount} {t.admin.catBooks}</span>
        <span className={cn('text-[11px] font-medium', r.isActive ? 'text-success' : 'text-ink-3')}>{r.isActive ? t.admin.catVisible : t.admin.catHidden}</span>
        <span className="ms-auto flex items-center gap-1.5">
          {isDirty && (
            <Button size="sm" className="h-8" onClick={() => save(r)}>{t.common.save}</Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.admin.catDelete} ${r.slug}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
      </div>
      {/* Category descriptions (EN/FA) — the API always accepted them, the UI finally uses them (audit) */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={r.descriptionEn ?? ''} onChange={(e) => patch(r.id, { descriptionEn: e.target.value })} dir="ltr"
          placeholder={t.admin.catDescEn} aria-label={`${t.admin.catDescEn} (${r.slug})`} className="h-8 text-xs" maxLength={300}
        />
        <Input
          value={r.descriptionFa ?? ''} onChange={(e) => patch(r.id, { descriptionFa: e.target.value })} dir="rtl" lang="fa"
          placeholder={t.admin.catDescFa} aria-label={`${t.admin.catDescFa} (${r.slug})`} className="h-8 text-xs" maxLength={300}
        />
      </div>
    </li>
  )
}
