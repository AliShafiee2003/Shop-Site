// Shared homepage-sections loader — used by GET /api/homepage AND the RSC page (C3 SSR).
import { db } from '@/lib/db'
import { normalizeLocale, parseJsonSafe } from '@/lib/server/utils'

export async function getHomeSections(rawLocale: string | null) {
  const locale = normalizeLocale(rawLocale)

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
