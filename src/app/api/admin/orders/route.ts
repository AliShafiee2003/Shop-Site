// GET /api/admin/orders?status=&q=&page= — paginated admin order list.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, parsePage } from '@/lib/server/utils'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')?.trim() || null
  const q = searchParams.get('q')?.trim() || null
  const page = parsePage(searchParams, 1)

  // Search (Task 49-10): order number — WITH or WITHOUT dashes — plus email and
  // phone (phone lives inside the serialized shipping address snapshot).
  // «SP2612130011», «sp2612130011», «26-12-13-0011», «SP-26-12-13-0011» → same order.
  const or: object[] = []
  if (q) {
    or.push(
      { orderNumber: { contains: q } },
      { email: { contains: q.toLowerCase() } },
      { shippingAddressJson: { contains: q } },
    )
    const norm = q.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (norm !== q) or.push({ orderNumber: { contains: norm } })
    // Re-dash a compact/partial code back into the stored shape: 2612130011 → SP-26-12-13-0011
    const m = norm.match(/^(?:SP)?(\d{2})(\d{2})(\d{2})(\d{1,4})?$/)
    if (m) or.push({ orderNumber: { contains: `SP-${m[1]}-${m[2]}-${m[3]}${m[4] ? `-${m[4]}` : ''}` } })
    // Legacy era (SP-2026-00014): compact SP202600014 → SP-2026-00014
    const legacy = norm.match(/^(?:SP)(\d{4})(\d{4,6})$/)
    if (legacy) or.push({ orderNumber: { contains: `SP-${legacy[1]}-${legacy[2]}` } })
  }

  const where = {
    ...(status ? { status } : {}),
    ...(q ? { OR: or } : {}),
  }

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { items: true } } },
    }),
  ])

  return json({
    items: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      email: o.email,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      totalMinor: o.totalMinor,
      currency: o.currency,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  })
}
