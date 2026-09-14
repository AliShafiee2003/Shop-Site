// GET /api/admin/audit-log?limit= — newest audit entries.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, parseIntParam } from '@/lib/server/utils'

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const limit = parseIntParam(searchParams.get('limit'), 50, 1, 200) ?? 50

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return json({
    items: entries.map((e) => ({
      id: e.id,
      actorEmail: e.actorEmail,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}
