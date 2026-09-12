// GET  /api/admin/announcements — all announcement-bar messages (incl. disabled),
//                                ordered sortOrder asc then createdAt asc.
// POST /api/admin/announcements — create a message (audited).
//
// NOTE — raw SQL on purpose: the long-running dev server process was booted
// BEFORE the Announcement model was generated into its Prisma client, so
// `db.announcement` is undefined in that process while $queryRaw/$executeRaw
// always exist. They hit the same table with model semantics (BOOLEAN → bool,
// INTEGER → number, epoch-ms DATETIME → Date on read). After the next dev-server
// restart these can be swapped 1:1 for db.announcement.* calls.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

interface AnnouncementRow {
  id: string
  enabled: boolean
  sortOrder: number
  textEn: string
  textFa: string
  href: string | null
  createdAt: Date
  updatedAt: Date
}

const ANN_COLS = '"id", "enabled", "sortOrder", "textEn", "textFa", "href", "createdAt", "updatedAt"'

/** SPA-internal target only: empty (→ null) or a path starting with '/'. */
const hrefSchema = z
  .string()
  .max(300)
  .transform((s) => s.trim())
  .refine((s) => s === '' || s.startsWith('/'), { message: 'href must be a site-internal path starting with "/"' })

function textSchema(label: string) {
  return z
    .string()
    .min(1, `${label} is required`)
    .max(300)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: `${label} is required` })
}

const createSchema = z.object({
  textEn: textSchema('textEn'),
  textFa: textSchema('textFa'),
  href: hrefSchema.nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
})

async function fetchOne(id: string): Promise<AnnouncementRow | null> {
  const rows = await db.$queryRawUnsafe<AnnouncementRow[]>(
    `SELECT ${ANN_COLS} FROM "Announcement" WHERE "id" = ?`,
    id,
  )
  return (rows as AnnouncementRow[])[0] ?? null
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const rows = await db.$queryRawUnsafe<AnnouncementRow[]>(
    `SELECT ${ANN_COLS} FROM "Announcement" ORDER BY "sortOrder" ASC, "createdAt" ASC`,
  )
  return json({ announcements: rows })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  // Default position: after every existing message.
  let sortOrder = d.sortOrder
  if (sortOrder === undefined) {
    const maxRows = (await db.$queryRawUnsafe<{ m: number | bigint | null }[]>(
      'SELECT MAX("sortOrder") AS m FROM "Announcement"',
    )) as { m: number | bigint | null }[]
    const max = maxRows[0]?.m
    sortOrder = (max === null || max === undefined ? -1 : Number(max)) + 1
  }

  const id = randomUUID()
  const now = Date.now() // DATETIME columns are epoch-ms integers in SQLite
  await db.$executeRawUnsafe(
    'INSERT INTO "Announcement" ("id","enabled","sortOrder","textEn","textFa","href","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)',
    id,
    d.enabled ? 1 : 0,
    sortOrder,
    d.textEn,
    d.textFa,
    d.href ? d.href : null,
    now,
    now,
  )
  const created = await fetchOne(id)

  await audit(user.email, 'ANNOUNCEMENT_CREATE', 'Announcement', id, `Created announcement "${d.textEn}"${d.href ? ` → ${d.href}` : ''}${d.enabled ? '' : ' (disabled)'}`)
  return json({ announcement: created }, 201)
}
