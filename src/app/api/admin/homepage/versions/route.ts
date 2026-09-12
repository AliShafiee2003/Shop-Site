// GET /api/admin/homepage/versions?locale= — version history for the homepage
// editor (R9). Lists the current PUBLISHED version (pinned) plus every ARCHIVED
// restore point (newest first; the retention cap keeps the newest 20), with a
// light payload: counts + section-type summary, never the full settings blob.
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, json, normalizeLocale, parseJsonSafe } from '@/lib/server/utils'

type SectionTypeSummary = { type: string; count: number; enabled: number }

function summarize(sections: { type: string; enabled: boolean; settingsJson: string }[]) {
  const byType = new Map<string, SectionTypeSummary>()
  for (const s of sections) {
    const cur = byType.get(s.type) ?? { type: s.type, count: 0, enabled: 0 }
    cur.count += 1
    if (s.enabled) cur.enabled += 1
    byType.set(s.type, cur)
  }
  return Array.from(byType.values())
}

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const versions = await db.homepageVersion.findMany({
    where: { locale, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    // PUBLISHED pins first (desc puts PUBLISHED above ARCHIVED), newest publish first within each.
    orderBy: [{ status: 'desc' }, { publishedAt: 'desc' }],
    take: 21,
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  })

  const items = versions.map((v) => ({
    id: v.id,
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    publishedBy: v.publishedBy,
    changeSummary: v.changeSummary,
    createdAt: v.createdAt.toISOString(),
    sectionCount: v.sections.length,
    enabledCount: v.sections.filter((s) => s.enabled).length,
    types: summarize(v.sections),
    // Light preview strip: first sections with their heading-ish setting.
    preview: v.sections.slice(0, 6).map((s) => {
      const settings = parseJsonSafe<Record<string, unknown>>(s.settingsJson, {})
      const heading =
        (typeof settings.headingEn === 'string' && settings.headingEn) ||
        (typeof settings.titleEn === 'string' && settings.titleEn) ||
        (typeof settings.headingFa === 'string' && settings.headingFa) ||
        (typeof settings.titleFa === 'string' && settings.titleFa) ||
        ''
      return { type: s.type, enabled: s.enabled, heading: heading || null }
    }),
  }))

  return json({ items })
}
