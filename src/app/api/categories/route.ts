// GET /api/categories?locale= — active categories with localized fields + published product counts.
import { db } from '@/lib/db'
import { json, normalizeLocale, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      translations: true,
      products: { where: { product: { status: 'PUBLISHED' } }, select: { productId: true } },
    },
  })

  return json(
    categories.map((c) => {
      const t = pickLocale(c.translations, locale)
      return {
        slug: c.slug,
        name: t?.name ?? c.slug,
        description: t?.description ?? null,
        icon: c.icon,
        iconUrl: c.iconUrl,
        color: c.color,
        productCount: c.products.length,
      }
    }),
  )
}
