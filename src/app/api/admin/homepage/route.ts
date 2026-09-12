// GET/PUT /api/admin/homepage?locale= — draft/published versions + upsert/publish flow (audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, normalizeLocale, parseJsonSafe, zodMessage } from '@/lib/server/utils'

type SectionDTO = { id: string; type: string; sortOrder: number; enabled: boolean; settings: Record<string, unknown> }

async function loadVersion(locale: string, status: string) {
  const version = await db.homepageVersion.findFirst({
    where: { locale, status },
    orderBy: { createdAt: 'desc' },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!version) return null
  const sections: SectionDTO[] = version.sections.map((s) => ({
    id: s.id,
    type: s.type,
    sortOrder: s.sortOrder,
    enabled: s.enabled,
    settings: parseJsonSafe<Record<string, unknown>>(s.settingsJson, {}),
  }))
  return { id: version.id, changeSummary: version.changeSummary, publishedAt: version.publishedAt?.toISOString() ?? null, sections }
}

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const [draft, published] = await Promise.all([
    loadVersion(locale, 'DRAFT'),
    loadVersion(locale, 'PUBLISHED'),
  ])

  return json({ draft, published })
}

const putSchema = z.object({
  locale: z.string(),
  sections: z
    .array(
      z.object({
        // SERIES (round 4) is admin-placeable — the palette offers it, so the
        // validator must accept it too (click-test found this enum missing it,
        // which made every publish containing a SERIES row a VALIDATION_ERROR).
        type: z.enum(['HERO', 'PRODUCT_SHELF', 'POSTER_GRID', 'EDITORIAL_FEATURE', 'CATEGORY_CAROUSEL', 'FOR_YOU', 'RECENTLY_VIEWED', 'ARTICLES', 'SCROLL_STORY', 'SERIES']),
        sortOrder: z.number().int().min(0),
        enabled: z.boolean().default(true),
        settings: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
  changeSummary: z.string().optional().nullable(),
  action: z.enum(['draft', 'publish']),
})

export async function PUT(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { locale: rawLocale, sections, changeSummary, action } = parsed.data
  const locale = normalizeLocale(rawLocale)

  const sectionData = sections.map((s) => ({
    type: s.type,
    sortOrder: s.sortOrder,
    enabled: s.enabled,
    settingsJson: JSON.stringify(s.settings),
  }))

  // ── Upsert the DRAFT version (replace all sections) ──
  const existingDraft = await db.homepageVersion.findFirst({ where: { locale, status: 'DRAFT' }, orderBy: { createdAt: 'desc' } })
  const draftVersion = existingDraft
    ? await db.homepageVersion.update({
        where: { id: existingDraft.id },
        data: { changeSummary: changeSummary ?? existingDraft.changeSummary, sections: { deleteMany: {}, create: sectionData } },
      })
    : await db.homepageVersion.create({
        data: { locale, status: 'DRAFT', changeSummary: changeSummary ?? null, sections: { create: sectionData } },
      })

  let published: { id: string; publishedAt: string; changeSummary: string | null } | null = null

  if (action === 'publish') {
    // Archive the previous published version, then create a fresh PUBLISHED one.
    await db.homepageVersion.updateMany({
      where: { locale, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    })
    const now = new Date()
    const newPublished = await db.homepageVersion.create({
      data: {
        locale,
        status: 'PUBLISHED',
        publishedAt: now,
        publishedBy: user.email,
        changeSummary: changeSummary ?? null,
        sections: { create: sectionData },
      },
    })
    published = { id: newPublished.id, publishedAt: now.toISOString(), changeSummary: newPublished.changeSummary }
    await audit(user.email, 'HOMEPAGE_PUBLISH', 'HomepageVersion', newPublished.id, `Published homepage (${locale}) with ${sections.length} sections`)
    // Retention cap: every publish leaves an ARCHIVED version row — keep the
    // newest 20 per locale and hard-delete older ones (sections cascade).
    const kept = await db.homepageVersion.findMany({
      where: { locale, status: 'ARCHIVED' },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: { id: true },
    })
    if (kept.length === 20) {
      await db.homepageVersion.deleteMany({
        where: { locale, status: 'ARCHIVED', id: { notIn: kept.map((v) => v.id) } },
      })
    }
  }

  const draftDto = {
    id: draftVersion.id,
    changeSummary: draftVersion.changeSummary,
    sections: sectionData.map((s, i) => ({ ...s, id: `s-${draftVersion.id}-${i}`, settings: sections[i].settings })),
  }

  return json({ draft: draftDto, published })
}
