// GET /api/account/orders?page= — paginated order history (10 per page).
// Each row carries the per-item covers + titles the Orders list needs for the
// fanned-cover stack and the title summary line.
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, parsePage } from '@/lib/server/utils'

const PAGE_SIZE = 10

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const { searchParams } = new URL(req.url)
  const page = parsePage(searchParams, 1)

  const [total, orders] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        items: { orderBy: { id: 'asc' }, select: { coverUrl: true, titleEn: true, titleFa: true, quantity: true } },
        _count: { select: { items: true } },
      },
    }),
  ])

  return json({
    items: orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalMinor: o.totalMinor,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
      firstCoverUrl: o.items[0]?.coverUrl ?? null,
      covers: o.items.slice(0, 4).map((i) => i.coverUrl).filter((c): c is string => Boolean(c)),
      titles: o.items.map((i) => ({ titleEn: i.titleEn, titleFa: i.titleFa, quantity: i.quantity })),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  })
}
