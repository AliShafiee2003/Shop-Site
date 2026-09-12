// POST /api/admin/homepage/versions/[id]/restore — copy an ARCHIVED (or the
// current PUBLISHED) version's sections into the DRAFT (R9). Deliberately does
// NOT publish: the admin reviews the restored draft in the editor and presses
// Publish through the normal audited flow. Restoring replaces ALL draft
// sections (same replace-all contract as the editor's PUT draft path).
import { db } from '@/lib/db'
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

  // Upsert the DRAFT version (replace all sections) — mirrors the editor's
  // own draft path so the editor state and the DB stay in the same shape.
  const existingDraft = await db.homepageVersion.findFirst({
    where: { locale: version.locale, status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
  })
  const summary = `Restored from ${version.status === 'PUBLISHED' ? 'current' : ''} version published ${version.publishedAt?.toISOString().slice(0, 10) ?? version.createdAt.toISOString().slice(0, 10)}`.replace('  ', ' ')

  const draft = existingDraft
    ? await db.homepageVersion.update({
        where: { id: existingDraft.id },
        data: { changeSummary: summary, sections: { deleteMany: {}, create: sectionData } },
      })
    : await db.homepageVersion.create({
        data: { locale: version.locale, status: 'DRAFT', changeSummary: summary, sections: { create: sectionData } },
      })

  await audit(user.email, 'HOMEPAGE_RESTORE', 'HomepageVersion', version.id, `Restored ${version.status.toLowerCase()} homepage version (${version.locale}) into the draft (${sectionData.length} sections)`)

  return json({
    draft: {
      id: draft.id,
      changeSummary: draft.changeSummary,
      sectionCount: sectionData.length,
    },
    restoredFrom: { id: version.id, status: version.status, publishedAt: version.publishedAt?.toISOString() ?? null },
  })
}
