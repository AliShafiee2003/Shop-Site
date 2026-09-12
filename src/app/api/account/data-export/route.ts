// POST /api/account/data-export — GDPR-style JSON export of the requester's own data.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, parseJsonSafe } from '@/lib/server/utils'

export async function POST() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const [addresses, orders, tickets, consents, reviews] = await Promise.all([
    db.address.findMany({ where: { userId: user.id } }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { titleEn: true, sku: true, quantity: true, unitPriceMinor: true } } },
    }),
    db.ticket.findMany({
      where: { userId: user.id },
      include: { messages: { select: { body: true, createdAt: true, senderType: true } } },
    }),
    db.consentRecord.findMany({ where: { userId: user.id } }),
    db.review.findMany({ where: { userId: user.id } }),
  ])

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLocale: user.preferredLocale,
        marketingConsent: user.marketingConsent,
        createdAt: user.createdAt.toISOString(),
      },
      addresses: addresses.map((a) => ({
        label: a.label,
        recipient: a.recipient,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        countryCode: a.countryCode,
        phone: a.phone,
      })),
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalMinor: o.totalMinor,
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        shippingAddress: parseJsonSafe<Record<string, unknown> | null>(o.shippingAddressJson, null),
        items: o.items,
      })),
      tickets: tickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        messages: t.messages,
      })),
      consents: consents.map((c) => ({
        policyType: c.policyType,
        policyVersion: c.policyVersion,
        accepted: c.accepted,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
      })),
      reviews: reviews.map((r) => ({
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        moderationState: r.moderationState,
      })),
    },
    {
      headers: {
        'Content-Disposition': `attachment; filename="persepix-data-export-${user.id}.json"`,
      },
    },
  )
}
