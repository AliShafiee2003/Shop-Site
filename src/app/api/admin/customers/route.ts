// GET /api/admin/customers?q=&sort=&dir=&page=&pageSize= — customer list with order stats (no password hashes).
// Task 27-d: added server-side sort + pagination. `items` remains the array → back-compat with the legacy list UI.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, parseIntParam } from '@/lib/server/utils'

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
  const page = parseIntParam(searchParams.get('page'), 1, 1) ?? 1
  const pageSize = parseIntParam(searchParams.get('pageSize'), 50, 1, 200) ?? 50

  const customers = await db.user.findMany({
    where: {
      role: 'CUSTOMER',
      ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { orders: { select: { totalMinor: true, createdAt: true, paymentStatus: true } } },
  })

  // Aggregates are computed in JS exactly as before (SQLite has no conditional sums).
  const rows = customers.map((c) => {
    const paid = c.orders.filter((o) => o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED')
    const lastOrderAt = c.orders.reduce<string | null>((latest, o) => {
      const iso = o.createdAt.toISOString()
      return !latest || iso > latest ? iso : latest
    }, null)
    return {
      id: c.id,
      email: c.email,
      name: c.name,
      status: c.status,
      preferredLocale: c.preferredLocale,
      marketingConsent: c.marketingConsent,
      orderCount: c.orders.length,
      totalSpentMinor: paid.reduce((s, o) => s + o.totalMinor, 0),
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
