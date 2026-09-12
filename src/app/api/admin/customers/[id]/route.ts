// GET/PATCH /api/admin/customers/[id] — customer detail for the admin table dialog (Task 27-d).
// GET   → profile + addresses + latest 10 orders + aggregate stats (404 unless the user exists).
// PATCH → internal admin note ONLY ({ adminNote?: string|null }) — role/status changes are out of scope.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

/** Totals count only paid money, mirroring the list route's aggregate. */
function isPaid(paymentStatus: string): boolean {
  return paymentStatus === 'SUCCEEDED' || paymentStatus === 'PARTIALLY_REFUNDED'
}

const patchSchema = z.object({
  adminNote: z.string().max(2000).nullable().optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  const u = await db.user.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isDefaultShipping: 'desc' }, { createdAt: 'desc' }] },
      orders: {
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, totalMinor: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })
  if (!u) return apiError(404, 'NOT_FOUND')

  // Stats span ALL of the customer's orders (the `include` above is capped at the latest 10).
  const [allOrders, reviewsCount, openTicketsCount, wishlistCount] = await Promise.all([
    db.order.findMany({ where: { userId: id }, select: { totalMinor: true, paymentStatus: true, createdAt: true } }),
    db.review.count({ where: { userId: id } }),
    db.ticket.count({ where: { userId: id, status: { not: 'CLOSED' } } }),
    db.wishlistItem.count({ where: { userId: id } }),
  ])

  const lastOrderAt = allOrders.reduce<string | null>((latest, o) => {
    const iso = o.createdAt.toISOString()
    return !latest || iso > latest ? iso : latest
  }, null)

  return json({
    customer: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      preferredLocale: u.preferredLocale,
      marketingConsent: u.marketingConsent,
      adminNote: u.adminNote,
      createdAt: u.createdAt.toISOString(),
      addresses: u.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        recipient: a.recipient,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        countryCode: a.countryCode,
        phone: a.phone,
        isDefaultShipping: a.isDefaultShipping,
        isDefaultBilling: a.isDefaultBilling,
        createdAt: a.createdAt.toISOString(),
      })),
      orders: u.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalMinor: o.totalMinor,
        createdAt: o.createdAt.toISOString(),
      })),
      stats: {
        orderCount: allOrders.length,
        totalSpentMinor: allOrders.filter((o) => isPaid(o.paymentStatus)).reduce((s, o) => s + o.totalMinor, 0),
        lastOrderAt,
        reviewsCount,
        openTicketsCount,
        wishlistCount,
      },
    },
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  if (parsed.data.adminNote === undefined) {
    return apiError(400, 'VALIDATION_ERROR', 'Nothing to update: only adminNote is supported')
  }

  const existing = await db.user.findUnique({ where: { id }, select: { id: true, email: true } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  // Empty/whitespace notes are stored as null (cleared) rather than empty strings.
  const note = parsed.data.adminNote === null ? null : parsed.data.adminNote.trim() === '' ? null : parsed.data.adminNote.trim()

  const updated = await db.user.update({
    where: { id },
    data: { adminNote: note },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      preferredLocale: true, marketingConsent: true, adminNote: true, createdAt: true,
    },
  })

  await audit(user.email, 'CUSTOMER_NOTE', 'User', id, `Internal note ${note === null ? 'cleared' : 'updated'} for ${existing.email}`)
  return json({ customer: { ...updated, createdAt: updated.createdAt.toISOString() } })
}
