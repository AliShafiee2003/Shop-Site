// GET  /api/admin/discounts — list all codes with usage stats.
// POST /api/admin/discounts — create a code (audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { isEmptyScope, normalizeCode, normalizeScope, parseScope, serializeScope } from '@/lib/server/discounts'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const scopeSchema = z.object({
  productIds: z.array(z.string().max(64)).max(200).optional(),
  categoryIds: z.array(z.string().max(64)).max(100).optional(),
  publisherNames: z.array(z.string().max(120)).max(50).optional(),
  personIds: z.array(z.string().max(64)).max(200).optional(),
})

const createSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  minSubtotalMinor: z.number().int().min(0).max(1_000_000).default(0),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  noteEn: z.string().max(200).nullable().optional(),
  noteFa: z.string().max(200).nullable().optional(),
  scope: scopeSchema.optional(),
})

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const rows = await db.discountCode.findMany({ orderBy: { createdAt: 'desc' } })
  // Join usage: count paid orders referencing each code.
  const usage = await db.order.groupBy({
    by: ['discountCode'],
    where: { discountCode: { not: null }, paymentStatus: 'SUCCEEDED' },
    _count: { _all: true },
    _sum: { discountMinor: true },
  })
  const usageMap = new Map(usage.map((u) => [u.discountCode, { orders: u._count._all, givenMinor: u._sum.discountMinor ?? 0 }]))
  // Distinct publishers (Product.publisher is free text) — powers the scope editor.
  const publisherRows = await db.product.findMany({
    select: { publisher: true },
    distinct: ['publisher'],
    orderBy: { publisher: 'asc' },
  })

  // Resolve scoped codes into labelled entities so the admin table can show
  // WHAT a code covers (titles/names) instead of opaque ids.
  const scoped = rows.filter((d) => { const s = parseScope(d.scopeJson); return !isEmptyScope(s) })
  const pidSet = new Set<string>(); const cidSet = new Set<string>(); const perSet = new Set<string>()
  for (const d of scoped) {
    const s = parseScope(d.scopeJson)
    s.productIds.forEach((x) => pidSet.add(x)); s.categoryIds.forEach((x) => cidSet.add(x)); s.personIds.forEach((x) => perSet.add(x))
  }
  type NamedRow = { id: string; translations: { locale: string; title?: string; name?: string }[] }
  const prods: NamedRow[] = pidSet.size
    ? await db.product.findMany({ where: { id: { in: [...pidSet] } }, select: { id: true, translations: { select: { locale: true, title: true } } } })
    : []
  const cats: NamedRow[] = cidSet.size
    ? await db.category.findMany({ where: { id: { in: [...cidSet] } }, select: { id: true, translations: { select: { locale: true, name: true } } } })
    : []
  const pers: NamedRow[] = perSet.size
    ? await db.person.findMany({ where: { id: { in: [...perSet] } }, select: { id: true, translations: { select: { locale: true, name: true } } } })
    : []
  const labelOf = (row: NamedRow | undefined, locale: string): string | undefined => {
    const t = row?.translations.find((x) => x.locale === locale)
    return (t?.title ?? t?.name) ?? undefined
  }
  const prodById = new Map<string, NamedRow>(prods.map((p) => [p.id, p]))
  const catById = new Map<string, NamedRow>(cats.map((c) => [c.id, c]))
  const perById = new Map<string, NamedRow>(pers.map((p) => [p.id, p]))
  const resolveScope = (raw: string) => {
    const s = parseScope(raw)
    return {
      products: s.productIds.map((id) => ({ id, en: labelOf(prodById.get(id), 'en') ?? id, fa: labelOf(prodById.get(id), 'fa') ?? id })),
      categories: s.categoryIds.map((id) => ({ id, en: labelOf(catById.get(id), 'en') ?? id, fa: labelOf(catById.get(id), 'fa') ?? id })),
      publishers: s.publisherNames.map((n) => ({ id: n, en: n, fa: n })),
      people: s.personIds.map((id) => ({ id, en: labelOf(perById.get(id), 'en') ?? id, fa: labelOf(perById.get(id), 'fa') ?? id })),
    }
  }

  return json({
    publishers: publisherRows.map((p) => p.publisher).filter((p): p is string => !!p),
    discounts: rows.map((d) => ({
      id: d.id,
      code: d.code,
      type: d.type,
      value: d.value,
      minSubtotalMinor: d.minSubtotalMinor,
      maxRedemptions: d.maxRedemptions,
      timesUsed: d.timesUsed,
      paidOrders: usageMap.get(d.code)?.orders ?? 0,
      givenAwayMinor: usageMap.get(d.code)?.givenMinor ?? 0,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      isActive: d.isActive,
      noteEn: d.noteEn,
      noteFa: d.noteFa,
      scope: parseScope(d.scopeJson),
      scopeResolved: resolveScope(d.scopeJson),
      createdAt: d.createdAt,
    })),
  })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  if (d.type === 'PERCENT' && (d.value < 1 || d.value > 90)) {
    return apiError(400, 'VALIDATION_ERROR', 'PERCENT value must be 1–90')
  }
  if (d.type === 'FIXED' && d.value > 1_000_000) {
    return apiError(400, 'VALIDATION_ERROR', 'FIXED value too large')
  }
  if (d.startsAt && d.endsAt && new Date(d.startsAt) > new Date(d.endsAt)) {
    return apiError(400, 'VALIDATION_ERROR', 'startsAt must be before endsAt')
  }

  const code = normalizeCode(d.code)
  const exists = await db.discountCode.findUnique({ where: { code } })
  if (exists) return apiError(409, 'CODE_TAKEN', 'A code with this name already exists')

  const created = await db.discountCode.create({
    data: {
      code,
      type: d.type,
      value: d.value,
      minSubtotalMinor: d.minSubtotalMinor,
      maxRedemptions: d.maxRedemptions ?? null,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      noteEn: d.noteEn ?? null,
      noteFa: d.noteFa ?? null,
      scopeJson: serializeScope(normalizeScope(d.scope ?? {})),
    },
  })

  const scopeSummary = isEmptyScope(normalizeScope(d.scope ?? {})) ? 'whole catalog' : 'scoped'
  await audit(user.email, 'DISCOUNT_CREATE', 'DiscountCode', created.id, `Created code ${code} (${d.type} ${d.type === 'PERCENT' ? `${d.value}%` : `€${(d.value / 100).toFixed(2)}`}, scope: ${scopeSummary})`)
  return json({ discount: created }, 201)
}
