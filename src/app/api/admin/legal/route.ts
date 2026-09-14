// GET /api/admin/legal?type=&locale= — list legal documents (optionally filtered) + per-type current summary.
// PUT /api/admin/legal — publish a NEW version of a legal document; previous versions stay in DB (audit trail).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const LEGAL_TYPES = ['PRIVACY', 'TERMS', 'WITHDRAWAL', 'IMPRINT', 'ACCESSIBILITY', 'COOKIES'] as const

const putSchema = z.object({
  type: z.enum(LEGAL_TYPES),
  locale: z.enum(['en', 'fa']),
  title: z.string().min(2).max(200),
  body: z.string().min(10).max(100_000),
  changeNote: z.string().max(300).optional(),
})

type LegalRow = {
  id: string
  type: string
  locale: string
  version: string
  title: string
  body: string
  effectiveAt: Date
  isCurrent: boolean
  updatedBy: string | null
  createdAt: Date
}

function serialize(d: LegalRow) {
  return {
    id: d.id,
    type: d.type,
    locale: d.locale,
    version: d.version,
    title: d.title,
    body: d.body,
    effectiveAt: d.effectiveAt.toISOString(),
    isCurrent: d.isCurrent,
    updatedBy: d.updatedBy,
    createdAt: d.createdAt.toISOString(),
  }
}

/** Current (isCurrent) doc summary for a type/locale pair, or null when never authored. */
function currentOf(rows: LegalRow[], type: string, locale: 'en' | 'fa') {
  const d = rows.find((r) => r.type === type && r.locale === locale && r.isCurrent)
  return d ? { version: d.version, title: d.title, effectiveAt: d.effectiveAt.toISOString() } : null
}

/** Next version: bump the trailing number ("1.2"→"1.3"); otherwise date-based "YYYY.MM.n" (n = first free). */
function bumpVersion(prev: string | null, taken: Set<string>): string {
  if (prev) {
    const m = /(\d+)$/.exec(prev.trim())
    if (m && Number.isSafeInteger(Number(m[1]))) {
      const candidate = prev.trim().slice(0, m.index) + String(Number(m[1]) + 1)
      if (!taken.has(candidate)) return candidate
    }
  }
  const now = new Date()
  const base = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  let n = 1
  while (taken.has(`${base}.${n}`)) n += 1
  return `${base}.${n}`
}

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const typeParam = (searchParams.get('type') ?? '').toUpperCase()
  const localeParam = (searchParams.get('locale') ?? '').toLowerCase()
  const filterType = (LEGAL_TYPES as readonly string[]).includes(typeParam) ? typeParam : null
  const filterLocale = localeParam === 'en' || localeParam === 'fa' ? localeParam : null

  // Legal corpora are small — fetch all, filter in memory, so the summary is always complete.
  const rows = await db.legalDocument.findMany({
    orderBy: [{ type: 'asc' }, { locale: 'asc' }, { effectiveAt: 'desc' }],
  })
  const docs = rows.filter(
    (r) => (!filterType || r.type === filterType) && (!filterLocale || r.locale === filterLocale),
  )

  const types = LEGAL_TYPES.map((type) => ({
    type,
    en: currentOf(rows, type, 'en'),
    fa: currentOf(rows, type, 'fa'),
  }))

  return json({ docs: docs.map(serialize), types })
}

export async function PUT(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = putSchema.safeParse(raw)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  const { doc, prevVersion } = await db.$transaction(async (tx) => {
    const history = await tx.legalDocument.findMany({
      where: { type: d.type, locale: d.locale },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, version: true },
    })
    const prev = history[0]?.version ?? null
    const nextVersion = bumpVersion(prev, new Set(history.map((h) => h.version)))

    // Archive the current rows, then publish the new version.
    await tx.legalDocument.updateMany({
      where: { type: d.type, locale: d.locale, isCurrent: true },
      data: { isCurrent: false },
    })
    const created = await tx.legalDocument.create({
      data: {
        type: d.type,
        locale: d.locale,
        version: nextVersion,
        title: d.title,
        body: d.body,
        isCurrent: true,
        updatedBy: user.email,
      },
    })
    return { doc: created, prevVersion: prev }
  })

  await audit(
    user.email,
    'LEGAL_UPDATE',
    'LegalDocument',
    doc.id,
    `${d.type}/${d.locale} v${prevVersion ?? '—'}→v${doc.version}${d.changeNote ? ` — ${d.changeNote}` : ''}`,
  )

  return json({ doc: serialize(doc) }, 201)
}
