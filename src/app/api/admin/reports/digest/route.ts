// POST /api/admin/reports/digest — queue the weekly sales digest now
// (round-9 backlog item b). The weekly guard is bypassed with ?force=1 so the
// owner can send an extra report any time; without it a digest younger than
// 7 days is a no-op (skipped:'recent') — identical semantics to the automatic
// healthz housekeeping queueing.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'
import { queueSalesDigestEmail } from '@/lib/server/report-mail'

/** GET — digest status for the reports panel (last queued/sent + recipient). */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const [last, queuedCount] = await Promise.all([
    db.mailMessage.findFirst({
      where: { kind: 'SALES_DIGEST' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, sentAt: true, to: true },
    }),
    db.mailMessage.count({ where: { kind: 'SALES_DIGEST', sentAt: null } }),
  ])
  return json({
    lastDigestAt: last?.createdAt.toISOString() ?? null,
    lastDigestSent: last?.sentAt?.toISOString() ?? null,
    lastTo: last?.to ?? null,
    queuedUnsent: queuedCount,
  })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  try {
    const result = await queueSalesDigestEmail({ headers: req.headers }, { force })
    return json(result)
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : 'DIGEST_FAILED')
  }
}
