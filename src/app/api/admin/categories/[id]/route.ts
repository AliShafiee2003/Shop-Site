// PATCH  /api/admin/categories/[id] — update names/descriptions/visibility (audited).
// DELETE /api/admin/categories/[id] — remove the category (ProductCategory links cascade).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  nameEn: z.string().min(2).max(60).optional(),
  nameFa: z.string().max(60).nullable().optional(),
  descriptionEn: z.string().max(300).nullable().optional(),
  descriptionFa: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  icon: z.string().max(40).nullable().optional(),
  iconUrl: z.string().max(300).nullable().optional(),
  color: z.string().max(9).nullable().optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
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

  const existing = await db.category.findUnique({ where: { id }, include: { translations: true } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  const en = existing.translations.find((t) => t.locale === 'en')
  const fa = existing.translations.find((t) => t.locale === 'fa')

  const updated = await db.$transaction(async (tx) => {
    await tx.category.update({
      where: { id },
      data: {
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
        ...(d.icon !== undefined ? { icon: d.icon } : {}),
        ...(d.iconUrl !== undefined ? { iconUrl: d.iconUrl } : {}),
        ...(d.color !== undefined ? { color: d.color } : {}),
      },
    })

    if (d.nameEn !== undefined || d.descriptionEn !== undefined) {
      if (en) {
        await tx.categoryTranslation.update({
          where: { id: en.id },
          data: {
            ...(d.nameEn !== undefined ? { name: d.nameEn.trim() } : {}),
            ...(d.descriptionEn !== undefined ? { description: d.descriptionEn } : {}),
          },
        })
      } else if (d.nameEn !== undefined && d.nameEn.trim() !== '') {
        await tx.categoryTranslation.create({
          data: { categoryId: id, locale: 'en', name: d.nameEn.trim(), description: d.descriptionEn ?? null },
        })
      }
    }
    if (d.nameFa !== undefined || d.descriptionFa !== undefined) {
      // Empty FA name (and no FA description) → remove the FA translation entirely.
      if (d.nameFa === '' && !d.descriptionFa) {
        if (fa) await tx.categoryTranslation.delete({ where: { id: fa.id } })
      } else if (fa) {
        await tx.categoryTranslation.update({
          where: { id: fa.id },
          data: {
            ...(d.nameFa != null ? { name: d.nameFa!.trim() } : {}),
            ...(d.descriptionFa !== undefined ? { description: d.descriptionFa } : {}),
          },
        })
      } else if (d.nameFa != null && d.nameFa.trim() !== '') {
        await tx.categoryTranslation.create({
          data: { categoryId: id, locale: 'fa', name: d.nameFa!.trim(), description: d.descriptionFa ?? null },
        })
      }
    }

    return tx.category.findUnique({ where: { id }, include: { translations: true } })
  })

  await audit(user.email, 'CATEGORY_UPDATE', 'Category', id, `Updated category "${existing.slug}"${d.isActive !== undefined ? ` — ${d.isActive ? 'visible' : 'hidden'}` : ''}`)
  return json({ category: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  const existing = await db.category.findUnique({ where: { id } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  await db.category.delete({ where: { id } })
  await audit(user.email, 'CATEGORY_DELETE', 'Category', id, `Deleted category "${existing.slug}"`)
  return json({ ok: true })
}
