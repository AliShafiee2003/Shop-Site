'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDict } from '@/lib/i18n'
import { formatDateTime, formatDate } from '@/lib/format'
import type { Locale } from '@/lib/types'

/** Canonical fulfillment stages — mirrors the AccountView stepper and the
 *  server-side getPublicOrderTimeline() parser. */
const STAGES = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const
type Stage = (typeof STAGES)[number]

/**
 * R6 — order lifecycle stepper for guest order tracking (/track).
 * Pure rendering over backend state: a stage lights up only when a matching
 * OrderEvent timestamp exists in `order.timeline` (see lib/server/order-timeline.ts).
 *
 * Layout: vertical timeline on mobile, a connected horizontal rail on sm+
 * (logical start/end insets only — the rail mirrors correctly under RTL).
 * Terminal failure states (CANCELLED / REFUNDED) render a muted banner
 * instead of the forward-looking stepper.
 */
export function OrderStepper({
  status,
  timeline,
  createdAt,
  eta,
  locale,
}: {
  status: string
  timeline?: { stage: string; at: string }[]
  createdAt: string
  eta?: string | null
  locale: Locale
}) {
  const t = getDict(locale)

  // Terminal, non-forward states get an explanatory banner instead.
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    const key = status === 'CANCELLED' ? 'cancelled' : 'refunded'
    return (
      <div role="status" className="mt-5 flex items-start gap-3 rounded-lg border border-line bg-soft/50 px-4 py-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-3/10 text-ink-3" aria-hidden>
          <Check className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-2">{t.track.terminalTitle[key]}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{t.track.terminalBody[key]}</p>
        </div>
      </div>
    )
  }

  const times = new Map<string, string>((timeline ?? []).map((p) => [p.stage, p.at]))
  // CREATED always has an event in practice; fall back to the order's own
  // createdAt so "Placed" is never blank on legacy rows.
  if (!times.has('PENDING_PAYMENT')) times.set('PENDING_PAYMENT', createdAt)
  const lastDoneIdx = (() => {
    // Index of the FURTHEST stage with a timestamp (monotonic lifecycle),
    // -1 when nothing is recorded yet.
    let idx = -1
    STAGES.forEach((s, i) => { if (times.has(s)) idx = i })
    return idx
  })()
  // The live stage is the one AFTER the furthest completed stage — DELIVERED
  // (last = 4) leaves nothing current.
  const currentIdx = lastDoneIdx + 1
  const allDone = lastDoneIdx === STAGES.length - 1

  const label: Record<Stage, string> = {
    PENDING_PAYMENT: t.track.stagePlaced,
    PAID: t.track.stagePaid,
    PROCESSING: t.track.stageProcessing,
    SHIPPED: t.track.stageShipped,
    DELIVERED: t.track.stageDelivered,
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{t.track.progressTitle}</h3>
        {eta && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand">
            {t.track.eta}: {formatDate(eta, locale)}
          </span>
        )}
      </div>

      <ol className="sm:flex" aria-label={t.track.progressTitle}>
        {STAGES.map((stage, i) => {
          const at = times.get(stage)
          const done = Boolean(at)
          const current = !done && i === currentIdx && !allDone
          // A stage with no timestamp but LATER stages already done was
          // skipped in the backend lifecycle (legacy orders can predate a
          // stage type) — show an em dash, never a misleading "Pending".
          const skipped = !done && STAGES.some((s, j) => j > i && times.has(s))
          const isLast = i === STAGES.length - 1
          return (
            <li
              key={stage}
              className="relative flex gap-3 pb-5 ps-9 last:pb-0 sm:flex-1 sm:flex-col sm:gap-1.5 sm:ps-0 sm:text-center"
              aria-current={current ? 'step' : undefined}
            >
              {/* connector to the next stage — vertical drop on mobile,
                  horizontal rail on sm+ (start/end insets → RTL-safe) */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute start-[13px] top-7 w-px sm:top-[15px] sm:h-[2px] sm:w-auto',
                    'h-[calc(100%-1.75rem)] sm:h-[2px]',
                    'sm:start-[50%] sm:end-[-50%]',
                    done ? 'bg-brand/50' : 'bg-line',
                    'transition-colors duration-500',
                  )}
                />
              )}

              {/* node */}
              <span
                aria-hidden
                className={cn(
                  'absolute start-0 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-colors duration-300 sm:relative sm:start-auto sm:mx-auto',
                  done
                    ? 'border-brand bg-brand text-white'
                    : current
                      ? 'border-brand text-brand motion-safe:animate-pulse-ring'
                      : 'border-line text-transparent',
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3} />
                ) : current ? (
                  <span className="h-2 w-2 rounded-full bg-brand" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                )}
              </span>

              <div className="min-w-0 sm:mt-1.5">
                <p
                  className={cn(
                    'text-sm leading-tight',
                    done ? 'font-semibold text-ink' : current ? 'font-semibold text-brand' : 'font-medium text-ink-3',
                  )}
                >
                  {label[stage]}
                  {current && (
                    <span className="ms-1.5 inline-block rounded-full bg-brand-soft px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-brand">
                      {t.track.now}
                    </span>
                  )}
                </p>
                {at ? (
                  <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{formatDateTime(at, locale)}</p>
                ) : skipped ? (
                  <p className="mt-0.5 text-[11px] leading-tight text-ink-3/40" aria-hidden>—</p>
                ) : (
                  <p className="mt-0.5 text-[11px] leading-tight text-ink-3/50">{t.track.pending}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
