// POST /api/admin/reports/digest — queue a sales digest now (R10 weekly,
// R11 monthly window). The per-window guard is bypassed with ?force=1 so the
// owner can send an extra report any time; without it a digest of the SAME
// window younger than its period is a no-op (skipped:'recent') — identical
// semantics to the automatic healthz housekeeping queueing.
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'
import { queueSalesDigestEmail, digestWindowStatus, DIGEST_WINDOWS, type DigestWindowDays } from '@/lib/server/report-mail'

/** GET — digest status for the reports panel (per-window last queued/sent +
 *  shared queuedUnsent). Legacy top-level fields mirror the weekly window so
 *  older clients keep working. */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const [weekly, monthly] = await Promise.all([
    digestWindowStatus(7),
    digestWindowStatus(30),
  ])
  return json({ weekly, monthly, ...weekly })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'
  const daysParam = Number(searchParams.get('days') ?? '7')
  const days: DigestWindowDays = (DIGEST_WINDOWS as readonly number[]).includes(daysParam) ? (daysParam as DigestWindowDays) : 7

  try {
    const result = await queueSalesDigestEmail({ headers: req.headers }, { force, days })
    return json(result)
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : 'DIGEST_FAILED')
  }
}
