// Server-side order lifecycle timeline for PUBLIC surfaces (guest /track).
// Derives the canonical fulfillment stages from REAL OrderEvent rows — the
// stepper is pure rendering over backend state, never the reverse.
//
// Security note: the public payload carries ONLY { stage, at } pairs. Event
// messages (internal admin notes, carrier remarks) are intentionally NOT
// exposed on the guest endpoint.
import { db } from '@/lib/db'

export interface PublicTimelinePoint {
  stage: 'PENDING_PAYMENT' | 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED'
  at: string
}

/** Port of the AccountView stepper parser (same stage claims, same legacy
 *  "Status changed X → Y" NOTE handling) — one source of truth per side. */
export function getPublicOrderTimeline(orderId: string): Promise<PublicTimelinePoint[]> {
  return db.orderEvent
    .findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { type: true, message: true, createdAt: true } })
    .then((events) => {
      const ts = new Map<string, Date>()
      const claim = (stage: string, at: Date) => {
        if (!ts.has(stage)) ts.set(stage, at)
      }
      for (const ev of events) {
        if (ev.type === 'CREATED') claim('PENDING_PAYMENT', ev.createdAt)
        else if (ev.type === 'PAID' || ev.type === 'STATUS_PAID') claim('PAID', ev.createdAt)
        else if (ev.type === 'STATUS_PROCESSING') claim('PROCESSING', ev.createdAt)
        else if (ev.type === 'SHIPPED' || ev.type === 'STATUS_SHIPPED') claim('SHIPPED', ev.createdAt)
        else if (ev.type === 'STATUS_DELIVERED') claim('DELIVERED', ev.createdAt)
        else if (ev.type === 'NOTE') {
          const m = /Status changed [A-Z_]+ → ([A-Z_]+)/.exec(ev.message)
          if (m && ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(m[1])) {
            claim(m[1], ev.createdAt)
          }
        }
      }
      const order = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const
      return order
        .filter((s) => ts.has(s))
        .map((s) => ({ stage: s, at: (ts.get(s) as Date).toISOString() }))
    })
}
