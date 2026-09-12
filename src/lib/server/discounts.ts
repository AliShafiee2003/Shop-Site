// Discount code validation + computation (server-authoritative).
// Codes are normalized (trim, uppercase). Discounts apply to the order SUBTOTAL
// (before shipping). VAT is included in prices, so a discount reduces the
// VAT-inclusive total; the contained tax is recomputed from the discounted total.
//
// Task 50 — scoping: a code may be limited to specific products, categories,
// publishers or contributors (author/illustrator/…). The scope lives on the row
// as scopeJson ({productIds,categoryIds,publisherNames,personIds}; empty lists =
// whole catalog). A cart product is eligible when it matches ANY non-empty list,
// and PERCENT/FIXED amounts compute against the ELIGIBLE items' subtotal only —
// a scoped code can never discount out-of-scope books.
import type { DiscountCode } from '@prisma/client'
import { db } from '@/lib/db'

export interface DiscountPublic {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  discountMinor: number
  minSubtotalMinor: number
  noteEn: string | null
  noteFa: string | null
}

export type DiscountRejection =
  | 'INVALID'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'MIN_SUBTOTAL'
  | 'EXHAUSTED'
  | 'NO_ELIGIBLE_ITEMS'

/** Eligibility scope — every list is optional; an empty/missing list = no restriction. */
export interface DiscountScope {
  productIds: string[]
  categoryIds: string[]
  publisherNames: string[]
  personIds: string[]
}

const EMPTY_SCOPE: DiscountScope = { productIds: [], categoryIds: [], publisherNames: [], personIds: [] }

export const isEmptyScope = (s: DiscountScope): boolean =>
  s.productIds.length === 0 && s.categoryIds.length === 0 && s.publisherNames.length === 0 && s.personIds.length === 0

/** Parse the stored scopeJson defensively (unknown shapes → empty scope). */
export function parseScope(raw: string | null | undefined): DiscountScope {
  if (!raw) return { ...EMPTY_SCOPE }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { ...EMPTY_SCOPE }
  }
  if (!v || typeof v !== 'object') return { ...EMPTY_SCOPE }
  const o = v as Record<string, unknown>
  const arr = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((e): e is string => typeof e === 'string' && e.length > 0) : []
  return {
    productIds: arr(o.productIds),
    categoryIds: arr(o.categoryIds),
    publisherNames: arr(o.publisherNames),
    personIds: arr(o.personIds),
  }
}

export function serializeScope(s: DiscountScope): string {
  return JSON.stringify({
    productIds: s.productIds ?? [],
    categoryIds: s.categoryIds ?? [],
    publisherNames: s.publisherNames ?? [],
    personIds: s.personIds ?? [],
  })
}

/** Normalize a user/admin-supplied scope (dedupe, trim publishers). */
export function normalizeScope(input: Partial<DiscountScope> | null | undefined): DiscountScope {
  const dedupe = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)))
  return {
    productIds: dedupe(input?.productIds ?? []),
    categoryIds: dedupe(input?.categoryIds ?? []),
    publisherNames: dedupe(input?.publisherNames ?? []),
    personIds: dedupe(input?.personIds ?? []),
  }
}

/**
 * Which cart line items are covered by the code's scope?
 * One DB roundtrip: load the cart's products with categories + contributors,
 * then match against the four scope lists (OR semantics).
 * Returns the eligible line totals ([]) when nothing matches.
 */
export async function eligibleItemTotals(
  scope: DiscountScope,
  items: { productId: string; lineTotalMinor: number }[],
): Promise<number[]> {
  if (isEmptyScope(scope)) return items.map((i) => i.lineTotalMinor)
  const productIds = Array.from(new Set(items.map((i) => i.productId)))
  if (productIds.length === 0) return []
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      publisher: true,
      categories: { select: { categoryId: true } },
      contributors: { select: { personId: true } },
    },
  })
  const meta = new Map(products.map((p) => [p.id, p]))
  const out: number[] = []
  for (const item of items) {
    const p = meta.get(item.productId)
    if (!p) continue
    const hit =
      (scope.productIds.length > 0 && scope.productIds.includes(p.id)) ||
      (scope.categoryIds.length > 0 && p.categories.some((c) => scope.categoryIds.includes(c.categoryId))) ||
      (scope.publisherNames.length > 0 && scope.publisherNames.includes(p.publisher ?? '')) ||
      (scope.personIds.length > 0 && p.contributors.some((c) => scope.personIds.includes(c.personId)))
    if (hit) out.push(item.lineTotalMinor)
  }
  return out
}

/** Normalize a raw code: trim, collapse inner spaces, uppercase. */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Compute the discount amount in minor units for a given subtotal. */
export function computeDiscountAmount(dc: Pick<DiscountCode, 'type' | 'value'>, subtotalMinor: number): number {
  if (dc.type === 'PERCENT') {
    return Math.min(subtotalMinor, Math.round((subtotalMinor * dc.value) / 100))
  }
  return Math.min(subtotalMinor, dc.value)
}

/** Full validation of a code against a subtotal. Returns the code row or a rejection reason.
 *  `items` (cart lines) enables SCOPED codes: without it, scoped codes are evaluated
 *  against the whole subtotal (legacy callers); with it, only eligible lines count. */
export async function validateDiscount(
  rawCode: string,
  subtotalMinor: number,
  tx?: { discountCode: Pick<typeof db.discountCode, 'findUnique'> },
  items?: { productId: string; lineTotalMinor: number }[],
): Promise<{ ok: true; dc: DiscountCode; discountMinor: number } | { ok: false; reason: DiscountRejection }> {
  const code = normalizeCode(rawCode)
  if (!code) return { ok: false, reason: 'INVALID' }
  const client = tx ?? db
  const dc = await client.discountCode.findUnique({ where: { code } })
  if (!dc) return { ok: false, reason: 'INVALID' }
  if (!dc.isActive) return { ok: false, reason: 'INACTIVE' }
  const now = new Date()
  if (dc.startsAt && dc.startsAt > now) return { ok: false, reason: 'NOT_STARTED' }
  if (dc.endsAt && dc.endsAt < now) return { ok: false, reason: 'EXPIRED' }
  if (dc.maxRedemptions !== null && dc.timesUsed >= dc.maxRedemptions) return { ok: false, reason: 'EXHAUSTED' }

  // Scope engine: which portion of THIS cart does the code cover?
  const scope = parseScope(dc.scopeJson)
  let baseMinor = subtotalMinor
  if (!isEmptyScope(scope)) {
    if (!items) return { ok: false, reason: 'NO_ELIGIBLE_ITEMS' } // cannot verify → refuse
    const eligibleTotals = await eligibleItemTotals(scope, items)
    baseMinor = eligibleTotals.reduce((s, v) => s + v, 0)
    if (baseMinor <= 0) return { ok: false, reason: 'NO_ELIGIBLE_ITEMS' }
  }

  if (baseMinor < dc.minSubtotalMinor) return { ok: false, reason: 'MIN_SUBTOTAL' }
  return { ok: true, dc, discountMinor: computeDiscountAmount(dc, baseMinor) }
}

/** Public shape sent to clients (never leaks internal counters beyond what's useful). */
export function toDiscountPublic(dc: DiscountCode, discountMinor: number): DiscountPublic {
  return {
    code: dc.code,
    type: dc.type as 'PERCENT' | 'FIXED',
    value: dc.value,
    discountMinor,
    minSubtotalMinor: dc.minSubtotalMinor,
    noteEn: dc.noteEn,
    noteFa: dc.noteFa,
  }
}
