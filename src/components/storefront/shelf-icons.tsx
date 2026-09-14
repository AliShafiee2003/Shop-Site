'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Category shelf marks — bespoke stroke SVGs keyed by the category's explicit
 * `icon` choice (admin pick, wins), then by category slug (auto default), with
 * a generic books-stack fallback. Rendered in `currentColor` — white on the
 * colored disc.
 */

type MarkProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function FictionMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h9l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M15 3v5h5" />
      <path d="M8 13c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0" />
    </svg>
  )
}

function PoetryMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.2 5.3 18.7 3.8a2.1 2.1 0 0 0-3 0L5 14.5 4 20l5.5-1L20.2 8.3a2.1 2.1 0 0 0 0-3Z" />
      <path d="M13.5 6.5 17.5 10.5" />
      <path d="M4 20c1.5-.3 3-.3 4.5 0" />
    </svg>
  )
}

function NonFictionMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  )
}

function ChildrensMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.4" />
      <rect x="13" y="4" width="7" height="7" rx="3.5" />
      <rect x="4" y="13" width="7" height="7" rx="3.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.4" />
    </svg>
  )
}

function ArtMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6a2 2 0 0 0 1.7-.9l.5-.7a1 1 0 0 1 .8-.4h1.8a1 1 0 0 1 .8.4l.5.7a2 2 0 0 0 1.7.9h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  )
}

function BiographyMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.8 6.8 0 0 1 13 0" />
    </svg>
  )
}

function BooksStackMark({ className }: MarkProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 16.5h14M5 20h14" />
      <rect x="4.5" y="4" width="12" height="8.5" rx="1" />
      <path d="M19.5 5.5v6" />
    </svg>
  )
}

/** slug-keyed marks (preferred) */
const SHELF_MARKS: Record<string, (p: MarkProps) => ReactNode> = {
  fiction: FictionMark,
  poetry: PoetryMark,
  'non-fiction': NonFictionMark,
  'childrens-books': ChildrensMark,
  'art-photography': ArtMark,
  'biography-memoir': BiographyMark,
}

/** legacy lucide-icon-key marks (fallback) */
const LEGACY_MARKS: Record<string, (p: MarkProps) => ReactNode> = {
  BookOpen: FictionMark,
  Feather: PoetryMark,
  NotebookPen: NonFictionMark,
  Shapes: ChildrensMark,
  Camera: ArtMark,
  UserRound: BiographyMark,
}

export function getShelfMark(slug?: string | null, icon?: string | null): (p: MarkProps) => ReactNode {
  // Explicit admin choice wins over the slug default, so changing the icon in
  // the admin panel is always visible on the storefront.
  if (icon && LEGACY_MARKS[icon]) return LEGACY_MARKS[icon]
  if (slug && SHELF_MARKS[slug]) return SHELF_MARKS[slug]
  return BooksStackMark
}

/**
 * TiltCircle — holographic 3D interactive disc (pointer-tilt parallax,
 * reference: freefrontend holographic 3d interactive card).
 * The disc background is the category's color (admin-definable) with a white
 * mark floating at translateZ above it and a cursor-following sheen.
 * Mouse/pen only; respects prefers-reduced-motion; rAF-throttled.
 */
export function TiltCircle({
  color,
  children,
  className,
  size = 96,
  imageSrc,
}: {
  color: string
  children: ReactNode
  className?: string
  size?: number
  /** Admin-uploaded custom artwork (Task 51): a square PNG becomes a full
   *  circular badge COVERING the disc — object-contain would float a white
   *  square inside the colored disc when the PNG has an opaque background.
   *  The holographic film underneath and the cursor sheen above still read
   *  through, so the upload keeps the shelf's visual language. */
  imageSrc?: string
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const discRef = useRef<HTMLSpanElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const sheenRef = useRef<HTMLSpanElement>(null)
  const frame = useRef(0)
  const [tiltable, setTiltable] = useState(false)

  // Pointer-precision devices only (touch stays static-depth).
  const enable = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setTiltable(true)
    }
  }, [])

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!tiltable || e.pointerType === 'touch') return
      const wrap = wrapRef.current
      const disc = discRef.current
      const icon = iconRef.current
      const sheen = sheenRef.current
      if (!wrap || !disc || !icon || !sheen) return
      const rect = wrap.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const reduce =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduce) return
        disc.style.transform = `translateY(-4px) rotateX(${(-py * 24).toFixed(2)}deg) rotateY(${(px * 24).toFixed(2)}deg)`
        icon.style.transform = `translateZ(44px) translate(${(-px * 6).toFixed(1)}px, ${(-py * 6).toFixed(1)}px)`
        sheen.style.background = `radial-gradient(circle at ${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%)`
        sheen.style.opacity = '1'
      })
    },
    [tiltable],
  )

  const onLeave = useCallback(() => {
    const disc = discRef.current
    const icon = iconRef.current
    const sheen = sheenRef.current
    if (disc) disc.style.transform = ''
    if (icon) icon.style.transform = ''
    if (sheen) sheen.style.opacity = '0'
  }, [])

  return (
    <span
      ref={wrapRef}
      className={cn('inline-block [perspective:640px]', className)}
      onPointerEnter={enable}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <span
        ref={discRef}
        className="relative flex items-center justify-center rounded-full shadow-[0_12px_32px_-12px_rgba(23,32,38,0.45)] ring-1 ring-inset ring-white/20 transition-transform duration-300 ease-out will-change-transform"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          color: '#ffffff',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* baked-in conic holographic film */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-45 mix-blend-soft-light"
          style={{
            background:
              'conic-gradient(from 210deg, #9adcf0, #b7f0d4, #f7e8a9, #f6c6a0, #d9c2f2, #9adcf0)',
          }}
        />
        {/* inner light edge for depth */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 45%)' }}
        />
        {/* Custom artwork — a full-disc circular badge above the film, below the sheen */}
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-cover"
          />
        ) : null}
        {/* cursor-following sheen */}
        <span
          ref={sheenRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 mix-blend-screen transition-opacity duration-200"
        />
        <span
          ref={iconRef}
          className="relative will-change-transform"
          style={{ transform: 'translateZ(30px)', transformStyle: 'preserve-3d' }}
        >
          {children}
        </span>
      </span>
    </span>
  )
}
