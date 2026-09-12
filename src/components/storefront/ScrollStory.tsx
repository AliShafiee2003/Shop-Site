'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { navigate } from '@/lib/router'
import { getDict } from '@/lib/i18n'
import { faDigits } from '@/lib/format'
import { cn, pickCopy } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Locale, HomeSection } from '@/lib/types'

/**
 * Pinned scroll section / sticky scrollytelling — a TALL module (n scenes ×
 * ~100vh of real page scroll) whose cinematic panel stays `position: sticky`
 * while the visitor scrolls through it, so the page seems to hold still while
 * scenes morph like a presentation. Built for spotlighting ONE book
 * («حفظ توجه مخاطب روی یک موضوع»).
 *
 * Two layouts (user, Task 45: «لزوما این مدل اسلایدر دو تصویره نیست»):
 *  - `split` (default) — text stack beside the scene image, both morphing.
 *  - `backdrop` — each scene's image IS the whole panel background (full-bleed
 *    crossfade under a legibility scrim) with the text overlaid, plus one
 *    STATIC module-level cover image floating over the story — often the
 *    background and the main image are the same asset («خیلی وقت‌ها همون بک
 *    گراند همون تصویر اصلی هست»); the small cover stays constant while the
 *    backdrops morph, because the module introduces ONE book.
 *
 * Engine — deliberately boring, no GSAP / Lenis / scroll hijacking:
 *  - the ONLY driver is the browser's own scroll position (user explicitly
 *    warned against wheel-event hijacking: «این را Scroll Hijacking نساز»).
 *  - progress = scrolled fraction of the section's travel; virtual scene
 *    s = progress × (n−1)  →  scene k owns the moment s = k
 *    (progress 0 → #1, 0.33 → #2, 0.66 → #3, 1 → #4 for four scenes).
 *  - every frame is SCRUBBED from live scroll (rAF-batched writes through
 *    refs, zero React re-renders per frame): scrolling back rewinds the
 *    morph exactly like GSAP scrub:true.
 *  - morph language (the PowerPoint feel): outgoing image fades while
 *    scaling 1→1.035, incoming arrives from 1.035→1; outgoing text lifts
 *    −26px while fading, incoming rises +26px→0 — all continuous, so the
 *    crossfade is a true morph, not a switch.
 *  - PURE scrub, no snap (user, Task 44: «اگر نصفه اسکرول شد و تصاویر در
 *    هم رفت اون حالت حفظ بشه»): the morph state IS the scroll position —
 *    stop anywhere and the half-blended frame stays exactly there, forever.
 *    There is no idle glide, no magnet to the nearest scene; resuming the
 *    scroll resumes the morph from the very same blend. Nothing ever writes
 *    scrollY — the browser's own scroll remains the single source of truth.
 *    Phones keep 35% extra travel per scene (globals.css) so a flick has
 *    finer resolution — a control aid, never an automatic correction.
 *  - Header sync (user, Task 45: «در حالت گوشی هدر افتاده روی اسلایدر»): the
 *    sticky header's height changes AFTER mount (announcement bar arriving
 *    async, font swap, logo decode — none fire a window resize), so the pin
 *    offset is kept live three ways: ResizeObserver on the header,
 *    document.fonts.ready, and a per-frame check inside paint() before the
 *    progress early-return. The panel always pins EXACTLY under the header.
 *  - Device variants (Task 47, «مدیر باید بتواند برای نسخه گوشی تصویر و متن
 *    متفاوت بگذارد»): every scene carries an optional portrait `imageMobile`
 *    plus optional shorter mobile copy; <768px the CSS swaps to the portrait
 *    layer (both layers live inside the SAME morph wrapper, so the scrub
 *    engine still drives one opacity/transform per scene — rotation-safe),
 *    and the text stacks resolve through pickCopy with per-locale fallback.
 *    The backdrop's floating cover also has a mobile variant.
 *  - Composition width (Task 51: «اسلایدر داستانی اگر اولین ماژول باشد باید
 *    عرض تمام صفحه داشته باشد، اما اگر وسط صفحه باشد عرضش اندازهٔ بقیه
 *    ماژول‌ها باشد»): `fullBleed` — HomeSections passes true ONLY for the
 *    first enabled module. Contained mode wraps the sticky panel in the same
 *    max-w-6xl + gutter the other modules use and rounds its corners, so the
 *    story reads as one module among others instead of a full-bleed band.
 *  - reduced motion: crossfades become opacity-only (no scale/translate),
 *    hint bounce disabled; content stays fully readable.
 */
export function ScrollStory({ section, locale, fullBleed = false }: { section: Extract<HomeSection, { type: 'SCROLL_STORY' }>; locale: Locale; fullBleed?: boolean }) {
  const s = section.settings
  const isFa = locale === 'fa'
  const t = getDict(locale)
  const slides = s.slides ?? []
  const n = Math.max(1, slides.length)
  // Task 47: one matchMedia subscription drives ALL device-variant resolution.
  const mobile = useIsMobile()
  const eyebrow = isFa ? pickCopy(mobile, s.eyebrowMobileFa, s.eyebrowFa || s.eyebrowEn) : pickCopy(mobile, s.eyebrowMobileEn, s.eyebrowEn)
  const cta = isFa ? (s.ctaFa || s.ctaEn) : s.ctaEn
  const cover = (mobile ? (s.coverImageMobile || s.coverImage) : s.coverImage) || undefined
  const backdrop = (s.layout ?? 'split') === 'backdrop'
  const step = { compact: '78vh', classic: '100vh', cinematic: '130vh' }[s.heightPreset ?? 'classic'] ?? '100vh'

  const wrapRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const hintRef = useRef<HTMLDivElement | null>(null)
  const imgRefs = useRef<(HTMLDivElement | null)[]>([])
  const txtRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef(0)
  const lastProgress = useRef(-1)
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)
  // The storefront header is sticky — the panel pins below it, and the
  // section's total height must subtract it too (--story-head in CSS).
  // Its height can change at ANY time (async announcements, font swap), so
  // keep a ref mirror + live element pointer for the per-frame sync.
  const [headH, setHeadH] = useState(0)
  const headHRef = useRef(0)
  const headerElRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    headerElRef.current = document.querySelector('header')
    const apply = () => {
      const h = headerElRef.current?.offsetHeight ?? 0
      if (h === headHRef.current) return
      headHRef.current = h
      setHeadH(h)
    }
    apply()
    // Element-level observation catches announcement arrival/dismissal and
    // font-driven reflows — none of which fire a window `resize`.
    const ro = headerElRef.current && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    if (ro && headerElRef.current) ro.observe(headerElRef.current)
    window.addEventListener('resize', apply)
    document.fonts?.ready.then(apply).catch(() => {})
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  /** Scrub: paint every layer from the live scroll position. */
  const paint = useCallback(() => {
    rafRef.current = 0
    // Header sync FIRST — even a parked story (progress unchanged) must
    // re-pin the instant the header above it changes height.
    const hh = headerElRef.current?.offsetHeight ?? 0
    if (hh !== headHRef.current) {
      headHRef.current = hh
      setHeadH(hh)
    }
    const wrap = wrapRef.current
    if (!wrap) return
    const travel = wrap.offsetHeight - (panelRef.current?.offsetHeight ?? 0)
    if (travel <= 0) return
    const progress = Math.min(1, Math.max(0, -wrap.getBoundingClientRect().top / travel))
    if (progress === lastProgress.current) return
    lastProgress.current = progress
    const pos = progress * (n - 1)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (let k = 0; k < n; k++) {
      const t = pos - k // signed distance from scene k (−1 incoming … +1 passed)
      const at = Math.min(1, Math.abs(t))
      const img = imgRefs.current[k]
      if (img) {
        img.style.opacity = String(Math.max(0, 1 - at))
        if (!reduced) img.style.transform = `scale(${(1 + 0.035 * at).toFixed(4)})`
      }
      const txt = txtRefs.current[k]
      if (txt) {
        txt.style.opacity = String(Math.max(0, 1 - at * 1.6))
        if (!reduced) txt.style.transform = `translateY(${(-26 * Math.max(-1, Math.min(1, t))).toFixed(1)}px)`
      }
    }
    if (barRef.current) barRef.current.style.transform = `scaleX(${progress.toFixed(4)})`
    if (hintRef.current) hintRef.current.style.opacity = progress < 0.04 ? '1' : '0'
    const idx = Math.min(n - 1, Math.round(pos))
    if (idx !== activeRef.current) {
      activeRef.current = idx
      setActive(idx)
    }
  }, [n])

  /** Pure-scrub loop (see docblock): every scroll frame repaints the morph
   *  from the live position and then RESTS there. No timers, no glide, no
   *  writes to scrollY — parked mid-morph is a stable state, not a transient. */
  const onScroll = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(paint)
  }, [paint])

  useEffect(() => {
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [onScroll])

  const pad = (x: number) => (isFa ? faDigits(String(x).padStart(2, '0')) : String(x).padStart(2, '0'))

  /* Scene text stacks — shared markup, morphed by the scrub in both layouts.
   * Mobile-first copy (Task 47): the shorter phone override wins on <768px,
   * falling back per-locale to the web text. */
  const sceneTexts = slides.map((sl, k) => {
    const sep = isFa ? pickCopy(mobile, sl.eyebrowMobileFa, sl.eyebrowFa || sl.eyebrowEn) : pickCopy(mobile, sl.eyebrowMobileEn, sl.eyebrowEn)
    const title = isFa ? pickCopy(mobile, sl.titleMobileFa, sl.titleFa || sl.titleEn) : pickCopy(mobile, sl.titleMobileEn, sl.titleEn)
    const text = isFa ? pickCopy(mobile, sl.textMobileFa, sl.textFa || sl.textEn) : pickCopy(mobile, sl.textMobileEn, sl.textEn)
    return (
      <div
        key={k}
        ref={(el) => { txtRefs.current[k] = el }}
        aria-hidden={k !== active || undefined}
        className="absolute inset-0 flex flex-col justify-center"
        style={{ opacity: k === 0 ? 1 : 0 }}
      >
        <p aria-hidden className="font-serif text-[3.4rem] font-semibold leading-none text-white/10 sm:text-7xl">
          {pad(k + 1)}
        </p>
        {sep ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/55 sm:text-sm">{sep}</p> : null}
        {title ? <h2 className="mt-2 text-2xl font-bold leading-snug [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] sm:text-3xl md:text-4xl">{title}</h2> : null}
        {text ? <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/75 sm:text-base">{text}</p> : null}
      </div>
    )
  })

  /* Bottom rail — scrubbed progress + scene counter + CTA (both layouts). */
  const rail = (
    <div className="mt-5 flex items-center gap-4 md:mt-7">
      <div className="relative h-0.5 flex-1 overflow-hidden rounded bg-white/15">
        <div
          ref={barRef}
          className="absolute inset-0 bg-orange-accent"
          style={{ transform: 'scaleX(0)', transformOrigin: isFa ? 'right center' : 'left center' }}
        />
      </div>
      <p className="shrink-0 text-xs tabular-nums text-white/60 sm:text-sm">
        {pad(active + 1)} <span aria-hidden className="text-white/30">/</span> {pad(n)}
      </p>
      {cta && s.ctaHref ? (
        <Button
          className="h-10 shrink-0 bg-orange-accent px-5 text-white hover:bg-orange-dark"
          onClick={() => navigate(s.ctaHref!)}
        >
          {cta}
        </Button>
      ) : null}
    </div>
  )

  return (
    <section
      ref={wrapRef}
      className={cn('story-wrap relative', !fullBleed && 'mx-auto w-full max-w-6xl px-4 sm:px-6')}
      aria-label={eyebrow ?? t.home.forYou}
      style={{ '--story-n': String(n), '--story-step-base': step, '--story-head': `${headH}px` } as React.CSSProperties}
    >
      <div ref={panelRef} className={cn('story-panel overflow-hidden bg-[#071523] text-white', !fullBleed && 'rounded-xl border border-line shadow-sm')}>
        {backdrop ? (
          <>
            {/* Full-bleed scene backdrops — each layer carries its own legibility
                scrim so image + scrim crossfade as ONE unit. */}
            {slides.map((sl, k) => (
              <div key={k} ref={(el) => { imgRefs.current[k] = el }} className="story-img-layer absolute inset-0" style={{ opacity: k === 0 ? 1 : 0 }}>
                {/* Device variants (Task 47): portrait layer <768px, landscape ≥768px —
                    CSS decides; the scrub only ever writes to the wrapper. */}
                <img
                  src={sl.imageMobile || sl.image}
                  alt={isFa ? (sl.titleFa || sl.titleEn || '') : (sl.titleEn || sl.titleFa || '')}
                  loading={k === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="h-full w-full object-cover md:hidden"
                />
                <img
                  src={sl.image}
                  alt={isFa ? (sl.titleFa || sl.titleEn || '') : (sl.titleEn || sl.titleFa || '')}
                  loading={k === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="hidden h-full w-full object-cover md:block"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
              </div>
            ))}

            {/* The ONE book — static cover floating over the morphing story
                (constant anchor while the scenes change). */}
            {cover ? (
              <div className="pointer-events-none absolute end-4 top-16 z-10 w-[5.5rem] rotate-[3.5deg] select-none sm:end-8 sm:w-28 md:end-14 md:top-1/2 md:w-44 md:-translate-y-1/2">
                <img
                  src={cover}
                  alt={isFa ? (slides[0]?.titleFa || '') : (slides[0]?.titleEn || '')}
                  loading="eager"
                  draggable={false}
                  className="rounded-md shadow-2xl ring-1 ring-white/30"
                />
              </div>
            ) : null}

            {eyebrow ? (
              <p className="absolute start-4 top-6 z-10 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-accent [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:start-6 sm:text-xs">
                <span aria-hidden className="inline-block h-px w-8 bg-orange-accent/60" />
                {eyebrow}
              </p>
            ) : null}

            {/* Text overlay — bottom of the panel, above the scrim. */}
            <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-end px-4 pb-16 sm:px-6 md:pb-20">
              <div className="relative min-h-[150px] sm:min-h-[190px]">{sceneTexts}</div>
              {rail}
            </div>
          </>
        ) : (
          <>
            {/* Ambient brand light — two quiet radial glows on deep navy. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_12%,rgba(1,75,116,0.55),transparent_62%),radial-gradient(90%_70%_at_10%_92%,rgba(1,75,116,0.35),transparent_58%)]" />
            <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-14 pt-8 sm:px-6 sm:pt-10">
              {eyebrow ? (
                <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-accent sm:text-xs">
                  <span aria-hidden className="inline-block h-px w-8 bg-orange-accent/60" />
                  {eyebrow}
                </p>
              ) : null}

              <div className="mt-3 grid min-h-0 flex-1 items-center gap-5 md:mt-4 md:grid-cols-2 md:gap-12">
                {/* Text stack — scenes stacked absolutely, morphed by the scrub. */}
                <div className="relative order-2 min-h-[170px] sm:min-h-[220px] md:order-1 md:min-h-[320px]">
                  {sceneTexts}
                </div>

                {/* Image stack — outgoing 1→1.035, incoming 1.035→1. */}
                <div className="relative order-1 mx-auto aspect-[3/4] max-h-[38svh] w-full max-w-xs overflow-hidden rounded-xl border border-white/15 shadow-2xl sm:max-w-sm md:order-2 md:max-h-none md:max-w-md">
                  {slides.map((sl, k) => (
                    <div key={k} ref={(el) => { imgRefs.current[k] = el }} className="story-img-layer absolute inset-0" style={{ opacity: k === 0 ? 1 : 0 }}>
                      {/* Device variants (Task 47) — same CSS-only swap as backdrop. */}
                      <img
                        src={sl.imageMobile || sl.image}
                        alt={isFa ? (sl.titleFa || sl.titleEn || '') : (sl.titleEn || sl.titleFa || '')}
                        loading={k === 0 ? 'eager' : 'lazy'}
                        draggable={false}
                        className="h-full w-full object-cover md:hidden"
                      />
                      <img
                        src={sl.image}
                        alt={isFa ? (sl.titleFa || sl.titleEn || '') : (sl.titleEn || sl.titleFa || '')}
                        loading={k === 0 ? 'eager' : 'lazy'}
                        draggable={false}
                        className="hidden h-full w-full object-cover md:block"
                      />
                    </div>
                  ))}
                  <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                </div>
              </div>

              {rail}
            </div>
          </>
        )}

        {/* Scroll hint — dissolves as soon as the story starts moving. */}
        <div
          ref={hintRef}
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-white/50 transition-opacity duration-500"
        >
          <ArrowDown className="h-4 w-4 animate-bounce motion-reduce:animate-none" />
        </div>
      </div>
    </section>
  )
}
