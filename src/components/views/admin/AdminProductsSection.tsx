'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Minus, ChevronUp, ChevronDown, Trash2, Download, BellRing, Layers, Check, Upload, FileUp, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDateTime } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { FullProductEditor } from '@/components/views/admin/ProductEditor'

interface AdminProduct { id: string; slug: string; status: string; title: string; titleFa: string; coverUrl?: string; priceMinor: number; stock: number; isFeatured: boolean; fixedPrice: boolean; completeness: { en: string; fa: string }; updatedAt: string }

const FORMAT_LABEL: Record<string, string> = { PAPERBACK: 'Paperback', HARDCOVER: 'Hardcover', SPECIAL: 'Special' }

interface VariantRow { id: string; sku: string; isbn13?: string | null; format: string; bookLanguage: string; editionLabel?: string | null; priceMinor: number; stock: number; lowStockThreshold: number; soldCount: number; isActive: boolean; waitingCount?: number }
interface TranslationRow { title: string; subtitle?: string | null; shortDescription?: string | null }
interface ProductEditorData {
  id: string; slug: string; status: string; coverUrl?: string | null; fixedPrice: boolean
  translations: Record<string, TranslationRow>
  variants: VariantRow[]
  priceHistory: { id: string; variantSku: string; oldPriceMinor: number | null; newPriceMinor: number; reason?: string | null; actorEmail?: string | null; effectiveAt: string }[]
}

export function AdminProducts() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [products, setProducts] = useState<AdminProduct[] | null>(null)
  const [q, setQ] = useState('')
  // Inline product editor state
  const [editId, setEditId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProductEditorData | null>(null)
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})
  const [stockDeltas, setStockDeltas] = useState<Record<string, number>>({})
  // Restock → notify flow: remember which restocked variants should ping their waiting customers
  const [notifyOnRestock, setNotifyOnRestock] = useState<Record<string, boolean>>({})
  // Bulk stock editor state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  // CSV product import dialog state
  const [importOpen, setImportOpen] = useState(false)
  // Full product editor (Task 27-f): 'new' = create, id = edit
  const [fullEdit, setFullEdit] = useState<string | null>(null)
  const [fullOpen, setFullOpen] = useState(false)
  // Pagination (server-side, Task 27)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20
  // Content editor state (phase 2): per-locale draft fields
  const [contentTab, setContentTab] = useState<'en' | 'fa'>('en')
  const [contentEdits, setContentEdits] = useState<Record<'en' | 'fa', { title: string; subtitle: string; shortDescription: string }>>({
    en: { title: '', subtitle: '', shortDescription: '' },
    fa: { title: '', subtitle: '', shortDescription: '' },
  })
  const [saving, setSaving] = useState(false)
  // Stable id array for the bulk dialog effect (hooks must run before any early return)
  const selectedIds = useMemo(() => [...selected], [selected])

  const load = useCallback(() => {
    apiGet<{ items: AdminProduct[]; total: number }>('/api/admin/products?locale=' + locale + `&page=${page}&pageSize=${PAGE_SIZE}` + (q ? `&q=${encodeURIComponent(q)}` : ''))
      .then((r) => { setProducts(r.items); setTotal(r.total ?? r.items.length) }).catch(() => setProducts([]))
  }, [locale, q, page])
  useEffect(() => { load() }, [load])
  // Search box resets to the first page
  useEffect(() => { setPage(1) }, [q])

  const openEditor = async (id: string) => {
    if (editId === id) { setEditId(null); setDetail(null); return }
    setEditId(id); setDetail(null); setPriceEdits({}); setStockDeltas({}); setNotifyOnRestock({})
    try {
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)
      setDetail(r.product)
      hydrateContent(r.product)
    } catch { setEditId(null) }
  }

  const hydrateContent = (p: ProductEditorData) => {
    setContentEdits({
      en: { title: p.translations.en?.title ?? '', subtitle: p.translations.en?.subtitle ?? '', shortDescription: p.translations.en?.shortDescription ?? '' },
      fa: { title: p.translations.fa?.title ?? '', subtitle: p.translations.fa?.subtitle ?? '', shortDescription: p.translations.fa?.shortDescription ?? '' },
    })
    setContentTab('en')
  }

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    await apiPatch(`/api/admin/products/${id}`, body)
    toast({ title: msg })
    load()
    if (editId === id) openEditorRefresh(id)
  }
  const openEditorRefresh = async (id: string) => {
    try {
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)
      setDetail(r.product); setPriceEdits({}); setStockDeltas({}); setNotifyOnRestock({})
    } catch { /* keep old */ }
  }

  /** Diff the content drafts against the loaded detail → translations PATCH payload (null = no change). */
  const contentPatch = () => {
    if (!detail) return null
    const out: Record<string, { title?: string; subtitle?: string | null; shortDescription?: string | null }> = {}
    for (const loc of ['en', 'fa'] as const) {
      const orig = detail.translations[loc]
      if (!orig) continue // locale row missing → not editable inline
      const draft = contentEdits[loc]
      const entry: { title?: string; subtitle?: string | null; shortDescription?: string | null } = {}
      if (draft.title.trim() && draft.title !== orig.title) entry.title = draft.title.trim()
      if ((draft.subtitle || null) !== (orig.subtitle ?? null)) entry.subtitle = draft.subtitle.trim() || null
      if ((draft.shortDescription || null) !== (orig.shortDescription ?? null)) entry.shortDescription = draft.shortDescription.trim() || null
      if (Object.keys(entry).length > 0) out[loc] = entry
    }
    return Object.keys(out).length > 0 ? out : null
  }

  const saveContent = async () => {
    if (!detail) return
    const translations = contentPatch()
    if (!translations) { toast({ title: t.admin.noChanges }); return }
    setSaving(true)
    try {
      await apiPatch(`/api/admin/products/${detail.id}`, { translations })
      toast({ title: t.admin.contentSaved })
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${detail.id}`)
      setDetail(r.product)
      hydrateContent(r.product)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const bumpStock = (variantId: string, delta: number, stock: number) => {
    setStockDeltas((d) => {
      const next = Math.max(-stock, (d[variantId] ?? 0) + delta)
      return { ...d, [variantId]: next }
    })
  }

  /** Hard-delete a DRAFT/ARCHIVED product — server enforces referential guards
   *  (published/scheduled → 409; order history → 409). */
  const removeProduct = async (p: AdminProduct) => {
    if (!window.confirm(`${t.admin.productDeleteConfirm} (${p.title})`)) return
    try {
      await apiDelete(`/api/admin/products/${p.id}`)
      toast({ title: tf(t.admin.productDeleted, { title: p.title }) })
      if (editId === p.id) { setEditId(null); setDetail(null) }
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  /** Blob-download the catalog CSV (auth cookie rides along automatically). */
  const exportCsv = async () => {
    try {
      const res = await fetch('/api/admin/products/export')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `persepix-products-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast({ title: t.admin.exportProductsDone })
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const saveEditor = async () => {
    if (!detail) return
    const variantPrices = Object.entries(priceEdits)
      .map(([variantId, eur]) => ({ variantId, priceMinor: Math.round(Number(eur) * 100) }))
      .filter((c) => Number.isFinite(c.priceMinor) && c.priceMinor > 0)
    const stockAdjust = Object.entries(stockDeltas)
      .filter(([, delta]) => delta !== 0)
      .map(([variantId, delta]) => ({ variantId, delta }))
    if (variantPrices.length === 0 && stockAdjust.length === 0) {
      toast({ title: t.admin.noChanges })
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/api/admin/products/${detail.id}`, {
        ...(variantPrices.length > 0 ? { variantPrices } : {}),
        ...(stockAdjust.length > 0 ? { stockAdjust } : {}),
      })
      // Restock → notify: batch-ping the waiting subscribers of variants that came back in stock.
      const toNotify = stockAdjust
        .filter(({ variantId, delta }) => {
          const v = detail.variants.find((x) => x.id === variantId)
          return delta > 0 && v && v.stock === 0 && (v.waitingCount ?? 0) > 0 && (notifyOnRestock[variantId] ?? true)
        })
        .map(({ variantId }) => variantId)
      let notifiedTotal = 0
      for (const variantId of toNotify) {
        try {
          const r = await apiPost<{ notified: number }>('/api/admin/back-in-stock/notify', { variantId })
          notifiedTotal += r.notified
        } catch { /* keep going — stock save already succeeded */ }
      }
      if (notifiedTotal > 0) toast({ title: tf(t.admin.notifiedAll, { n: notifiedTotal }) })
      else toast({ title: t.admin.pricesSaved })
      load()
      openEditorRefresh(detail.id)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (!products) return <Spinner label={t.common.loading} />
  const allSelected = selected.size > 0 && selected.size === products.length
  const editingProduct = editId ? products.find((p) => p.id === editId) ?? null : null
  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t.admin.products}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm" className="h-9 gap-1.5"
            onClick={() => { setFullEdit('new'); setFullOpen(true) }}
          >
            <Plus className="h-4 w-4" aria-hidden />{t.admin.newProduct}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => void exportCsv()}
          >
            <Download className="h-4 w-4" aria-hidden />{t.admin.exportProducts}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="h-4 w-4" aria-hidden />{t.admin.importProducts}
          </Button>
          <Button
            variant="ghost" size="sm" className="h-9 gap-1.5 text-ink-3"
            onClick={() => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)))}
            aria-pressed={allSelected}
          >
            <Layers className="h-4 w-4" aria-hidden />{t.admin.selectAll}
          </Button>
          <Input placeholder={t.common.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-56" />
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {products.map((p) => {
          const editing = editId === p.id
          return (
            <li key={p.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 transition-colors', editing && 'bg-brand-soft/40', selected.has(p.id) && 'bg-brand-soft/25')}>
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                aria-label={`${t.admin.bulkStock}: ${p.title}`}
                className="h-4 w-4 shrink-0 accent-[#014B74]"
              />
              {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-14 w-10 rounded-sm border border-line object-cover" /> : <span className="h-14 w-10 rounded-sm bg-soft" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="truncate text-xs text-ink-3" lang="fa" dir="rtl">{p.titleFa}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span className={cn('h-1.5 w-1.5 rounded-full', p.completeness.en === 'READY' ? 'bg-success' : 'bg-warning')} aria-hidden />
                  EN {p.completeness.en === 'READY' ? '✓' : '~'}
                  <span className={cn('h-1.5 w-1.5 rounded-full', p.completeness.fa === 'READY' ? 'bg-success' : 'bg-warning')} aria-hidden />
                  FA {p.completeness.fa === 'READY' ? '✓' : '~'}
                  {' · '}{p.stock} {t.admin.units.toLowerCase()}
                </p>
              </div>
              <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'default' : 'brand'}>{p.status}</Badge>
              <span className="text-sm font-semibold text-ink bdi">{formatMoney(p.priceMinor, locale)}</span>
              <div className="flex gap-1.5">
                {p.status !== 'PUBLISHED' ? (
                  <Button size="sm" className="h-8" onClick={() => patch(p.id, { status: 'PUBLISHED' }, t.admin.saved)}>{t.admin.publishProduct}</Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => patch(p.id, { status: 'DRAFT' }, t.admin.saved)}>{t.admin.unpublish}</Button>
                )}
                <Button
                  size="sm" variant={editing ? 'default' : 'outline'} className="h-8 gap-1"
                  onClick={() => openEditor(p.id)} aria-expanded={editing}
                >
                  {editing ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  {t.admin.editProduct}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setFullEdit(p.id); setFullOpen(true) }} aria-label={`${t.admin.fullEditor}: ${p.title}`}>
                  <Pencil className="h-3 w-3" aria-hidden />{t.admin.fullEditor}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/books/${p.slug}`)}>{t.admin.view}</Button>
                {(p.status === 'DRAFT' || p.status === 'ARCHIVED') && (
                  <Button
                    size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10"
                    onClick={() => void removeProduct(p)}
                    aria-label={`${t.admin.deleteProduct} ${p.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>

            </li>
          )
        })}
      </ul>

      {/* Floating bulk bar */}
      {selected.size > 0 && !bulkOpen && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="fade-up flex items-center gap-3 rounded-full border border-brand/20 bg-white/95 py-2 pe-2 ps-5 shadow-lg backdrop-blur">
            <span className="text-sm font-medium text-ink">{tf(t.admin.bulkSelected, { n: selected.size })}</span>
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs text-ink-3" onClick={() => setSelected(new Set())}>
              {t.admin.clearSel}
            </Button>
            <Button size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" aria-hidden />{t.admin.bulkStock}
            </Button>
          </div>
        </div>
      )}

      {/* Edit product — hoisted from the inline expander into a near-viewport
          dialog (user: «عرض باکس Edit product خیلی کمه، بیش از ۲ برابر بزرگترش
          کن»). The 1fr admin column capped it at ~960px; a 100vw−2rem dialog
          with a 1920px cap gives the variants/content surface >2× the working
          width on desktop screens. */}
      <Dialog open={editId !== null} onOpenChange={(o) => { if (!o) { setEditId(null); setDetail(null) } }}>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0"
          style={{ width: 'calc(100vw - 2rem)', maxWidth: '1920px' }}
        >
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold text-ink">
              {t.admin.editProduct}
              {editingProduct && (
                <span className="min-w-0 truncate text-sm font-normal text-ink-3">
                  — {locale === 'fa' && editingProduct.titleFa ? editingProduct.titleFa : editingProduct.title}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-slim">
            {!detail ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-white px-4 py-10 text-sm text-ink-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}
              </div>
            ) : (
              <div className="space-y-4">

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {t.admin.variants}
                  {detail.fixedPrice && <span className="ms-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">fixed-price</span>}
                </h3>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-8" disabled={saving} onClick={saveEditor}>{saving ? t.common.saving : t.admin.savePrices}</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditId(null); setDetail(null) }}>{t.admin.close}</Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-soft/60 text-xs uppercase tracking-wide text-ink-3">
                      <th className="px-3 py-2 text-start font-medium">{t.admin.formatCol}</th>
                      <th className="px-3 py-2 text-start font-medium">{t.admin.skuCol}</th>
                      <th className="px-3 py-2 text-end font-medium">{t.admin.price}</th>
                      <th className="px-3 py-2 text-center font-medium">{t.admin.stock}</th>
                      <th className="px-3 py-2 text-end font-medium">{t.admin.soldCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {detail.variants.map((v) => {
                      const delta = stockDeltas[v.id] ?? 0
                      const editedPrice = priceEdits[v.id]
                      const changed = delta !== 0 || editedPrice !== undefined
                      return (
                        <tr key={v.id} className={cn('transition-colors', changed && 'bg-brand-soft/40')}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-ink">{FORMAT_LABEL[v.format] ?? v.format}</p>
                            <p className="text-[11px] text-ink-3">{v.bookLanguage}{v.editionLabel ? ` · ${v.editionLabel}` : ''}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-mono text-xs text-ink-2 bdi" dir="ltr">{v.sku}</p>
                            {v.isbn13 && <p className="text-[11px] text-ink-3 bdi" dir="ltr">{v.isbn13}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-xs text-ink-3">€</span>
                              <Input
                                type="number" min={1} step="0.01" inputMode="decimal" dir="ltr"
                                defaultValue={(v.priceMinor / 100).toFixed(2)}
                                key={`${v.id}-${v.priceMinor}`}
                                onChange={(e) => setPriceEdits((s) => {
                                  const next = { ...s }
                                  const val = e.target.value
                                  if (val === '' || Math.round(Number(val) * 100) === v.priceMinor) delete next[v.id]
                                  else next[v.id] = val
                                  return next
                                })}
                                className="h-8 w-24 text-end tabular-nums"
                                aria-label={`${t.admin.price} — ${v.sku}`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => bumpStock(v.id, -1, v.stock)} aria-label="−1" className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft disabled:opacity-30" disabled={delta <= -v.stock}>
                                <Minus className="h-3.5 w-3.5" aria-hidden />
                              </button>
                              <span className="w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                                {v.stock + delta}
                                {delta !== 0 && <span className={cn('ms-0.5 text-[11px] font-medium', delta > 0 ? 'text-success' : 'text-error')}>({delta > 0 ? `+${delta}` : delta})</span>}
                              </span>
                              <button type="button" onClick={() => bumpStock(v.id, 1, v.stock)} aria-label="+1" className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft">
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                              </button>
                              <button type="button" onClick={() => bumpStock(v.id, 10, v.stock)} className="ms-1 rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-soft">+10</button>
                            </div>
                            {v.stock === 0 && (v.waitingCount ?? 0) > 0 && (
                              <label className={cn('mt-1.5 flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition',
                                delta > 0
                                  ? 'border-success/40 bg-success/10 text-success'
                                  : 'border-line bg-soft text-ink-3')}>
                                <input
                                  type="checkbox"
                                  checked={notifyOnRestock[v.id] ?? true}
                                  onChange={(e) => setNotifyOnRestock((s) => ({ ...s, [v.id]: e.target.checked }))}
                                  className="h-3 w-3 accent-[#014B74]"
                                  aria-label={tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                                />
                                <BellRing className="h-3 w-3" aria-hidden />
                                {tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                              </label>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-end text-ink-2 tabular-nums">{v.soldCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {detail.priceHistory.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.priceHistory}</h4>
                  <ul className="space-y-1">
                    {detail.priceHistory.slice(0, 5).map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        <span className="font-mono bdi" dir="ltr">{h.variantSku}</span>
                        {h.oldPriceMinor !== null && h.oldPriceMinor !== h.newPriceMinor ? (
                          <span className="bdi">{formatMoney(h.oldPriceMinor, locale)} → <span className="font-semibold text-ink-2">{formatMoney(h.newPriceMinor, locale)}</span></span>
                        ) : (
                          <span className="bdi">{h.reason ?? '—'}</span>
                        )}
                        <span className="ms-auto">{formatDateTime(h.effectiveAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Content editor (EN/FA) ── */}
              <div className="border-t border-line pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{t.admin.contentTitle}</h3>
                  <div className="flex items-center gap-2">
                    <div role="tablist" aria-label={t.admin.contentTitle} className="flex rounded-md border border-line p-0.5">
                      {(['en', 'fa'] as const).map((loc) => (
                        <button
                          key={loc} type="button" role="tab" aria-selected={contentTab === loc}
                          onClick={() => setContentTab(loc)}
                          className={cn(
                            'rounded px-3 py-1 text-xs font-semibold transition',
                            contentTab === loc ? 'bg-brand text-white shadow-sm' : 'text-ink-3 hover:text-ink',
                          )}
                        >
                          {loc === 'en' ? 'English' : 'فارسی'}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="h-8" disabled={saving || !contentPatch()} onClick={saveContent}>
                      {saving ? t.common.saving : t.admin.contentSave}
                    </Button>
                  </div>
                </div>
                {(['en', 'fa'] as const).map((loc) => {
                  const orig = detail.translations[loc]
                  const draft = contentEdits[loc]
                  const dirty = contentPatch() !== null
                  if (contentTab !== loc) return null
                  if (!orig) {
                    return (
                      <div key={loc} className="rounded-md border border-line bg-soft/40 p-4 text-sm text-ink-3">
                        {t.admin.contentMissingLocale}
                      </div>
                    )
                  }
                  return (
                    <div key={loc} className={cn('grid gap-3 rounded-md border p-3 transition-colors', dirty ? 'border-brand/30 bg-brand-soft/30' : 'border-line bg-soft/40')}>
                      <div>
                        <Label htmlFor={`ct-title-${loc}`} className="mb-1 text-xs">{t.admin.contentTitleField}</Label>
                        <Input
                          id={`ct-title-${loc}`} value={draft.title} maxLength={300}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], title: e.target.value } }))}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`ct-sub-${loc}`} className="mb-1 text-xs">{t.admin.contentSubtitleField}</Label>
                        <Input
                          id={`ct-sub-${loc}`} value={draft.subtitle} maxLength={300}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], subtitle: e.target.value } }))}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`ct-desc-${loc}`} className="mb-1 text-xs">{t.admin.contentDescField}</Label>
                        <textarea
                          id={`ct-desc-${loc}`} value={draft.shortDescription} rows={3} maxLength={1000}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], shortDescription: e.target.value } }))}
                          className="flex w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        />
                      </div>
                      <p className="text-[11px] text-ink-3">{t.admin.contentDirtyHint}</p>
                    </div>
                  )
                })}
              </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BulkStockDialog
        open={bulkOpen}
        productIds={selectedIds}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) setSelected(new Set()) }}
        onApplied={(n) => { load(); toast({ title: tf(t.admin.bulkApplied, { n }) }) }}
      />

      <ImportProductsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(n) => { load(); toast({ title: tf(t.admin.importProductsApplied, { n }) }) }}
      />

      {/* Full product editor — create + edit with media upload, categories, contributors, variants, related, SEO (Task 27-f) */}
      <FullProductEditor
        productId={fullEdit}
        open={fullOpen}
        onClose={() => setFullOpen(false)}
        onSaved={(id) => { setFullOpen(false); setPage(1); load(); if (id) openEditorRefresh(id) }}
      />

      {/* Pagination */}
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
    </div>
  )
}

/** Multi-product stock editor: one dialog, per-variant steppers, one audited batch.
 *  Out-of-stock variants with waiting subscribers get a "notify on restock" toggle
 *  (default on) — positive deltas on those variants ping their waiters in the same tx. */
function BulkStockDialog({ open, productIds, onOpenChange, onApplied }: {
  open: boolean
  productIds: string[]
  onOpenChange: (o: boolean) => void
  onApplied: (n: number) => void
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [groups, setGroups] = useState<{ product: ProductEditorData }[] | null>(null)
  const [deltas, setDeltas] = useState<Record<string, { delta: number; stock: number; sku: string; waiting: number }>>({})
  const [notifyOn, setNotifyOn] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || productIds.length === 0) { setGroups(null); setDeltas({}); setNotifyOn({}); return }
    let alive = true
    setGroups(null)
    Promise.all(productIds.map((id) => apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)))
      .then((rs) => { if (alive) setGroups(rs) })
      .catch(() => { if (alive) setGroups([]) })
    return () => { alive = false }
  }, [open, productIds])

  const bump = (v: VariantRow, delta: number) => {
    setDeltas((d) => {
      const next = Math.max(-v.stock, (d[v.id]?.delta ?? 0) + delta)
      if (next === 0) {
        const rest = { ...d }
        delete rest[v.id]
        return rest
      }
      return { ...d, [v.id]: { delta: next, stock: v.stock, sku: v.sku, waiting: v.waitingCount ?? 0 } }
    })
  }

  const apply = async () => {
    const adjustments = Object.entries(deltas).map(([variantId, d]) => ({ variantId, delta: d.delta }))
    if (adjustments.length === 0) return
    const notifyVariantIds = Object.entries(deltas)
      .filter(([variantId, d]) => d.delta > 0 && d.stock === 0 && d.waiting > 0 && (notifyOn[variantId] ?? true))
      .map(([variantId]) => variantId)
    setBusy(true)
    try {
      const res = await apiPost<{ updated: { variantId: string }[]; notified: { count: number }[] }>('/api/admin/products/bulk-stock', {
        adjustments,
        ...(notifyVariantIds.length > 0 ? { notifyVariantIds } : {}),
      })
      const notifiedTotal = (res.notified ?? []).reduce((s, n) => s + n.count, 0)
      onApplied(adjustments.length)
      if (notifiedTotal > 0) toast({ title: tf(t.admin.notifiedAll, { n: notifiedTotal }) })
      onOpenChange(false)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const pending = Object.keys(deltas).length

  // ── CSV export: current stock of every loaded variant ──
  const exportCsv = () => {
    if (!groups) return
    const rows: string[][] = [['sku', 'title', 'format', 'current_stock', 'new_stock']]
    for (const { product } of groups) {
      const title = product.translations.en?.title ?? product.slug
      for (const v of product.variants) {
        rows.push([v.sku, title, v.format, String(v.stock), String(v.stock)])
      }
    }
    const csv = rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `persepix-stock-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV import: stage deltas from sku,new_stock rows ──
  const importCsv = async (file: File) => {
    if (!groups) return
    let text = ''
    try { text = await file.text() } catch { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
    const skuIdx = header.indexOf('sku')
    const stockIdx = header.indexOf('new_stock')
    if (skuIdx === -1 || stockIdx === -1) { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }

    const bySku = new Map<string, VariantRow>()
    for (const { product } of groups) for (const v of product.variants) bySku.set(v.sku.toLowerCase(), v)

    let matched = 0
    let skipped = 0
    const staged: NonNullable<typeof deltas> = {}
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line)
      const sku = (cells[skuIdx] ?? '').trim().toLowerCase()
      const newStock = Number.parseInt((cells[stockIdx] ?? '').trim(), 10)
      const variant = bySku.get(sku)
      if (!variant || !Number.isFinite(newStock) || newStock < 0) { skipped++; continue }
      const delta = Math.max(-variant.stock, newStock - variant.stock)
      if (delta === 0) continue // unchanged — nothing to stage
      staged[variant.id] = { delta, stock: variant.stock, sku: variant.sku, waiting: variant.waitingCount ?? 0 }
      matched++
    }
    if (matched > 0) setDeltas((d) => ({ ...d, ...staged }))
    toast({ title: tf(t.admin.bulkImported, { n: lines.length - 1, m: matched, k: skipped }) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" style={{ maxWidth: '42rem' }} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand"><Layers className="h-4 w-4" aria-hidden /></span>
            {t.admin.bulkTitle}
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{tf(t.admin.bulkSelected, { n: productIds.length })}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-3">{t.admin.bulkHint}</p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv} disabled={!groups} aria-label={t.admin.bulkExport}>
              <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.bulkExport}
            </Button>
            <label className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground',
              !groups && 'pointer-events-none opacity-50',
            )} aria-label={t.admin.bulkImport}>
              <Upload className="h-3.5 w-3.5" aria-hidden />{t.admin.bulkImport}
              <input
                type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importCsv(f)
                  e.target.value = '' // allow re-importing the same file
                }}
              />
            </label>
          </div>
        </div>
        <p className="-mt-1 font-mono text-[10.5px] text-ink-3 bdi" dir="ltr">{t.admin.bulkImportHint}</p>
        {!groups ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}</div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">{t.common.error}</p>
        ) : (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pe-1 scrollbar-slim">
            {groups.map(({ product }) => (
              <div key={product.id} className="rounded-md border border-line">
                <p className="border-b border-line bg-soft/60 px-3 py-2 text-sm font-semibold text-ink">{product.translations.en?.title ?? product.slug}</p>
                <ul className="divide-y divide-line">
                  {product.variants.map((v) => {
                    const d = deltas[v.id]
                    const notifyEligible = v.stock === 0 && (v.waitingCount ?? 0) > 0
                    return (
                      <li key={v.id} className={cn('flex items-center gap-3 px-3 py-2 transition-colors', d && 'bg-brand-soft/40')}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{FORMAT_LABEL[v.format] ?? v.format}</p>
                          <p className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{v.sku}</p>
                          {notifyEligible && (
                            <label className={cn(
                              'mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition',
                              d && d.delta > 0 && (notifyOn[v.id] ?? true)
                                ? 'border-success/40 bg-success/10 text-success'
                                : 'border-line text-ink-3',
                            )}>
                              <Checkbox
                                checked={notifyOn[v.id] ?? true}
                                onCheckedChange={(val) => setNotifyOn((n) => ({ ...n, [v.id]: val === true }))}
                                className="h-3 w-3"
                                aria-label={tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                              />
                              <BellRing className="h-3 w-3" aria-hidden />
                              {tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                            </label>
                          )}
                        </div>
                        <span className="text-sm tabular-nums text-ink-2" aria-live="polite">
                          {v.stock + (d?.delta ?? 0)}
                          {d && <span className={cn('ms-1 text-[11px] font-semibold', d.delta > 0 ? 'text-success' : 'text-error')}>({d.delta > 0 ? `+${d.delta}` : d.delta})</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => bump(v, -1)} disabled={!!d && d.delta <= -v.stock} aria-label={`−1 ${v.sku}`} className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft disabled:opacity-30"><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                          <button type="button" onClick={() => bump(v, 1)} aria-label={`+1 ${v.sku}`} className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft"><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                          <button type="button" onClick={() => bump(v, 10)} aria-label={`+10 ${v.sku}`} className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-soft">+10</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-9" onClick={() => onOpenChange(false)}>{t.admin.close}</Button>
          <Button size="sm" className="h-9" disabled={busy || pending === 0} onClick={apply}>
            {busy ? t.common.saving : `${t.admin.bulkApply}${pending > 0 ? ` (${pending})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Minimal CSV line parser (quoted fields, escaped quotes, comma-separated). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const IMPORT_TEMPLATE = [
  'slug,title_en,title_fa,price_eur,stock,sku,format,status,category,cover_url,authors',
  'the-winter-catalogue,"The Winter Catalogue","کاتالوگ زمستان",24.00,12,,PAPERBACK,PUBLISHED,fiction,,neda-ahmadi',
  'letters-from-the-alborz,"Letters from the Alborz","",18.50,3,SP-ALBORZ,HARDCOVER,DRAFT,poetry,,shirin-golzar;martin-ellison',
].join('\n')

/** CSV product import: paste or pick a .csv, preview parsed rows client-side,
 *  then POST the raw CSV — the server re-validates authoritatively, creates the
 *  products (+ one default variant each) in one transaction and reports skips. */
function ImportProductsDialog({ open, onOpenChange, onImported }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImported: (n: number) => void
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [skips, setSkips] = useState<{ row: number; reason: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // Known person slugs for the authors column — loaded once when the dialog opens.
  const [knownSlugs, setKnownSlugs] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    apiGet<{ people: { slug: string }[] }>('/api/admin/people')
      .then((r) => setKnownSlugs(r.people.map((p) => p.slug)))
      .catch(() => setKnownSlugs([]))
  }, [open])

  const rows = useMemo(() => parseImportPreview(csv, knownSlugs), [csv, knownSlugs])
  const readyCount = rows.filter((r) => !r.error).length

  const pickFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setCsv(String(reader.result ?? '')); setSkips([]) }
    reader.readAsText(file)
  }

  const apply = async () => {
    if (readyCount === 0 || busy) return
    setBusy(true)
    try {
      const r = await apiPost<{ created: { id: string }[]; skipped: { row: number; reason: string }[] }>('/api/admin/products/import', { csv })
      setSkips(r.skipped)
      if (r.created.length > 0) onImported(r.created.length)
      if (r.created.length > 0 && r.skipped.length === 0) {
        setCsv('')
        onOpenChange(false)
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.admin.importProductsBad, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSkips([]) }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" style={{ maxWidth: '42rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
              <FileUp className="h-4 w-4" aria-hidden />
            </span>
            {t.admin.importProductsTitle}
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-1 text-xs leading-relaxed text-ink-3">{t.admin.importProductsHint}</p>

        {/* Column reference — mono, LTR always */}
        <div dir="ltr" className="rounded-md border border-brand/20 bg-brand-soft/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-brand">
          {t.admin.importProductsDoc}
        </div>

        {/* Toolbar: file picker + template */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" aria-hidden />{t.admin.importProductsEdit}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-ink-3" onClick={() => {
            const blob = new Blob(['\uFEFF' + IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'persepix-product-import-template.csv'
            a.click()
            URL.revokeObjectURL(a.href)
          }}>
            <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.importProductsTemplate}
          </Button>
        </div>

        {/* Paste area */}
        <div>
          <Label htmlFor="import-csv" className="text-xs">{t.admin.importProductsPaste}</Label>
          <textarea
            id="import-csv" dir="ltr" rows={4} spellCheck={false}
            value={csv} onChange={(e) => { setCsv(e.target.value); setSkips([]) }}
            placeholder={'slug,title_en,price_eur,authors\nmy-next-book,"My Next Book",21.00,neda-ahmadi'}
            className="mt-1.5 flex w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          />
          {knownSlugs.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              {t.admin.importProductsAuthorsHint}{' '}
              <span className="font-mono text-[10px] text-ink-2 bdi" dir="ltr">{knownSlugs.slice(0, 6).join(' · ')}{knownSlugs.length > 6 ? ' …' : ''}</span>
            </p>
          )}
        </div>

        {/* Preview table */}
        {csv.trim() ? (
          rows.length === 0 ? (
            <p className="rounded-md border border-orange-accent/30 bg-orange-accent/5 px-3 py-2 text-xs font-medium text-orange-dark" role="alert">
              {t.admin.importProductsBad}
            </p>
          ) : (
            <div>
              <p className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink">
                <span>{t.admin.importProductsPreview}</span>
                <span className="font-normal text-ink-3 bdi" dir="ltr">
                  {readyCount}/{rows.length}
                </span>
              </p>
              <div className="max-h-60 overflow-y-auto rounded-md border border-line" dir="ltr">
                <table className="w-full text-start text-xs">
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.line} className={cn('transition-colors', r.error || r.authorsError ? 'bg-orange-accent/[0.07]' : 'bg-success/[0.05]')}>
                        <td className="px-2.5 py-2 font-mono text-[11px] text-ink-3">{r.line}</td>
                        <td className="max-w-44 px-2 py-2">
                          <span className="block truncate font-medium text-ink">{r.title || '—'}</span>
                          {r.titleFa && <span className="block truncate text-[11px] text-ink-3" lang="fa" dir="rtl">{r.titleFa}</span>}
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] text-ink-3">{r.slug || '—'}</td>
                        <td className="px-2 py-2 bdi" dir="ltr">{r.price || '—'}</td>
                        <td className="px-2 py-2 text-end bdi" dir="ltr">{r.stock || '0'}</td>
                        <td className="max-w-40 px-2 py-2">
                          {r.authors ? (
                            <span
                              className={cn('block truncate font-mono text-[11px]', r.authorsError ? 'text-orange-dark' : 'text-ink-2')}
                              title={r.authorsError ?? r.authors}
                            >
                              {r.authors}
                            </span>
                          ) : (
                            <span className="text-[11px] text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-end">
                          {r.error || r.authorsError ? (
                            <span className="inline-flex items-center rounded-full bg-orange-accent/15 px-2 py-0.5 text-[10px] font-bold text-orange-dark" title={r.error ?? r.authorsError}>?</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                              <Check className="h-2.5 w-2.5" aria-hidden />{t.admin.importProductsOk}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <p className="rounded-md border border-dashed border-line bg-soft/50 px-3 py-3 text-center text-xs text-ink-3">
            {t.admin.importProductsEmpty}
          </p>
        )}

        {/* Skipped rows report (after server apply) */}
        {skips.length > 0 && (
          <div className="rounded-md border border-orange-accent/30 bg-orange-accent/5 px-3 py-2">
            <p className="text-xs font-semibold text-orange-dark">{tf(t.admin.importProductsSkipped, { n: skips.length })}</p>
            <ul className="mt-1 space-y-0.5">
              {skips.slice(0, 6).map((s) => (
                <li key={s.row} className="text-[11px] text-ink-2 bdi" dir="ltr">
                  row {s.row}: {s.reason}
                </li>
              ))}
              {skips.length > 6 && <li className="text-[11px] text-ink-3">…</li>}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => onOpenChange(false)}>{t.nav.close}</Button>
          <Button size="sm" className="h-9 gap-1.5" disabled={busy || readyCount === 0} onClick={apply}>
            <FileUp className="h-4 w-4" aria-hidden />
            {busy ? t.common.saving : tf(t.admin.importProductsApply, { n: readyCount })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Light client-side preview for the import dialog (server stays authoritative).
 *  knownSlugs powers the authors-column check: unknown slugs turn the row orange
 *  with a nearest-match hint so typos surface before the import runs. */
function parseImportPreview(csv: string, knownSlugs: string[]): { line: number; slug: string; title: string; titleFa: string; price: string; stock: string; authors: string; authorsError?: string; error?: string }[] {
  const trimmed = csv.trim()
  if (!trimmed) return []
  const grid = trimmed.split(/\r?\n/).filter((l) => l.trim() !== '').map(parseCsvLine)
  if (grid.length < 2) return []
  const header = grid[0].map((h) => h.trim().toLowerCase())
  const ci = (name: string) => header.indexOf(name)
  if (ci('title_en') < 0 || ci('price_eur') < 0) {
    return grid.slice(1).map((_, i) => ({ line: i + 2, slug: '', title: '', titleFa: '', price: '', stock: '', authors: '', error: 'header' }))
  }
  const nearestSlug = (raw: string): string | undefined => {
    const s = raw.toLowerCase()
    return knownSlugs.find((k) => k.startsWith(s.slice(0, 4)) || s.startsWith(k.slice(0, 4)) || k.includes(s))
  }
  return grid.slice(1).map((cells, i) => {
    const get = (n: string) => (ci(n) >= 0 ? (cells[ci(n)] ?? '').trim() : '')
    const title = get('title_en')
    const priceRaw = get('price_eur')
    const slug = (get('slug') || title)
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const price = Number(priceRaw.replace(',', '.').replace(/[^\d.]/g, ''))
    let error: string | undefined
    if (!title) error = 'title_en'
    else if (!Number.isFinite(price) || price <= 0) error = 'price_eur'
    else if (slug.length < 2) error = 'slug'
    // Authors cell (client-side hint only — the server re-checks against the DB)
    const authorsRaw = get('authors')
    let authorsError: string | undefined
    if (authorsRaw && knownSlugs.length > 0) {
      const slugs = authorsRaw.split(';').map((s) => s.trim()).filter(Boolean)
      const unknown = slugs.filter((s) => !knownSlugs.includes(s.toLowerCase()))
      if (unknown.length > 0) {
        const hint = nearestSlug(unknown[0])
        authorsError = `“${unknown[0]}”${hint ? ` → ${hint}` : ''}`
      }
    }
    return { line: i + 2, slug, title, titleFa: get('title_fa'), price: priceRaw, stock: get('stock'), authors: authorsRaw, authorsError, error }
  })
}
