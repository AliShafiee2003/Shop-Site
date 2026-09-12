// Shared homepage-sections loader — used by GET /api/homepage AND by the
// server-rendered entry (src/app/page.tsx) so the home page paints with full
// content (no skeleton flash on first load).
import { db } from '@/lib/db'
import { parseJsonSafe } from '@/lib/server/utils'
import type { Locale } from '@/lib/types'

export async function getPublishedHomeSections(locale: Locale) {
  let version = await db.homepageVersion.findFirst({
    where: { status: 'PUBLISHED', locale },
    orderBy: { publishedAt: 'desc' },
  })
  // Fallback: English published version if the requested locale has none.
  if (!version && locale !== 'en') {
    version = await db.homepageVersion.findFirst({
      where: { status: 'PUBLISHED', locale: 'en' },
      orderBy: { publishedAt: 'desc' },
    })
  }
  if (!version) return []

  const sections = await db.homepageSection.findMany({
    where: { versionId: version.id },
    orderBy: { sortOrder: 'asc' },
  })

  return sections.map((s) => ({
    id: s.id,
    type: s.type,
    sortOrder: s.sortOrder,
    enabled: s.enabled,
    settings: parseJsonSafe<Record<string, unknown>>(s.settingsJson, {}),
  }))
}

export type HomeSectionsDTO = Awaited<ReturnType<typeof getPublishedHomeSections>>
