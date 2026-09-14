// GET  /api/admin/promotions — list sitewide promotions (active first).
// POST /api/admin/promotions — create a promotion (audited). Activating one
// deactivates the others: the storefront supports a single sitewide promo.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'
import { parseExcludedIds } from '@/lib/server/promotions'

const createSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  isActive: z.boolean().default(false),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  noteEn: z.string().max(160).nullable().optional(),
  noteFa: z.string().max(160).nullable().optional(),
  excludedProductIds: z.array(z.string()).max(100).optional(),
})

export async function GET() {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const rows = await db.promotion.findMany({ orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] })
  const now = new Date()
  return json({
    promotions: rows.map((p) => ({
      ...p,
      excludedProductIds: parseExcludedIds(p.excludedProductIds),
      inWindow:
        (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt >= now),
    })),
  })
}

export async function POST(req: Request) {
  const user = await requireContentAdmin()
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
  if (d.type === 'FIXED' && (d.value < 100 || d.value > 1_000_000)) {
    return apiError(400, 'VALIDATION_ERROR', 'FIXED value must be €1.00–€10,000.00')
  }
  if (d.startsAt && d.endsAt && new Date(d.startsAt) > new Date(d.endsAt)) {
    return apiError(400, 'VALIDATION_ERROR', 'startsAt must be before endsAt')
  }

  const created = await db.promotion.create({
    data: {
      name: d.name.trim(),
      type: d.type,
      value: d.value,
      isActive: d.isActive,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      noteEn: d.noteEn ?? null,
      noteFa: d.noteFa ?? null,
      excludedProductIds: JSON.stringify(d.excludedProductIds ?? []),
    },
  })
  if (created.isActive) {
    // Single sitewide promo: switch every other one off.
    await db.promotion.updateMany({ where: { id: { not: created.id } }, data: { isActive: false } })
  }

  await audit(user.email, 'PROMOTION_CREATE', 'Promotion', created.id, `Created promotion "${created.name}" (${created.type} ${created.type === 'PERCENT' ? `${created.value}%` : `€${(created.value / 100).toFixed(2)}`})${created.isActive ? ' — ACTIVE' : ''}`)
  return json({ promotion: created }, 201)
}
