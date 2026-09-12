// PATCH  /api/admin/announcements/[id] — edit a message (audited on real changes).
// DELETE /api/admin/announcements/[id] — remove a message (audited).
//
// NOTE — raw SQL on purpose: the long-running dev server process was booted
// BEFORE the Announcement model was generated into its Prisma client, so
// `db.announcement` is undefined in that process while $queryRaw/$executeRaw
// always exist. They hit the same table with model semantics (BOOLEAN → bool,
// INTEGER → number, epoch-ms DATETIME → Date on read). After the next dev-server
// restart these can be swapped 1:1 for db.announcement.* calls.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
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

const patchSchema = z.object({
  textEn: z
    .string()
    .min(1, 'textEn is required')
    .max(300)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'textEn is required' })
    .optional(),
  textFa: z
    .string()
    .min(1, 'textFa is required')
    .max(300)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'textFa is required' })
    .optional(),
  href: hrefSchema.nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
})

async function fetchOne(id: string): Promise<AnnouncementRow | null> {
  const rows = await db.$queryRawUnsafe<AnnouncementRow[]>(
    `SELECT ${ANN_COLS} FROM "Announcement" WHERE "id" = ?`,
    id,
  )
  return (rows as AnnouncementRow[])[0] ?? null
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const row = await fetchOne(id)
  if (!row) return apiError(404, 'NOT_FOUND', 'Announcement not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  // '' clears the link; null also clears it (matches the editor's "no link" state).
  const href = d.href === undefined ? undefined : d.href === '' ? null : d.href

  const sets: string[] = []
  const vals: (string | number | null)[] = []
  if (d.textEn !== undefined) { sets.push('"textEn" = ?'); vals.push(d.textEn) }
  if (d.textFa !== undefined) { sets.push('"textFa" = ?'); vals.push(d.textFa) }
  if (href !== undefined) { sets.push('"href" = ?'); vals.push(href) }
  if (d.enabled !== undefined) { sets.push('"enabled" = ?'); vals.push(d.enabled ? 1 : 0) }
  if (d.sortOrder !== undefined) { sets.push('"sortOrder" = ?'); vals.push(d.sortOrder) }
  sets.push('"updatedAt" = ?')
  vals.push(Date.now()) // DATETIME columns are epoch-ms integers in SQLite
  vals.push(id)

  await db.$executeRawUnsafe(
    `UPDATE "Announcement" SET ${sets.join(', ')} WHERE "id" = ?`,
    ...vals,
  )
  const updated = await fetchOne(id)

  // Audit only real changes (mirrors the discounts PATCH style).
  const changes: string[] = []
  if (d.textEn !== undefined && d.textEn !== row.textEn) changes.push(`textEn "${row.textEn}" → "${d.textEn}"`)
  if (d.textFa !== undefined && d.textFa !== row.textFa) changes.push(`textFa "${row.textFa}" → "${d.textFa}"`)
  if (href !== undefined && href !== row.href) changes.push(`href ${row.href ?? '∅'} → ${href ?? '∅'}`)
  if (d.enabled !== undefined && d.enabled !== row.enabled) changes.push(`enabled ${row.enabled} → ${d.enabled}`)
  if (d.sortOrder !== undefined && d.sortOrder !== row.sortOrder) changes.push(`sortOrder ${row.sortOrder} → ${d.sortOrder}`)
  if (changes.length > 0) {
    await audit(user.email, 'ANNOUNCEMENT_UPDATE', 'Announcement', id, `Announcement "${row.textEn}": ${changes.join(', ')}`)
  }
  return json({ announcement: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const row = await fetchOne(id)
  if (!row) return apiError(404, 'NOT_FOUND', 'Announcement not found')

  await db.$executeRawUnsafe('DELETE FROM "Announcement" WHERE "id" = ?', id)
  await audit(user.email, 'ANNOUNCEMENT_DELETE', 'Announcement', id, `Deleted announcement "${row.textEn}"`)
  return json({ ok: true })
}
