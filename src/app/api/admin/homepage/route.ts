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

  // ── Single-source config (user-reported bug: «تغییر ترتیب در فارسی روی انگلیسی اثر ندارد») ──
  // Every section setting is bilingual (headingEn/headingFa, titleEn/titleFa, …),
  // so per-locale versions are pure duplication and WILL drift. Whatever the
  // editor saves is therefore mirrored to BOTH locales atomically; the admin
  // UI locale toggle only switches the interface language, never the data.
  const mirrorLocales: Array<'en' | 'fa'> = locale === 'en' ? ['en', 'fa'] : ['fa', 'en']
  const now = new Date()

  const { requestedDraftId, published } = await db.$transaction(async (tx) => {
    let requestedDraftId: string | null = null
    let published: { id: string; publishedAt: string; changeSummary: string | null } | null = null

    for (const loc of mirrorLocales) {
      const existingDraft = await tx.homepageVersion.findFirst({ where: { locale: loc, status: 'DRAFT' }, orderBy: { createdAt: 'desc' } })
      const draftVersion = existingDraft
        ? await tx.homepageVersion.update({
            where: { id: existingDraft.id },
            data: { changeSummary: changeSummary ?? existingDraft.changeSummary, sections: { deleteMany: {}, create: sectionData } },
          })
        : await tx.homepageVersion.create({
            data: { locale: loc, status: 'DRAFT', changeSummary: changeSummary ?? null, sections: { create: sectionData } },
          })
      if (loc === locale) requestedDraftId = draftVersion.id

      if (action === 'publish') {
        // Archive the previous published version, then create a fresh PUBLISHED one.
        await tx.homepageVersion.updateMany({
          where: { locale: loc, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        })
        const newPublished = await tx.homepageVersion.create({
          data: {
            locale: loc,
            status: 'PUBLISHED',
            publishedAt: now,
            publishedBy: user.email,
            changeSummary: changeSummary ?? null,
            sections: { create: sectionData },
          },
        })
        if (loc === locale) {
          published = { id: newPublished.id, publishedAt: now.toISOString(), changeSummary: newPublished.changeSummary }
        }
        // Retention cap: every publish leaves an ARCHIVED version row — keep the
        // newest 20 per locale and hard-delete older ones (sections cascade).
        const kept = await tx.homepageVersion.findMany({
          where: { locale: loc, status: 'ARCHIVED' },
          orderBy: { publishedAt: 'desc' },
          take: 20,
          select: { id: true },
        })
        if (kept.length === 20) {
          await tx.homepageVersion.deleteMany({
            where: { locale: loc, status: 'ARCHIVED', id: { notIn: kept.map((v) => v.id) } },
          })
        }
      }
    }
    return { requestedDraftId, published }
  })

  if (action === 'publish') {
    await audit(user.email, 'HOMEPAGE_PUBLISH', 'HomepageVersion', published!.id, `Published homepage (en+fa mirrored) with ${sections.length} sections`)
  }

  const draftDto = {
    id: requestedDraftId,
    changeSummary: changeSummary ?? null,
    sections: sectionData.map((s, i) => ({ ...s, id: `s-${requestedDraftId}-${i}`, settings: sections[i].settings })),
  }

  return json({ draft: draftDto, published })
}
