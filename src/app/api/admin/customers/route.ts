// GET /api/admin/customers?q=&sort=&dir=&page=&pageSize= — customer list with order stats (no password hashes).
// Task 27-d: server-side sort + pagination. `items` remains the array → back-compat with the legacy list UI.
// API-405 (audit v4): pageSize now goes through the shared parseListQuery
// (default 50, HARD CAP 100 — was 200). The User findMany itself stays a full
// scan BY DESIGN: the orderCount/totalSpent/lastOrderAt aggregates are computed
// per customer and sorted in JS (SQLite conditional sums), so the response page
// cannot be cut at SQL level without breaking those sorts — but the per-row
// payload was bounded by replacing the per-customer `orders` include with two
// compact `order.groupBy` aggregates, so the scan no longer materializes every
// order row of every customer. (SQL-side pagination of aggregates = deferred
// DB-416-style work.)
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, parseListQuery } from '@/lib/server/utils'

const SORT_KEYS = ['createdAt', 'orderCount', 'totalSpent', 'lastOrderAt', 'email'] as const
type SortKey = (typeof SORT_KEYS)[number]

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
  const sortRaw = searchParams.get('sort') ?? 'createdAt'
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as SortKey) : 'createdAt'
  const dir: 'asc' | 'desc' = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const { page, pageSize } = parseListQuery(searchParams)

  const where = {
    role: 'CUSTOMER' as const,
    ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] } : {}),
  }

  // API-405: aggregates in two groupBys instead of an orders include — the
  // customer rows no longer carry their whole order history.
  const [customers, allOrderAgg, paidOrderAgg] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        preferredLocale: true,
        marketingConsent: true,
        createdAt: true,
      },
    }),
    // All orders per customer: count (orderCount) + newest createdAt (lastOrderAt).
    db.order.groupBy({ by: ['userId'], _count: { _all: true }, _max: { createdAt: true } }),
    // Paid orders per customer: sum of totals (totalSpentMinor) — exactly the
    // SUCCEEDED / PARTIALLY_REFUNDED set the old JS filter accepted.
    db.order.groupBy({
      by: ['userId'],
      where: { paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
      _sum: { totalMinor: true },
    }),
  ])
  const countByUser = new Map(allOrderAgg.map((g) => [g.userId, g]))
  const paidByUser = new Map(paidOrderAgg.map((g) => [g.userId, g]))

  // Aggregates are computed in JS exactly as before (SQLite has no conditional sums).
  const rows = customers.map((c) => {
    const all = countByUser.get(c.id)
    const paid = paidByUser.get(c.id)
    const lastOrderAt = all?._max.createdAt ? all._max.createdAt.toISOString() : null
    return {
      id: c.id,
      email: c.email,
      name: c.name,
      status: c.status,
      preferredLocale: c.preferredLocale,
      marketingConsent: c.marketingConsent,
      orderCount: all?._count._all ?? 0,
      totalSpentMinor: paid?._sum.totalMinor ?? 0,
      lastOrderAt,
      createdAt: c.createdAt.toISOString(),
    }
  })

  // In-JS sort over the computed aggregates.
  // lastOrderAt data-integrity rule (Task 27-d): customers with NO orders must sort LAST in BOTH
  // directions. For `desc` we model a missing lastOrderAt as epoch 0 (the smallest value → ends up
  // last after the descending flip, exactly as specified). For `asc`, epoch 0 would wrongly surface
  // "never ordered" customers at the top, so there the null is modelled as +∞ instead — nulls stay
  // last regardless of direction.
  const sign = dir === 'desc' ? -1 : 1
  const nullSentinel = dir === 'desc' ? 0 : Number.MAX_SAFE_INTEGER
  rows.sort((a, b) => {
    let d = 0
    switch (sort) {
      case 'email':
        d = a.email.localeCompare(b.email)
        break
      case 'orderCount':
        d = a.orderCount - b.orderCount
        break
      case 'totalSpent':
        d = a.totalSpentMinor - b.totalSpentMinor
        break
      case 'lastOrderAt': {
        const av = a.lastOrderAt ? Date.parse(a.lastOrderAt) : nullSentinel
        const bv = b.lastOrderAt ? Date.parse(b.lastOrderAt) : nullSentinel
        d = av - bv
        break
      }
      default: // createdAt (ISO strings compare lexicographically)
        d = a.createdAt.localeCompare(b.createdAt)
    }
    if (d !== 0) return d * sign
    return a.id.localeCompare(b.id) // deterministic tie-break → pagination never duplicates/skips rows
  })

  const total = rows.length
  const items = rows.slice((page - 1) * pageSize, page * pageSize)

  return json({ items, total, page, pageSize })
}
