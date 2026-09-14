'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDict } from '@/lib/i18n'
import { ProductCard } from './ProductCard'
import type { Locale, ProductCard as ProductCardDTO } from '@/lib/types'

/**
 * Product row — a calm static spread when every card fits the available
 * width; a BOUNDED slider ONLY when the row overflows (user: unlike the
 * category row, product sliders must NOT loop — «نمى‌خو‌اهیم نامحدود اسکر‌ol
 * بش‌ود و در یک ‌ل‌وپ بی‌فت‌د» — you scroll exactly as far as the items go,
 * then it stops).
 *
 * Slider mode: phones swipe with the browser's own momentum scroll
 * (proximity snap to card starts); desktop can additionally press-and-drag
 * with the mouse and gets arrow buttons that fade out at either end. No
 * clones, no re-basing — the scrollable range is exactly the content.
 *
 * Shared by every book slider on the site (admin PRODUCT_SHELF modules,
 * For-you shelf, Recently viewed) so they all move and feel identically
 * («باید مثل بقیه اسلایدر باشن»).
 */
export function ProductRow({ products, locale, label }: { products: ProductCardDTO[]; locale: Locale; label: string }) {
  const isRtl = locale === 'fa'
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const dragRef = useRef<{ startX: number; baseX: number; latestDx: number; captured: boolean; raf: number } | null>(null)
  const suppressClickRef = useRef(false)
  const [slider, setSlider] = useState(false)
  const [ends, setEnds] = useState({ atStart: true, atEnd: false })

  /** Refresh the arrow-end states from the current offset. u-space is
   *  forward-positive (u = -scrollLeft in RTL) so 0..maxU means the same
   *  thing in both writing directions. */
  const measureEnds = useCallback((el: HTMLDivElement) => {
    const maxU = el.scrollWidth - el.clientWidth
    const u = isRtl ? -el.scrollLeft : el.scrollLeft
    const atStart = u <= 4
    const atEnd = u >= maxU - 4
    setEnds((e) => (atStart === e.atStart && atEnd === e.atEnd ? e : { atStart, atEnd }))
  }, [isRtl])

  /** Natural row width (Σ card widths + gaps — immune to justify-between
   *  spreading, the same lesson as CategoryRow) vs the viewport: static
   *  spread when everything fits, bounded slider when it doesn't. */
  const reflow = useCallback(() => {
    const el = trackRef.current
    const n = products.length
    if (!el || n === 0 || el.children.length < n) return
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    let w = 0
    for (let i = 0; i < n; i++) w += (el.children[i] as HTMLElement).offsetWidth
    const rowW = w + (n - 1) * gap
    if (!(rowW > 40)) return
    if (rowW <= el.clientWidth - 12) {
      // Everything fits — no slider; make sure a stale offset never lingers.
      if (slider) { setSlider(false); el.scrollLeft = 0 }
      return
    }
    if (!slider) { setSlider(true); setEnds({ atStart: true, atEnd: false }); return }
    measureEnds(el)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: RTL flip changes text metrics — re-measure must run even though isRtl is unread here
  }, [products.length, isRtl, slider, measureEnds])

  // Viewport resizes — and the initial geometry pass (RO fires once on
  // observe, in the same frame before paint) — re-measure. Webfonts change
  // title metrics, so re-decide once they settle.
  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => reflow())
    ro.observe(el)
    document.fonts?.ready.then(() => reflow()).catch(() => {})
    return () => ro.disconnect()
  }, [reflow])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = trackRef.current
      if (el) measureEnds(el)
    })
  }, [measureEnds])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [onScroll])

  // A new product set (locale switch, refetch) always starts at the
  // beginning; the resulting scroll event refreshes the arrow states.
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 })
  }, [products])

  /** Mouse press-and-drag to scroll — mouse/pen only (touch scrolls
   *  natively); pointer capture engages lazily after 6px so plain clicks on
   *  cards still work, and a real drag suppresses its trailing click. */
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

  /** Arrow buttons glide ~0.72 of a page and stop exactly at the content
   *  ends — no wrap-around (bounded by design, unlike CategoryRow). */
  const nudge = useCallback((forward: boolean) => {
    const el = trackRef.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = Math.max(el.clientWidth * 0.72, 240)
    const maxU = Math.max(el.scrollWidth - el.clientWidth, 0)
    const u = isRtl ? -el.scrollLeft : el.scrollLeft
    const nu = Math.min(Math.max(u + (forward ? step : -step), 0), maxU)
    el.scrollTo({ left: isRtl ? -nu : nu, behavior: reduced ? 'auto' : 'smooth' })
  }, [isRtl])

  const d = getDict(locale)
  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        role="group"
        aria-roledescription={slider ? 'carousel' : undefined}
        aria-label={label}
        onPointerDown={slider ? onPointerDown : undefined}
        onPointerMove={slider ? onPointerMove : undefined}
        onPointerUp={slider ? endDrag : undefined}
        onPointerCancel={slider ? endDrag : undefined}
        onClickCapture={slider ? onClickCapture : undefined}
        // Cards are links — the browser would otherwise hijack a press-drag
        // into native HTML5 link-dragging (pointercancel, no scrolling).
        onDragStart={slider ? (e) => e.preventDefault() : undefined}
        className={cn(
          // -my-3 + py-3: net-zero layout shift but 12px of vertical headroom
          // in the scroll clip box so card hover artwork is not sliced; px-1
          // grants the same courtesy horizontally.
          'scrollbar-none -mx-1 -my-3 flex gap-4 overflow-x-auto overscroll-x-contain px-1 py-3 sm:gap-5',
          slider
            ? 'snap-x cursor-grab select-none active:cursor-grabbing'
            : 'sm:justify-between sm:overflow-visible',
        )}
      >
        {products.map((p) => (
          <div
            key={p.id}
            className={cn(
              'min-w-0 shrink-0 basis-[44%] xs:basis-[42%] sm:basis-[30%] md:basis-[23%] lg:basis-[19%]',
              slider && 'snap-start',
            )}
          >
            <ProductCard p={p} locale={locale} className="h-full" />
          </div>
        ))}
      </div>
      {/* Desktop arrows — only when the row overflows. They fade out at the
          ends because the range is bounded (unlike the category loop). */}
      {slider && (
        <>
          <button
            type="button"
            onClick={() => nudge(false)}
            aria-label={d.home.shelfPrev}
            disabled={ends.atStart}
            className="absolute -start-3 top-[38%] z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm transition hover:bg-soft hover:shadow disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="h-5 w-5 mirror-rtl" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => nudge(true)}
            aria-label={d.home.shelfNext}
            disabled={ends.atEnd}
            className="absolute -end-3 top-[38%] z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-sm transition hover:bg-soft hover:shadow disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="h-5 w-5 mirror-rtl" aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
