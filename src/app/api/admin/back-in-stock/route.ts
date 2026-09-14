// GET /api/admin/back-in-stock — list back-in-stock requests grouped per variant,
// with the current stock state so staff can see which alerts are actionable.
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, pickLocale } from '@/lib/server/utils'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const subs = await db.backInStockSubscriber.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      variant: {
        include: { product: { include: { translations: true } } },
      },
    },
  })

  // Group per variant: one row per variant with subscriber list.
  const byVariant = new Map<string, {
    variantId: string; sku: string; stock: number; productTitle: string; productTitleFa: string; productSlug: string
    requests: { id: string; email: string; locale: string; notifiedAt: string | null; createdAt: string }[]
  }>()
  for (const s of subs) {
    const v = s.variant
    let row = byVariant.get(v.id)
    if (!row) {
      row = {
        variantId: v.id,
        sku: v.sku,
        stock: v.stock,
        productTitle: pickLocale(v.product.translations, 'en')?.title ?? v.product.slug,
        productTitleFa: pickLocale(v.product.translations, 'fa')?.title ?? '',
        productSlug: v.product.slug,
        requests: [],
      }
      byVariant.set(v.id, row)
    }
    row.requests.push({ id: s.id, email: s.email, locale: s.locale, notifiedAt: s.notifiedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString() })
  }

  return json({ variants: [...byVariant.values()] })
}
