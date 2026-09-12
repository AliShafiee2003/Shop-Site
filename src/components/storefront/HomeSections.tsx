'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getShelfMark, TiltCircle } from './shelf-icons'
import { navigate } from '@/lib/router'
import { apiGet } from '@/lib/api'
import { getDict } from '@/lib/i18n'
import { faDigits } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { ProductCard } from './ProductCard'
import { ProductRow } from './ProductRow'
import { HeroSlider } from './HeroSlider'
import { ScrollStory } from './ScrollStory'
import { ForYouShelf } from './ForYouShelf'
import { RecentlyViewed } from './RecentlyViewed'
import { SectionHeading, Skeleton, Reveal } from './bits'
import type { Locale, HomeSection, ProductCard as ProductCardDTO, CategoryDTO, ArticleListItem } from '@/lib/types'


/** ProductRow moved to ./ProductRow.tsx so the For-you shelf and
 *  Recently-viewed shelf can share the exact same slider mechanic. */

function ProductShelf({ section, locale }: { section: Extract<HomeSection, { type: 'PRODUCT_SHELF' }>; locale: Locale }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const [products, setProducts] = useState<ProductCardDTO[] | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ locale, pageSize: String(s.limit ?? 8) })
    switch (s.source) {
      case 'bestselling':
      case 'bestsellers': params.set('sort', 'bestselling'); break
      case 'featured': params.set('sort', 'featured'); break
      case 'category': if (s.categorySlug) params.set('category', s.categorySlug); params.set('sort', 'newest'); break
      case 'in-stock': params.set('availability', 'in'); params.set('sort', 'newest'); break
      // Discounted = the live promotion actually lowers the effective price
      // (sale=1). Flash = same, but ONLY while the promotion's deadline sits
      // within `flashHours` from now — the module empties itself otherwise
      // (and hideWhenEmpty removes it from the page entirely).
      case 'discounted': params.set('sale', '1'); params.set('sort', 'bestselling'); break
      case 'flash': params.set('sale', '1'); params.set('flashHours', String(s.flashHours ?? 12)); params.set('sort', 'bestselling'); break
      default: params.set('sort', 'newest')
    }
    apiGet<{ items: ProductCardDTO[] }>(`/api/products?${params.toString()}`)
      .then((r) => setProducts(s.hideOutOfStock ? r.items.filter((p) => p.inStock) : r.items))
      .catch(() => setProducts([]))
  }, [locale, s.source, s.categorySlug, s.limit, s.hideOutOfStock, s.flashHours])

  const heading = isFa ? (s.headingFa || s.headingEn) : s.headingEn
  const description = isFa ? (s.descriptionFa || s.descriptionEn) : s.descriptionEn
  const ctaLabel = isFa ? (s.ctaFa || s.ctaEn) : s.ctaEn
  const ctaHref = s.ctaHref ?? '/books'

  // Self-cleaning modules (flash deals, seasonal shelves): once the fetch came
  // back empty, remove the WHOLE module — heading included — so the page never
  // shows an orphan section title. While loading, the skeleton still renders.
  if (products && products.length === 0 && s.hideWhenEmpty) return null

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-label={heading}>
      {/* Whole-module reveal — heading + slider rise together as one quiet
          set («مجموعه هر ماژول آروم ظاهر بشه»); per-block stagger stays
          exclusive to the editorial boxes. The heading's mb-5 sits between
          two siblings INSIDE the wrapper, so the gap survives unchanged. */}
      <Reveal>
        <SectionHeading title={heading} description={description} ctaLabel={ctaLabel} ctaHref={ctaHref} locale={locale} />
        {!products ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">{getDict(locale).common.empty}</p>
        ) : s.layout === 'carousel' ? (
          // Static spread when everything fits; BOUNDED slider (no loop) when
          // the row overflows the available width (decided inside ProductRow).
          <ProductRow products={products} locale={locale} label={heading ?? ''} />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {products.slice(0, s.limit ?? 8).map((p, i) => <ProductCard key={p.id} p={p} locale={locale} priority={i < 4} />)}
          </div>
        )}
      </Reveal>
    </section>
  )
}

/** Category disc + label — shared by the static spread and the loop slider. */
function CategoryItem({ c, live = true, snap = false }: { c: CategoryDTO; live?: boolean; snap?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { if (live) navigate(`/categories/${c.slug}`) }}
      tabIndex={live ? 0 : -1}
      aria-hidden={!live || undefined}
      aria-label={c.name}
      className={cn(
        'group relative z-0 flex w-24 shrink-0 flex-col items-center gap-2.5 hover:z-10 sm:w-auto',
        snap && 'snap-start',
      )}
    >
      {/* Custom square-PNG artwork covers the whole disc as a circular badge
          (Task 51); the preset shelf mark renders only when there is no upload. */}
      <TiltCircle color={c.color ?? '#014B74'} imageSrc={c.iconUrl ?? undefined}>
        {c.iconUrl ? null : getShelfMark(c.slug, c.icon)({ className: 'h-9 w-9' })}
      </TiltCircle>
      <span className="text-center text-[13px] font-medium leading-tight text-ink-2 transition group-hover:text-brand">{c.name}</span>
    </button>
  )
}

/**
 * Categories row — a calm static spread when everything fits the available
 * width; an infinite loop slider ONLY when the content overflows (user:
 * «اگر عرض کافی برای نمایش همه کتگوری‌ها وجود داره دیگه لازم نیست اسلایدر
 * داشته باشیم — اسلایدر راه حلی هست برای وقتی که عرض کم هست»).
 *
 * Slider mode: phones swipe with the browser's own touch momentum; desktop
 * can additionally press-and-drag with the mouse (user request) and gets
 * always-on arrow buttons. The set is rendered `copies` times inside a native
 * overflow-x scroller; home = copy #1, and whenever the offset drifts near
 * either end of the copy field it is silently re-based by one `period`
 * (= width of one copy + gap) — visually a no-op, since the content is
 * periodic. All arithmetic runs in u-space (forward-positive; u = -scrollLeft
 * in RTL per spec-compliant browsers) so LTR and RTL share one rule set.
 */
function CategoryRow({ cats, locale, label }: { cats: CategoryDTO[]; locale: Locale; label: string }) {
  const isRtl = locale === 'fa'
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const periodRef = useRef(0)
  const dragRef = useRef<{ startX: number; baseX: number; latestDx: number; captured: boolean; raf: number } | null>(null)
  const suppressClickRef = useRef(false)
  const [loop, setLoop] = useState(false)
  const [copies, setCopies] = useState(1)

  /** Measure one copy's width, re-decide static vs loop on every geometry
   *  change, and in loop mode guarantee enough copies to cover the viewport
   *  on both sides (copies ≥ ceil(viewport/period) + 2) then (re)base. */
  const reflow = useCallback((preserve: boolean) => {
    const el = trackRef.current
    const n = cats.length
    if (!el || n === 0 || el.children.length < n) return
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    // Natural width of one set = Σ item widths + (n-1)·gaps; the loop period
    // adds one more gap. Summing widths (instead of measuring edge-to-edge)
    // keeps the measurement immune to `justify-between` spreading in static
    // mode — which otherwise feeds back into the mode decision and oscillates
    // static↔loop forever (observed: kids flip-flopping 6↔18 every ~200ms).
    let w = 0
    for (let i = 0; i < n; i++) w += (el.children[i] as HTMLElement).offsetWidth
    const setW = w + (n - 1) * gap
    const period = setW + gap
    if (!(period > 40)) return
    periodRef.current = period
    if (setW <= el.clientWidth - 12) {
      // Everything fits — no slider (user point ①).
      if (loop) { setLoop(false); setCopies(1) }
      return
    }
    const need = Math.max(3, Math.ceil(el.clientWidth / period) + 2)
    if (!loop) { setLoop(true); setCopies(need); return }
    if (need > copies) { setCopies(need); return } // structure rebuilds; layout effect re-bases
    if (el.dataset.homified !== '1') {
      el.dataset.homified = '1'
      el.scrollLeft = isRtl ? -period : period
    } else if (preserve) {
      // Keep the same spot within the repeating pattern across resizes.
      const u = isRtl ? -el.scrollLeft : el.scrollLeft
      const rel = (((u - period) % period) + period) % period
      const nu = period + rel
      el.scrollLeft = isRtl ? -nu : nu
    }
  }, [cats.length, isRtl, copies, loop])

  // Viewport resizes — and the initial geometry pass (RO fires once on
  // observe, in the same frame before paint) — re-measure, keeping the
  // user's relative position.
  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => reflow(true))
    ro.observe(el)
    // Webfonts change item label widths — re-decide once they settle.
    document.fonts?.ready.then(() => reflow(false)).catch(() => {})
    return () => ro.disconnect()
  }, [reflow])

  /** Silent re-base while scrolling — rAF-throttled. The jump lands on
   *  pixel-identical content, so it is invisible even mid-momentum. While a
   *  mouse drag is active the drag anchor is shifted by the same delta, so
   *  the absolute `baseX - dx` mapping stays continuous. */
  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = trackRef.current
      const p = periodRef.current
      if (!el || p < 40) return
      const u = isRtl ? -el.scrollLeft : el.scrollLeft
      let nu = u
      if (u < 4) nu = u + p
      else if (u > 2 * p) nu = u - p
      if (nu === u) return
      const nx = isRtl ? -nu : nu
      const delta = nx - el.scrollLeft
      el.scrollLeft = nx
      const d = dragRef.current
      if (d?.captured) d.baseX += delta
    })
  }, [isRtl])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [onScroll])

  /** Mouse press-and-drag to scroll (user: «با کلیک کردن، نگه داشتن و کشیدن
   *  موس به چپ یا راست») — mouse/pen only; touch already scrolls natively.
   *  Pointer capture is LAZY: it engages only after 6px of movement, so a
   *  plain click still reaches the disc buttons; once a real drag happened,
   *  the trailing click is suppressed. */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = trackRef.current
    if (!el) return
    suppressClickRef.current = false
    dragRef.current = { startX: e.clientX, baseX: el.scrollLeft, latestDx: 0, captured: false, raf: 0 }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const el = trackRef.current
    if (!d || !el) return
    const dx = e.clientX - d.startX
    d.latestDx = dx
    if (!d.captured) {
      if (Math.abs(dx) < 6) return
      d.captured = true
      suppressClickRef.current = true
      // While CSS scroll-snap is armed, the snapper fights every direct
      // scrollLeft write (rubber-banding = the reported «لگ میزنه» stutter),
      // so it is disarmed for the duration of the drag; the browser re-snaps
      // on release. Children lose pointer-events so card hover/click can't
      // fire mid-drag (also kills hover-transition repaint churn).
      el.classList.add('drag-scrolling')
      try { el.setPointerCapture(e.pointerId) } catch { /* already released */ }
    }
    // Works unchanged in RTL: drag right (dx > 0) → scrollLeft decreases,
    // i.e. the content moves rightward in both writing directions.
    // The write is rAF-batched — pointermove fires at the input-polling rate
    // (often above the display rate) and a scrollLeft write per event forces
    // layout each time. baseX is read INSIDE the frame so any re-base that
    // ran in between is respected (CategoryRow shifts it by ±period).
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        d.raf = 0
        const el2 = trackRef.current
        if (el2 && dragRef.current === d) el2.scrollLeft = d.baseX - d.latestDx
      })
    }
  }, [])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    if (d.raf) cancelAnimationFrame(d.raf)
    const el = trackRef.current
    if (el) {
      // Final flush, then re-arm scroll snapping — a proximity re-snap at
      // most settles half a card, which reads as an intentional soft stop.
      el.scrollLeft = d.baseX - d.latestDx
      el.classList.remove('drag-scrolling')
    }
    try { trackRef.current?.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const nudge = useCallback((forward: boolean) => {
    const el = trackRef.current
    const p = periodRef.current
    if (!el || !(p > 40)) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = Math.max(el.clientWidth * 0.6, 180)
    const du = forward ? step : -step
    const maxU = el.scrollWidth - el.clientWidth
    let u = isRtl ? -el.scrollLeft : el.scrollLeft
    // Canonicalise (a long momentum scroll may sit past the band), then
    // pre-rebase so the upcoming smooth scroll stays INSIDE the re-base band
    // AND inside the cloned content — an instant scrollLeft write mid-animation
    // would cancel the glide (observed: EN target 1334 got 823; FA target
    // -1334 hit the content ceiling and stalled at -704).
    while (u > 2 * p) u -= p
    while (u < 4) u += p
    while (u + du > 2 * p - 4 && u - p > 4) u -= p
    while (u + du > maxU - 4 && u - p > 4) u -= p
    if (u + du < 4 && u + p <= 2 * p) u += p
    const x = isRtl ? -u : u
    if (x !== el.scrollLeft) el.scrollLeft = x
    el.scrollBy({ left: isRtl ? -du : du, behavior: reduced ? 'auto' : 'smooth' })
  }, [isRtl])

  const d = getDict(locale)
  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        role="group"
        aria-roledescription={loop ? 'carousel' : undefined}
        aria-label={label}
        onPointerDown={loop ? onPointerDown : undefined}
        onPointerMove={loop ? onPointerMove : undefined}
        onPointerUp={loop ? endDrag : undefined}
        onPointerCancel={loop ? endDrag : undefined}
        onClickCapture={loop ? onClickCapture : undefined}
        className={cn(
          'scrollbar-none -mx-1 -my-3 flex gap-4 overflow-x-auto overscroll-x-contain px-1 py-3 sm:gap-5',
          loop
            ? 'cursor-grab select-none active:cursor-grabbing'
            : 'snap-x sm:justify-between sm:overflow-visible',
        )}
      >
        {/* -my-3 + py-3: net-zero layout shift, but the scroll clip box gains
            12px of vertical headroom — the hover-tilted disc no longer gets its
            top sliced off on narrow viewports. In loop mode copies #0 and #2+
            are exact clones: hidden from AT, not focusable, clicks inert. */}
        {Array.from({ length: copies }).flatMap((_, set) =>
          cats.map((c) => (
            <CategoryItem key={`${set}:${c.slug}`} c={c} live={!loop || set === 1} snap={!loop} />
          )),
        )}
      </div>
      {/* Desktop arrows (user: «یک دکمه هم داشته باشیم که کاربران گیج نشن») —
          only when the row actually overflows, never disabled: the loop is
          infinite. start/end mirror in RTL; chevrons flip via .mirror-rtl. */}
      {loop && (
        <>
          <button
            type="button"
            onClick={() => nudge(false)}
            aria-label={d.home.catPrev}
            className="absolute -start-3 top-7 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm transition hover:bg-soft hover:shadow sm:flex"
          >
            <ChevronLeft className="h-5 w-5 mirror-rtl" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => nudge(true)}
            aria-label={d.home.catNext}
            className="absolute -end-3 top-7 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm transition hover:bg-soft hover:shadow sm:flex"
          >
            <ChevronRight className="h-5 w-5 mirror-rtl" aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}

function CategoryCarousel({ section, locale }: { section: Extract<HomeSection, { type: 'CATEGORY_CAROUSEL' }>; locale: Locale }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const [cats, setCats] = useState<CategoryDTO[] | null>(null)

  useEffect(() => {
    apiGet<CategoryDTO[]>('/api/categories?locale=' + locale)
      .then((r) => {
        const order = s.slugs ?? []
        const sorted = [...r].sort((a, b) => {
          const ia = order.indexOf(a.slug), ib = order.indexOf(b.slug)
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
        })
        setCats(sorted)
      })
      .catch(() => setCats([]))
  }, [locale, s.slugs])

  const heading = isFa ? (s.headingFa || s.headingEn) : s.headingEn
  const description = isFa ? (s.descriptionFa || s.descriptionEn) : s.descriptionEn

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-label={heading}>
      <Reveal>
        <SectionHeading title={heading} description={description} locale={locale} />
        {!cats ? (
          <div className="flex gap-6 overflow-hidden">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-28 shrink-0 rounded-full" />)}</div>
        ) : (
          // Static spread when everything fits; infinite loop slider only when
          // the row overflows the available width (decided inside CategoryRow).
          <CategoryRow cats={cats} locale={locale} label={heading ?? ''} />
        )}
      </Reveal>
    </section>
  )
}

function PosterGrid({ section, locale }: { section: Extract<HomeSection, { type: 'POSTER_GRID' }>; locale: Locale }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const posters = s.posters ?? []
  const template = s.template ?? 'one_plus_two'
  const gridClass =
    template === 'one_wide' ? 'grid-cols-1'
    : template === 'two_equal' ? 'grid-cols-1 sm:grid-cols-2'
    : template === 'three_equal' ? 'grid-cols-1 sm:grid-cols-3'
    : template === 'four_grid' ? 'grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-1 sm:grid-cols-2' // one_plus_two

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-label={isFa ? 'کمپین‌ها' : 'Campaigns'}>
      {/* The whole poster set surfaces as one gentle unit. */}
      <Reveal>
        <div className={cn('grid gap-4', gridClass)}>
        {posters.map((p, i) => {
          const large = template === 'one_plus_two' ? p.span === 'large' : false
          const title = isFa ? (p.titleFa || p.titleEn) : p.titleEn
          const eyebrow = isFa ? (p.eyebrowFa || p.eyebrowEn) : p.eyebrowEn
          const text = isFa ? (p.textFa || p.textEn) : p.textEn
          const cta = isFa ? (p.ctaFa || p.ctaEn) : p.ctaEn
          const light = p.textColor === 'light'
          return (
            <button
              key={i} type="button" onClick={() => p.href && navigate(p.href)}
              className={cn(
                'group relative overflow-hidden rounded-lg border border-line text-start focus-visible:outline-brand',
                large ? 'sm:row-span-2 min-h-[320px] sm:min-h-[420px]' : 'min-h-[200px] sm:min-h-[204px]',
                !p.href && 'cursor-default'
              )}
            >
              { }
              <img
                src={p.image} alt={title ?? ''} loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
              <div className={cn('absolute inset-0', light ? 'bg-gradient-to-t from-black/70 via-black/25 to-transparent' : 'bg-gradient-to-t from-white/80 via-white/35 to-transparent')} />
              <div className="relative flex h-full min-h-[inherit] flex-col justify-end p-5 sm:p-6">
                {eyebrow ? (
                  <p className={cn('mb-1.5 text-xs font-semibold uppercase tracking-wide', light ? 'text-orange-accent' : 'text-orange-dark')}>{eyebrow}</p>
                ) : null}
                {title ? <h3 className={cn('max-w-xs text-lg font-bold leading-snug sm:text-xl', light ? 'text-white' : 'text-ink')}>{title}</h3> : null}
                {text ? <p className={cn('mt-1 max-w-xs text-sm', light ? 'text-white/85' : 'text-ink-2')}>{text}</p> : null}
                {cta ? (
                  <span className={cn('mt-3 inline-flex items-center gap-1 text-sm font-semibold', light ? 'text-white' : 'text-brand', !p.href && 'hidden')}>
                    {cta}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 mirror-rtl" aria-hidden />
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
        </div>
      </Reveal>
    </section>
  )
}

function EditorialFeature({ section, locale }: { section: Extract<HomeSection, { type: 'EDITORIAL_FEATURE' }>; locale: Locale }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const title = isFa ? (s.titleFa || s.titleEn) : s.titleEn
  const text = isFa ? (s.textFa || s.textEn) : s.textEn
  const quote = isFa ? (s.quoteFa || s.quoteEn) : s.quoteEn
  const attribution = isFa ? (s.attributionFa || s.attributionEn) : s.attributionEn
  const eyebrow = isFa ? (s.eyebrowFa || s.eyebrowEn) : s.eyebrowEn
  const cta = isFa ? (s.ctaFa || s.ctaEn) : s.ctaEn
  // Preset tokens map to design-system surfaces; a #hex value (admin "custom
  // color") is applied verbatim as an inline background.
  const hexBg = typeof s.bg === 'string' && s.bg.startsWith('#') ? s.bg : null
  const bgClass =
    s.bg === 'soft' ? 'bg-soft'
    : s.bg === 'brand' ? 'bg-brand'
    : s.bg === 'paper' ? 'journal-bg border-y border-brand/10'
    : hexBg ? ''
    : 'bg-white'
  const stacked = s.layout === 'stacked'
  // Section height — user: the highlight box should breathe (~600px) so the
  // page reads more minimal and lighter. Admin-selectable via `minH`.
  const minH = Number(s.minH ?? 600)

  // Staggered reveal (user spec): texts do NOT slide in from far below — they
  // rise ~22px while de-blurring, each block offset from the previous one
  // (eyebrow 0 → headline 100 → attribution 180 → body 260 → image 300 → CTA).
  return (
    <section
      className={cn('relative flex items-center overflow-hidden', bgClass)}
      style={{ minHeight: `${minH}px`, ...(hexBg ? { backgroundColor: hexBg } : {}) }}
      aria-label={title ?? eyebrow ?? 'Feature'}
    >
      {/* Paper treatment: an oversized quiet glyph gives the journal block its
          own identity without leaving the minimal system (user request). */}
      {s.bg === 'paper' && (
        <span aria-hidden className="pointer-events-none absolute -top-6 end-4 select-none font-serif text-[10rem] leading-none text-brand/[0.06] sm:end-10 sm:text-[13rem]">
          &rdquo;
        </span>
      )}
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className={cn(
          'grid items-center gap-5 sm:gap-8',
          stacked ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
        )}>
          {s.image ? (
            <Reveal
              delay={300}
              className={cn(
                'overflow-hidden rounded-lg border border-line',
                stacked && 'mx-auto max-w-lg',
                !stacked && s.layout === 'image-right' && 'md:order-2'
              )}
            >
              <img src={s.image} alt={attribution ?? title ?? ''} loading="lazy" className={cn('w-full object-cover', stacked ? 'aspect-[3/2]' : 'aspect-[4/3]')} />
            </Reveal>
          ) : null}
          <div className={cn(stacked && 'mx-auto max-w-lg text-center')}>
            {eyebrow ? (
              <Reveal delay={0} className="mb-2">
                <p className={cn('text-xs font-semibold uppercase tracking-wide', s.accentOrange ? 'text-orange-dark' : 'text-brand')}>{eyebrow}</p>
              </Reveal>
            ) : null}
            {quote ? (
              <Reveal delay={100}>
                <blockquote className={cn('text-xl font-semibold leading-snug sm:text-2xl', s.bg === 'brand' ? 'text-white' : 'text-ink')}>
                  <span className={cn('me-1', s.accentOrange ? 'text-orange-accent' : 'text-brand')} aria-hidden>&ldquo;</span>
                  {quote}
                  <span className={cn('ms-1', s.accentOrange ? 'text-orange-accent' : 'text-brand')} aria-hidden>&rdquo;</span>
                </blockquote>
              </Reveal>
            ) : title ? (
              <Reveal delay={100}>
                <h2 className={cn('text-xl font-bold leading-snug sm:text-2xl', s.bg === 'brand' ? 'text-white' : 'text-ink')}>{title}</h2>
              </Reveal>
            ) : null}
            {attribution ? (
              <Reveal delay={180} className="mt-2">
                <p className={cn('text-sm', s.bg === 'brand' ? 'text-white/75' : 'text-ink-3')}>— {attribution}</p>
              </Reveal>
            ) : null}
            {text ? (
              <Reveal delay={260} className="mt-3">
                <p className={cn('text-[15px] leading-relaxed', s.bg === 'brand' ? 'text-white/85' : 'text-ink-2')}>{text}</p>
              </Reveal>
            ) : null}
            {cta && s.ctaHref ? (
              <Reveal delay={340} className="mt-5">
                <Button
                  className={cn('h-11 px-5', s.bg === 'brand' ? 'bg-white text-brand hover:bg-white/90' : 'bg-brand text-white hover:bg-brand-hover', s.accentOrange && s.bg !== 'brand' && 'bg-orange-accent hover:bg-orange-dark')}
                  onClick={() => navigate(s.ctaHref!)}
                >
                  {cta}
                </Button>
              </Reveal>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

/** For-you shelf as an admin-placeable module — TasteSignal personalization
 *  (view/cart/purchase signals). The component itself hides until there are
 *  enough suggestions AND the visitor accepted consent. */
function ForYouSection({ section, locale }: { section: Extract<HomeSection, { type: 'FOR_YOU' }>; locale: Locale }) {
  const s = section.settings
  const override = locale === 'fa' ? s.headingFa : s.headingEn
  return (
    <ForYouShelf
      locale={locale}
      limit={s.limit}
      title={override || undefined}
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
    />
  )
}

/** Recently-viewed shelf as an admin-placeable module (localStorage history). */
function RecentlyViewedSection({ section, locale }: { section: Extract<HomeSection, { type: 'RECENTLY_VIEWED' }>; locale: Locale }) {
  const s = section.settings
  const override = locale === 'fa' ? s.headingFa : s.headingEn
  return (
    <RecentlyViewed
      limit={s.limit}
      title={override || undefined}
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
    />
  )
}

/** Journal teaser module — the latest published articles. Hides itself while
 *  the journal has no posts, so the admin can leave it enabled safely.
 *
 *  Admin-selectable background (white / soft tint / journal paper / brand navy
 *  / any #hex) and article count (2–4); the grid always follows the REAL
 *  number of rendered articles («خودکار باید سایزش تنظیم بشه»).
 *
 *  Card alignment contract (user bug report: the long middle title pushed the
 *  neighbouring images around because <button> grid items get their content
 *  VERTICALLY CENTERED by Chrome when the row stretches them):
 *  - every image starts at the same y AND ends at the same y (fixed 3:2 box);
 *  - every title starts at the same y (fixed 2-line block, clamped);
 *  - the lead flows below; a LONGER lead only grows its own card DOWNWARD
 *    (grid items-start) — image/title rows never shift. */
function ArticlesSection({ section, locale }: { section: Extract<HomeSection, { type: 'ARTICLES' }>; locale: Locale }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const [items, setItems] = useState<ArticleListItem[] | null>(null)

  useEffect(() => {
    let alive = true
    apiGet<ArticleListItem[]>(`/api/articles?locale=${locale}`)
      .then((r) => { if (alive) setItems((r ?? []).slice(0, s.limit ?? 3)) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [locale, s.limit])

  const heading = isFa ? (s.headingFa || s.headingEn) : s.headingEn
  const description = isFa ? (s.descriptionFa || s.descriptionEn) : s.descriptionEn
  const ctaLabel = isFa ? (s.ctaFa || s.ctaEn) : s.ctaEn
  const ctaHref = s.ctaHref ?? '/articles'
  const fmt = (iso?: string | null) => {
    if (!iso) return ''
    try { return new Date(iso).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } catch { return '' }
  }

  if (items && items.length === 0) return null

  const bg = s.bg ?? 'white'
  const onBrand = bg === 'brand'
  const bgClass =
    bg === 'soft' ? 'bg-soft'
    : bg === 'brand' ? 'bg-brand'
    : bg === 'paper' ? 'journal-bg border-y border-brand/10'
    : '' // white or custom #hex (hex goes through the inline style below)
  const hexStyle = bg.startsWith('#') ? { backgroundColor: bg } : undefined

  // Columns follow the rendered count, not the configured cap: 4 → 4-up,
  // 3 → 3-up, 2 → 2-up, 0/1 → single (kept book-width on larger screens).
  const n = items?.length ?? 0
  const gridClass =
    n >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4'
    : n === 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
    : n === 2 ? 'sm:grid-cols-2'
    : 'grid-cols-1'

  return (
    <section className={cn('relative overflow-hidden py-6 sm:py-8', bgClass)} style={hexStyle} aria-label={heading}>
      {bg === 'paper' && (
        <span aria-hidden className="pointer-events-none absolute -top-6 end-4 select-none font-serif text-[10rem] leading-none text-brand/[0.06] sm:end-10 sm:text-[13rem]">&rdquo;</span>
      )}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Whole-module reveal — heading + article cards surface together; the
            paper quote glyph above stays put as background decor. */}
        <Reveal>
          <SectionHeading title={heading} description={description} ctaLabel={ctaLabel} ctaHref={ctaHref} locale={locale} tone={onBrand ? 'light' : undefined} />
          {!items ? (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[3/2] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className={cn('grid items-start gap-x-5 gap-y-10 sm:gap-x-6 sm:gap-y-12 lg:gap-x-8', gridClass, n === 1 && 'sm:max-w-xl')}>
              {items.map((a) => (
                <button key={a.slug} type="button" onClick={() => navigate(`/articles/${a.slug}`)} className="group flex flex-col rounded-lg text-start focus-visible:outline-brand">
                  {/* Fixed 3:2 image box — equal column widths ⇒ every image starts
                      and ends on the same y across the row. */}
                  <div className={cn('aspect-[3/2] w-full shrink-0 overflow-hidden rounded-lg border bg-soft', onBrand ? 'border-white/25' : 'border-line')}>
                    {a.heroUrl ? (
                      <img src={a.heroUrl} alt={a.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    ) : (
                      <div className={cn('journal-bg flex h-full w-full items-center justify-center font-serif text-4xl', onBrand ? 'text-white/30' : 'text-brand/30')} aria-hidden>&rdquo;</div>
                    )}
                  </div>
                  {/* Exactly 2 lines tall for every card (min-h 2 × 1.4em) so the
                      lead below always starts at the same y. */}
                  <h3 className={cn('mt-3 line-clamp-2 min-h-[2.8em] text-[15px] font-semibold leading-[1.4]', onBrand ? 'text-white' : 'text-ink transition group-hover:text-brand')}>{a.title}</h3>
                  {a.excerpt ? <p className={cn('mt-1.5 text-sm leading-relaxed', onBrand ? 'text-white/80' : 'text-ink-2')}>{a.excerpt}</p> : null}
                  <p className={cn('mt-2 text-xs', onBrand ? 'text-white/60' : 'text-ink-3')}>
                    {fmt(a.publishedAt)}
                    {a.readingMinutes ? (isFa ? ` · ${faDigits(a.readingMinutes)} دقیقه مطالعه` : ` · ${a.readingMinutes} min read`) : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}

export function HomeSections({ sections, locale }: { sections: HomeSection[]; locale: Locale }) {
  const enabled = sections.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder)
  const firstId = enabled[0]?.id ?? null
  return (
    /* Module strip 30→14px + per-module padding tightened one step (Task 51:
       «فاصله بین ماژول‌ها رو کمی کاهش بده، مخصوصاً بین هیرو و ماژول بعدش»).
       `>*+*` targets only FOLLOWING siblings — the hero keeps zero top offset
       under the header, and the spacer strip shows the page background. The
       module DIRECTLY after the hero (marker class .home-hero on the slider
       root) gets its top padding zeroed — the strip alone carries that gap.
       The parent selector outranks the section's own .py-* class, so no
       !important is needed. */
    <div className="[&>*+*]:mt-[14px] [&>.home-hero+*]:pt-0">
      {enabled.map((s) => {
        switch (s.type) {
          case 'HERO': return <HeroWrapper key={s.id} section={s} locale={locale} />
          case 'PRODUCT_SHELF': return <ProductShelf key={s.id} section={s} locale={locale} />
          case 'CATEGORY_CAROUSEL': return <CategoryCarousel key={s.id} section={s} locale={locale} />
          case 'POSTER_GRID': return <PosterGrid key={s.id} section={s} locale={locale} />
          case 'EDITORIAL_FEATURE': return <EditorialFeature key={s.id} section={s} locale={locale} />
          case 'FOR_YOU': return <ForYouSection key={s.id} section={s} locale={locale} />
          case 'RECENTLY_VIEWED': return <RecentlyViewedSection key={s.id} section={s} locale={locale} />
          case 'ARTICLES': return <ArticlesSection key={s.id} section={s} locale={locale} />
          case 'SCROLL_STORY': return <ScrollStory key={s.id} section={s} locale={locale} fullBleed={s.id === firstId} />
          default: return null
        }
      })}
    </div>
  )
}

function HeroWrapper({ section, locale }: { section: Extract<HomeSection, { type: 'HERO' }>; locale: Locale }) {
  return <HeroSlider slides={section.settings.slides ?? []} locale={locale} heightPreset={section.settings.heightPreset} autoplayMs={section.settings.autoplayMs} />
}
