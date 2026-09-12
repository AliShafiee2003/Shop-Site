'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, X, Tag, Ban, RotateCcw, Layers, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { useSettings } from '@/lib/use-settings'
import { getDict, tf } from '@/lib/i18n'
import { faDigits, toLatinDigits } from '@/lib/format'
import { bookLanguageLabel, formatLabel } from '@/lib/bookLabels'
import { ProductCard } from '@/components/storefront/ProductCard'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import type { Locale, ProductCard as ProductCardDTO, CategoryDTO, PersonDTO } from '@/lib/types'

export interface CatalogQuery {
  category?: string
  person?: string
  format?: string
  language?: string
  publisher?: string
  availability?: string
  minPrice?: string
  maxPrice?: string
  sale?: string
  fixed?: string
  sort?: string
  page?: string
  q?: string
  series?: string
}

/** Facet options pulled from live catalog data (/api/products/facets). */
interface Facets {
  languages: { value: string; count: number }[]
  publishers: { value: string; count: number }[]
  formats: { value: string; count: number }[]
  price: { min: number; max: number }
}
const EMPTY_FACETS: Facets = { languages: [], publishers: [], formats: [], price: { min: 0, max: 100 } }

/** Published book series (R5: the /books series chip rail). Same payload the
 *  /series index uses — slug, localized names, volume count, cover fan. */
interface SeriesEntry {
  slug: string
  name: string
  nameEn: string
  nameFa: string
  count: number
  cover: string | null
  covers: string[]
}

const toList = (s?: string): string[] =>
  s ? [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))] : []
const toggleIn = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function CatalogView({ query: initialQuery, heading }: { query?: CatalogQuery; heading?: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const rtlDir = isFa ? ('rtl' as const) : ('ltr' as const)
  const dig = (n: number) => (isFa ? faDigits(String(n)) : String(n))
  // Price fields are TEXT inputs (inputMode=numeric), not type=number: a
  // Persian-localized phone renders native number inputs with ۱۲۳ glyphs on
  // EVERY site — the user saw Persian digits in the EN filter (Task 46).
  // A controlled text field renders exactly the locale's digits and parses
  // Persian/Arabic/Latin input alike.
  const parsePrice = (raw: string) => {
    const n = Number(toLatinDigits(raw).replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && raw.trim() !== '' ? n : NaN
  }
  const [query, setQuery] = useState<CatalogQuery>(initialQuery ?? {})
  // C3: the RSC entry prefetches the FIRST page with the exact same loader the
  // API route uses — seed the list so the SSR HTML carries real book cards.
  const ssr = useSsrPageData()
  const initKeyJson = JSON.stringify(initialQuery ?? {})
  const ssrCatalog = ssr && ssr.locale === locale && ssr.catalog && JSON.stringify(ssr.catalog.query) === initKeyJson
    ? ssr.catalog
    : null
  const [dataState, setDataState] = useState<{ key: string; items: ProductCardDTO[]; total: number; failed?: boolean } | null>(
    ssrCatalog ? { key: `${locale}|${initKeyJson}`, items: ssrCatalog.items, total: ssrCatalog.total } : null,
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [people, setPeople] = useState<PersonDTO[]>([])
  const [facets, setFacets] = useState<Facets | null>(null)
  const [seriesList, setSeriesList] = useState<SeriesEntry[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const settings = useSettings()
  const promotion = settings?.promotion ?? null
  const pageSize = 12

  // Sync external query prop changes (category page → catalog) during render (React-endorsed pattern)
  const initKey = JSON.stringify(initialQuery ?? {})
  const [lastInitKey, setLastInitKey] = useState(initKey)
  if (initKey !== lastInitKey) {
    setLastInitKey(initKey)
    setQuery(initialQuery ?? {})
  }

  useEffect(() => {
    let alive = true
    apiGet<CategoryDTO[]>('/api/categories?locale=' + locale).then((r) => { if (alive) setCategories(r) }).catch(() => { if (alive) setCategories([]) })
    apiGet<PersonDTO[]>('/api/people?locale=' + locale).then((r) => { if (alive) setPeople(r) }).catch(() => { if (alive) setPeople([]) })
    apiGet<Facets>('/api/products/facets').then((r) => { if (alive) setFacets(r) }).catch(() => { if (alive) setFacets(EMPTY_FACETS) })
    apiGet<{ series: SeriesEntry[] }>('/api/series?locale=' + locale)
      .then((r) => { if (alive) setSeriesList(r.series ?? []) })
      .catch(() => { if (alive) setSeriesList([]) })
    return () => { alive = false }
  }, [locale])

  // Selection lists (comma-joined in the URL for shareability)
  const selCats = useMemo(() => toList(query.category), [query.category])
  const selFormats = useMemo(() => toList(query.format), [query.format])
  const selLangs = useMemo(() => toList(query.language), [query.language])
  const selPubs = useMemo(() => toList(query.publisher), [query.publisher])
  const availActive = query.availability === 'in'
  const saleActive = query.sale === '1'
  const priceActive = query.minPrice != null || query.maxPrice != null

  const priceDomain = facets?.price ?? EMPTY_FACETS.price
  const queryLo = query.minPrice != null ? Number(query.minPrice) : null
  const queryHi = query.maxPrice != null ? Number(query.maxPrice) : null
  const [dragPrice, setDragPrice] = useState<[number, number] | null>(null)
  const sliderValue: [number, number] = dragPrice ?? [
    Number.isFinite(queryLo as number) ? Math.max(priceDomain.min, queryLo as number) : priceDomain.min,
    Number.isFinite(queryHi as number) ? Math.min(priceDomain.max, queryHi as number) : priceDomain.max,
  ]
  const commitPrice = (lo: number, hi: number) => {
    const cl = Math.min(Math.max(Math.round(lo), priceDomain.min), priceDomain.max)
    const ch = Math.min(Math.max(Math.round(hi), priceDomain.min), priceDomain.max)
    const [lo2, hi2] = cl <= ch ? [cl, ch] : [ch, cl]
    setDragPrice(null)
    applyParams({
      minPrice: lo2 > priceDomain.min ? String(lo2) : undefined,
      maxPrice: hi2 < priceDomain.max ? String(hi2) : undefined,
    })
  }

  const queryString = useMemo(() => JSON.stringify(query), [query])
  const loadKey = `${locale}|${queryString}`
  const items = dataState && dataState.key === loadKey ? dataState.items : null
  const total = dataState && dataState.key === loadKey ? dataState.total : 0
  const failed = dataState?.key === loadKey && !!dataState.failed

  const buildParams = useCallback((page: number) => {
    const q = JSON.parse(queryString) as CatalogQuery
    const params = new URLSearchParams({ locale, pageSize: String(pageSize), page: String(page) })
    if (q.q) params.set('q', q.q)
    if (q.category) params.set('category', q.category)
    if (q.person) params.set('person', q.person)
    if (q.format) params.set('format', q.format)
    if (q.language) params.set('language', q.language)
    if (q.publisher) params.set('publisher', q.publisher)
    if (q.availability) params.set('availability', q.availability)
    if (q.minPrice) params.set('minPrice', q.minPrice)
    if (q.maxPrice) params.set('maxPrice', q.maxPrice)
    if (q.sale) params.set('sale', q.sale)
    if (q.fixed) params.set('fixed', q.fixed)
    if (q.series) params.set('series', q.series)
    params.set('sort', q.sort ?? 'featured')
    return params
  }, [queryString, locale])

  useEffect(() => {
    // SSR-seeded (or already showing) this exact query — no refetch needed.
    if (dataState?.key === loadKey) return
    let alive = true
    apiGet<{ items: ProductCardDTO[]; total: number }>('/api/products?' + buildParams(1).toString())
      .then((r) => { if (alive) setDataState({ key: loadKey, items: r.items, total: r.total }) })
      .catch(() => { if (alive) setDataState({ key: loadKey, items: [], total: 0, failed: true }) })
    return () => { alive = false }
  }, [loadKey, buildParams, dataState?.key])

  const loadMore = async () => {
    if (!items) return
    setLoadingMore(true)
    try {
      const r = await apiGet<{ items: ProductCardDTO[]; total: number }>('/api/products?' + buildParams(Math.floor(items.length / pageSize) + 1).toString())
      setDataState({ key: loadKey, items: [...items, ...r.items], total: r.total })
    } catch { /* keep list */ } finally { setLoadingMore(false) }
  }

  /** Multi-param setter — sale/fixed are mutually exclusive sets (excluded
   *  titles never carry a sale price), so activating one clears the other. */
  const applyParams = (patch: Partial<CatalogQuery>) => {
    setQuery((prev) => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(patch)) {
        if (!v) delete next[k as keyof CatalogQuery]
        else next[k as keyof CatalogQuery] = v
      }
      delete next.page
      return next
    })
    // reflect in URL for shareability (PRD 9.1 preserve filter state) —
    // always keep the locale segment so FA users don't flip back to EN
    const next = { ...query, ...patch } as CatalogQuery
    const params = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => { if (v && k !== 'page') params.set(k, v) })
    const qs = params.toString()
    navigate(`/${locale}/books${qs ? `?${qs}` : ''}`, { replace: true })
  }

  const setParam = (key: keyof CatalogQuery, value?: string) => applyParams({ [key]: value })
  const setMulti = (key: 'category' | 'format' | 'language' | 'publisher', list: string[]) =>
    applyParams({ [key]: list.length > 0 ? list.join(',') : undefined })

  const clearFilters = () => {
    setQuery((prev) => ({ q: prev.q, sort: prev.sort }))
    setDragPrice(null)
    navigate(`/${locale}/books${query.sort ? `?sort=${query.sort}` : ''}`, { replace: true })
  }

  const activeCategory = categories.find((c) => c.slug === query.category)
  const selSeries = query.series ?? null
  const activeSeries = seriesList.find((s) => s.slug === selSeries) ?? null
  const activeFilterCount =
    selCats.length + selFormats.length + selLangs.length + selPubs.length +
    (availActive ? 1 : 0) + (saleActive ? 1 : 0) + (priceActive ? 1 : 0) + (query.fixed ? 1 : 0) + (selSeries ? 1 : 0)

  const countBadge = (n: number) => (
    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
      {dig(n)}
    </span>
  )

  /** One check row (option + localized count). */
  const checkRow = (opts: { key: string; label: string; count?: number; checked: boolean; onToggle: () => void }) => (
    <Label key={opts.key} className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 text-sm font-normal text-ink-2 transition-colors hover:text-ink">
      <Checkbox checked={opts.checked} onCheckedChange={opts.onToggle} aria-label={opts.label} />
      <span className="min-w-0 flex-1 truncate">{opts.label}</span>
      {opts.count != null && <span className="text-xs tabular-nums text-ink-3">{dig(opts.count)}</span>}
    </Label>
  )

  const accordionValue = ['category', 'format', 'availability', 'language', 'publisher', 'price']

  // Facet options, de-duplicated defensively (a duplicate value would mean a
  // duplicate React key — the exact console error the user reported).
  const languageOptions = useMemo(
    () => [...new Map((facets?.languages ?? []).map((l) => [l.value, l])).values()],
    [facets],
  )
  const publisherOptions = useMemo(
    () => [...new Map((facets?.publishers ?? []).map((p) => [p.value, p])).values()],
    [facets],
  )

  const filterPanel = (
    <>
    <Accordion type="multiple" defaultValue={accordionValue} className="rounded-lg border border-line bg-white px-4">
      {/* Category — multi-select accordion */}
      <AccordionItem value="category" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.category}{selCats.length > 0 && countBadge(selCats.length)}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-0.5">
            {categories.map((c) => checkRow({
              key: c.slug, label: c.name, count: c.productCount,
              checked: selCats.includes(c.slug),
              onToggle: () => setMulti('category', toggleIn(selCats, c.slug)),
            }))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Format — multi-select accordion (options from live variants) */}
      <AccordionItem value="format" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.format}{selFormats.length > 0 && countBadge(selFormats.length)}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-0.5">
            {(facets?.formats ?? [{ value: 'PAPERBACK', count: 0 }, { value: 'HARDCOVER', count: 0 }]).map((f) => checkRow({
              key: f.value, label: formatLabel(f.value, locale), count: f.count,
              checked: selFormats.includes(f.value),
              onToggle: () => setMulti('format', toggleIn(selFormats, f.value)),
            }))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Availability — multi-select accordion */}
      <AccordionItem value="availability" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.availability}{(availActive || saleActive) && countBadge((availActive ? 1 : 0) + (saleActive ? 1 : 0))}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-0.5">
            {checkRow({
              key: 'in', label: t.catalog.inStockOnly,
              checked: availActive,
              onToggle: () => setParam('availability', availActive ? undefined : 'in'),
            })}
            {promotion && checkRow({
              key: 'sale', label: t.catalog.onSale,
              checked: saleActive,
              onToggle: () => applyParams(saleActive ? { sale: undefined } : { sale: '1', fixed: undefined }),
            })}
            {promotion && (
              <span className="inline-flex items-center gap-1.5 pb-1 ps-7 text-xs text-ink-3">
                <Tag className="h-3 w-3 text-orange-dark mirror-rtl" aria-hidden />
                <span className="rounded bg-orange-accent/10 px-1.5 py-px font-mono text-[10px] font-bold text-orange-dark bdi" dir="ltr">{promotion.badge}</span>
              </span>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Language — multi-select accordion (user request: «در فیلتر کتاب‌ها
          بخش Language و Publisher هم باید منوی آکاردئونی بشن») */}
      <AccordionItem value="language" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.language}{selLangs.length > 0 && countBadge(selLangs.length)}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-0.5">
            {languageOptions.map((l) => checkRow({
              key: l.value, label: bookLanguageLabel(l.value, locale), count: l.count,
              checked: selLangs.includes(l.value),
              onToggle: () => setMulti('language', toggleIn(selLangs, l.value)),
            }))}
            {languageOptions.length === 0 && <p className="pb-2 text-xs text-ink-3">{t.catalog.allLanguages}</p>}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Publisher — multi-select accordion (options from DB, de-duplicated) */}
      <AccordionItem value="publisher" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.publisher}{selPubs.length > 0 && countBadge(selPubs.length)}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-0.5">
            {publisherOptions.map((p) => checkRow({
              key: p.value, label: p.value, count: p.count,
              checked: selPubs.includes(p.value),
              onToggle: () => setMulti('publisher', toggleIn(selPubs, p.value)),
            }))}
            {publisherOptions.length === 0 && <p className="pb-2 text-xs text-ink-3">{t.catalog.allPublishers}</p>}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Price — dual-range slider + numeric inputs */}
      <AccordionItem value="price" className="border-b border-line last:border-b-0">
        <AccordionTrigger className="py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2 hover:no-underline hover:text-ink [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-3">
          <span className="flex items-center gap-2">{t.catalog.price}{priceActive && countBadge(1)}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <div className="px-0.5 pt-1">
            <Slider
              dir={rtlDir}
              min={priceDomain.min}
              max={priceDomain.max}
              step={1}
              minStepsBetweenThumbs={1}
              value={sliderValue}
              onValueChange={(v) => setDragPrice([v[0] ?? priceDomain.min, v[1] ?? priceDomain.max])}
              onValueCommit={(v) => commitPrice(v[0] ?? priceDomain.min, v[1] ?? priceDomain.max)}
              aria-label={t.catalog.price}
              className="[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:h-3.5 [&_[data-slot=slider-thumb]]:w-3.5 [&_[data-slot=slider-thumb]]:border-brand [&_[data-slot=slider-range]]:bg-brand"
            />
            <div className="mt-3.5 flex items-center gap-2">
              <Input
                type="text" inputMode="numeric" autoComplete="off" min={priceDomain.min} max={sliderValue[1]} className="h-9"
                placeholder={t.catalog.minPrice}
                aria-label={t.catalog.priceMinLabel}
                value={dig(sliderValue[0])}
                onChange={(e) => { const n = parsePrice(e.target.value); setDragPrice([Number.isFinite(n) ? n : priceDomain.min, sliderValue[1]]) }}
                onBlur={() => commitPrice(sliderValue[0], sliderValue[1])}
                onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(sliderValue[0], sliderValue[1]) }}
              />
              <span className="text-ink-3">—</span>
              <Input
                type="text" inputMode="numeric" autoComplete="off" min={sliderValue[0]} max={priceDomain.max} className="h-9"
                placeholder={t.catalog.maxPrice}
                aria-label={t.catalog.priceMaxLabel}
                value={dig(sliderValue[1])}
                onChange={(e) => { const n = parsePrice(e.target.value); setDragPrice([sliderValue[0], Number.isFinite(n) ? n : priceDomain.max]) }}
                onBlur={() => commitPrice(sliderValue[0], sliderValue[1])}
                onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(sliderValue[0], sliderValue[1]) }}
              />
              <span className="text-xs text-ink-3">€</span>
            </div>
            <p className="mt-2 text-[11px] text-ink-3 bdi" dir="ltr">
              €{dig(sliderValue[0])} – €{dig(sliderValue[1])} · {dig(priceDomain.min)}–{dig(priceDomain.max)} €
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    {/* Bottom reset — back to the base state (user request: «یک دکمه جهت clear
        کردن فیلترها یا برگشتن به حالت پایه» at the bottom of the filter box). */}
    <Button
      type="button"
      variant="outline"
      onClick={clearFilters}
      disabled={activeFilterCount === 0}
      aria-label={t.catalog.resetFilters}
      className="mt-3 w-full gap-2 border-line text-ink-2 hover:border-error/40 hover:bg-error/5 hover:text-error"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t.catalog.resetFilters}
    </Button>
    </>
  )

  const sortValue = query.sort ?? 'featured'
  const shownCount = items?.length ?? 0

  const chips: { key: string; label: string; clear: () => void }[] = [
    ...selCats.map((c) => ({ key: `cat-${c}`, label: categories.find((x) => x.slug === c)?.name ?? c, clear: () => setMulti('category', toggleIn(selCats, c)) })),
    ...selFormats.map((f) => ({ key: `fmt-${f}`, label: formatLabel(f, locale), clear: () => setMulti('format', toggleIn(selFormats, f)) })),
    ...selLangs.map((l) => ({ key: `lang-${l}`, label: bookLanguageLabel(l, locale), clear: () => setMulti('language', toggleIn(selLangs, l)) })),
    ...selPubs.map((p) => ({ key: `pub-${p}`, label: p, clear: () => setMulti('publisher', toggleIn(selPubs, p)) })),
    ...(availActive ? [{ key: 'avail', label: t.catalog.inStockOnly, clear: () => setParam('availability', undefined) }] : []),
    ...(saleActive ? [{ key: 'sale', label: t.catalog.onSale, clear: () => applyParams({ sale: undefined }) }] : []),
    ...(query.fixed ? [{ key: 'fixed', label: t.catalog.fixedFilter, clear: () => applyParams({ fixed: undefined }) }] : []),
    ...(selSeries ? [{ key: `series-${selSeries}`, label: activeSeries?.name ?? selSeries, clear: () => setParam('series', undefined) }] : []),
    ...(priceActive ? [{
      key: 'price',
      label: `€${query.minPrice ?? priceDomain.min} – €${query.maxPrice ?? priceDomain.max}`,
      clear: () => applyParams({ minPrice: undefined, maxPrice: undefined }),
    }] : []),
  ]

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: getDict(locale).nav.home, href: `/${locale}` }, { label: activeCategory?.name ?? (query.fixed === '1' && promotion ? t.catalog.fixedTitle : query.sale === '1' && promotion ? t.catalog.saleTitle : heading ?? t.catalog.title) }]} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{activeCategory?.name ?? (query.fixed === '1' && promotion ? t.catalog.fixedTitle : query.sale === '1' && promotion ? t.catalog.saleTitle : heading ?? t.catalog.title)}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {activeSeries
              ? t.catalog.seriesDesc
              : activeCategory?.description ?? (locale === 'fa' ? 'همهٔ عناوین پرس‌پیکس' : 'Every title from Persepix')}
            {' · '}
            {items ? tf(t.catalog.count, { n: total }) : '…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile filters */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-10 gap-2 lg:hidden">
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                {t.catalog.filters}
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{dig(activeFilterCount)}</span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined} side={locale === 'fa' ? 'right' : 'left'} dir={rtlDir} className="w-80 overflow-y-auto p-5 scrollbar-slim">
              <SheetHeader className="px-0 pb-2 pt-0">
                <SheetTitle className="text-base">{t.catalog.filters}</SheetTitle>
              </SheetHeader>
              {filterPanel}
              <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>{t.catalog.applyFilters}</Button>
            </SheetContent>
          </Sheet>
          {/* Sort */}
          <div className="min-w-[190px]">
            <Select value={sortValue} onValueChange={(v) => setParam('sort', v === 'featured' ? undefined : v)}>
              <SelectTrigger aria-label={t.catalog.sort} className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={rtlDir}>
                <SelectItem value="featured">{t.catalog.sortFeatured}</SelectItem>
                <SelectItem value="newest">{t.catalog.sortNewest}</SelectItem>
                <SelectItem value="bestselling">{t.catalog.sortBestselling}</SelectItem>
                <SelectItem value="price-asc">{t.catalog.sortPriceAsc}</SelectItem>
                <SelectItem value="price-desc">{t.catalog.sortPriceDesc}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* R5: series chip rail — one-click shelf filtering on /books. Fed by
          /api/series (same payload as the /series index); hides itself when
          the shop has no published series. */}
      {seriesList.length > 0 && (
        <div className="mb-5 flex items-center gap-3" role="group" aria-label={t.catalog.seriesLabel}>
          <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 sm:inline">
            {t.catalog.seriesLabel}
          </span>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 scrollbar-slim">
            {seriesList.map((s) => {
              const active = s.slug === selSeries
              return (
                <button
                  key={s.slug} type="button" onClick={() => setParam('series', active ? undefined : s.slug)}
                  aria-pressed={active} title={s.name}
                  className={cn(
                    'group flex h-11 shrink-0 items-center gap-2.5 rounded-full border ps-2 pe-4 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
                    active
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-line bg-white text-ink-2 hover:-translate-y-px hover:border-brand/40 hover:text-ink hover:shadow-sm',
                  )}
                >
                  <span className="relative flex h-7 w-9 shrink-0 items-center justify-center" aria-hidden>
                    {s.covers.length >= 2 ? (
                      <span className="relative block h-7 w-9">
                        <img src={s.covers[1]!} alt="" width={18} height={24} loading="lazy" className="absolute start-4 top-0 h-6 w-4.5 rounded-[3px] border border-white/80 object-cover shadow-sm" />
                        <img src={s.covers[0]!} alt="" width={18} height={24} loading="lazy" className="absolute start-0 top-0.5 h-6 w-4.5 rounded-[3px] border border-white/80 object-cover shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5" />
                      </span>
                    ) : s.cover ? (
                      <img src={s.cover} alt="" width={20} height={28} loading="lazy" className="h-7 w-5 rounded-[3px] border border-white/80 object-cover shadow-sm" />
                    ) : (
                      <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', active ? 'bg-white/20' : 'bg-brand-soft')}>
                        <Layers className={cn('h-3.5 w-3.5', active ? 'text-white' : 'text-brand')} aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">{s.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[10px] font-bold leading-4 tabular-nums transition-colors',
                      active ? 'bg-white/25 text-white' : 'bg-soft text-ink-3 group-hover:bg-brand-soft group-hover:text-brand',
                    )}
                  >
                    {dig(s.count)}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sale banner (sale-filtered catalog view) */}
      {query.sale === '1' && promotion && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-orange-accent/30 bg-gradient-to-r from-orange-accent/[0.10] via-orange-accent/[0.04] to-transparent px-4 py-3" role="status">
          <span className="promo-dot inline-block h-2 w-2 shrink-0 rounded-full bg-orange-accent" aria-hidden />
          <p className="text-sm font-semibold text-ink">{locale === 'fa' ? promotion.noteFa ?? promotion.name : promotion.noteEn ?? promotion.name}</p>
          <span className="rounded-full bg-orange-accent px-2 py-0.5 text-[11px] font-bold text-white bdi" dir="ltr">{promotion.badge}</span>
          {(promotion.excludedCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => applyParams(query.fixed === '1' ? { fixed: undefined } : { fixed: '1', sale: undefined })}
              aria-pressed={query.fixed === '1'}
              title={t.catalog.saleExcludesNote}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-accent/50',
                query.fixed === '1'
                  ? 'border-orange-accent bg-orange-accent/15 text-orange-dark'
                  : 'border-line bg-white/85 text-ink-3 hover:border-orange-accent/50 hover:text-orange-dark',
              )}
            >
              <Ban className={cn('h-3 w-3 transition-transform', query.fixed === '1' && 'scale-110')} aria-hidden />
              {tf(t.catalog.saleExcludes, { n: locale === 'fa' ? faDigits(promotion.excludedCount ?? 0) : String(promotion.excludedCount ?? 0) })}
            </button>
          )}
          <p className="w-full text-xs leading-relaxed text-ink-3 sm:w-auto sm:flex-1">{locale === 'fa' ? 'قیمت‌های حراج به‌صورت خودکار اعمال شده‌اند — بدون کد تخفیف.' : 'Sale prices are applied automatically — no code needed.'}</p>
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-3">{t.catalog.activeFilters}:</span>
          {chips.map((chip) => (
            <button
              key={chip.key} type="button"
              onClick={chip.clear}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/30 bg-brand-soft px-2.5 text-xs font-medium text-brand hover:bg-brand/20"
            >
              {chip.label} <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button
            type="button" onClick={clearFilters}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-ink-3 transition-colors hover:text-error"
          >
            {t.catalog.clear}
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside aria-label={t.catalog.filters} className="hidden lg:block">
          <div className="sticky top-28">{filterPanel}</div>
        </aside>
        <div>
          {failed ? (
            <EmptyState title={t.common.error} action={<Button onClick={() => setDataState(null)}>{t.common.retry}</Button>} />
          ) : !items ? (
            <Spinner label={t.common.loading} />
          ) : items.length === 0 ? (
            <EmptyState
              title={t.common.noResults + (query.q ? ` “${query.q}”` : '')}
              body={query.sale === '1' && activeFilterCount <= 1 ? (locale === 'fa' ? 'هیچ کتابی در حراج نیست — به‌زودی سر بزنید.' : 'No books are on sale right now — check back soon.') : t.common.suggested}
              action={<Button onClick={() => navigate('/books')}>{t.catalog.clear}</Button>}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((p, i) => <ProductCard key={p.id} p={p} locale={locale} priority={i < 4} />)}
              </div>
              {shownCount < total && (
                <div className="mt-10 flex justify-center">
                  <Button
                    variant="outline" size="lg" className="h-12 px-8"
                    disabled={loadingMore}
                    onClick={loadMore}
                  >
                    {loadingMore ? t.common.loading : t.common.more}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
