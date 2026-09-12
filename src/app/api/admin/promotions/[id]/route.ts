// PATCH  /api/admin/promotions/[id] — update a promotion (audited).
// Activating one promotion deactivates all others (single sitewide promo).
// DELETE /api/admin/promotions/[id] — remove a promotion (audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'
import { parseExcludedIds } from '@/lib/server/promotions'

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  type: z.enum(['PERCENT', 'FIXED']).optional(),
  value: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  noteEn: z.string().max(160).nullable().optional(),
  noteFa: z.string().max(160).nullable().optional(),
  excludedProductIds: z.array(z.string()).max(100).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  const existing = await db.promotion.findUnique({ where: { id } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  const nextType = d.type ?? existing.type
  const nextValue = d.value ?? existing.value
  if (nextType === 'PERCENT' && (nextValue < 1 || nextValue > 90)) {
    return apiError(400, 'VALIDATION_ERROR', 'PERCENT value must be 1–90')
  }
  if (nextType === 'FIXED' && (nextValue < 100 || nextValue > 1_000_000)) {
    return apiError(400, 'VALIDATION_ERROR', 'FIXED value must be €1.00–€10,000.00')
  }
  const nextStarts = d.startsAt !== undefined ? d.startsAt : (existing.startsAt?.toISOString() ?? null)
  const nextEnds = d.endsAt !== undefined ? d.endsAt : (existing.endsAt?.toISOString() ?? null)
  if (nextStarts && nextEnds && new Date(nextStarts) > new Date(nextEnds)) {
    return apiError(400, 'VALIDATION_ERROR', 'startsAt must be before endsAt')
  }

  const updated = await db.promotion.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.value !== undefined ? { value: d.value } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
      ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
      ...(d.noteEn !== undefined ? { noteEn: d.noteEn } : {}),
      ...(d.noteFa !== undefined ? { noteFa: d.noteFa } : {}),
      ...(d.excludedProductIds !== undefined ? { excludedProductIds: JSON.stringify(d.excludedProductIds) } : {}),
    },
  })

  if (updated.isActive && existing.isActive !== true) {
    await db.promotion.updateMany({ where: { id: { not: id } }, data: { isActive: false } })
  }

  await audit(
    user.email,
    'PROMOTION_UPDATE',
    'Promotion',
    id,
    `Updated promotion "${updated.name}"${d.excludedProductIds !== undefined ? ` — ${d.excludedProductIds.length} excluded title(s)` : ''}${d.isActive !== undefined ? ` — ${updated.isActive ? 'ACTIVATED (others off)' : 'deactivated'}` : ''}`,
  )
  return json({ promotion: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  const existing = await db.promotion.findUnique({ where: { id } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  await db.promotion.delete({ where: { id } })
  await audit(user.email, 'PROMOTION_DELETE', 'Promotion', id, `Deleted promotion "${existing.name}"`)
  return json({ ok: true })
}
