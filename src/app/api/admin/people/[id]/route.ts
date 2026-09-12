// PATCH /api/admin/people/[id] — update contributor names, bios, profession, status (audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  nameEn: z.string().min(2).max(80).optional(),
  nameFa: z.string().max(80).nullable().optional(),
  shortBioEn: z.string().max(600).nullable().optional(),
  shortBioFa: z.string().max(600).nullable().optional(),
  profession: z.string().max(80).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  // Portrait photo (Task 51) — /uploads/… URL from the admin media endpoint.
  portraitUrl: z.string().max(300).nullable().optional(),
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

  const existing = await db.person.findUnique({ where: { id }, include: { translations: true } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  const en = existing.translations.find((t) => t.locale === 'en')
  const fa = existing.translations.find((t) => t.locale === 'fa')

  const updated = await db.$transaction(async (tx) => {
    const person = await tx.person.update({
      where: { id },
      data: {
        ...(d.profession !== undefined ? { profession: d.profession } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.portraitUrl !== undefined ? { portraitUrl: d.portraitUrl } : {}),
      },
    })

    if (d.nameEn !== undefined || d.shortBioEn !== undefined) {
      if (en) {
        await tx.personTranslation.update({
          where: { id: en.id },
          data: {
            ...(d.nameEn !== undefined ? { name: d.nameEn.trim() } : {}),
            ...(d.shortBioEn !== undefined ? { shortBio: d.shortBioEn } : {}),
          },
        })
      } else if (d.nameEn !== undefined && d.nameEn.trim() !== '') {
        await tx.personTranslation.create({
          data: { personId: id, locale: 'en', name: d.nameEn.trim(), shortBio: d.shortBioEn ?? null },
        })
      }
    }
    if (d.nameFa !== undefined || d.shortBioFa !== undefined) {
      if (d.nameFa === '' && !d.shortBioFa) {
        if (fa) await tx.personTranslation.delete({ where: { id: fa.id } })
      } else if (fa) {
        await tx.personTranslation.update({
          where: { id: fa.id },
          data: {
            ...(d.nameFa != null ? { name: d.nameFa!.trim() } : {}),
            ...(d.shortBioFa !== undefined ? { shortBio: d.shortBioFa } : {}),
          },
        })
      } else if (d.nameFa != null && d.nameFa.trim() !== '') {
        await tx.personTranslation.create({
          data: { personId: id, locale: 'fa', name: d.nameFa!.trim(), shortBio: d.shortBioFa ?? null },
        })
      }
    }

    return tx.person.findUnique({ where: { id }, include: { translations: true } })
  })

  await audit(user.email, 'PERSON_UPDATE', 'Person', id, `Updated contributor "${existing.slug}"${d.status !== undefined ? ` — status ${d.status}` : ''}${d.portraitUrl !== undefined ? ` — portrait ${d.portraitUrl ? 'set' : 'cleared'}` : ''}`)
  return json({ person: updated })
}
