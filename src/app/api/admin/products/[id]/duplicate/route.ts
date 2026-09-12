// POST /api/admin/products/[id]/duplicate — clone product as DRAFT (no variants).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json } from '@/lib/server/utils'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    include: { translations: true, categories: true, contributors: true },
  })
  if (!product) return apiError(404, 'NOT_FOUND', 'Product not found')

  // Unique slug: slug-copy, slug-copy-2, ...
  let slug = `${product.slug}-copy`
  for (let n = 2; await db.product.findUnique({ where: { slug } }); n++) {
    slug = `${product.slug}-copy-${n}`
  }

  const clone = await db.product.create({
    data: {
      slug,
      status: 'DRAFT',
      publisher: product.publisher,
      series: product.series,
      seriesSlug: product.seriesSlug,
      coverUrl: product.coverUrl,
      audience: product.audience,
      safetyNote: product.safetyNote,
      fixedPrice: product.fixedPrice,
      isFeatured: false,
      translations: {
        create: product.translations.map((t) => ({
          locale: t.locale,
          title: `${t.title} (Copy)`,
          subtitle: t.subtitle,
          shortDescription: t.shortDescription,
          longDescription: t.longDescription,
          seoTitle: t.seoTitle,
          seoDesc: t.seoDesc,
          publishedState: t.publishedState,
        })),
      },
      categories: { create: product.categories.map((c) => ({ categoryId: c.categoryId, isPrimary: c.isPrimary })) },
      contributors: {
        create: product.contributors.map((c) => ({
          personId: c.personId,
          role: c.role,
          displayOrder: c.displayOrder,
        })),
      },
    },
  })

  await audit(user.email, 'PRODUCT_DUPLICATE', 'Product', clone.id, `Duplicated ${product.slug} → ${slug}`)

  return json({ id: clone.id, slug: clone.slug })
}
