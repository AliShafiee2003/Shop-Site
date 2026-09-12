'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Loader2, Plus, ChevronUp, Inbox, Trash2, CalendarClock, BookUser, Download, Megaphone, Check, X, Ban, Search, Pencil, Tags, Building2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge, Spinner, EmptyState } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { AdminCategoryRow } from '@/components/views/admin/shared'

/* ───────────────────────── Admin: discount codes ───────────────────────── */

interface DiscountRow {
  id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number
  minSubtotalMinor: number; maxRedemptions: number | null; timesUsed: number
  paidOrders: number; givenAwayMinor: number
  startsAt: string | null; endsAt: string | null; isActive: boolean
  noteEn: string | null; noteFa: string | null; createdAt: string
  scope?: DiscountScope
  scopeResolved?: ScopeSel
}

/** Task 50 — discount eligibility scope. Empty lists = whole catalog. */
interface DiscountScope {
  productIds: string[]; categoryIds: string[]; publisherNames: string[]; personIds: string[]
}

/** Labelled scope entries (ids resolved to names for display/editing). */
interface ScopeLabel { id: string; en: string; fa: string }
interface ScopeSel {
  products: ScopeLabel[]; categories: ScopeLabel[]; publishers: ScopeLabel[]; people: ScopeLabel[]
}

const emptyScopeSel = (): ScopeSel => ({ products: [], categories: [], publishers: [], people: [] })

const scopeSelIsLimited = (s: ScopeSel): boolean =>
  s.products.length > 0 || s.categories.length > 0 || s.publishers.length > 0 || s.people.length > 0

/** ScopeSel → API payload (ids only). */
const scopeSelToPayload = (s: ScopeSel): DiscountScope => ({
  productIds: s.products.map((x) => x.id),
  categoryIds: s.categories.map((x) => x.id),
  publisherNames: s.publishers.map((x) => x.id),
  personIds: s.people.map((x) => x.id),
})

const scopePayloadToSel = (resolved?: ScopeSel): ScopeSel => ({
  products: resolved?.products ?? [],
  categories: resolved?.categories ?? [],
  publishers: resolved?.publishers ?? [],
  people: resolved?.people ?? [],
})

/** Scope editor — pick the products / categories / publishers / contributors a
 *  code applies to. mode='all' (empty payload) or 'limited' (explicit selection;
 *  matches the engine in lib/server/discounts.ts: OR semantics across the lists). */
function DiscountScopeEditor({ mode, onModeChange, value, onChange, publishers }: {
  mode: 'all' | 'limited'
  onModeChange: (m: 'all' | 'limited') => void
  value: ScopeSel
  onChange: (s: ScopeSel) => void
  publishers: string[]
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const limited = mode === 'limited'

  // Reference data (admin endpoints include ids + bilingual names)
  const [cats, setCats] = useState<AdminCategoryRow[] | null>(null)
  const [people, setPeople] = useState<{ id: string; nameEn: string | null; nameFa: string | null }[] | null>(null)
  useEffect(() => {
    let alive = true
    apiGet<{ categories: AdminCategoryRow[] }>('/api/admin/categories').then((r) => { if (alive) setCats(r.categories ?? []) }).catch(() => { if (alive) setCats([]) })
    apiGet<{ people: { id: string; nameEn: string | null; nameFa: string | null }[] }>('/api/admin/people').then((r) => { if (alive) setPeople(r.people ?? []) }).catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [])

  // Product search (debounced, like the related picker)
  const [pq, setPq] = useState('')
  const [pResults, setPResults] = useState<{ id: string; title: string; titleFa: string | null }[]>([])
  const [pSearching, setPSearching] = useState(false)
  useEffect(() => {
    if (!limited) return
    const timer = setTimeout(async () => {
      setPSearching(true)
      try {
        const r = await apiGet<{ items: { id: string; title: string; titleFa?: string | null }[] }>(
          `/api/admin/products?locale=en${pq.trim() ? `&q=${encodeURIComponent(pq.trim())}` : ''}`,
        )
        setPResults((r.items ?? []).slice(0, 8).map((p) => ({ id: p.id, title: p.title, titleFa: p.titleFa ?? null })))
      } catch { setPResults([]) } finally { setPSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [limited, pq])

  // People filter (client-side)
  const [personQ, setPersonQ] = useState('')
  const peopleFiltered = useMemo(() => {
    if (!people) return []
    const q = personQ.trim().toLowerCase()
    const base = people.filter((p) => !value.people.some((x) => x.id === p.id))
    if (!q) return base.slice(0, 6)
    return base.filter((p) => (p.nameEn ?? '').toLowerCase().includes(q) || (p.nameFa ?? '').includes(personQ.trim())).slice(0, 6)
  }, [people, personQ, value.people])

  const toggle = (key: 'products' | 'categories' | 'publishers' | 'people', label: ScopeLabel) => {
    const list = value[key]
    onChange({ ...value, [key]: list.some((x) => x.id === label.id) ? list.filter((x) => x.id !== label.id) : [...list, label] })
  }
  const removeAt = (key: 'products' | 'categories' | 'publishers' | 'people', id: string) =>
    onChange({ ...value, [key]: value[key].filter((x) => x.id !== id) })

  const modeBtn = (active: boolean) =>
    cn('h-8 rounded-md px-3 text-xs font-semibold transition-colors', active ? 'bg-brand text-white shadow-sm' : 'bg-white text-ink-2 border border-line hover:bg-soft')

  const chip = (key: 'products' | 'categories' | 'publishers' | 'people', l: ScopeLabel) => (
    <span key={l.id} className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 py-0.5 pe-1 ps-2 text-xs text-brand">
      <span className="truncate">{isFa ? l.fa || l.en : l.en || l.fa}</span>
      <button type="button" onClick={() => removeAt(key, l.id)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-brand/70 transition hover:bg-brand/15 hover:text-brand" aria-label={`${t.common.delete} ${l.en}`}>
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )

  const sectionCls = 'rounded-md border border-line bg-white/70 p-3'
  const headCls = 'mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3'

  return (
    <div className={cn('rounded-lg border p-3.5 transition-colors', limited ? 'border-brand/35 bg-brand-soft/20' : 'border-line bg-white/50')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-ink">{t.admin.discountScopeTitle}</p>
        <div className="flex items-center gap-1.5" role="group" aria-label={t.admin.discountScopeTitle}>
          <button type="button" className={modeBtn(mode === 'all')} aria-pressed={mode === 'all'} onClick={() => onModeChange('all')}>
            {t.admin.discountScopeAll}
          </button>
          <button type="button" className={modeBtn(limited)} aria-pressed={limited} onClick={() => onModeChange('limited')}>
            {t.admin.discountScopeLimited}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{t.admin.discountScopeHint}</p>

      {limited && (
        <div className="mt-3 space-y-3">
          {scopeSelIsLimited(value) === false && (
            <p className="rounded-md bg-orange-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-orange-dark">{t.admin.discountScopeEmptyWarn}</p>
          )}

          {/* Products — search + chips */}
          <div className={sectionCls}>
            <p className={headCls}><Package className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopeProducts} <span className="text-brand">{value.products.length > 0 && `(${value.products.length})`}</span></p>
            <Input value={pq} onChange={(e) => setPq(e.target.value)} dir="ltr" placeholder={t.admin.discountScopeSearchProducts} className="h-8 text-xs" />
            {pSearching && <p className="mt-1 text-[11px] text-ink-3">…</p>}
            {!pSearching && pResults.length > 0 && (
              <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {pResults.filter((p) => !value.products.some((x) => x.id === p.id)).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle('products', { id: p.id, en: p.title, fa: p.titleFa ?? p.title })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand">
                      <span className="truncate">{p.title}</span>
                      <Plus className="h-3 w-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {value.products.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{value.products.map((l) => chip('products', l))}</div>}
          </div>

          {/* Categories — toggle chips */}
          <div className={sectionCls}>
            <p className={headCls}><Tags className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopeCategories}</p>
            {!cats ? <p className="text-[11px] text-ink-3">…</p> : cats.length === 0 ? <p className="text-[11px] text-ink-3">—</p> : (
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const on = value.categories.some((x) => x.id === c.id)
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle('categories', { id: c.id, en: c.nameEn ?? c.slug, fa: c.nameFa ?? c.nameEn ?? c.slug })} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition', on ? 'bg-brand text-white shadow-sm' : 'border border-line bg-white text-ink-2 hover:bg-soft')}>
                      {isFa ? c.nameFa ?? c.nameEn ?? c.slug : c.nameEn ?? c.slug}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Publishers — dropdown + chips */}
          <div className={sectionCls}>
            <p className={headCls}><Building2 className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopePublishers}</p>
            {publishers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggle('publishers', { id: e.target.value, en: e.target.value, fa: e.target.value }) }}
                  className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                  aria-label={t.admin.discountScopeSelectPublisher}
                >
                  <option value="">{t.admin.discountScopeSelectPublisher}</option>
                  {publishers.filter((p) => !value.publishers.some((x) => x.id === p)).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {value.publishers.length > 0 && <div className="flex flex-wrap gap-1.5">{value.publishers.map((l) => chip('publishers', l))}</div>}
              </div>
            ) : <p className="text-[11px] text-ink-3">—</p>}
          </div>

          {/* People — searchable + chips */}
          <div className={sectionCls}>
            <p className={headCls}><BookUser className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopePeople}</p>
            <Input value={personQ} onChange={(e) => setPersonQ(e.target.value)} placeholder={t.admin.discountScopeSearchPeople} className="h-8 text-xs" />
            {!people ? <p className="mt-1 text-[11px] text-ink-3">…</p> : peopleFiltered.length > 0 && (
              <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {peopleFiltered.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle('people', { id: p.id, en: p.nameEn ?? p.id, fa: p.nameFa ?? p.nameEn ?? p.id })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand">
                      <span className="truncate">{isFa ? p.nameFa ?? p.nameEn : p.nameEn ?? p.nameFa}</span>
                      <Plus className="h-3 w-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {value.people.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{value.people.map((l) => chip('people', l))}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact scope summary for table rows — «همهٔ کالاها» or labelled chips. */
function DiscountScopeSummary({ sel }: { sel?: ScopeSel }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  if (!sel || !scopeSelIsLimited(sel)) {
    return <span className="text-[11px] text-ink-3">{t.admin.discountScopeAppliesAll}</span>
  }
  const parts: string[] = []
  const name = (l: ScopeLabel) => (isFa ? l.fa || l.en : l.en || l.fa)
  if (sel.products.length > 0) parts.push(sel.products.length === 1 ? name(sel.products[0]) : `${sel.products.length} ${isFa ? 'کالا' : 'products'}`)
  if (sel.categories.length > 0) parts.push(sel.categories.map(name).join('، '))
  if (sel.publishers.length > 0) parts.push(sel.publishers.map(name).join('، '))
  if (sel.people.length > 0) parts.push(sel.people.map(name).join('، '))
  const shown = parts.slice(0, 3)
  const rest = parts.length - shown.length
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      {shown.map((p, i) => (
        <span key={i} className="rounded-full bg-brand-soft/70 px-1.5 py-0.5 font-medium text-brand">{p}</span>
      ))}
      {rest > 0 && <span className="text-ink-3">+{rest}</span>}
    </span>
  )
}

interface PromoRow {
  id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number
  isActive: boolean; startsAt: string | null; endsAt: string | null
  noteEn: string | null; noteFa: string | null; inWindow?: boolean
  excludedProductIds?: string[]
}

interface AdminProductLite {
  id: string; title: string; titleEn: string | null; titleFa: string | null
  priceMinor: number | null; fixedPrice: boolean; status: string
}

/** Per-promotion product exclusion picker — exempted titles keep their list price. */
function PromoExclusionsDialog({ row, onSaved }: { row: PromoRow; onSaved: (ids: string[]) => void }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AdminProductLite[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setSelected(new Set(row.excludedProductIds ?? []))
    apiGet<{ items: AdminProductLite[] }>('/api/admin/products')
      .then((r) => { if (alive) setItems(r.items) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [open, row.id, row.excludedProductIds])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      await apiPatch(`/api/admin/promotions/${row.id}`, { excludedProductIds: [...selected] })
      toast({ title: t.admin.promoExcludedSaved })
      onSaved([...selected])
      setOpen(false)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const count = row.excludedProductIds?.length ?? 0
  const filtered = (items ?? []).filter((p) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return (p.titleEn ?? '').toLowerCase().includes(needle)
      || (p.titleFa ?? '').includes(needle)
      || p.title.toLowerCase().includes(needle)
  })
  const selectedSorted = [...selected]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className={cn('h-8 gap-1.5', count > 0 ? 'text-orange-dark hover:bg-orange-accent/10' : 'text-ink-3 hover:bg-soft')}
          aria-label={`${t.admin.promoExcludedBtn} — ${row.name}`}
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          {t.admin.promoExcludedBtn}
          {count > 0 && (
            <span className="rounded-full bg-orange-accent/15 px-1.5 py-px text-[10px] font-bold text-orange-dark bdi" dir="ltr">
              {locale === 'fa' ? faDigits(String(count)) : count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><Ban className="h-4 w-4" aria-hidden /></span>
            {t.admin.promoExcluded}
            {count > 0 && (
              <span className="rounded-full bg-orange-accent/15 px-2 py-0.5 text-xs font-semibold text-orange-dark">{tf(t.admin.promoExcludedCount, { n: count })}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-ink-3">{t.admin.promoExcludedHint}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.admin.promoExcludedSearch} className="h-9 ps-8" />
        </div>
        {!items ? (
          <div className="flex items-center gap-2 py-6 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">{t.common.empty}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto pe-1 scrollbar-slim">
            {filtered.map((p) => {
              const checked = selected.has(p.id)
              return (
                <li key={p.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                      checked ? 'border-orange-accent/45 bg-orange-accent/[0.07]' : 'border-line hover:bg-soft/60',
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} className="mt-0" aria-label={p.titleEn ?? p.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{isFa ? p.titleFa ?? p.titleEn ?? p.title : p.titleEn ?? p.title}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        {p.priceMinor != null ? <span className="bdi" dir="ltr">{formatMoney(p.priceMinor, locale)}</span> : null}
                        {p.fixedPrice && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">fixed-price</span>}
                        {p.status !== 'PUBLISHED' && <span>{t.admin.statusDraft}</span>}
                      </span>
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-orange-dark" aria-hidden />}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {items != null && selectedSorted.length === 0 && filtered.length > 0 && (
          <p className="text-[11px] text-ink-3">{t.admin.promoExcludedEmpty}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setOpen(false)}>{t.admin.close}</Button>
          <Button size="sm" className="h-9" disabled={busy || items == null} onClick={save}>
            {busy ? t.common.saving : t.admin.promoExcludedSave}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Sitewide auto promotion manager — one live promotion at a time. */
function AdminPromotionCard() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [rows, setRows] = useState<PromoRow[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [noteEn, setNoteEn] = useState('')
  const [noteFa, setNoteFa] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ promotions: PromoRow[] }>('/api/admin/promotions').then((r) => setRows(r.promotions)).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    const numericValue = Math.round(Number(value) * (type === 'PERCENT' ? 1 : 100))
    if (!name.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
      toast({ title: t.admin.promoFillRequired, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await apiPost('/api/admin/promotions', {
        name: name.trim(), type, value: numericValue,
        isActive: false,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        noteEn: noteEn || null, noteFa: noteFa || null,
      })
      toast({ title: t.admin.promoSaved })
      setName(''); setValue(''); setStartsAt(''); setEndsAt(''); setNoteEn(''); setNoteFa(''); setShowForm(false)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const setActive = async (row: PromoRow, active: boolean) => {
    try {
      await apiPatch(`/api/admin/promotions/${row.id}`, { isActive: active })
      toast({ title: active ? t.admin.promoActivated : t.admin.promoDeactivated })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const remove = async (row: PromoRow) => {
    await apiDelete(`/api/admin/promotions/${row.id}`)
    toast({ title: t.admin.promoDeleted })
    load()
  }

  const fmt = (r: PromoRow) => (r.type === 'PERCENT' ? `${r.value}%` : formatMoney(r.value, locale))
  const live = rows?.find((r) => r.isActive && r.inWindow !== false)

  return (
    <section className="mb-6 rounded-lg border border-orange-accent/25 bg-gradient-to-b from-orange-accent/[0.06] to-transparent p-4" aria-label={t.admin.promoAuto}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-accent/15 text-orange-dark">
            <Megaphone className="h-4.5 w-4.5 mirror-rtl" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">{t.admin.promoAuto}</h3>
            <p className="text-xs text-ink-3">{t.admin.promoAutoHint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
              <span className="bdi" dir="ltr">{fmt(live)}</span> · {t.admin.promoLive}
            </span>
          ) : null}
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
            {showForm ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {t.admin.promoNew}
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          className="mt-4 grid gap-3 rounded-md border border-line bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}
        >
          <div>
            <Label htmlFor="pr-name" className="mb-1 text-xs">{t.admin.promoName}</Label>
            <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" maxLength={80} required />
          </div>
          <div>
            <Label htmlFor="pr-type" className="mb-1 text-xs">{t.admin.discountType}</Label>
            <select id="pr-type" value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
              <option value="PERCENT">{t.admin.discountPercent}</option>
              <option value="FIXED">{t.admin.discountFixed}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="pr-value" className="mb-1 text-xs">{type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
            <Input id="pr-value" type="number" min={type === 'PERCENT' ? 1 : 1} max={type === 'PERCENT' ? 90 : 10000} step={type === 'PERCENT' ? 1 : '0.5'} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" className="h-9" required />
          </div>
          <div>
            <Label htmlFor="pr-starts" className="mb-1 text-xs">{t.admin.promoStarts}</Label>
            <Input id="pr-starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} dir="ltr" className="h-9" />
          </div>
          <div>
            <Label htmlFor="pr-ends" className="mb-1 text-xs">{t.admin.promoEnds}</Label>
            <Input id="pr-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} dir="ltr" className="h-9" />
          </div>
          <div>
            <Label htmlFor="pr-note-en" className="mb-1 text-xs">{t.admin.promoNoteEn}</Label>
            <Input id="pr-note-en" value={noteEn} onChange={(e) => setNoteEn(e.target.value)} className="h-9" maxLength={160} placeholder="Autumn sale — 10% off everything" />
          </div>
          <div lang="fa" dir="rtl">
            <Label htmlFor="pr-note-fa" className="mb-1 text-xs">{t.admin.promoNoteFa}</Label>
            <Input id="pr-note-fa" value={noteFa} onChange={(e) => setNoteFa(e.target.value)} className="h-9" maxLength={160} placeholder="فروش پاییزه — ۱۰٪ تخفیف" />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" className="h-9 w-full" disabled={busy}>{busy ? t.common.saving : t.admin.promoSave}</Button>
          </div>
        </form>
      )}

      {!rows ? (
        <div className="mt-4"><Spinner label={t.common.loading} /></div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t.admin.promoNone}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => {
            const now = new Date()
            const expired = r.endsAt != null && new Date(r.endsAt) < now
            const notStarted = r.startsAt != null && new Date(r.startsAt) > now
            const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000))
            return (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-white px-3 py-2.5', !r.isActive && 'opacity-75')}>
                <Switch checked={r.isActive} onCheckedChange={(v) => setActive(r, v)} disabled={expired} aria-label={`${r.name} ${r.isActive ? t.admin.promoDeactivated : t.admin.promoActivate}`} />
                <span className="font-semibold text-ink bdi">{isFa ? r.noteFa ?? r.name : r.noteEn ?? r.name}</span>
                <span className="rounded bg-orange-accent/10 px-1.5 py-0.5 font-mono text-xs font-bold text-orange-dark bdi" dir="ltr">{fmt(r)}</span>
                {notStarted && !expired ? (
                  <Badge tone="warning"><CalendarClock className="me-1 h-3 w-3" aria-hidden />{tf(t.admin.promoStartsIn, { d: daysUntil(r.startsAt!) })}</Badge>
                ) : expired ? (
                  <Badge tone="warning">{t.admin.promoExpired}</Badge>
                ) : r.endsAt ? (
                  <Badge tone="success"><CalendarClock className="me-1 h-3 w-3" aria-hidden />{tf(t.admin.promoEndsIn, { d: daysUntil(r.endsAt) })}</Badge>
                ) : null}
                {r.endsAt ? (
                  <span className="inline-flex items-center gap-1 text-xs text-ink-3"><CalendarClock className="h-3 w-3" aria-hidden />{formatDate(r.endsAt, locale)}</span>
                ) : null}
                <span className="ms-auto flex items-center gap-1">
                  <PromoExclusionsDialog
                    row={r}
                    onSaved={(ids) => setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, excludedProductIds: ids } : x)))}
                  />
                  <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.admin.promoDelete} ${r.name}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Per-code usage list (orders) + CSV export, shown in a dialog. */
function DiscountUsageDialog({ row, trigger }: { row: DiscountRow; trigger: React.ReactNode }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ orders: { orderNumber: string; email: string; status: string; paymentStatus: string; discountMinor: number; totalMinor: number; createdAt: string }[]; paidCount: number; givenAwayMinor: number } | null>(null)

  const load = useCallback(() => {
    apiGet<{ orders: { orderNumber: string; email: string; status: string; paymentStatus: string; discountMinor: number; totalMinor: number; createdAt: string }[]; paidCount: number; givenAwayMinor: number }>(`/api/admin/discounts/${row.id}`).then(setData).catch(() => setData(null))
  }, [row.id])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); else setData(null) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" style={{ maxWidth: '42rem' }} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {t.admin.discountUsageTitle}
            <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-brand bdi" dir="ltr">{row.code}</span>
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <Spinner label={t.common.loading} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
              <span><span className="font-semibold text-ink bdi">{data.paidCount}</span> {t.admin.discountOrders}</span>
              <span>{t.admin.discountGiven}: <span className="font-semibold text-error bdi">−{formatMoney(data.givenAwayMinor, locale)}</span></span>
              <a
                href={`/api/admin/discounts/${row.id}?format=csv`}
                className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-brand transition hover:bg-brand-soft"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.discountUsageExport}
              </a>
            </div>
            {data.orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">{t.admin.discountUsageEmpty}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {data.orders.map((o) => (
                  <li key={o.orderNumber} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="font-mono text-xs font-semibold text-brand bdi" dir="ltr">{o.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
                    <Badge tone={o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED' ? 'success' : o.paymentStatus === 'FAILED' ? 'error' : 'warning'}>
                      {o.paymentStatus}
                    </Badge>
                    <span className="font-semibold text-success bdi">−{formatMoney(o.discountMinor, locale)}</span>
                    <span className="w-20 text-end text-xs text-ink-3">{formatDate(o.createdAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AdminDiscounts() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [rows, setRows] = useState<DiscountRow[] | null>(null)
  const [publishers, setPublishers] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  // create form state
  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('')
  const [minEur, setMinEur] = useState('')
  const [maxRed, setMaxRed] = useState('')
  const [noteEn, setNoteEn] = useState('')
  const [noteFa, setNoteFa] = useState('')
  const [scope, setScope] = useState<ScopeSel>(emptyScopeSel())
  const [scopeMode, setScopeMode] = useState<'all' | 'limited'>('all')
  const [busy, setBusy] = useState(false)
  // Edit-after-create (audit P1: the PATCH API always accepted edits — UI never offered them)
  const [editing, setEditing] = useState<DiscountRow | null>(null)
  const [edValue, setEdValue] = useState('')
  const [edMin, setEdMin] = useState('')
  const [edMax, setEdMax] = useState('')
  const [edStarts, setEdStarts] = useState('')
  const [edEnds, setEdEnds] = useState('')
  const [edNoteEn, setEdNoteEn] = useState('')
  const [edNoteFa, setEdNoteFa] = useState('')
  const [edScope, setEdScope] = useState<ScopeSel>(emptyScopeSel())
  const [edScopeMode, setEdScopeMode] = useState<'all' | 'limited'>('all')
  const [edBusy, setEdBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ discounts: DiscountRow[]; publishers?: string[] }>('/api/admin/discounts')
      .then((r) => { setRows(r.discounts); setPublishers(r.publishers ?? []) })
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    const numericValue = Math.round(Number(value) * (type === 'PERCENT' ? 1 : 100))
    if (!code.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
      toast({ title: t.admin.discountFillRequired, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await apiPost('/api/admin/discounts', {
        code: code.trim(),
        type,
        value: numericValue,
        minSubtotalMinor: minEur ? Math.round(Number(minEur) * 100) : 0,
        maxRedemptions: maxRed ? Number(maxRed) : null,
        noteEn: noteEn || null,
        noteFa: noteFa || null,
        scope: scopeMode === 'limited' ? scopeSelToPayload(scope) : { productIds: [], categoryIds: [], publisherNames: [], personIds: [] },
      })
      toast({ title: t.admin.discountCreated })
      setCode(''); setValue(''); setMinEur(''); setMaxRed(''); setNoteEn(''); setNoteFa(''); setScope(emptyScopeSel()); setScopeMode('all'); setShowForm(false)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const toggle = async (row: DiscountRow) => {
    await apiPatch(`/api/admin/discounts/${row.id}`, { isActive: !row.isActive })
    toast({ title: row.isActive ? t.admin.discountDisabled : t.admin.discountEnabled })
    load()
  }

  const remove = async (row: DiscountRow) => {
    // Audit: destructive actions must confirm (order snapshots survive, but still).
    if (!window.confirm(tf(t.admin.confirmDelete, { name: row.code }))) return
    await apiDelete(`/api/admin/discounts/${row.id}`)
    toast({ title: t.admin.discountDeleted })
    load()
  }

  const openEdit = (row: DiscountRow) => {
    setEditing(row)
    setEdValue(row.type === 'PERCENT' ? String(row.value) : (row.value / 100).toFixed(2))
    setEdMin(row.minSubtotalMinor > 0 ? (row.minSubtotalMinor / 100).toFixed(2) : '')
    setEdMax(row.maxRedemptions !== null ? String(row.maxRedemptions) : '')
    setEdStarts(row.startsAt ? row.startsAt.slice(0, 10) : '')
    setEdEnds(row.endsAt ? row.endsAt.slice(0, 10) : '')
    setEdNoteEn(row.noteEn ?? '')
    setEdNoteFa(row.noteFa ?? '')
    setEdScope(scopePayloadToSel(row.scopeResolved))
    setEdScopeMode(row.scope && scopeSelIsLimited(scopePayloadToSel(row.scopeResolved)) ? 'limited' : 'all')
  }

  const saveEdit = async () => {
    if (!editing) return
    const numericValue = editing.type === 'PERCENT'
      ? Math.round(Number(edValue))
      : Math.round(Number(edValue) * 100)
    const nextScope = edScopeMode === 'limited' ? scopeSelToPayload(edScope) : { productIds: [], categoryIds: [], publisherNames: [], personIds: [] }
    const scopeChanged = JSON.stringify(nextScope) !== JSON.stringify(editing.scope ?? { productIds: [], categoryIds: [], publisherNames: [], personIds: [] })
    setEdBusy(true)
    try {
      await apiPatch(`/api/admin/discounts/${editing.id}`, {
        ...(Number.isFinite(numericValue) && numericValue > 0 && numericValue !== editing.value ? { value: numericValue } : {}),
        ...(edMin !== '' || editing.minSubtotalMinor > 0 ? { minSubtotalMinor: edMin ? Math.round(Number(edMin) * 100) : 0 } : {}),
        ...(edMax !== '' || editing.maxRedemptions !== null ? { maxRedemptions: edMax ? Number(edMax) : null } : {}),
        ...(edStarts || editing.startsAt ? { startsAt: edStarts ? new Date(edStarts + 'T00:00:00Z').toISOString() : null } : {}),
        ...(edEnds || editing.endsAt ? { endsAt: edEnds ? new Date(edEnds + 'T23:59:59Z').toISOString() : null } : {}),
        ...(edNoteEn !== (editing.noteEn ?? '') ? { noteEn: edNoteEn || null } : {}),
        ...(edNoteFa !== (editing.noteFa ?? '') ? { noteFa: edNoteFa || null } : {}),
        ...(scopeChanged ? { scope: nextScope } : {}),
      })
      toast({ title: t.admin.discountUpdated })
      setEditing(null)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setEdBusy(false) }
  }

  const fmtValue = (r: DiscountRow) => (r.type === 'PERCENT' ? `${r.value}%` : formatMoney(r.value, locale))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.admin.discounts}</h2>
          <p className="text-xs text-ink-3">{t.admin.discountsHint}</p>
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {t.admin.discountNew}
        </Button>
      </div>

      <AdminPromotionCard />
      {showForm && (
        <form
          className="mb-5 grid gap-3 rounded-lg border border-brand/20 bg-brand-soft/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}
        >
          <div>
            <Label htmlFor="dc-code" className="mb-1 text-xs">{t.admin.discountCodeLabel}</Label>
            <Input id="dc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} dir="ltr" placeholder="SPRING25" className="h-9 font-mono uppercase" maxLength={40} required />
          </div>
          <div>
            <Label htmlFor="dc-type" className="mb-1 text-xs">{t.admin.discountType}</Label>
            <select id="dc-type" value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
              <option value="PERCENT">{t.admin.discountPercent}</option>
              <option value="FIXED">{t.admin.discountFixed}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="dc-value" className="mb-1 text-xs">{type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
            <Input id="dc-value" type="number" min={type === 'PERCENT' ? 1 : 0.5} max={type === 'PERCENT' ? 90 : 10000} step={type === 'PERCENT' ? 1 : '0.5'} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" className="h-9" required />
          </div>
          <div>
            <Label htmlFor="dc-min" className="mb-1 text-xs">{t.admin.discountMinEur}</Label>
            <Input id="dc-min" type="number" min={0} step="0.5" value={minEur} onChange={(e) => setMinEur(e.target.value)} dir="ltr" placeholder="0" className="h-9" />
          </div>
          <div>
            <Label htmlFor="dc-max" className="mb-1 text-xs">{t.admin.discountMaxRed}</Label>
            <Input id="dc-max" type="number" min={1} step={1} value={maxRed} onChange={(e) => setMaxRed(e.target.value)} dir="ltr" placeholder="∞" className="h-9" />
          </div>
          <div>
            <Label htmlFor="dc-note-en" className="mb-1 text-xs">{t.admin.discountNoteEn}</Label>
            <Input id="dc-note-en" value={noteEn} onChange={(e) => setNoteEn(e.target.value)} className="h-9" maxLength={200} />
          </div>
          <div lang="fa" dir="rtl">
            <Label htmlFor="dc-note-fa" className="mb-1 text-xs">{t.admin.discountNoteFa}</Label>
            <Input id="dc-note-fa" value={noteFa} onChange={(e) => setNoteFa(e.target.value)} className="h-9" maxLength={200} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <DiscountScopeEditor mode={scopeMode} onModeChange={setScopeMode} value={scope} onChange={setScope} publishers={publishers} />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" className="h-9 w-full" disabled={busy}>{busy ? t.common.saving : t.admin.discountCreate}</Button>
          </div>
        </form>
      )}

      {!rows ? (
        <Spinner label={t.common.loading} />
      ) : rows.length === 0 ? (
        <EmptyState title={t.admin.discountNoneYet} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-soft/60 text-xs uppercase tracking-wide text-ink-3">
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountCodeLabel}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountType}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.discountMinEur}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t.admin.discountUsage}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.discountGiven}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountWindow}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t.admin.status}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {rows.map((r) => {
                const exhausted = r.maxRedemptions !== null && r.timesUsed >= r.maxRedemptions
                const expired = r.endsAt !== null && new Date(r.endsAt) < new Date()
                return (
                  <tr key={r.id} className={cn('transition-colors hover:bg-soft/40', (!r.isActive || exhausted || expired) && 'opacity-70')}>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-brand bdi" dir="ltr">{r.code}</span>
                      {(isFa ? r.noteFa : r.noteEn) && <p className="mt-1 max-w-[180px] truncate text-[11px] text-ink-3">{isFa ? r.noteFa : r.noteEn}</p>}
                      <p className="mt-1 max-w-[200px]">
                        <DiscountScopeSummary sel={r.scopeResolved} />
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink bdi">{fmtValue(r)}</td>
                    <td className="px-3 py-2.5 text-end text-ink-2 bdi">{r.minSubtotalMinor > 0 ? formatMoney(r.minSubtotalMinor, locale) : '—'}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      <span className={cn('font-semibold', exhausted && 'text-error')}>{r.timesUsed}</span>
                      <span className="text-ink-3"> / {r.maxRedemptions ?? '∞'}</span>
                      {r.paidOrders > 0 && <p className="text-[11px] text-ink-3">{r.paidOrders} {t.admin.discountOrders}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums text-ink-2 bdi">{r.givenAwayMinor > 0 ? `−${formatMoney(r.givenAwayMinor, locale)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">
                      {r.endsAt ? (
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden />{formatDate(r.endsAt, locale)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Switch checked={r.isActive} onCheckedChange={() => toggle(r)} aria-label={`${r.code} ${r.isActive ? t.admin.discountDisable : t.admin.discountEnable}`} disabled={exhausted || expired} />
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8 text-ink-2 hover:bg-soft" onClick={() => openEdit(r)} aria-label={`${t.admin.editDiscount} ${r.code}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <DiscountUsageDialog
                          row={r}
                          trigger={
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-ink-2 hover:bg-soft" aria-label={`${t.admin.discountUsage} ${r.code}`}>
                              <Inbox className="h-3.5 w-3.5" aria-hidden />
                              {r.paidOrders}
                            </Button>
                          }
                        />
                        <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.common.delete} ${r.code}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog — value/min/max/window/notes/scope (PATCH API existed since day one) */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t.admin.editDiscount}
              {editing && <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand bdi" dir="ltr">{editing.code}</span>}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 text-xs">{editing.type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
                  <Input type="number" min={editing.type === 'PERCENT' ? 1 : 0.5} step={editing.type === 'PERCENT' ? 1 : '0.5'} value={edValue} onChange={(e) => setEdValue(e.target.value)} dir="ltr" className="h-9" />
                </div>
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountMinEur}</Label>
                  <Input type="number" min={0} step="0.5" value={edMin} onChange={(e) => setEdMin(e.target.value)} dir="ltr" className="h-9" />
                </div>
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountMaxRed}</Label>
                  <Input type="number" min={1} step={1} value={edMax} onChange={(e) => setEdMax(e.target.value)} dir="ltr" placeholder="∞" className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 text-xs">{t.admin.startsAt}</Label>
                    <Input type="date" value={edStarts} onChange={(e) => setEdStarts(e.target.value)} dir="ltr" className="h-9" />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs">{t.admin.endsAt}</Label>
                    <Input type="date" value={edEnds} onChange={(e) => setEdEnds(e.target.value)} dir="ltr" className="h-9" />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountNoteEn}</Label>
                  <Input value={edNoteEn} onChange={(e) => setEdNoteEn(e.target.value)} className="h-9" maxLength={200} />
                </div>
                <div lang="fa" dir="rtl">
                  <Label className="mb-1 text-xs">{t.admin.discountNoteFa}</Label>
                  <Input value={edNoteFa} onChange={(e) => setEdNoteFa(e.target.value)} className="h-9" maxLength={200} />
                </div>
              </div>
              <DiscountScopeEditor mode={edScopeMode} onModeChange={setEdScopeMode} value={edScope} onChange={setEdScope} publishers={publishers} />
              <p className="text-[11px] text-ink-3">{editing.type === 'PERCENT' ? '1–90%' : '>= 0.50 €'}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                <Button size="sm" className="h-9" disabled={edBusy} onClick={saveEdit}>{edBusy ? t.common.saving : t.common.save}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
