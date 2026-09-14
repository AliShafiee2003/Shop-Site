// POST /api/admin/products/bulk-stock — apply stock deltas to many variants in
// one audited transaction. Deltas are clamped so stock never goes negative;
// each non-zero delta writes a PriceHistory row (same contract as the per-product
// stockAdjust PATCH) and a single aggregated STOCK_ADJUST audit entry.
// Variants listed in notifyVariantIds that end up restocked (stock > 0) get their
// waiting back-in-stock subscribers marked notified in the same transaction, with
// one aggregated BACK_IN_STOCK_NOTIFY audit entry.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const bodySchema = z.object({
  adjustments: z.array(z.object({
    variantId: z.string().min(1),
    delta: z.number().int().refine((d) => d !== 0, 'delta must be non-zero'),
  })).min(1).max(50),
  // Subset of adjustments (positive deltas) whose waiting subscribers should be notified.
  notifyVariantIds: z.array(z.string().min(1)).max(50).optional(),
})

export async function POST(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const adjustments = parsed.data.adjustments
  const notifySet = new Set(parsed.data.notifyVariantIds ?? [])

  const results = await db.$transaction(async (tx) => {
    const out: { variantId: string; sku: string; stock: number }[] = []
    const auditRows: { sku: string; delta: number }[] = []
    const notified: { variantId: string; sku: string; count: number }[] = []
    const notifiedSkus: string[] = []
    let notifiedTotal = 0
    for (const adj of adjustments) {
      const variant = await tx.variant.findUnique({ where: { id: adj.variantId } })
      if (!variant) continue
      const nextStock = Math.max(0, variant.stock + adj.delta)
      if (nextStock === variant.stock) continue
      await tx.variant.update({ where: { id: variant.id }, data: { stock: nextStock } })
      // Same contract as per-product stockAdjust: PriceHistory row with old=new=current price, delta in reason.
      await tx.priceHistory.create({
        data: {
          variantId: variant.id,
          oldPriceMinor: variant.priceMinor,
          newPriceMinor: variant.priceMinor,
          reason: `STOCK_ADJUST ${adj.delta > 0 ? '+' : ''}${adj.delta} (bulk)`,
          actorEmail: user.email,
        },
      })
      out.push({ variantId: variant.id, sku: variant.sku, stock: nextStock })
      auditRows.push({ sku: variant.sku, delta: nextStock - variant.stock })
      // Restock → notify waiting subscribers (same tx, rolls back together).
      if (nextStock > 0 && variant.stock === 0 && notifySet.has(variant.id)) {
        const upd = await tx.backInStockSubscriber.updateMany({
          where: { variantId: variant.id, notifiedAt: null },
          data: { notifiedAt: new Date() },
        })
        if (upd.count > 0) {
          notified.push({ variantId: variant.id, sku: variant.sku, count: upd.count })
          notifiedTotal += upd.count
          notifiedSkus.push(variant.sku)
        }
      }
    }
    if (auditRows.length > 0) {
      await tx.auditLog.create({
        data: {
          actorEmail: user.email,
          action: 'STOCK_ADJUST',
          entityType: 'Variant',
          entityId: auditRows.map((r) => r.sku).join(', ').slice(0, 180),
          summary: `Bulk stock adjust: ${auditRows.map((r) => `${r.sku} ${r.delta > 0 ? '+' : ''}${r.delta}`).join(', ')}`,
        },
      })
    }
    if (notifiedTotal > 0) {
      await tx.auditLog.create({
        data: {
          actorEmail: user.email,
          action: 'BACK_IN_STOCK_NOTIFY',
          entityType: 'BackInStockSubscriber',
          entityId: notifiedSkus.join(', ').slice(0, 180),
          summary: `Restock notice sent to ${notifiedTotal} waiting customer${notifiedTotal === 1 ? '' : 's'} (bulk restock — ${notifiedSkus.join(', ')})`,
        },
      })
    }
    return { updated: out, notified }
  })

  return json(results)
}
