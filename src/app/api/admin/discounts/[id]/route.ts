// GET    /api/admin/discounts/[id] — one code + the orders that used it (?format=csv for CSV attachment).
// PATCH  /api/admin/discounts/[id] — toggle active / edit fields (audited).
// DELETE /api/admin/discounts/[id] — remove a code (audited; keeps order snapshots intact).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { isEmptyScope, normalizeScope, normalizeCode, parseScope, serializeScope } from '@/lib/server/discounts'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const scopeSchema = z.object({
  productIds: z.array(z.string().max(64)).max(200).optional(),
  categoryIds: z.array(z.string().max(64)).max(100).optional(),
  publisherNames: z.array(z.string().max(120)).max(50).optional(),
  personIds: z.array(z.string().max(64)).max(200).optional(),
})

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  value: z.number().int().min(1).optional(),
  minSubtotalMinor: z.number().int().min(0).max(1_000_000).optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  noteEn: z.string().max(200).nullable().optional(),
  noteFa: z.string().max(200).nullable().optional(),
  scope: scopeSchema.optional(),
})

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)

  const dc = await db.discountCode.findUnique({ where: { id } })
  if (!dc) return apiError(404, 'NOT_FOUND', 'Discount code not found')

  const orders = await db.order.findMany({
    where: { discountCode: dc.code },
    orderBy: { createdAt: 'desc' },
    select: {
      orderNumber: true, email: true, status: true, paymentStatus: true,
      subtotalMinor: true, discountMinor: true, shippingMinor: true, totalMinor: true,
      createdAt: true,
    },
  })

  if (searchParams.get('format') === 'csv') {
    const lines: string[] = ['order_number,email,status,payment_status,subtotal_minor,discount_minor,shipping_minor,total_minor,created_at']
    for (const o of orders) {
      lines.push([o.orderNumber, o.email, o.status, o.paymentStatus, o.subtotalMinor, o.discountMinor, o.shippingMinor, o.totalMinor, o.createdAt.toISOString()].map(csvEscape).join(','))
    }
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="discount-${normalizeCode(dc.code).toLowerCase()}-usage.csv"`,
      },
    })
  }

  const paidOrders = orders.filter((o) => o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED')
  return json({
    discount: {
      id: dc.id, code: dc.code, type: dc.type, value: dc.value,
      minSubtotalMinor: dc.minSubtotalMinor, maxRedemptions: dc.maxRedemptions,
      timesUsed: dc.timesUsed, startsAt: dc.startsAt, endsAt: dc.endsAt,
      isActive: dc.isActive, noteEn: dc.noteEn, noteFa: dc.noteFa, createdAt: dc.createdAt,
    },
    orders,
    paidCount: paidOrders.length,
    givenAwayMinor: paidOrders.reduce((s, o) => s + o.discountMinor, 0),
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const dc = await db.discountCode.findUnique({ where: { id } })
  if (!dc) return apiError(404, 'NOT_FOUND', 'Discount code not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  const value = d.value ?? dc.value
  if (dc.type === 'PERCENT' && (value < 1 || value > 90)) {
    return apiError(400, 'VALIDATION_ERROR', 'PERCENT value must be 1–90')
  }

  const updated = await db.discountCode.update({
    where: { id },
    data: {
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      ...(d.value !== undefined ? { value } : {}),
      ...(d.minSubtotalMinor !== undefined ? { minSubtotalMinor: d.minSubtotalMinor } : {}),
      ...(d.maxRedemptions !== undefined ? { maxRedemptions: d.maxRedemptions } : {}),
      ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
      ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
      ...(d.noteEn !== undefined ? { noteEn: d.noteEn } : {}),
      ...(d.noteFa !== undefined ? { noteFa: d.noteFa } : {}),
      ...(d.scope !== undefined ? { scopeJson: serializeScope(normalizeScope(d.scope)) } : {}),
    },
  })

  const changes: string[] = []
  if (d.isActive !== undefined && d.isActive !== dc.isActive) changes.push(`active ${dc.isActive} → ${d.isActive}`)
  if (d.value !== undefined && d.value !== dc.value) changes.push(`value ${dc.value} → ${d.value}`)
  if (d.maxRedemptions !== undefined && d.maxRedemptions !== dc.maxRedemptions) changes.push(`maxRedemptions ${dc.maxRedemptions ?? '∞'} → ${d.maxRedemptions ?? '∞'}`)
  if (d.scope !== undefined) {
    const nextScope = normalizeScope(d.scope)
    if (isEmptyScope(nextScope) !== isEmptyScope(parseScope(dc.scopeJson))) changes.push('scope changed')
    else if (serializeScope(nextScope) !== (dc.scopeJson || '{}')) changes.push('scope updated')
  }
  if (changes.length > 0) {
    await audit(user.email, 'DISCOUNT_UPDATE', 'DiscountCode', id, `Code ${dc.code}: ${changes.join(', ')}`)
  }
  return json({ discount: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const dc = await db.discountCode.findUnique({ where: { id } })
  if (!dc) return apiError(404, 'NOT_FOUND', 'Discount code not found')

  await db.discountCode.delete({ where: { id } })
  // Order rows keep their discountCode/discountMinor snapshot — historical totals stay intact.
  await audit(user.email, 'DISCOUNT_DELETE', 'DiscountCode', id, `Deleted code ${normalizeCode(dc.code)}`)
  return json({ ok: true })
}
