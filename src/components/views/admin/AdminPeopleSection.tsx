'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, ChevronUp, ChevronDown, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { UploadButton, uploadImageFile } from '@/components/views/admin/shared'
import type { Dict } from '@/components/views/admin/shared'

interface AdminPersonRow {
  id: string; slug: string; status: string; portraitUrl: string | null
  nationality: string | null; profession: string | null
  nameEn: string | null; nameFa: string | null
  shortBioEn: string | null; shortBioFa: string | null
  bookCount: number
}

const STATUS_TONES: Record<string, 'success' | 'warning' | 'brand'> = { PUBLISHED: 'success', DRAFT: 'warning', ARCHIVED: 'brand' }

export function AdminPeople() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminPersonRow[] | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Per-row portrait upload spinner (Task 51)
  const [portraitBusyId, setPortraitBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ people: AdminPersonRow[] }>('/api/admin/people').then((r) => setRows(r.people)).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (r: AdminPersonRow, orig: AdminPersonRow) => {
    const data: Record<string, unknown> = {}
    if (r.nameEn !== orig.nameEn) data.nameEn = r.nameEn
    if (r.nameFa !== orig.nameFa) data.nameFa = r.nameFa
    if (r.shortBioEn !== orig.shortBioEn) data.shortBioEn = r.shortBioEn
    if (r.shortBioFa !== orig.shortBioFa) data.shortBioFa = r.shortBioFa
    if (r.profession !== orig.profession) data.profession = r.profession
    if (r.status !== orig.status) data.status = r.status
    if (r.portraitUrl !== orig.portraitUrl) data.portraitUrl = r.portraitUrl
    try {
      await apiPatch(`/api/admin/people/${r.id}`, data)
      toast({ title: t.admin.personSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const create = async () => {
    if (newName.trim().length < 2) { toast({ title: t.admin.personNameRequired, variant: 'destructive' }); return }
    setBusy(true)
    try {
      await apiPost('/api/admin/people', { nameEn: newName.trim() })
      toast({ title: t.admin.personCreated })
      setNewName('')
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  /** Portrait upload — instant-save PATCH (Task 51): pick a file → /api/admin/upload
   *  → portraitUrl persisted immediately; the avatar spinner covers the round-trip. */
  const setPortrait = async (r: AdminPersonRow, file: File) => {
    setPortraitBusyId(r.id)
    try {
      const url = await uploadImageFile(file)
      await apiPatch(`/api/admin/people/${r.id}`, { portraitUrl: url })
      toast({ title: t.admin.personPortraitSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setPortraitBusyId(null) }
  }

  if (!rows) return <Spinner label={t.common.loading} />

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t.admin.peopleTitle}</h2>
        <p className="text-xs text-ink-3">{t.admin.peopleHint}</p>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.admin.personNewName} className="h-9 w-56" maxLength={80} />
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={busy}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.personAdd}
        </Button>
      </form>

      <ul className="space-y-2">
        {rows.map((r) => {
          const open = expanded === r.id
          return (
            <li key={r.id} className="rounded-lg border border-line bg-white">
              <div className="flex flex-wrap items-center gap-2.5 p-3">
                {/* Portrait — click the camera badge to upload (instant save) */}
                <label
                  className={cn('group relative shrink-0 cursor-pointer rounded-full', portraitBusyId === r.id && 'pointer-events-none')}
                  title={t.admin.personPortraitUpload}
                  aria-label={t.admin.personPortraitUpload}
                >
                  {r.portraitUrl ? (
                    <img src={r.portraitUrl} alt="" className="h-9 w-9 rounded-full border border-line object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{(r.nameEn ?? r.slug).slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-white text-ink-3 shadow-sm transition group-hover:text-brand" aria-hidden>
                    {portraitBusyId === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Camera className="h-2.5 w-2.5" />}
                  </span>
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void setPortrait(r, f); e.currentTarget.value = '' }}
                  />
                </label>
                <span className="font-semibold text-ink bdi">{r.nameEn ?? r.slug}</span>
                {r.nameFa ? <span className="text-sm text-ink-2 bdi" dir="rtl" lang="fa">{r.nameFa}</span> : null}
                <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{r.slug}</span>
                <Badge tone={STATUS_TONES[r.status] ?? 'brand'}>{r.status === 'PUBLISHED' ? t.admin.statusPublished : r.status === 'DRAFT' ? t.admin.statusDraft : t.admin.statusArchived}</Badge>
                <span className="text-xs text-ink-3">{r.bookCount} {t.admin.personBooks}</span>
                <Button
                  size="sm" variant="ghost" className="ms-auto h-8 gap-1 text-ink-2 hover:bg-soft"
                  aria-expanded={open} onClick={() => setExpanded(open ? null : r.id)}
                >
                  {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  {t.common.edit}
                </Button>
              </div>
              {open && <PersonEditor r={r} t={t} busy={portraitBusyId === r.id} onSave={save} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Expandable editor: local draft state per row; Save diffs against the row snapshot. */
function PersonEditor({ r, t, busy, onSave }: {
  r: AdminPersonRow; t: Dict; busy: boolean
  onSave: (r: AdminPersonRow, orig: AdminPersonRow) => void
}) {
  const [draft, setDraft] = useState<AdminPersonRow>(r)
  const dirty =
    draft.nameEn !== r.nameEn || draft.nameFa !== r.nameFa ||
    draft.shortBioEn !== r.shortBioEn || draft.shortBioFa !== r.shortBioFa ||
    draft.profession !== r.profession || draft.status !== r.status ||
    draft.portraitUrl !== r.portraitUrl
  const set = (data: Partial<AdminPersonRow>) => setDraft((d) => ({ ...d, ...data }))

  return (
    <div className="border-t border-line bg-soft/40 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Portrait (Task 51) — upload replaces the letter avatar on the public
            author page, search results and this list; instant-save lives on the
            row avatar camera, this one rides the Save button like every field. */}
        <div>
          <Label className="mb-1 text-xs">{t.admin.personPortrait}</Label>
          <div className="flex items-center gap-2.5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white">
              {draft.portraitUrl ? (
                <img src={draft.portraitUrl} alt="" className="h-14 w-14 object-cover" />
              ) : (
                <span className="text-lg font-bold text-brand">{(draft.nameEn ?? r.slug).slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <div className="flex flex-col items-start gap-1">
              <UploadButton onUploaded={(url) => set({ portraitUrl: url })} label={t.admin.upload} busyLabel={t.admin.uploading} />
              {draft.portraitUrl && (
                <button
                  type="button" onClick={() => set({ portraitUrl: null })}
                  className="text-xs text-ink-3 transition hover:text-error"
                >
                  {t.admin.personPortraitRemove}
                </button>
              )}
              {busy && <span className="inline-flex items-center gap-1 text-[11px] text-ink-3"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{t.admin.uploading}</span>}
            </div>
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personNameEn}</Label>
          <Input value={draft.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} dir="ltr" className={cn('h-9 text-sm', draft.nameEn !== r.nameEn && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div lang="fa" dir="rtl">
          <Label className="mb-1 text-xs">{t.admin.personNameFa}</Label>
          <Input value={draft.nameFa ?? ''} onChange={(e) => set({ nameFa: e.target.value })} className={cn('h-9 text-sm', draft.nameFa !== r.nameFa && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personProfession}</Label>
          <Input value={draft.profession ?? ''} onChange={(e) => set({ profession: e.target.value })} dir="ltr" className={cn('h-9 text-sm', draft.profession !== r.profession && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personStatus}</Label>
          <select
            value={draft.status} onChange={(e) => set({ status: e.target.value })}
            className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
            aria-label={t.admin.personStatus}
          >
            <option value="PUBLISHED">{t.admin.statusPublished}</option>
            <option value="DRAFT">{t.admin.statusDraft}</option>
            <option value="ARCHIVED">{t.admin.statusArchived}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-1 text-xs">{t.admin.personBioEn}</Label>
          <textarea
            value={draft.shortBioEn ?? ''} onChange={(e) => set({ shortBioEn: e.target.value })} dir="ltr" rows={2}
            className={cn('w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm', draft.shortBioEn !== r.shortBioEn && 'border-brand/50 bg-brand-soft/30')}
            maxLength={600}
          />
        </div>
        <div className="sm:col-span-2" lang="fa" dir="rtl">
          <Label className="mb-1 text-xs">{t.admin.personBioFa}</Label>
          <textarea
            value={draft.shortBioFa ?? ''} onChange={(e) => set({ shortBioFa: e.target.value })} rows={2}
            className={cn('w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm', draft.shortBioFa !== r.shortBioFa && 'border-brand/50 bg-brand-soft/30')}
            maxLength={600}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" className="h-9" disabled={!dirty} onClick={() => onSave(draft, r)}>{t.common.save}</Button>
      </div>
    </div>
  )
}
