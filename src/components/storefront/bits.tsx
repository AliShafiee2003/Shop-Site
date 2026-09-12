'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Star, StarHalf, Minus, Plus, ChevronRight, Loader2, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { localePath } from '@/lib/router'
import { parseInlineSpans } from '@/lib/markdown'
import { formatMoney, formatDate, faDigits } from '@/lib/format'
import { tf, getDict } from '@/lib/i18n'
import type { Locale, Block } from '@/lib/types'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-3" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? 'Loading…'}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  // Directional shimmer (globals.css) instead of a flat opacity pulse —
  // reads as "data is on its way" and stays calm under reduced motion.
  return <div className={cn('skeleton-shimmer rounded-md bg-soft', className)} aria-hidden />
}

/** Scroll-triggered reveal — the element starts quietly hidden
 *  (opacity 0 · translateY(22px) · blur(5px), see `.reveal` in globals.css)
 *  and eases to full visibility ONCE when it enters the viewport
 *  (IntersectionObserver, threshold 0.15; it also fires immediately for
 *  elements already on screen, so above-the-fold use becomes a soft page
 *  entrance). `delay` (ms) staggers sibling reveals so blocks appear in
 *  sequence (title → text → CTA …) instead of all at once. Content stays in
 *  the DOM for screen readers; prefers-reduced-motion disables the motion
 *  entirely via CSS.
 *
 *  Two usages: (1) per-block stagger inside the editorial highlight boxes,
 *  (2) a WHOLE-MODULE wrapper — heading + slider/posters/articles rise
 *  together as one gentle set («مجموعه هر ماژول آروم ظاهر بشه»). The end
 *  state is transform/filter-free (globals.css), so revealed slider boxes
 *  keep their full drag/hover performance. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      // Ancient browsers: skip the animation and just show the content.
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={cn('reveal', visible && 'reveal-visible', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-xl text-brand" aria-hidden>✦</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body ? <p className="max-w-sm text-sm text-ink-3">{body}</p> : null}
      {action}
    </div>
  )
}

/** tone='light' — for dark module backgrounds (e.g. the articles teaser on
 *  brand navy): heading, description and CTA flip to white-on-dark. */
export function SectionHeading({ title, description, ctaLabel, ctaHref, locale, tone }: {
  title: string; description?: string; ctaLabel?: string; ctaHref?: string; locale: Locale; tone?: 'light'
}) {
  const light = tone === 'light'
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className={cn('text-xl font-semibold tracking-tight sm:text-2xl', light ? 'text-white' : 'text-ink')}>{title}</h2>
        {description ? <p className={cn('mt-1 text-sm', light ? 'text-white/70' : 'text-ink-3')}>{description}</p> : null}
      </div>
      {ctaLabel && ctaHref ? (
        <Link
          href={localePath(locale, ctaHref)}
          onClick={(e) => { e.preventDefault(); import('@/lib/router').then(({ navigate }) => navigate(ctaHref)) }}
          className={cn('group inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm font-medium', light ? 'text-white hover:text-white/85' : 'text-brand hover:text-brand-hover')}
        >
          {ctaLabel}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 mirror-rtl" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}

export function RatingStars({ value, count, size = 'sm', locale }: { value: number; count?: number; size?: 'sm' | 'md'; locale: Locale }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  const px = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  // Digits follow the locale (global rule: FA shows Persian digits, EN never does).
  const valueText = locale === 'fa' ? faDigits(value.toFixed(1)) : value.toFixed(1)
  const countText = typeof count === 'number' && count > 0 ? ` (${locale === 'fa' ? faDigits(count) : count})` : ''
  return (
    <div className="flex items-center gap-1.5" aria-label={tf(getDict(locale).common.rating, {}) + `: ${valueText}`}>
      <div className="flex items-center gap-0.5 text-orange-accent">
        {Array.from({ length: 5 }).map((_, i) => (
          i < full
            ? <Star key={i} className={cn(px, 'fill-current')} aria-hidden />
            : i === full && half
              ? <StarHalf key={i} className={cn(px, 'fill-current')} aria-hidden />
              : <Star key={i} className={cn(px, 'text-line')} aria-hidden />
        ))}
      </div>
      <span className={cn('text-ink-3', size === 'md' ? 'text-sm' : 'text-xs')}>
        {value > 0 ? valueText : '–'}{countText}
      </span>
    </div>
  )
}

export function StockBadge({ inStock, isLowStock, lowCount, locale }: { inStock: boolean; isLowStock?: boolean; lowCount?: number; locale: Locale }) {
  const t = getDict(locale).common
  if (!inStock) {
    return <span className="inline-flex items-center rounded-full border border-line bg-soft px-2 py-0.5 text-xs font-medium text-ink-3">{t.outOfStock}</span>
  }
  if (isLowStock) {
    return (
      <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
        {tf(t.lowStock, { n: locale === 'fa' ? faDigits(String(lowCount ?? 1)) : String(lowCount ?? 1) })}
      </span>
    )
  }
  return <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{t.inStock}</span>
}

export function PriceTag({ minor, locale, className }: { minor: number; locale: Locale; className?: string }) {
  return (
    <span className={cn('font-semibold text-ink', className)}>
      <span className="bdi">{formatMoney(minor, locale)}</span>
    </span>
  )
}

/** Sale price tag: struck-through list price + effective price, with a small "−n%" badge. */
export function SalePriceTag({ minor, listMinor, locale, className }: {
  minor: number; listMinor?: number | null; locale: Locale; className?: string
}) {
  const onSale = listMinor != null && listMinor > minor
  if (!onSale) return <PriceTag minor={minor} locale={locale} className={className} />
  const pct = Math.round((1 - minor / listMinor) * 100)
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span className="font-semibold text-orange-dark">
        <span className="bdi">{formatMoney(minor, locale)}</span>
      </span>
      <span aria-hidden className="text-xs font-medium text-ink-3 line-through decoration-ink-3/60">
        <span className="bdi">{formatMoney(listMinor, locale)}</span>
      </span>
      <span
        aria-hidden
        className="inline-flex h-4.5 items-center rounded bg-orange-accent px-1 py-px text-[10px] font-bold leading-none text-white shadow-sm"
      >
        −{locale === 'fa' ? faDigits(String(pct)) : pct}%
      </span>
    </span>
  )
}

/** Small ribbon pinned over a product cover while a promotion is on. */
export function SaleRibbon({ badge, locale }: { badge: string; locale?: Locale }) {
  void locale
  return (
    <span className="pointer-events-none absolute start-0 top-3 z-10 inline-flex items-center gap-1 rounded-e-md bg-orange-accent px-2 py-1 text-[11px] font-bold leading-none text-white shadow-sm">
      <Tag className="h-3 w-3" aria-hidden />
      <span className="bdi">{badge}</span>
    </span>
  )
}

export function QtyStepper({ value, onChange, max = 10, min = 1, disabled, small, locale = 'en' }: {
  value: number; onChange: (v: number) => void; max?: number; min?: number; disabled?: boolean; small?: boolean; locale?: Locale
}) {
  const qt = getDict(locale).common
  return (
    <div className={cn('inline-flex items-center rounded-md border border-line', small ? 'h-9' : 'h-11')} role="group" aria-label={qt.qty}>
      <button
        type="button" disabled={disabled || value <= min} aria-label={qt.decreaseQty}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn('flex h-full items-center justify-center rounded-s-md px-2.5 text-ink-2 hover:bg-soft disabled:opacity-40', small ? 'w-8' : 'w-10')}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className={cn('flex h-full min-w-8 items-center justify-center border-x border-line text-sm font-medium tabular-nums', small ? 'px-1' : 'px-2')} aria-live="polite">{locale === 'fa' ? faDigits(String(value)) : value}</span>
      <button
        type="button" disabled={disabled || value >= max} aria-label={qt.increaseQty}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn('flex h-full items-center justify-center rounded-e-md px-2.5 text-ink-2 hover:bg-soft disabled:opacity-40', small ? 'w-8' : 'w-10')}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

export function Breadcrumbs({ items, locale }: { items: { label: string; href?: string }[]; locale: Locale }) {
  const t = getDict(locale).common
  return (
    <nav aria-label={t.breadcrumb} className="mb-4 flex flex-wrap items-center gap-1 text-sm text-ink-3">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 mirror-rtl" aria-hidden />}
          {item.href ? (
            <Link href={localePath(locale, item.href)} onClick={(e) => { e.preventDefault(); import('@/lib/router').then(({ navigate }) => navigate(item.href!)) }} className="rounded px-0.5 hover:text-brand hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="px-0.5 text-ink-2">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Inline markdown marks (**bold** · *italic* · `code`) → styled React nodes.
 *  Persian-aware: never breaks RTL runs, code spans stay LTR. */
export function renderInline(text: string, keyPrefix = ''): React.ReactNode[] {
  return parseInlineSpans(text).map((s, i) => {
    if (s.code)
      return (
        <code key={`${keyPrefix}c${i}`} dir="ltr" className="mx-0.5 inline-block rounded bg-soft px-1.5 py-0.5 font-mono text-[0.86em] text-ink bdi">
          {s.text}
        </code>
      )
    if (s.bold)
      return (
        <strong key={`${keyPrefix}b${i}`} className="font-bold text-ink">
          {s.text}
        </strong>
      )
    if (s.italic)
      return (
        <em key={`${keyPrefix}i${i}`} className="italic">
          {s.text}
        </em>
      )
    return <span key={`${keyPrefix}s${i}`}>{s.text}</span>
  })
}

/** Server-side-consistent renderer for structured editorial blocks (PRD 12.2).
 *  Markdown source: ## h2 · ### h3 · > quote -- author · lists · ! callout ::
 *  ![alt](src) image · GFM table · --- divider · **bold** · *italic* · `code`.
 *  Fully bilingual — FA gets Vazirmatn via [lang=fa], «» quote marks, RTL tables. */
export function ProseBlocks({ blocks, locale, measure = true }: { blocks: Block[]; locale: Locale; measure?: boolean }) {
  if (!Array.isArray(blocks)) return null
  const isFa = locale === 'fa'
  const q = (s: string) => (isFa ? `«${s}»` : `“${s}”`)
  return (
    <div className={cn('prose-blocks space-y-5 text-[15.5px] leading-[1.75] text-ink-2', measure && 'prose-measure')} lang={locale}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'p':
            return <p key={i}>{renderInline(b.text ?? '', `p${i}-`)}</p>
          case 'h2':
            return <h2 key={i} id={`section-${i}`} className="scroll-mt-24 border-b border-line/70 pb-2 pt-4 text-xl font-bold tracking-tight text-ink">{renderInline(b.text ?? '', `h2${i}-`)}</h2>
          case 'h3':
            return <h3 key={i} className="pt-2 text-lg font-semibold text-ink">{renderInline(b.text ?? '', `h3${i}-`)}</h3>
          case 'quote':
            return (
              <blockquote key={i} className="rounded-e-md border-s-4 border-orange-accent bg-gradient-to-b from-soft/80 to-soft/40 px-5 py-4 text-[15.5px] italic text-ink-2">
                <p>{q(b.text ?? '')}</p>
                {b.attribution ? <footer className="mt-2 text-sm not-italic text-ink-3">— {renderInline(b.attribution, `qa${i}-`)}</footer> : null}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-2 ps-6 marker:text-orange-accent/70">
                {(b.items ?? []).map((it, j) => <li key={j}>{renderInline(it, `ul${i}-${j}-`)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-2 ps-6 marker:font-semibold marker:text-brand/70">
                {(b.items ?? []).map((it, j) => <li key={j}>{renderInline(it, `ol${i}-${j}-`)}</li>)}
              </ol>
            )
          case 'callout':
            return (
              <aside key={i} className="rounded-lg border border-brand/20 bg-brand-soft px-5 py-4">
                {b.title ? <p className="mb-1 text-sm font-bold text-brand">{renderInline(b.title, `ct${i}-`)}</p> : null}
                <p className="text-sm text-ink-2">{renderInline(b.text ?? '', `cb${i}-`)}</p>
              </aside>
            )
          case 'image':
            if (!b.src) return null
            return (
              <figure key={i} className="overflow-hidden rounded-lg border border-line">
                <img src={b.src} alt={b.alt ?? ''} loading="lazy" className="aspect-[7/4] w-full object-cover" />
                {(b.caption ?? b.alt) ? <figcaption className="bg-soft px-4 py-2.5 text-xs text-ink-3">{b.caption ?? b.alt}</figcaption> : null}
              </figure>
            )
          case 'table': {
            const head = b.head ?? []
            const rows = b.rows ?? []
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-line scrollbar-slim">
                <table className="w-full border-collapse text-start text-sm">
                  {head.some((c) => c.trim() !== '') && (
                    <thead>
                      <tr className="bg-soft">
                        {head.map((c, j) => (
                          <th key={j} scope="col" className="border-b border-line px-3.5 py-2.5 text-start text-[13px] font-bold text-ink">
                            {renderInline(c, `th${i}-${j}-`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={ri} className={cn('transition-colors hover:bg-brand-soft/40', ri % 2 === 1 && 'bg-soft/40')}>
                        {r.map((c, ci) => (
                          <td key={ci} className={cn('border-b border-line/60 px-3.5 py-2.5 align-top', ci === 0 ? 'font-semibold text-ink' : 'text-ink-2')}>
                            {renderInline(c, `td${i}-${ri}-${ci}-`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          case 'divider':
            return <hr key={i} className="border-line" />
          default:
            return null
        }
      })}
    </div>
  )
}

export function LegalPlaceholder({ locale }: { locale: Locale }) {
  const t = getDict(locale).static
  return (
    <div role="note" className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      {t.placeholderNote}
    </div>
  )
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'brand' | 'orange' | 'success' | 'warning' | 'error' }) {
  const tones = {
    default: 'border-line bg-soft text-ink-2',
    brand: 'border-brand/20 bg-brand-soft text-brand',
    orange: 'border-orange-accent/30 bg-orange-accent/10 text-orange-dark',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    error: 'border-error/30 bg-error/10 text-error',
  }
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export { formatDate, formatMoney }
