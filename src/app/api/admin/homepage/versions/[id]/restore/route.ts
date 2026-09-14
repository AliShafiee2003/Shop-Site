// POST /api/admin/homepage/versions/[id]/restore — copy an ARCHIVED (or the
// current PUBLISHED) version's sections into the DRAFT (R9). Deliberately does
// NOT publish: the admin reviews the restored draft in the editor and presses
// Publish through the normal audited flow. Restoring replaces ALL draft
// sections (same replace-all contract as the editor's PUT draft path).
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json } from '@/lib/server/utils'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params

  const version = await db.homepageVersion.findUnique({
    where: { id },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!version) return apiError(404, 'NOT_FOUND')
  if (version.status === 'DRAFT') return apiError(400, 'NOT_RESTORABLE')
  if (version.sections.length === 0) return apiError(400, 'EMPTY_VERSION')

  const sectionData = version.sections.map((s) => ({
    type: s.type,
    sortOrder: s.sortOrder,
    enabled: s.enabled,
    settingsJson: s.settingsJson,
  }))

  // Single-source config: the homepage editor writes are mirrored to BOTH
  // locales (settings are bilingual), so a restore must mirror too — otherwise
  // the next editor save would resurrect the pre-restore order in one locale.
  const otherLocale: 'en' | 'fa' = version.locale === 'en' ? 'fa' : 'en'
  const summary = `Restored from ${version.status === 'PUBLISHED' ? 'current' : ''} version published ${version.publishedAt?.toISOString().slice(0, 10) ?? version.createdAt.toISOString().slice(0, 10)}`.replace('  ', ' ')

  const restoreDraftFor = async (loc: 'en' | 'fa', tx: Prisma.TransactionClient) => {
    const existingDraft = await tx.homepageVersion.findFirst({
      where: { locale: loc, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    })
    return existingDraft
      ? await tx.homepageVersion.update({
          where: { id: existingDraft.id },
          data: { changeSummary: summary, sections: { deleteMany: {}, create: sectionData } },
        })
      : await tx.homepageVersion.create({
          data: { locale: loc, status: 'DRAFT', changeSummary: summary, sections: { create: sectionData } },
        })
  }

  const draft = await db.$transaction(async (tx) => {
    const restored = await restoreDraftFor(version.locale as 'en' | 'fa', tx)
    await restoreDraftFor(otherLocale, tx) // single-source config: mirror to the other locale's draft
    return restored
  })

  await audit(user.email, 'HOMEPAGE_RESTORE', 'HomepageVersion', version.id, `Restored ${version.status.toLowerCase()} homepage version (${version.locale}) into both drafts en+fa (${sectionData.length} sections each)`)

  return json({
    draft: {
      id: draft.id,
      changeSummary: draft.changeSummary,
      sectionCount: sectionData.length,
    },
    restoredFrom: { id: version.id, status: version.status, publishedAt: version.publishedAt?.toISOString() ?? null },
  })
}
