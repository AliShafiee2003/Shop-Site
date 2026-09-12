'use client'

/**
 * Admin journal (مجله) — the article authoring surface (Task 51:
 * «هیچ صفحه‌ای برای نگارش مقاله پیاده سازی نشده»).
 *
 * List: every status with bilingual titles, topic chips, publish state and a
 *       quick «view on the site» link. Rows expand into the full editor.
 * Editor (create + edit):
 *  - meta row: status, publish date (datetime-local), slug (auto), featured,
 *    byline, hero image upload;
 *  - topics: toggle chips of the ArticleCategory directory;
 *  - EN + FA columns: title, excerpt, body as MARKDOWN with a live
 *    <ProseBlocks/> preview — the same grammar/contract as the product
 *    long-description (space-tolerant headings «##تیتر», tables, quotes…);
 *  - related books / people: search + chips, rendered by the public article page;
 *  - reading time is computed server-side from the body (~190 wpm).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, X, Upload, Eye, EyeOff, Trash2, Star, ExternalLink, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge, Spinner, ProseBlocks } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { navigate } from '@/lib/router'
import { textToBlocks, blocksToText } from '@/lib/markdown'
import { formatDate } from '@/lib/format'
import type { Locale } from '@/lib/types'

interface AdminArticleRow {
  id: string
  slug: string
  status: string
  heroUrl: string | null
  byline: string | null
  isFeatured: boolean
  publishedAt: string | null
  updatedAt: string
  titleEn: string | null
  titleFa: string | null
  excerptEn: string | null
  excerptFa: string | null
  bodyEn: string | null
  bodyFa: string | null
  readingMinutesEn: number | null
  readingMinutesFa: number | null
  categoryIds: string[]
  productIds: string[]
  personIds: string[]
}

interface ArticleCatMeta { id: string; slug: string; nameEn: string | null; nameFa: string | null }
interface ProdHit { id: string; title: string; titleFa: string | null; coverUrl: string | null }
interface PersonHit { id: string; nameEn: string | null; nameFa: string | null; portraitUrl: string | null }

type Dict = ReturnType<typeof getDict>

const STATUS_TONES: Record<string, 'success' | 'warning' | 'brand' | 'default'> = {
  PUBLISHED: 'success', DRAFT: 'warning', SCHEDULED: 'brand', ARCHIVED: 'default',
}

async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
  const j = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
  if (!res.ok || !j.url) throw new Error(j.message ?? `Upload failed (HTTP ${res.status})`)
  return j.url
}

/** ISO → <input type="datetime-local"> value in the browser's local time. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v: string): string | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function AdminArticles() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminArticleRow[] | null>(null)
  const [cats, setCats] = useState<ArticleCatMeta[]>([])
  // 'new' = create form; article id = editing that row
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ articles: AdminArticleRow[]; categories: ArticleCatMeta[] }>('/api/admin/articles')
      .then((r) => { setRows(r.articles ?? []); setCats(r.categories ?? []) })
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (r: AdminArticleRow) => {
    if (!window.confirm(`${t.admin.artDeleteConfirm} (${r.titleEn || r.slug})`)) return
    try {
      await apiDelete(`/api/admin/articles/${r.id}`)
      toast({ title: t.admin.artDeleted })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  if (!rows) return <Spinner label={t.common.loading} />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.admin.artTitle}</h2>
          <p className="text-xs text-ink-3">{t.admin.artHint}</p>
        </div>
        <Button
          size="sm" className="h-9 gap-1.5"
          onClick={() => { setExpanded(expanded === 'new' ? null : 'new') }}
          aria-expanded={expanded === 'new'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.artNew}
        </Button>
      </div>

      {expanded === 'new' && (
        <div className="mb-4">
          <ArticleEditor row={null} cats={cats} t={t} locale={locale} onDone={() => { setExpanded(null); load() }} onCancel={() => setExpanded(null)} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-soft/40 p-8 text-center text-sm text-ink-3">{t.admin.artEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const open = expanded === r.id
            return (
              <li key={r.id} className="rounded-lg border border-line bg-white">
                <div className="flex flex-wrap items-center gap-2.5 p-3">
                  {/* Hero thumb / placeholder */}
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-soft text-sm text-ink-3" aria-hidden>
                    {r.heroUrl ? <img src={r.heroUrl} alt="" className="h-full w-full object-cover" /> : '✎'}
                  </span>
                  <span className="min-w-0 max-w-[26rem] truncate font-semibold text-ink bdi">{r.titleEn || r.titleFa || r.slug}</span>
                  {r.titleFa && <span className="hidden min-w-0 max-w-[20rem] truncate text-sm text-ink-2 bdi sm:block" dir="rtl" lang="fa">{r.titleFa}</span>}
                  <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{r.slug}</span>
                  <Badge tone={STATUS_TONES[r.status] ?? 'brand'}>{statusLabel(r.status, t)}</Badge>
                  {r.isFeatured && <Star className="h-3.5 w-3.5 text-orange-accent" aria-label={t.admin.artFeatured} />}
                  <span className="text-xs text-ink-3">{r.publishedAt ? formatDate(r.publishedAt, locale) : '—'}</span>
                  <span className="ms-auto flex items-center gap-1">
                    <Button
                      size="sm" variant="ghost" className="h-8 gap-1 text-ink-2 hover:bg-soft"
                      onClick={() => navigate(`/articles/${r.slug}`)}
                      title={t.admin.artView}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />{t.admin.artView}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 gap-1 text-ink-2 hover:bg-soft"
                      aria-expanded={open} onClick={() => setExpanded(open ? null : r.id)}
                    >
                      {t.common.edit}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 gap-1 text-ink-3 hover:bg-error/10 hover:text-error"
                      onClick={() => void remove(r)} aria-label={`${t.common.delete} ${r.titleEn || r.slug}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </span>
                </div>
                {open && (
                  <div className="border-t border-line bg-soft/30 p-3">
                    <ArticleEditor row={r} cats={cats} t={t} locale={locale} onDone={() => { setExpanded(null); load() }} onCancel={() => setExpanded(null)} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function statusLabel(status: string, t: Dict): string {
  switch (status) {
    case 'PUBLISHED': return t.admin.statusPublished
    case 'DRAFT': return t.admin.statusDraft
    case 'SCHEDULED': return t.admin.statusScheduled
    default: return t.admin.statusArchived
  }
}

/* ───────────────────────────── Editor ───────────────────────────── */

interface Draft {
  slug: string
  status: string
  heroUrl: string | null
  byline: string
  isFeatured: boolean
  publishedLocal: string
  titleEn: string; excerptEn: string; bodyEn: string
  titleFa: string; excerptFa: string; bodyFa: string
  categoryIds: string[]
  productIds: { id: string; en: string; fa: string }[]
  personIds: { id: string; en: string; fa: string }[]
}

function ArticleEditor({ row, cats, t, locale, onDone, onCancel }: {
  row: AdminArticleRow | null
  cats: ArticleCatMeta[]
  t: Dict
  locale: Locale
  onDone: () => void
  onCancel: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [heroBusy, setHeroBusy] = useState(false)
  const [preview, setPreview] = useState<{ en: boolean; fa: boolean }>({ en: false, fa: false })
  const isFa = locale === 'fa'

  const [draft, setDraft] = useState<Draft>(() => ({
    slug: row?.slug ?? '',
    status: row?.status ?? 'DRAFT',
    heroUrl: row?.heroUrl ?? null,
    byline: row?.byline ?? '',
    isFeatured: row?.isFeatured ?? false,
    publishedLocal: toLocalInput(row?.publishedAt ?? null),
    titleEn: row?.titleEn ?? '',
    excerptEn: row?.excerptEn ?? '',
    bodyEn: blocksToText(row?.bodyEn ?? null),
    titleFa: row?.titleFa ?? '',
    excerptFa: row?.excerptFa ?? '',
    bodyFa: blocksToText(row?.bodyFa ?? null),
    categoryIds: row?.categoryIds ?? [],
    productIds: [],
    personIds: [],
  }))
  // Original related ids (chips resolve from saved ids on open)
  const [related, setRelated] = useState<{ products: ProdHit[]; people: PersonHit[] }>({ products: [], people: [] })
  const set = (d: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...d }))

  // Resolve the saved related ids into labeled chips (one batch each).
  useEffect(() => {
    if (!row || (row.productIds.length === 0 && row.personIds.length === 0)) return
    let alive = true
    ;(async () => {
      try {
        const prods = row.productIds.length > 0
          ? await apiGet<{ items: ProdHit[] }>(`/api/admin/products?locale=en&pageSize=200`)
          : { items: [] as ProdHit[] }
        const people = row.personIds.length > 0 ? await apiGet<{ people: PersonHit[] }>('/api/admin/people') : { people: [] as PersonHit[] }
        if (!alive) return
        setRelated({
          products: (prods.items ?? []).filter((p) => row.productIds.includes(p.id)),
          people: (people.people ?? []).filter((p) => row.personIds.includes(p.id)),
        })
        setDraft((prev) => ({
          ...prev,
          productIds: (prods.items ?? []).filter((p) => row.productIds.includes(p.id)).map((p) => ({ id: p.id, en: p.title, fa: p.titleFa ?? p.title })),
          personIds: (people.people ?? []).filter((p) => row.personIds.includes(p.id)).map((p) => ({ id: p.id, en: p.nameEn ?? p.id, fa: p.nameFa ?? p.nameEn ?? p.id })),
        }))
      } catch { /* chips stay empty; saving replaces ids from the draft */ }
    })()
    return () => { alive = false }
  }, [row])

  // ── Related products search (debounced, like the discount scope editor) ──
  const [pq, setPq] = useState('')
  const [pHits, setPHits] = useState<ProdHit[]>([])
  const [pSearching, setPSearching] = useState(false)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setPSearching(true)
      try {
        const r = await apiGet<{ items: ProdHit[] }>(`/api/admin/products?locale=en&pageSize=6${pq.trim() ? `&q=${encodeURIComponent(pq.trim())}` : ''}`)
        setPHits(r.items ?? [])
      } catch { setPHits([]) } finally { setPSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [pq])

  // ── People directory (client-side filter) ──
  const [people, setPeople] = useState<PersonHit[]>([])
  const [personQ, setPersonQ] = useState('')
  useEffect(() => {
    apiGet<{ people: PersonHit[] }>('/api/admin/people')
      .then((r) => setPeople(r.people ?? []))
      .catch(() => setPeople([]))
  }, [])
  const personHits = useMemo(() => {
    const q = personQ.trim().toLowerCase()
    const base = people.filter((p) => !draft.personIds.some((x) => x.id === p.id))
    if (!q) return base.slice(0, 6)
    return base.filter((p) => (p.nameEn ?? '').toLowerCase().includes(q) || (p.nameFa ?? '').includes(personQ.trim())).slice(0, 6)
  }, [people, personQ, draft.personIds])

  const toggleCategory = (id: string) =>
    set({ categoryIds: draft.categoryIds.includes(id) ? draft.categoryIds.filter((c) => c !== id) : [...draft.categoryIds, id] })

  const uploadHero = async (file: File) => {
    setHeroBusy(true)
    try { set({ heroUrl: await uploadImageFile(file) }) }
    catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
    finally { setHeroBusy(false) }
  }

  const save = async () => {
    if (draft.titleEn.trim().length < 2) {
      toast({ title: t.admin.artTitleRequired, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      // Body: the textarea holds the markdown mirror — server converts to
      // blocks JSON (textToBlocks). An untouched mirror round-trips losslessly.
      const payload = {
        slug: draft.slug.trim() || undefined,
        status: draft.status,
        heroUrl: draft.heroUrl,
        byline: draft.byline.trim() || null,
        isFeatured: draft.isFeatured,
        publishedAt: fromLocalInput(draft.publishedLocal),
        en: { title: draft.titleEn.trim(), excerpt: draft.excerptEn.trim() || null, bodyMd: draft.bodyEn },
        ...(draft.titleFa.trim()
          ? { fa: { title: draft.titleFa.trim(), excerpt: draft.excerptFa.trim() || null, bodyMd: draft.bodyFa } }
          : { fa: { title: '', bodyMd: null } }),
        categoryIds: draft.categoryIds,
        productIds: draft.productIds.map((p) => p.id),
        personIds: draft.personIds.map((p) => p.id),
      }
      if (row) await apiPatch(`/api/admin/articles/${row.id}`, payload)
      else await apiPost('/api/admin/articles', payload)
      toast({ title: row ? t.admin.artSaved : t.admin.artCreated })
      onDone()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const chip = (l: { id: string; en: string; fa: string }, onRemove: () => void) => (
    <span key={l.id} className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 py-0.5 pe-1 ps-2 text-xs text-brand">
      <span className="truncate bdi">{isFa ? l.fa || l.en : l.en || l.fa}</span>
      <button type="button" onClick={onRemove} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-brand/70 transition hover:bg-brand/15 hover:text-brand" aria-label={`${t.common.delete} ${l.en}`}>
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )

  const previewBtn = (loc: 'en' | 'fa') => (
    <button
      type="button"
      onClick={() => setPreview((p) => ({ ...p, [loc]: !p[loc] }))}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition',
        preview[loc] ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand',
      )}
      aria-pressed={preview[loc]}
    >
      {preview[loc] ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
      {preview[loc] ? t.admin.hidePreview : t.admin.preview}
    </button>
  )

  const bodyCol = (loc: 'en' | 'fa') => {
    const value = loc === 'en' ? draft.bodyEn : draft.bodyFa
    const onChange = (v: string) => set(loc === 'en' ? { bodyEn: v } : { bodyFa: v })
    const label = loc === 'en' ? t.admin.artBodyEn : t.admin.artBodyFa
    const isFaCol = loc === 'fa'
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[13px] font-medium text-ink">{label}</Label>
          {previewBtn(loc)}
        </div>
        <Textarea
          rows={10}
          dir={isFaCol ? undefined : 'ltr'}
          className={cn(
            'max-h-[60vh] overflow-y-auto text-[13px] scrollbar-slim',
            isFaCol ? 'font-prose-fa text-[13.5px] leading-[1.9]' : 'font-mono leading-relaxed',
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        {preview[loc] && (
          <div
            lang={isFaCol ? 'fa' : 'en'}
            dir={isFaCol ? 'rtl' : 'ltr'}
            className="max-h-[46vh] overflow-y-auto rounded-lg border border-brand/25 bg-white p-4 scrollbar-slim"
            aria-live="polite"
          >
            {value.trim() ? <ProseBlocks blocks={textToBlocks(value)} locale={loc} measure={false} /> : <p className="text-sm text-ink-3">—</p>}
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-3">{t.admin.longHint}</p>
      </div>
    )
  }

  const inputCls = 'h-9 text-sm'
  const dirtyCls = (changed: boolean) => cn(changed && 'border-brand/50 bg-brand-soft/30')

  return (
    <div className="space-y-4 rounded-lg border border-line bg-white p-4">
      {/* ── Meta row ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="mb-1 text-xs">{t.admin.artStatusLabel}</Label>
          <select
            value={draft.status} onChange={(e) => set({ status: e.target.value })}
            className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
            aria-label={t.admin.artStatusLabel}
          >
            <option value="DRAFT">{t.admin.statusDraft}</option>
            <option value="SCHEDULED">{t.admin.statusScheduled}</option>
            <option value="PUBLISHED">{t.admin.statusPublished}</option>
            <option value="ARCHIVED">{t.admin.statusArchived}</option>
          </select>
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.artPublishAt}</Label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="datetime-local" value={draft.publishedLocal}
              onChange={(e) => set({ publishedLocal: e.target.value })}
              className={cn(inputCls, 'ps-8')} dir="ltr"
              aria-label={t.admin.artPublishAt}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.artSlug}</Label>
          <Input
            value={draft.slug} onChange={(e) => set({ slug: e.target.value })}
            placeholder={t.admin.artSlugAuto} className={cn(inputCls, 'font-mono text-xs')} dir="ltr" maxLength={120}
            spellCheck={false}
          />
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.artByline}</Label>
          <Input value={draft.byline} onChange={(e) => set({ byline: e.target.value })} className={inputCls} maxLength={200} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Featured */}
        <div className="flex items-center gap-2">
          <Switch checked={draft.isFeatured} onCheckedChange={(v) => set({ isFeatured: v })} aria-label={t.admin.artFeatured} />
          <Label className="text-xs">{t.admin.artFeatured}</Label>
        </div>
        {/* Hero image */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-12 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-soft text-xs text-ink-3" aria-hidden>
            {draft.heroUrl ? <img src={draft.heroUrl} alt="" className="h-full w-full object-cover" /> : '✎'}
          </span>
          <div className="flex flex-col items-start gap-1">
            <label className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink-2 transition hover:bg-soft', heroBusy && 'pointer-events-none opacity-60')}>
              {heroBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
              {heroBusy ? t.admin.uploading : t.admin.artHeroUpload}
              <input
                type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void uploadHero(f) }}
              />
            </label>
            {draft.heroUrl && (
              <button type="button" onClick={() => set({ heroUrl: null })} className="text-xs text-ink-3 transition hover:text-error">
                {t.admin.artHeroRemove}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Topics ── */}
      {cats.length > 0 && (
        <div>
          <Label className="mb-1.5 text-xs">{t.admin.artTopics}</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.admin.artTopics}>
            {cats.map((c) => {
              const active = draft.categoryIds.includes(c.id)
              return (
                <button
                  key={c.id} type="button" role="checkbox" aria-checked={active}
                  onClick={() => toggleCategory(c.id)}
                  className={cn(
                    'h-7 rounded-full border px-3 text-xs font-medium transition',
                    active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2 hover:border-brand/40 hover:text-brand',
                  )}
                >
                  {isFa ? c.nameFa || c.nameEn : c.nameEn || c.nameFa}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bilingual content ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-4" dir="ltr" lang="en">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">English</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-ink">{t.admin.artTitleLabel} *</Label>
              <Input value={draft.titleEn} onChange={(e) => set({ titleEn: e.target.value })} className={inputCls} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-ink">{t.admin.artExcerpt}</Label>
              <Textarea rows={2} value={draft.excerptEn} onChange={(e) => set({ excerptEn: e.target.value })} maxLength={2000} />
            </div>
            {bodyCol('en')}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4" dir="rtl" lang="fa">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-3">فارسی</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-ink">{t.admin.artTitleLabel}</Label>
              <Input value={draft.titleFa} onChange={(e) => set({ titleFa: e.target.value })} className={cn(inputCls, dirtyCls(false))} maxLength={300} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-ink">{t.admin.artExcerpt}</Label>
              <Textarea rows={2} value={draft.excerptFa} onChange={(e) => set({ excerptFa: e.target.value })} maxLength={2000} />
            </div>
            {bodyCol('fa')}
          </div>
        </section>
      </div>

      {/* ── Related books + people ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white/70 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">{t.admin.artRelatedBooks} <span className="text-brand">{draft.productIds.length > 0 && `(${draft.productIds.length})`}</span></p>
          {draft.productIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {draft.productIds.map((p) => chip(p, () => set({ productIds: draft.productIds.filter((x) => x.id !== p.id) })))}
            </div>
          )}
          <Input value={pq} onChange={(e) => setPq(e.target.value)} dir="ltr" placeholder={t.admin.artSearchBooks} className="h-8 text-xs" />
          {pSearching && <p className="mt-1 text-[11px] text-ink-3">…</p>}
          {!pSearching && pHits.length > 0 && (
            <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto scrollbar-slim">
              {pHits.filter((p) => !draft.productIds.some((x) => x.id === p.id)).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => set({ productIds: [...draft.productIds, { id: p.id, en: p.title, fa: p.titleFa ?? p.title }] })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand"
                  >
                    {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-7 w-5 rounded-sm border border-line object-cover" /> : <span className="h-7 w-5 rounded-sm bg-soft" aria-hidden />}
                    <span className="truncate">{p.title}</span>
                    <Plus className="ms-auto h-3 w-3 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-line bg-white/70 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">{t.admin.artRelatedPeople} <span className="text-brand">{draft.personIds.length > 0 && `(${draft.personIds.length})`}</span></p>
          {draft.personIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {draft.personIds.map((p) => chip(p, () => set({ personIds: draft.personIds.filter((x) => x.id !== p.id) })))}
            </div>
          )}
          <Input value={personQ} onChange={(e) => setPersonQ(e.target.value)} dir="ltr" placeholder={t.admin.artSearchPeople} className="h-8 text-xs" />
          {personHits.length > 0 && (
            <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto scrollbar-slim">
              {personHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => set({ personIds: [...draft.personIds, { id: p.id, en: p.nameEn ?? p.id, fa: p.nameFa ?? p.nameEn ?? p.id }] })}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand"
                  >
                    {p.portraitUrl ? <img src={p.portraitUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">{(p.nameEn ?? '?').slice(0, 1)}</span>}
                    <span className="truncate bdi">{isFa ? p.nameFa || p.nameEn : p.nameEn || p.nameFa}</span>
                    <Plus className="ms-auto h-3 w-3 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="button" size="sm" className="h-9" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {row ? t.common.save : t.admin.artCreate}
        </Button>
      </div>
    </div>
  )
}
