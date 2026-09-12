'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn, pickCopy } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { getDict, tf } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Locale, HeroSlide } from '@/lib/types'

/**
 * Hero slider — true infinite-loop track carousel.
 * Strip = [clone(last), ...slides, clone(first)]; `pos` runs over that strip
 * (real slides at 1..count). Press-and-hold dragging follows the pointer 1:1;
 * release snaps with eased motion; flicks (velocity) advance; wrapping past a
 * clone performs a silent FLIP re-seat onto the equivalent real slide AFTER the
 * snap animation completes (never mid-flight — the earlier version cut the
 * transition at 80ms, which read as a hard jump).
 * Direction-aware px math: in RTL the strip lays out right→left (children at
 * negative x), so the transform sign flips (+px instead of −px) and the
 * drag/keyboard semantics mirror — otherwise the FA hero renders blank.
 * Dragging is UNBOUNDED in both directions: crossing a slide width mid-drag
 * silently re-seats the base position onto the neighbouring strip slot and
 * re-bases the pointer origin — the content under the finger is pixel-identical
 * (clone ↔ real), so the loop feels endless while holding the pointer down.
 * No hand cursor anywhere (per user request); clicks after a drag are suppressed.
 * Controls: dots only (user request) — prev/next/pause/counter bar removed.
 */

const SNAP_MS = 520
const FLICK_V = 0.5 // px/ms
const MOVE_THRESHOLD = 0.16 // fraction of width
const CLICK_SUPPRESS_PX = 8
const DRAG_START_PX = 6 // px of horizontal travel before the gesture becomes a drag

export function HeroSlider({ slides, locale, heightPreset, autoplayMs: autoplayMsProp }: {
  slides: HeroSlide[]
  locale: Locale
  heightPreset?: string
  autoplayMs?: number
}) {
  const t = getDict(locale)
  const count = slides.length
  const rtl = locale === 'fa'
  // Task 47: one subscription for the whole slider — passed down to slides.
  const mobile = useIsMobile()

  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(1) // strip position (1..count are real slides)
  const dragRef = useRef({ active: false, capturing: false, pointerId: -1, startX: 0, startY: 0, dx: 0, samples: [] as { t: number; x: number }[], width: 1 })
  const reseatRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const [index, setIndex] = useState(0) // real-slide index for dots/aria
  const [paused, setPaused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const widthRef = useRef(1)

  const autoplayMs = Math.max(3000, autoplayMsProp ?? 5000)

  /** Apply the current strip position (plus optional drag offset) in px.
   * Strip children: [cloneLast, real…, cloneFirst] laid out in reading order —
   * left→right in LTR (child i rests at translateX(−i·w)), right→left in RTL
   * (child i rests at translateX(+i·w)).
   * The live drag offset moves the strip 1:1 WITH the pointer in BOTH
   * directions: T_ltr = −pos·w + dx (finger left ⇒ strip left ⇒ next slide),
   * T_rtl = +pos·w + dx (finger right ⇒ strip right ⇒ next slide, mirrored).
   * The earlier LTR formula −(pos·w + dx) mirrored the gesture — dragging left
   * pushed the strip right — which made the loop feel broken (user report). */
  const applyPos = useCallback(
    (animate: boolean, dragPx = 0) => {
      const track = trackRef.current
      if (!track) return
      track.style.transition = animate ? `transform ${SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none'
      const base = posRef.current * (widthRef.current || 1)
      const x = rtl ? base + dragPx : -(base - dragPx)
      track.style.transform = `translate3d(${x}px, 0, 0)`
    },
    [rtl],
  )

  /**
   * Silent FLIP re-seat from a clone position onto the equivalent real slide.
   * MUST wait for the snap animation to finish — reseating early (or worse,
   * synchronously) kills the transition and the slide visibly jumps.
   * Handles ANY out-of-range position (multi-slide flicks can pass a clone by
   * several steps), and re-syncs the dot index — otherwise the track and the
   * dots desync and the visible slide renders with hidden text.
   */
  const reseat = useCallback(() => {
    if (reseatRef.current) window.clearTimeout(reseatRef.current)
    reseatRef.current = window.setTimeout(() => {
      const pos = posRef.current
      let changed = false
      if (pos <= 0) {
        posRef.current = pos + count
        changed = true
      } else if (pos >= count + 1) {
        posRef.current = pos - count
        changed = true
      }
      if (changed) {
        applyPos(false)
        setIndex((((posRef.current - 1) % count) + count) % count)
      }
      // Double-rAF so any jump paints before a future transition re-enables.
      requestAnimationFrame(() => requestAnimationFrame(() => applyPos(false)))
    }, SNAP_MS + 40)
  }, [count, applyPos])

  const step = useCallback(
    (delta: number) => {
      if (count <= 1) return
      // Safety: if a previous cycle left pos out of range (timer starvation),
      // silently normalize onto the equivalent real slide before animating.
      const cur = posRef.current
      if (cur <= 0 || cur >= count + 1) {
        posRef.current = ((((cur - 1) % count) + count) % count) + 1
        applyPos(false)
      }
      const next = posRef.current + delta
      posRef.current = next
      applyPos(true)
      setIndex((((next - 1) % count) + count) % count)
      reseat()
    },
    [count, applyPos, reseat],
  )

  const goTo = useCallback(
    (i: number) => {
      if (count <= 1) return
      // Dot i corresponds to real slide i+1 (strip position); `currentReal` is
      // the 0-based real slide currently shown.
      const currentReal = (((posRef.current - 1) % count) + count) % count
      let delta = ((i - currentReal + count) % count + count) % count
      // Choose the short path around the endless strip (may cross clones).
      if (delta > count / 2) delta -= count
      if (delta === 0) {
        // Already on the requested slide — just keep the dots in sync.
        setIndex(currentReal)
        return
      }
      step(delta)
    },
    [count, step],
  )

  // Measure container width (px math — unambiguous in both LTR and RTL).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      widthRef.current = el.clientWidth || 1
      applyPos(false)
    }
    measure()
    applyPos(false)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyPos])

  // Autoplay — paused while dragging, hidden tab, hover/focus, manual pause.
  useEffect(() => {
    if (count <= 1 || paused || dragging) return
    const timer = setInterval(() => {
      if (document.hidden) return
      step(1)
    }, autoplayMs)
    return () => clearInterval(timer)
  }, [count, paused, dragging, autoplayMs, step])

  useEffect(() => () => { if (reseatRef.current) window.clearTimeout(reseatRef.current) }, [])

  // ── Pointer drag (unified mouse/pen/touch) ──
  // NOTE — capture is DEFERRED (see onPointerMove): calling setPointerCapture
  // on pointerdown retargets the ensuing `click` to the <section> (Pointer
  // Events spec: the click target becomes the capture element), which made the
  // slide CTA button and the dots dead — the user's «این دکمه کار نمیکنه».
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (count <= 1 || !e.isPrimary) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const el = containerRef.current
      if (!el) return
      // Stage every gesture from a clean, in-range base: cancel a pending
      // reseat and normalize a clone position onto its equivalent real slide
      // (pixel-identical content), so the drag math below never fights a
      // snap animation that is still settling.
      if (reseatRef.current) { window.clearTimeout(reseatRef.current); reseatRef.current = null }
      const cur = posRef.current
      if (cur <= 0 || cur >= count + 1) {
        posRef.current = ((((cur - 1) % count) + count) % count) + 1
        applyPos(false)
      }
      dragRef.current = {
        active: true, // gesture is live…
        capturing: false, // …but NOT a drag yet — clicks must survive
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dx: 0,
        samples: [{ t: performance.now(), x: e.clientX }],
        width: widthRef.current || 1,
      }
    },
    [count, applyPos],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d.active || e.pointerId !== d.pointerId) return
      // Promote to a real drag only after decisive HORIZONTAL travel (and
      // only when the pointer is moving more sideways than down — vertical
      // motion stays a page scroll on touch). Only NOW do we take pointer
      // capture, so plain taps/clicks on the CTA and dots never retarget.
      if (!d.capturing) {
        const adx = Math.abs(e.clientX - d.startX)
        const ady = Math.abs(e.clientY - d.startY)
        if (adx < DRAG_START_PX || ady >= adx) return
        d.capturing = true
        setDragging(true)
        // Capture is an enhancement (keep receiving moves outside the slider);
        // synthetic/released pointers throw NotFoundError — safe to ignore.
        try { containerRef.current?.setPointerCapture?.(d.pointerId) } catch { /* no active pointer */ }
      }
      d.dx = e.clientX - d.startX
      // Unbounded loop: once the drag passes one slide width, re-seat the base
      // position onto the neighbouring strip slot and re-base the pointer
      // origin. The clone under the finger renders the identical image, so the
      // swap is invisible — the user can spin left/right without end.
      const w = d.width || widthRef.current || 1
      const REBASE = 0.98
      let rebased = false
      if (!rtl) {
        while (d.dx > w * REBASE) { posRef.current -= 1; d.startX += w; d.dx -= w; rebased = true }
        while (d.dx < -w * REBASE) { posRef.current += 1; d.startX -= w; d.dx += w; rebased = true }
      } else {
        while (d.dx > w * REBASE) { posRef.current += 1; d.startX += w; d.dx -= w; rebased = true }
        while (d.dx < -w * REBASE) { posRef.current -= 1; d.startX -= w; d.dx += w; rebased = true }
      }
      if (rebased) {
        setIndex((((posRef.current - 1) % count) + count) % count)
        // Any position is now legal (clones extend the strip conceptually);
        // the pending reseat timer from a previous gesture stays harmless.
        if (reseatRef.current) { window.clearTimeout(reseatRef.current); reseatRef.current = null }
      }
      d.samples.push({ t: performance.now(), x: e.clientX })
      if (d.samples.length > 6) d.samples.shift()
      // The loop strip has no ends, so the offset follows the pointer 1:1.
      applyPos(false, d.dx)
    },
    [applyPos, rtl, count],
  )

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d.active) return
      d.active = false
      // Gesture ended before becoming a drag: a plain click/tap on a CTA or
      // dot — do nothing so the browser delivers the click untouched.
      if (!d.capturing) return
      d.capturing = false
      setDragging(false)
      const w = d.width || widthRef.current || 1
      const dx = d.dx
      // Recent velocity from the sample window (px/ms).
      let v = 0
      if (d.samples.length >= 2) {
        const a = d.samples[0]
        const b = d.samples[d.samples.length - 1]
        const dt = b.t - a.t
        if (dt > 0) v = (b.x - a.x) / dt
      }
      // RTL mirrors the gesture: swiping right advances.
      // NOTE: velocity and dx share the same screen-space sign convention, so
      // a flick must resolve EXACTLY like the dx path below (same sign test —
      // the old inverted test made quick flicks go backwards, which read as
      // "the slider is not a loop").
      const sign = rtl ? 1 : -1
      let steps = Math.round((sign * dx) / w)
      if (steps === 0 && Math.abs(v) >= FLICK_V) steps = sign * v > 0 ? 1 : -1
      if (steps === 0 && Math.abs(dx) > w * MOVE_THRESHOLD) steps = sign * dx > 0 ? 1 : -1
      steps = Math.max(-count, Math.min(count, steps))
      suppressClickRef.current = Math.abs(dx) > CLICK_SUPPRESS_PX
      if (steps !== 0) {
        posRef.current += steps
        applyPos(true)
        setIndex((((posRef.current - 1) % count) + count) % count)
        reseat()
      } else {
        applyPos(true)
      }
      // Release the pointer capture if we took it.
      try { containerRef.current?.releasePointerCapture?.(e.pointerId) } catch { /* noop */ }
    },
    [count, applyPos, reseat, rtl],
  )

  // Suppress the post-drag click (CTA must not fire after a swipe).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onClickCapture = (ev: MouseEvent) => {
      if (suppressClickRef.current) {
        ev.preventDefault()
        ev.stopPropagation()
        suppressClickRef.current = false
      }
    }
    el.addEventListener('click', onClickCapture, true)
    return () => el.removeEventListener('click', onClickCapture, true)
  }, [])

  // Keyboard navigation (arrow semantics mirror in RTL).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(rtl ? -1 : 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(rtl ? 1 : -1) }
    },
    [step, rtl],
  )

  if (!count) return null

  const strip: { slide: HeroSlide; key: string; realIndex: number | null }[] = []
  if (count > 1) strip.push({ slide: slides[count - 1], key: 'clone-last', realIndex: count - 1 })
  slides.forEach((s, i) => strip.push({ slide: s, key: `real-${i}`, realIndex: i }))
  if (count > 1) strip.push({ slide: slides[0], key: 'clone-first', realIndex: 0 })

  // Default preset: aspect-[7/4] collapses to ~223px on a 390px phone — slide
  // content (title + body + CTA, ≈290–340px) then overflows the TOP edge and
  // ends up under the sticky header (user, Task 46: «هدر روی اسلایدر اصلی
  // میوفته در نسخه گوشی»). A mobile-only min-height keeps the box taller than
  // its content; desktops keep the pure aspect ratio.
  const heightClass = heightPreset === 'immersive' ? 'h-[82svh]' : heightPreset === 'full' ? 'h-[calc(100svh-3.5rem)]' : 'aspect-[7/4] max-h-[560px] w-full min-h-[360px] sm:min-h-0'

  return (
    <section
      ref={containerRef}
      aria-roledescription="carousel"
      aria-label={t.nav.home}
      // .home-hero: parent-side layout hook — HomeSections zeroes the top
      // padding of whatever module directly follows the hero (Task 51).
      className={cn('home-hero relative w-full touch-pan-y select-none overflow-hidden bg-ink', heightClass, dragging && 'cursor-grabbing')}
      style={{ cursor: dragging ? undefined : 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex h-full w-full will-change-transform"
      >
        {strip.map(({ slide, key, realIndex }) => (
          <SlideView key={key} slide={slide} locale={locale} active={realIndex === index} eager={realIndex !== null && realIndex < 2} mobile={mobile} />
        ))}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center sm:bottom-4">
          {/* Dots only (user request): quiet position indicator, still tappable */}
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/25 px-2.5 py-2 backdrop-blur-sm"
            role="tablist"
            aria-label={tf(t.home.heroGo, { n: index + 1 })}
          >
            {slides.map((_, i) => (
              <button
                key={i} type="button" role="tab" aria-selected={i === index}
                aria-label={tf(t.home.heroGo, { n: i + 1 })}
                onClick={() => goTo(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** One slide in the strip — static markup; the track moves, slides don't re-mount.
 *  Device variants (Task 47): the portrait `imageMobile` renders <768px via a
 *  CSS-only swap (both layers exist, so device rotation never re-renders the
 *  moving track), while the shorter mobile copy resolves through the shared
 *  `mobile` flag with per-locale fallback to the web text. */
function SlideView({ slide, locale, active, eager, mobile }: {
  slide: HeroSlide
  locale: Locale
  active: boolean
  eager: boolean
  mobile: boolean
}) {
  const isFa = locale === 'fa'
  // FA fallback rule: wherever the Persian text is missing, English replaces it.
  // Mobile overrides slot in FRONT of the locale's web text — never cross the
  // locale boundary (FA mobile: mobileFa → fa → en; EN mobile: mobileEn → en).
  const title = isFa ? pickCopy(mobile, slide.titleMobileFa, slide.titleFa || slide.titleEn) : pickCopy(mobile, slide.titleMobileEn, slide.titleEn)
  const eyebrow = isFa ? pickCopy(mobile, slide.eyebrowMobileFa, slide.eyebrowFa || slide.eyebrowEn) : pickCopy(mobile, slide.eyebrowMobileEn, slide.eyebrowEn)
  const body = isFa ? pickCopy(mobile, slide.bodyMobileFa, slide.bodyFa || slide.bodyEn) : pickCopy(mobile, slide.bodyMobileEn, slide.bodyEn)
  const cta = isFa ? (slide.ctaFa || slide.ctaEn) : slide.ctaEn
  const light = slide.textColor !== 'dark'
  // Scrim must darken the PHYSICAL side the text sits on (justify-start/end are
  // direction-aware, so RTL flips left/right).
  const darkenLeft = slide.position !== 'center' && (slide.position === 'left') !== (locale === 'fa')
  const scrim =
    slide.position === 'center'
      ? 'linear-gradient(to top, rgba(1,20,32,0.82) 0%, rgba(1,20,32,0.38) 42%, rgba(1,20,32,0) 72%)'
      : darkenLeft
        ? 'linear-gradient(to right, rgba(1,20,32,0.80) 0%, rgba(1,20,32,0.36) 45%, rgba(1,20,32,0) 75%)'
        : 'linear-gradient(to left, rgba(1,20,32,0.80) 0%, rgba(1,20,32,0.36) 45%, rgba(1,20,32,0) 75%)'

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-hidden={!active}
      className="relative h-full w-full shrink-0 grow-0 basis-full overflow-hidden"
      style={{ backgroundColor: slide.bg ?? '#014B74' }}
    >
      {/* Device variants (Task 47): portrait mobile image <768px, landscape web
          image ≥768px — CSS classes decide, no JS, so a rotation mid-drag can
          never remount track children. */}
      <img
        src={slide.imageMobile || slide.image}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        draggable={false}
        className={cn('h-full w-full object-cover md:hidden', active && 'kenburns')}
      />
      <img
        src={slide.image}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        draggable={false}
        className={cn('hidden h-full w-full object-cover md:block', active && 'kenburns')}
      />
      {/* Cinematic scrim: side gradient toward the text column + bottom anchor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ backgroundImage: scrim, opacity: light ? 1 : 0.55 }}
      />
      <div className={cn(
        'pointer-events-none absolute inset-0 flex',
        slide.position === 'center' ? 'items-center justify-center' : slide.position === 'right' ? 'items-end justify-end' : 'items-end justify-start',
        slide.position !== 'center' && 'pb-14 sm:pb-16'
      )}>
        <div className={cn(
          'pointer-events-auto max-w-xl px-5 sm:px-8 lg:px-14',
          slide.position === 'center' && 'text-center',
          slide.position === 'right' && 'text-end'
        )}>
          {eyebrow ? (
            <p
              className={cn('mb-2.5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm',
                light ? 'border-white/30 bg-white/10 text-white/95' : 'border-ink/20 bg-white/60 text-ink-2',
                'transition-all delay-100 duration-500',
                active ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}
            >
              <span aria-hidden className={cn('h-1 w-1 rounded-full', light ? 'bg-orange-accent' : 'bg-orange-accent')} />
              {eyebrow}
            </p>
          ) : null}
          <h2 className={cn('text-[1.65rem] font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.9rem]',
            light ? 'text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)]' : 'text-ink',
            'transition-all delay-200 duration-500',
            active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
            {title}
          </h2>
          {body ? (
            <p className={cn('mt-3 max-w-md text-sm leading-relaxed sm:text-[15px]', light ? 'text-white/85' : 'text-ink-2', slide.position === 'center' && 'mx-auto',
              'transition-all delay-300 duration-500',
              active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
              {body}
            </p>
          ) : null}
          {cta && slide.href ? (
            <div className={cn('transition-all delay-[400ms] duration-500', active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
              <Button
                size="lg"
                className={cn('mt-5 h-11 px-6 text-[15px] shadow-lg',
                  light ? 'bg-white text-ink hover:bg-white/90' : 'bg-brand text-white hover:bg-brand-hover')}
                onClick={() => navigate(slide.href!)}
              >
                {cta}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
