'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { History, Loader2, ArrowUp, ArrowDown, Plus, ChevronUp, ChevronDown, Trash2, Check, X, Clock, Pencil, Smartphone, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatDateTime, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { Locale } from '@/lib/types'
import { UploadButton } from '@/components/views/admin/shared'

type AdminDict = ReturnType<typeof getDict>['admin']

/* ───────────────────── Admin: homepage deep editors (Task 27, audit P0-2) ───────────────────── */

const SECTION_DEFAULTS: Record<string, { slides?: Record<string, unknown>[]; posters?: Record<string, unknown>[] } & Record<string, unknown>> = {
  HERO: {
    autoplayMs: 6000,
    motion: 'slide',
    slides: [{ image: '/images/hero-season.png', eyebrowEn: '', eyebrowFa: '', titleEn: 'New season titles', titleFa: 'تازه‌های فصل', bodyEn: '', bodyFa: '', ctaEn: 'Discover the new titles', ctaFa: 'کشف تازه‌های نشر', href: '/books', textColor: 'light', position: 'center', bg: '' }],
  },
  PRODUCT_SHELF: { headingEn: 'New titles', headingFa: 'تازه‌های نشر', descriptionEn: '', descriptionFa: '', source: 'newest', layout: 'grid', limit: 8, hideOutOfStock: false, ctaEn: '', ctaFa: '', ctaHref: '', categorySlug: '' },
  POSTER_GRID: { template: 'standard', posters: [] },
  EDITORIAL_FEATURE: { layout: 'image-left', bg: 'paper', minH: 600, accentOrange: false, image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', quoteEn: '', quoteFa: '', textEn: '', textFa: '', attributionEn: '', attributionFa: '', ctaEn: '', ctaFa: '', ctaHref: '' },
  CATEGORY_CAROUSEL: { headingEn: 'Browse the shelves', headingFa: 'گشت‌وگذار در قفسه‌ها', descriptionEn: '', descriptionFa: '', slugs: [] },
  FOR_YOU: { headingEn: '', headingFa: '', limit: 12 },
  RECENTLY_VIEWED: { headingEn: '', headingFa: '', limit: 12 },
  ARTICLES: { headingEn: 'From the journal', headingFa: 'از مجلهٔ پرس‌پیکس', descriptionEn: '', descriptionFa: '', limit: 3, bg: 'white', ctaEn: 'All articles', ctaFa: 'همهٔ مقاله‌ها', ctaHref: '/articles' },
  SERIES: { headingEn: '', headingFa: '', descriptionEn: '', descriptionFa: '', layout: 'cards', ctaEn: 'All series', ctaFa: 'همهٔ مجموعه‌ها', ctaHref: '/series' },
  SCROLL_STORY: { eyebrowEn: 'Book spotlight', eyebrowFa: 'معرفی کتاب', ctaEn: 'Get the book', ctaFa: 'خرید کتاب', ctaHref: '/books', heightPreset: 'classic', layout: 'split', slides: [{ image: '', eyebrowEn: 'Part I', eyebrowFa: 'دفتر نخست', titleEn: '', titleFa: '', textEn: '', textFa: '' }] },
}

type SectionRec = { id: string; type: string; sortOrder: number; enabled: boolean; settings: Record<string, unknown> }

export function AdminHomepage() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [data, setData] = useState<{ draft: { id: string; sections: SectionRec[] }; published: { publishedAt: string; changeSummary?: string } | null } | null>(null)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  // R9: version history (restore points) — list + restore-to-draft.
  interface VersionRow {
    id: string; status: string; publishedAt: string | null; publishedBy: string | null
    changeSummary: string | null; createdAt: string; sectionCount: number; enabledCount: number
    types: { type: string; count: number; enabled: number }[]
    preview: { type: string; enabled: boolean; heading: string | null }[]
  }
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<VersionRow[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Press-&-hold drag reorder (same pattern as the product gallery, Task 49/50):
  // grab the handle → the row becomes draggable → hover the target row → drop.
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [armDrag, setArmDrag] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<typeof data>('/api/admin/homepage?locale=' + locale).then((r) => { setData(r as NonNullable<typeof data>); setSummary('') }).catch(() => setData(null))
  }, [locale])
  useEffect(() => { load() }, [load])

  const loadHistory = useCallback(() => {
    apiGet<{ items: VersionRow[] }>('/api/admin/homepage/versions?locale=' + locale)
      .then((r) => setHistory(r.items)).catch(() => setHistory([]))
  }, [locale])
  const toggleHistory = () => {
    setHistoryOpen((v) => !v)
    if (!history) loadHistory()
  }
  const restoreVersion = async (row: VersionRow) => {
    if (!window.confirm(t.admin.homeRestoreConfirm)) return
    setRestoringId(row.id)
    try {
      await apiPost(`/api/admin/homepage/versions/${row.id}/restore`, {})
      toast({ title: t.admin.homeRestored })
      load()
      loadHistory()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally {
      setRestoringId(null)
    }
  }

  if (!data) return <Spinner label={t.common.loading} />
  const sections = data.draft?.sections ?? []

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    const ordered = next.map((s, i) => ({ ...s, sortOrder: i }))
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: ordered } } : d)
  }
  /** Drag & drop reorder (from → to), renumbering sortOrder. */
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) return
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ordered = next.map((s, i) => ({ ...s, sortOrder: i }))
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: ordered } } : d)
  }
  const toggle = (id: string, enabled: boolean) => {
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.map((s) => s.id === id ? { ...s, enabled } : s) } } : d)
  }
  /** Deep-merge a patch into a section's settings (local draft only — persisted on Save draft/Publish). */
  const patchSettings = (id: string, patch: Record<string, unknown>) => {
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.map((s) => s.id === id ? { ...s, settings: { ...s.settings, ...patch } } : s) } } : d)
  }
  const addSection = (type: string) => {
    setAddOpen(false)
    const fresh: SectionRec = { id: `new-${Date.now()}`, type, sortOrder: sections.length, enabled: true, settings: structuredClone(SECTION_DEFAULTS[type] ?? {}) }
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: [...d.draft.sections, fresh] } } : d)
    setEditingId(fresh.id)
    toast({ title: locale === 'fa' ? 'بخش اضافه شد — برای انتشار ذخیره کنید' : 'Section added — save draft or publish to persist' })
  }
  const removeSection = (id: string) => {
    if (!window.confirm(t.admin.removeConfirm)) return
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.filter((s) => s.id !== id).map((s, i) => ({ ...s, sortOrder: i })) } } : d)
    if (editingId === id) setEditingId(null)
  }
  const save = async (action: 'draft' | 'publish') => {
    setBusy(true)
    try {
      await apiPut('/api/admin/homepage', {
        locale,
        changeSummary: summary || (action === 'publish' ? 'Publish from admin' : 'Draft edit'),
        action,
        sections: sections.map((s, i) => ({ type: s.type, sortOrder: i, enabled: s.enabled, settings: s.settings })),
      })
      // Task 50 — explicit success feedback (was: a bare “Publish” title).
      const now = formatDateTime(new Date().toISOString(), locale)
      toast({
        title: action === 'publish' ? t.admin.publishSuccess : t.admin.draft,
        description: action === 'publish'
          ? tf(t.admin.publishSuccessDesc, { n: sections.length, time: now })
          : tf(t.admin.draftSavedDesc, { time: now }),
      })
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }

  const typeLabels: Record<string, string> = {
    HERO: locale === 'fa' ? 'اسلایدروی صفحهٔ اصلی' : 'Hero slider',
    PRODUCT_SHELF: locale === 'fa' ? 'قفسهٔ کتاب' : 'Product shelf',
    CATEGORY_CAROUSEL: locale === 'fa' ? 'چرخ‌وفلک موضوع‌ها' : 'Category carousel',
    POSTER_GRID: locale === 'fa' ? 'شبکهٔ پوستر' : 'Poster grid',
    EDITORIAL_FEATURE: locale === 'fa' ? 'ویژهٔ تحریریه' : 'Editorial feature',
    FOR_YOU: locale === 'fa' ? 'قفسهٔ «برای شما» (شخصی‌سازی)' : 'For-you shelf (personalized)',
    RECENTLY_VIEWED: locale === 'fa' ? 'بازدیدهای اخیر' : 'Recently viewed',
    ARTICLES: locale === 'fa' ? 'معرفی مقاله‌ها' : 'Articles teaser',
    SCROLL_STORY: locale === 'fa' ? 'قصّهٔ اسکرولی (سنجاق‌شده)' : 'Scroll story (pinned)',
    SERIES: locale === 'fa' ? 'قفسهٔ مجموعه‌ها' : 'Series shelf',
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.admin.homepage}</h2>
          {/* Single-source config: sections carry bilingual fields (headingEn/headingFa),
              so one configuration drives BOTH storefront languages — a save or publish
              here is mirrored to en+fa atomically (user-reported drift bug, fixed). */}
          <p className="mt-0.5 text-xs text-ink-3">
            {locale === 'fa'
              ? 'این پیکربندی برای هر دو زبان مشترک است؛ متن‌های EN/FA هر بخش داخل همان بخش ویرایش می‌شوند و ذخیره/انتشار به هر دو زبان اعمال می‌شود.'
              : 'This configuration is shared by both languages — each section holds its own EN/FA texts, and every save/publish applies to EN and FA alike.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder={t.admin.changeSummary} value={summary} onChange={(e) => setSummary(e.target.value)} className="h-9 w-48" />
          <Button variant="outline" className="h-9" disabled={busy} onClick={() => save('draft')}>{t.admin.draft}</Button>
          <Button className="h-9" disabled={busy} onClick={() => save('publish')}>{t.admin.publish}</Button>
          <Button variant="outline" className="h-9 gap-1.5" aria-expanded={historyOpen} onClick={toggleHistory}>
            <History className="h-4 w-4 text-brand" aria-hidden />{t.admin.homeHistory}
          </Button>
        </div>
      </div>
      {data.published && (
        <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
          {t.admin.published}: {formatDateTime(data.published.publishedAt, locale)}{data.published.changeSummary ? ` — ${data.published.changeSummary}` : ''}
        </p>
      )}

      {/* R9: version history — every publish leaves a restore point; restoring
          copies an old version into the DRAFT (publish stays a manual step). */}
      {historyOpen && (
        <div className="mb-5 overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-soft/60 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <History className="h-3.5 w-3.5 text-brand" aria-hidden />{t.admin.homeHistory}
            </p>
            <p className="text-[11px] text-ink-3">{t.admin.homeHistoryHint}</p>
          </div>
          {!history ? (
            <div className="px-4 py-6"><Spinner label={t.common.loading} /></div>
          ) : history.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">{t.admin.homeHistoryEmpty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((row) => {
                const isCurrent = row.status === 'PUBLISHED'
                const expanded = expandedId === row.id
                return (
                  <li key={row.id} className={cn('px-4 py-3', isCurrent && 'bg-success/[0.04]')}>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', isCurrent ? 'bg-success/10 text-success' : 'bg-soft text-ink-3')}>
                        <Clock className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-ink">{formatDateTime(row.publishedAt ?? row.createdAt, locale)}</span>
                          {isCurrent ? (
                            <Badge tone="success"><Check className="me-1 h-3 w-3" aria-hidden />{t.admin.homeHistoryCurrent}</Badge>
                          ) : (
                            <Badge tone="default">{locale === 'fa' ? 'آرشیو' : 'Archived'}</Badge>
                          )}
                          <span className="text-xs text-ink-3">{tf(t.admin.homeSectionsCount, { n: row.sectionCount })}</span>
                        </p>
                        <p className="truncate text-[11px] text-ink-3">
                          {row.changeSummary || '—'}
                          {row.publishedBy ? ` · ${tf(t.admin.homeBy, { email: row.publishedBy })}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-ink-3" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : row.id)}>
                          {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                          {locale === 'fa' ? 'بخش‌ها' : 'Sections'}
                        </Button>
                        {!isCurrent && (
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={restoringId === row.id} onClick={() => restoreVersion(row)}>
                            {restoringId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden />}
                            {t.admin.homeRestore}
                          </Button>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <ol className="ms-10 mt-2 space-y-1 border-s border-line ps-3">
                        {row.preview.map((p, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-ink-2">
                            <span className={cn('h-1.5 w-1.5 rounded-full', p.enabled ? 'bg-brand' : 'bg-line')} aria-hidden />
                            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-3">{p.type}</span>
                            {p.heading && <span className="truncate">{p.heading}</span>}
                            {!p.enabled && <Badge tone="default">{locale === 'fa' ? 'خاموش' : 'off'}</Badge>}
                          </li>
                        ))}
                        {row.sectionCount > row.preview.length && (
                          <li className="text-[11px] text-ink-3">+{row.sectionCount - row.preview.length} {locale === 'fa' ? 'بخش دیگر' : 'more sections'}</li>
                        )}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Add-section menu (audit P1: sections could not be added) */}
      <div className="relative mb-3 inline-block">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
          <Plus className="h-4 w-4" aria-hidden />{t.admin.addSection}
        </Button>
        {addOpen && (
          <div className="absolute z-20 mt-1 w-56 rounded-lg border border-line bg-white p-1 shadow-lg">
            {Object.keys(typeLabels).map((type) => (
              <button key={type} type="button" onClick={() => addSection(type)} className="flex w-full items-center rounded-md px-3 py-2 text-start text-sm text-ink-2 hover:bg-soft hover:text-ink">
                {typeLabels[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {sections.map((s, i) => {
          const editing = editingId === s.id
          const summaryLine =
            s.type === 'PRODUCT_SHELF' ? `${s.settings.source ?? 'newest'} · ${s.settings.limit ?? 8}` :
            s.type === 'HERO' ? `${(s.settings.slides as unknown[] | undefined)?.length ?? 0} slides` :
            s.type === 'POSTER_GRID' ? `${(s.settings.posters as unknown[] | undefined)?.length ?? 0} posters` :
            s.type === 'CATEGORY_CAROUSEL' ? ((s.settings.slugs as string[] | undefined) ?? []).join(', ') :
            s.type === 'FOR_YOU' || s.type === 'RECENTLY_VIEWED' ? `${s.settings.limit ?? 12} books` :
            s.type === 'ARTICLES' ? `${s.settings.limit ?? 3} articles${s.settings.bg && s.settings.bg !== 'white' ? ` · ${String(s.settings.bg)}` : ''}` :
            s.type === 'SERIES' ? `${String(s.settings.layout ?? 'cards')} · ${String(s.settings.ctaHref ?? '/series')}` :
            s.type === 'EDITORIAL_FEATURE' ? `${String(s.settings.layout ?? 'image-left')} · ${Number(s.settings.minH ?? 600)}px` :
            s.type === 'SCROLL_STORY' ? `${((s.settings.slides as unknown[] | undefined) ?? []).length} scenes · ${String(s.settings.layout ?? 'split')}${s.settings.coverImage ? ' · cover' : ''} · ${String(s.settings.heightPreset ?? 'classic')}` :
            String(s.settings.layout ?? '')
          return (
            <li
              key={s.id}
              draggable={armDrag === s.id}
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); setArmDrag(null) }}
              onDragOver={(e) => {
                if (dragFrom !== null && dragFrom !== i) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOver(i)
                }
              }}
              onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                const raw = dragFrom ?? Number.parseInt(e.dataTransfer.getData('text/plain') || '', 10)
                setDragFrom(null)
                setDragOver(null)
                setArmDrag(null)
                if (Number.isFinite(raw)) reorder(raw, i)
              }}
              className={cn(
                'rounded-lg border px-4 py-3 transition-colors',
                editing ? 'border-brand/40 bg-brand-soft/20'
                  : dragOver === i ? 'border-brand bg-brand-soft/70 ring-2 ring-brand/30'
                    : dragFrom === i ? 'border-brand/40 opacity-50'
                      : 'border-line bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                {/* Drag handle — press & hold, then hover into place (HTML5 drag) */}
                <button
                  type="button"
                  aria-label={t.admin.dragSectionHint}
                  title={t.admin.dragSectionHint}
                  onMouseDown={() => setArmDrag(s.id)}
                  onMouseUp={() => setArmDrag((cur) => (cur === s.id ? null : cur))}
                  onTouchStart={() => setArmDrag(s.id)}
                  onTouchEnd={() => setArmDrag(null)}
                  className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 transition hover:bg-soft hover:text-ink active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex flex-col gap-0.5">
                  <button type="button" aria-label={t.admin.moveUp} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-ink-3 hover:bg-soft disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" aria-label={t.admin.moveDown} disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-ink-3 hover:bg-soft disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink"><span className="me-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-soft text-[11px] font-bold text-ink-2 bdi" dir="ltr">{i + 1}</span>{typeLabels[s.type] ?? s.type}</p>
                  <p className="truncate text-xs text-ink-3" dir="auto">{summaryLine}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={editing ? 'default' : 'outline'} className="h-8 gap-1" aria-expanded={editing} onClick={() => setEditingId(editing ? null : s.id)}>
                    {editing ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3 w-3" aria-hidden />}
                    {editing ? t.admin.doneEdit : t.admin.editSection}
                  </Button>
                  <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} aria-label={t.admin.enable} />
                  <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" aria-label={t.admin.removeSection} onClick={() => removeSection(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
              {editing && (
                <div className="mt-3 border-t border-line pt-3">
                  {s.type === 'HERO' && <HeroSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'POSTER_GRID' && <PosterSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'PRODUCT_SHELF' && <ShelfSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'CATEGORY_CAROUSEL' && <CarouselSectionEditor section={s} onPatch={patchSettings} />}
                  {(s.type === 'FOR_YOU' || s.type === 'RECENTLY_VIEWED') && <SimpleShelfSectionEditor section={s} onPatch={patchSettings} />}
                  {s.type === 'SERIES' && <SeriesSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'ARTICLES' && <ArticlesSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'EDITORIAL_FEATURE' && <EditorialSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'SCROLL_STORY' && <ScrollStorySectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  <p className="mt-3 text-[11px] text-ink-3">
                    {locale === 'fa' ? 'تغییرها ابتدا روی پیش‌نویس اعمال می‌شوند؛ با «انتشار» برای بازدیدکنندگان فعال می‌شوند.' : 'Edits land on the draft; “Publish” makes them live for visitors.'}
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-xs text-ink-3">
        {locale === 'fa' ? 'بخش‌ها از انواع تأییدشده انتخاب می‌شوند؛ محتوای هر بخش در پیش‌نویس ذخیره و با «انتشار» برای همه بازدیدکنندگان فعال می‌شود.' : 'Sections compose from approved types only. Content is saved as a draft; “Publish” makes it live for all visitors.'}
      </p>
    </div>
  )
}

/* ── Field primitives shared by the section editors ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 text-xs text-ink-3">{label}</Label>
      {children}
    </div>
  )
}

function SectionText({ value, onChange, dir, lang, placeholder, rows, mono }: { value: string; onChange: (v: string) => void; dir?: 'ltr' | 'rtl'; lang?: string; placeholder?: string; rows?: number; mono?: boolean }) {
  if (rows) {
    return (
      <textarea
        value={value} rows={rows} dir={dir} lang={lang} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn('w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40', mono && 'font-mono text-[13px]')}
      />
    )
  }
  return (
    <Input value={value} dir={dir} lang={lang} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 bg-white" />
  )
}

function BilingualPair({ labelEn, labelFa, valueEn, valueFa, onChangeEn, onChangeFa, rows }: { labelEn: string; labelFa: string; valueEn: string; valueFa: string; onChangeEn: (v: string) => void; onChangeFa: (v: string) => void; rows?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={labelEn}><SectionText value={valueEn} onChange={onChangeEn} dir="ltr" lang="en" rows={rows} /></Field>
      <Field label={labelFa}><SectionText value={valueFa} onChange={onChangeFa} dir="rtl" lang="fa" rows={rows} /></Field>
    </div>
  )
}

/** Task 47 — collapsible per-device override group for sliders: the admin can
 *  give phones (<768px) their own portrait image and shorter copy (4 states:
 *  web/mobile × EN/FA). Blank fields fall back to the web values at runtime;
 *  the orange chip counts how many overrides are filled in. */
function MobileVariantBox({ locale, filled, children }: { locale: Locale; filled: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const fa = locale === 'fa'
  return (
    <div className={cn('rounded-md border', filled > 0 ? 'border-orange-accent/40 bg-orange-accent/[0.05]' : 'border-line bg-transparent')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-start">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-orange-accent" aria-hidden />
        <span className="min-w-0 flex-1 text-xs font-semibold text-ink-2">
          {fa ? 'نسخهٔ گوشی (اختیاری)' : 'Mobile variant (optional)'}
          <span className="ms-2 hidden font-normal text-ink-3 sm:inline">
            {fa ? 'فقط زیر ۷۶۸px — خالی = همان مقدار نسخهٔ وب' : 'phones <768px only — blank = web value'}
          </span>
        </span>
        {filled > 0 && (
          <span className="shrink-0 rounded-full bg-orange-accent/15 px-2 py-0.5 text-[10px] font-bold text-orange-dark">{faDigits(filled)}</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="space-y-3 border-t border-line px-3 pb-3 pt-3">{children}</div>}
    </div>
  )
}

const mobileFilled = (vals: unknown[]) => vals.filter((v) => String(v ?? '').trim() !== '').length

function ImageField({ label, value, onChange, t, onRemove }: { label: string; value: string; onChange: (v: string) => void; t: AdminDict; onRemove?: () => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded border border-line bg-soft">
            {/* plain img: runtime-chosen admin URL — next/image has no benefit here */}
            <img src={value} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink-3">—</span>
        )}
        <div className="min-w-40 flex-1"><SectionText value={value} onChange={onChange} dir="ltr" placeholder="/images/…" /></div>
        <UploadButton label={t.upload} busyLabel={t.uploading} onUploaded={onChange} />
        {onRemove && value && (
          <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={onRemove} aria-label={t.clear}><X className="h-3.5 w-3.5" aria-hidden /></Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">{t.uploadHint}</p>
    </Field>
  )
}

/** HERO — per-slide editor (audit P0-2: slides were completely uneditable). */
function HeroSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const slides = (section.settings.slides as Record<string, unknown>[] | undefined) ?? []
  const setSlides = (next: Record<string, unknown>[]) => onPatch(section.id, { slides: next })
  const setSlide = (i: number, patch: Record<string, unknown>) => setSlides(slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.admin.autoplayMs}>
          <Input type="number" min={2000} step={500} dir="ltr" value={String(section.settings.autoplayMs ?? 6000)} onChange={(e) => onPatch(section.id, { autoplayMs: Number(e.target.value) || 6000 })} className="h-9 bg-white" />
        </Field>
        <Field label={t.admin.motion}>
          <select value={String(section.settings.motion ?? 'slide')} onChange={(e) => onPatch(section.id, { motion: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="slide">slide</option>
            <option value="fade">fade</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.slides} ({slides.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setSlides([...slides, { ...(SECTION_DEFAULTS.HERO.slides?.[0] ?? {}), titleEn: '', titleFa: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addSlide}
        </Button>
      </div>
      {slides.map((sl, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...slides]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSlides(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === slides.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...slides]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setSlides(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSlide} onClick={() => setSlides(slides.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(sl.image ?? '')} onChange={(v) => setSlide(i, { image: v })} t={t.admin} />
          <MobileVariantBox locale={locale} filled={mobileFilled([sl.imageMobile, sl.eyebrowMobileEn, sl.eyebrowMobileFa, sl.titleMobileEn, sl.titleMobileFa, sl.bodyMobileEn, sl.bodyMobileFa])}>
            <ImageField label={locale === 'fa' ? 'تصویر گوشی (عمودی ۹:۱۶)' : 'Mobile image (portrait 9:16)'} value={String(sl.imageMobile ?? '')} onChange={(v) => setSlide(i, { imageMobile: v })} t={t.admin} />
            <BilingualPair labelEn="Eyebrow — mobile (EN)" labelFa="سرنویس گوشی (فارسی)" valueEn={String(sl.eyebrowMobileEn ?? '')} valueFa={String(sl.eyebrowMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowMobileEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowMobileFa: v })} />
            <BilingualPair labelEn="Title — mobile (EN)" labelFa="عنوان گوشی (فارسی)" valueEn={String(sl.titleMobileEn ?? '')} valueFa={String(sl.titleMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { titleMobileEn: v })} onChangeFa={(v) => setSlide(i, { titleMobileFa: v })} />
            <BilingualPair labelEn="Body — mobile (EN)" labelFa="متن گوشی (فارسی)" valueEn={String(sl.bodyMobileEn ?? '')} valueFa={String(sl.bodyMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { bodyMobileEn: v })} onChangeFa={(v) => setSlide(i, { bodyMobileFa: v })} rows={2} />
          </MobileVariantBox>
          <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(sl.eyebrowEn ?? '')} valueFa={String(sl.eyebrowFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(sl.titleEn ?? '')} valueFa={String(sl.titleFa ?? '')} onChangeEn={(v) => setSlide(i, { titleEn: v })} onChangeFa={(v) => setSlide(i, { titleFa: v })} />
          <BilingualPair labelEn="Body (EN)" labelFa="متن (فارسی)" valueEn={String(sl.bodyEn ?? '')} valueFa={String(sl.bodyFa ?? '')} onChangeEn={(v) => setSlide(i, { bodyEn: v })} onChangeFa={(v) => setSlide(i, { bodyFa: v })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t.admin.ctaLabel}><SectionText value={String(sl.ctaEn ?? '')} onChange={(v) => setSlide(i, { ctaEn: v })} dir="ltr" placeholder="Discover the new titles" /></Field>
            <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(sl.ctaFa ?? '')} onChange={(v) => setSlide(i, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label={t.admin.ctaLink}><SectionText value={String(sl.href ?? '')} onChange={(v) => setSlide(i, { href: v })} dir="ltr" placeholder="/books" /></Field>
            <Field label={t.admin.textPosition}>
              <select value={String(sl.position ?? 'center')} onChange={(e) => setSlide(i, { position: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="left">{t.admin.posLeft}</option>
                <option value="center">{t.admin.posCenter}</option>
                <option value="right">{t.admin.posRight}</option>
              </select>
            </Field>
            <Field label={t.admin.textColor}>
              <select value={String(sl.textColor ?? 'light')} onChange={(e) => setSlide(i, { textColor: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="light">{t.admin.light}</option>
                <option value="dark">{t.admin.dark}</option>
              </select>
            </Field>
            <Field label={t.admin.bgColor}>
              <div className="flex items-center gap-1.5">
                <SectionText value={String(sl.bg ?? '')} onChange={(v) => setSlide(i, { bg: v })} dir="ltr" placeholder="#014B74 / linear-gradient(…)" mono />
                {String(sl.bg ?? '').startsWith('#') && <span className="h-7 w-7 shrink-0 rounded border border-line" style={{ backgroundColor: String(sl.bg) }} aria-hidden />}
              </div>
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

/** POSTER_GRID — per-poster editor with image/bg/span (audit P0-2). */
function PosterSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const posters = (section.settings.posters as Record<string, unknown>[] | undefined) ?? []
  const setPosters = (next: Record<string, unknown>[]) => onPatch(section.id, { posters: next })
  const setPoster = (i: number, patch: Record<string, unknown>) => setPosters(posters.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.admin.template}>
          <select value={String(section.settings.template ?? 'standard')} onChange={(e) => onPatch(section.id, { template: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="standard">standard</option>
            <option value="wide-first">wide-first</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.posters} ({posters.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPosters([...posters, { image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', textEn: '', textFa: '', ctaEn: '', ctaFa: '', href: '', bg: '', textColor: 'light', span: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addPoster}
        </Button>
      </div>
      {posters.map((p, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...posters]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setPosters(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === posters.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...posters]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setPosters(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSection} onClick={() => setPosters(posters.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(p.image ?? '')} onChange={(v) => setPoster(i, { image: v })} t={t.admin} />
          <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(p.eyebrowEn ?? '')} valueFa={String(p.eyebrowFa ?? '')} onChangeEn={(v) => setPoster(i, { eyebrowEn: v })} onChangeFa={(v) => setPoster(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(p.titleEn ?? '')} valueFa={String(p.titleFa ?? '')} onChangeEn={(v) => setPoster(i, { titleEn: v })} onChangeFa={(v) => setPoster(i, { titleFa: v })} />
          <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(p.textEn ?? '')} valueFa={String(p.textFa ?? '')} onChangeEn={(v) => setPoster(i, { textEn: v })} onChangeFa={(v) => setPoster(i, { textFa: v })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label={t.admin.ctaLabel}><SectionText value={String(p.ctaEn ?? '')} onChange={(v) => setPoster(i, { ctaEn: v })} dir="ltr" /></Field>
            <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(p.ctaFa ?? '')} onChange={(v) => setPoster(i, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
            <Field label={t.admin.ctaLink}><SectionText value={String(p.href ?? '')} onChange={(v) => setPoster(i, { href: v })} dir="ltr" placeholder="/articles/…" /></Field>
            <Field label={t.admin.span}><SectionText value={String(p.span ?? '')} onChange={(v) => setPoster(i, { span: v })} dir="ltr" placeholder="col-span-2" mono /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t.admin.bgColor}>
              <div className="flex items-center gap-1.5">
                <SectionText value={String(p.bg ?? '')} onChange={(v) => setPoster(i, { bg: v })} dir="ltr" placeholder="#014B74 / linear-gradient(…)" mono />
                {String(p.bg ?? '').startsWith('#') && <span className="h-7 w-7 shrink-0 rounded border border-line" style={{ backgroundColor: String(p.bg) }} aria-hidden />}
              </div>
            </Field>
            <Field label={t.admin.textColor}>
              <select value={String(p.textColor ?? 'light')} onChange={(e) => setPoster(i, { textColor: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="light">{t.admin.light}</option>
                <option value="dark">{t.admin.dark}</option>
              </select>
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

/** PRODUCT_SHELF — source/limit/category were read-only before (audit P1). */
function ShelfSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const source = String(s.source ?? 'newest')
  return (
    <div className="space-y-3">
      <BilingualPair labelEn={t.admin.headingEn} labelFa={t.admin.headingFa} valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn={t.admin.descEn} labelFa={t.admin.descFa} valueEn={String(s.descriptionEn ?? '')} valueFa={String(s.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label={t.admin.shelfSource}>
          <select value={source} onChange={(e) => onPatch(section.id, { source: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="newest">{t.admin.sourceNewest}</option>
            <option value="bestselling">{t.admin.sourceBestsellers}</option>
            <option value="featured">{t.admin.sourceFeatured}</option>
            <option value="category">{t.admin.sourceCategory}</option>
            <option value="discounted">{t.admin.sourceOnSale}</option>
            <option value="flash">{t.admin.sourceFlash}</option>
          </select>
        </Field>
        <Field label={t.admin.limitLabel}>
          <Input type="number" min={2} max={24} dir="ltr" value={String(s.limit ?? 8)} onChange={(e) => onPatch(section.id, { limit: Math.max(2, Math.min(24, Number(e.target.value) || 8)) })} className="h-9 bg-white" />
        </Field>
        {source === 'category' ? (
          <Field label={t.admin.categorySlug}><SectionText value={String(s.categorySlug ?? '')} onChange={(v) => onPatch(section.id, { categorySlug: v })} dir="ltr" placeholder="fiction" mono /></Field>
        ) : source === 'flash' ? (
          <Field label={t.admin.flashHours}><Input type="number" min={1} max={72} dir="ltr" value={String(s.flashHours ?? 12)} onChange={(e) => onPatch(section.id, { flashHours: Math.max(1, Math.min(72, Number(e.target.value) || 12)) })} className="h-9 bg-white" /></Field>
        ) : <span />}
        <Field label="Layout">
          <select value={String(s.layout ?? 'grid')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="grid">grid</option>
            <option value="carousel">carousel</option>
            <option value="featured">featured</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t.admin.shelfCta}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.shelfCta} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
        <Field label={t.admin.shelfCtaHref}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/books?sort=new" mono /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <Checkbox checked={Boolean(s.hideWhenEmpty)} onCheckedChange={(v) => onPatch(section.id, { hideWhenEmpty: v === true })} />
        {t.admin.hideWhenEmpty}
      </label>
    </div>
  )
}

/** FOR_YOU / RECENTLY_VIEWED — optional heading override + item limit.
 *  An empty heading falls back to the storefront's built-in dictionary label. */
function SimpleShelfSectionEditor({ section, onPatch }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void }) {
  const s = section.settings
  return (
    <div className="space-y-3">
      <BilingualPair
        labelEn="Heading (EN) — empty = default" labelFa="عنوان (فارسی) — خالی = پیش‌فرض"
        valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')}
        onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Limit">
          <Input type="number" min={3} max={12} dir="ltr" value={String(s.limit ?? 12)} onChange={(e) => onPatch(section.id, { limit: Math.max(3, Math.min(12, Number(e.target.value) || 12)) })} className="h-9 bg-white" />
        </Field>
      </div>
      <p className="text-[11px] text-ink-3">Personalized shelves stay hidden automatically while the visitor has no matching history.</p>
    </div>
  )
}

/** SERIES — bilingual heading/description overrides, card vs chips layout,
 *  optional CTA. The shelf itself is data-driven from published series, so
 *  the editor only tunes the presentation (nothing to hand-curate). */
function SeriesSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const layout = String(s.layout ?? 'cards')
  return (
    <div className="space-y-3">
      <BilingualPair
        labelEn="Heading (EN) — empty = default" labelFa="عنوان (فارسی) — خالی = پیش‌فرض"
        valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')}
        onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })}
      />
      <BilingualPair
        labelEn="Description (EN) — empty = default" labelFa="توضیح (فارسی) — خالی = پیش‌فرض"
        valueEn={String(s.descriptionEn ?? '')} valueFa={String(s.descriptionFa ?? '')}
        onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Layout">
          <select
            value={layout}
            onChange={(e) => onPatch(section.id, { layout: e.target.value })}
            className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
            aria-label="Layout"
          >
            <option value="cards">Cards (cover + count)</option>
            <option value="chips">Chips (compact)</option>
          </select>
        </Field>
        <Field label={locale === 'fa' ? 'متن دکمه (انگلیسی)' : 'CTA label (EN)'}>
          <Input dir="ltr" value={String(s.ctaEn ?? '')} onChange={(e) => onPatch(section.id, { ctaEn: e.target.value })} className="h-9 bg-white" placeholder={t.series.title} />
        </Field>
        <Field label={locale === 'fa' ? 'متن دکمه (فارسی)' : 'CTA label (FA)'}>
          <Input dir="rtl" value={String(s.ctaFa ?? '')} onChange={(e) => onPatch(section.id, { ctaFa: e.target.value })} className="h-9 bg-white" placeholder={t.series.title} />
        </Field>
      </div>
      <p className="text-[11px] text-ink-3">Data-driven: shows every published series with its volume count — hides itself while no series is published.</p>
    </div>
  )
}

/** ARTICLES — headings/description + count (2–4) + background + CTA.
 *  Hides itself when the journal is empty. The rendered grid always adapts
 *  to the real article count; this select caps how many are pulled. */
function ArticlesSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const bg = String(s.bg ?? 'white')
  const bgIsPreset = ['white', 'soft', 'paper', 'brand'].includes(bg)
  const selectCls = 'flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm'
  return (
    <div className="space-y-3">
      <BilingualPair labelEn="Heading (EN)" labelFa="عنوان (فارسی)" valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn="Description (EN)" labelFa="توضیح (فارسی)" valueEn={String(s.descriptionEn ?? '')} valueFa={String(s.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label={t.admin.articleCount}>
          <select value={String(s.limit ?? 3)} onChange={(e) => onPatch(section.id, { limit: Number(e.target.value) })} className={selectCls}>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </Field>
        <Field label={t.admin.bgColor}>
          <select value={bgIsPreset ? bg : 'custom'} onChange={(e) => onPatch(section.id, { bg: e.target.value === 'custom' ? '#EAF4F8' : e.target.value })} className={selectCls}>
            <option value="white">{t.admin.bgWhite}</option>
            <option value="soft">{t.admin.bgSoft}</option>
            <option value="paper">{t.admin.bgPaper}</option>
            <option value="brand">{t.admin.bgBrand}</option>
            <option value="custom">{t.admin.bgCustom}</option>
          </select>
        </Field>
        <Field label="CTA (EN)"><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label="CTA (FA)"><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {!bgIsPreset && (
          <Field label={`${t.admin.bgColor} (hex)`}>
            <SectionText value={bg} onChange={(v) => onPatch(section.id, { bg: v })} dir="ltr" placeholder="#EAF4F8" mono />
          </Field>
        )}
        <Field label="CTA link"><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/articles" mono /></Field>
      </div>
    </div>
  )
}

/** SCROLL_STORY — pinned scrollytelling spotlight for ONE book: a tall
 *  section whose sticky panel morphs through scenes as the visitor scrolls
 *  (real scroll, no hijacking). Editor: layout (split / backdrop), per-scene
 *  travel preset, shared eyebrow + CTA, backdrop cover image, and the scene
 *  list (image + label + title + text each). */
function ScrollStorySectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const slides = (s.slides as Record<string, unknown>[] | undefined) ?? []
  const setSlides = (next: Record<string, unknown>[]) => onPatch(section.id, { slides: next })
  const setSlide = (i: number, patch: Record<string, unknown>) => setSlides(slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)))
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={locale === 'fa' ? 'چیدمان' : 'Layout'}>
          <select value={String(s.layout ?? 'split')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="split">{locale === 'fa' ? 'دو ستونه (متن + تصویر)' : 'Split (text + image)'}</option>
            <option value="backdrop">{locale === 'fa' ? 'تمام‌صفحه (بک‌گراند + جلد)' : 'Backdrop (full-bleed + cover)'}</option>
          </select>
        </Field>
        <Field label={locale === 'fa' ? 'طول اسکرول هر صحنه' : 'Scroll length per scene'}>
          <select value={String(s.heightPreset ?? 'classic')} onChange={(e) => onPatch(section.id, { heightPreset: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="compact">{locale === 'fa' ? 'کوتاه (۷۸vh)' : 'Compact (78vh)'}</option>
            <option value="classic">{locale === 'fa' ? 'استاندارد (۱۰۰vh)' : 'Classic (100vh)'}</option>
            <option value="cinematic">{locale === 'fa' ? 'سینمایی (۱۳۰vh)' : 'Cinematic (130vh)'}</option>
          </select>
        </Field>
        <Field label={t.admin.ctaLabel}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
      </div>
      <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(s.eyebrowEn ?? '')} valueFa={String(s.eyebrowFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowFa: v })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t.admin.ctaLink}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/books/…" mono /></Field>
        {/* Backdrop layout: the ONE book's small cover floating over the
            morphing scenes — often the same artwork as the backgrounds. */}
        <ImageField label={locale === 'fa' ? 'جلد شناور (چیدمان تمام‌صفحه)' : 'Floating cover (backdrop layout)'} value={String(s.coverImage ?? '')} onChange={(v) => onPatch(section.id, { coverImage: v })} t={t.admin} />
      </div>
      <MobileVariantBox locale={locale} filled={mobileFilled([s.eyebrowMobileEn, s.eyebrowMobileFa, s.coverImageMobile])}>
        <BilingualPair labelEn="Eyebrow — mobile (EN)" labelFa="سرنویس گوشی (فارسی)" valueEn={String(s.eyebrowMobileEn ?? '')} valueFa={String(s.eyebrowMobileFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowMobileEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowMobileFa: v })} />
        <ImageField label={locale === 'fa' ? 'جلد شناور گوشی (عمودی)' : 'Floating cover — mobile (portrait)'} value={String(s.coverImageMobile ?? '')} onChange={(v) => onPatch(section.id, { coverImageMobile: v })} t={t.admin} />
      </MobileVariantBox>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.slides} ({slides.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setSlides([...slides, { image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', textEn: '', textFa: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addSlide}
        </Button>
      </div>
      {slides.map((sl, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...slides]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSlides(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === slides.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...slides]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setSlides(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSlide} onClick={() => setSlides(slides.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(sl.image ?? '')} onChange={(v) => setSlide(i, { image: v })} t={t.admin} />
          <MobileVariantBox locale={locale} filled={mobileFilled([sl.imageMobile, sl.eyebrowMobileEn, sl.eyebrowMobileFa, sl.titleMobileEn, sl.titleMobileFa, sl.textMobileEn, sl.textMobileFa])}>
            <ImageField label={locale === 'fa' ? 'تصویر گوشی (عمودی ۹:۱۶)' : 'Mobile image (portrait 9:16)'} value={String(sl.imageMobile ?? '')} onChange={(v) => setSlide(i, { imageMobile: v })} t={t.admin} />
            <BilingualPair labelEn="Scene label — mobile (EN)" labelFa="برچسب صحنهٔ گوشی (فارسی)" valueEn={String(sl.eyebrowMobileEn ?? '')} valueFa={String(sl.eyebrowMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowMobileEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowMobileFa: v })} />
            <BilingualPair labelEn="Title — mobile (EN)" labelFa="عنوان گوشی (فارسی)" valueEn={String(sl.titleMobileEn ?? '')} valueFa={String(sl.titleMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { titleMobileEn: v })} onChangeFa={(v) => setSlide(i, { titleMobileFa: v })} />
            <BilingualPair labelEn="Text — mobile (EN)" labelFa="متن گوشی (فارسی)" valueEn={String(sl.textMobileEn ?? '')} valueFa={String(sl.textMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { textMobileEn: v })} onChangeFa={(v) => setSlide(i, { textMobileFa: v })} rows={2} />
          </MobileVariantBox>
          <BilingualPair labelEn="Scene label (EN)" labelFa="برچسب صحنه (فارسی)" valueEn={String(sl.eyebrowEn ?? '')} valueFa={String(sl.eyebrowFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(sl.titleEn ?? '')} valueFa={String(sl.titleFa ?? '')} onChangeEn={(v) => setSlide(i, { titleEn: v })} onChangeFa={(v) => setSlide(i, { titleFa: v })} />
          <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(sl.textEn ?? '')} valueFa={String(sl.textFa ?? '')} onChangeEn={(v) => setSlide(i, { textEn: v })} onChangeFa={(v) => setSlide(i, { textFa: v })} rows={2} />
        </div>
      ))}
    </div>
  )
}

/** CATEGORY_CAROUSEL — headings + category slug list. */
function CarouselSectionEditor({ section, onPatch }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void }) {
  const slugs = ((section.settings.slugs as string[] | undefined) ?? []).join(', ')
  return (
    <div className="space-y-3">
      <BilingualPair labelEn="Heading (EN)" labelFa="عنوان (فارسی)" valueEn={String(section.settings.headingEn ?? '')} valueFa={String(section.settings.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn="Description (EN)" labelFa="توضیح (فارسی)" valueEn={String(section.settings.descriptionEn ?? '')} valueFa={String(section.settings.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <Field label="Category slugs (comma-separated)">
        <SectionText value={slugs} onChange={(v) => onPatch(section.id, { slugs: v.split(',').map((x) => x.trim()).filter(Boolean) })} dir="ltr" placeholder="fiction, poetry, history" mono />
      </Field>
    </div>
  )
}

/** EDITORIAL_FEATURE — layout/background/image/texts/CTA. This is the
 *  “highlight ONE article / ONE author” module («From the journal»,
 *  «From the author»): the admin can place any number of them anywhere. */
function EditorialSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const bg = String(s.bg ?? 'paper')
  const bgIsPreset = ['white', 'soft', 'paper', 'brand'].includes(bg)
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Layout">
          <select value={String(s.layout ?? 'image-left')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="image-left">image-left</option>
            <option value="image-right">image-right</option>
            <option value="stacked">stacked</option>
          </select>
        </Field>
        <Field label={t.admin.bgColor}>
          <select value={bgIsPreset ? bg : 'custom'} onChange={(e) => onPatch(section.id, { bg: e.target.value === 'custom' ? '#EAF4F8' : e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="white">{t.admin.bgWhite}</option>
            <option value="soft">{t.admin.bgSoft}</option>
            <option value="paper">{t.admin.bgPaper}</option>
            <option value="brand">{t.admin.bgBrand}</option>
            <option value="custom">{t.admin.bgCustom}</option>
          </select>
        </Field>
        <Field label={t.admin.minHeight}>
          <select value={String(s.minH ?? 600)} onChange={(e) => onPatch(section.id, { minH: Number(e.target.value) })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="480">480 px</option>
            <option value="600">600 px</option>
            <option value="720">720 px</option>
          </select>
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Checkbox checked={Boolean(s.accentOrange)} onCheckedChange={(v) => onPatch(section.id, { accentOrange: v === true })} /> accent orange
          </label>
        </div>
      </div>
      {!bgIsPreset && (
        <Field label={`${t.admin.bgColor} (hex)`}>
          <SectionText value={bg} onChange={(v) => onPatch(section.id, { bg: v })} dir="ltr" placeholder="#EAF4F8" mono />
        </Field>
      )}
      <ImageField label={t.admin.slideImage} value={String(s.image ?? '')} onChange={(v) => onPatch(section.id, { image: v })} t={t.admin} />
      <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(s.eyebrowEn ?? '')} valueFa={String(s.eyebrowFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowFa: v })} />
      <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(s.titleEn ?? '')} valueFa={String(s.titleFa ?? '')} onChangeEn={(v) => onPatch(section.id, { titleEn: v })} onChangeFa={(v) => onPatch(section.id, { titleFa: v })} />
      <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(s.textEn ?? '')} valueFa={String(s.textFa ?? '')} onChangeEn={(v) => onPatch(section.id, { textEn: v })} onChangeFa={(v) => onPatch(section.id, { textFa: v })} rows={3} />
      <BilingualPair labelEn="Quote (EN)" labelFa="نقل‌قول (فارسی)" valueEn={String(s.quoteEn ?? '')} valueFa={String(s.quoteFa ?? '')} onChangeEn={(v) => onPatch(section.id, { quoteEn: v })} onChangeFa={(v) => onPatch(section.id, { quoteFa: v })} rows={2} />
      <BilingualPair labelEn="Attribution (EN)" labelFa="منبع (فارسی)" valueEn={String(s.attributionEn ?? '')} valueFa={String(s.attributionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { attributionEn: v })} onChangeFa={(v) => onPatch(section.id, { attributionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t.admin.ctaLabel}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
        <Field label={t.admin.ctaLink}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/articles/…" mono /></Field>
      </div>
    </div>
  )
}
