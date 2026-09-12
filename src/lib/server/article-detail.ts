// Shared article-detail loader — used by GET /api/articles/[slug] AND by the
// RSC catch-all page for C3 server-side body rendering.
import { db } from '@/lib/db'
import { productCardInclude, toProductCard } from '@/lib/server/catalog'
import { getActivePromotion } from '@/lib/server/promotions'
import { parseJsonSafe, pickLocale } from '@/lib/server/utils'

export async function getArticleDetail(slug: string, locale: 'en' | 'fa') {
  const article = await db.article.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      translations: true,
      categoryLinks: { include: { category: { include: { translations: true } } } },
      relations: true,
    },
  })
  if (!article) return null

  const t = pickLocale(article.translations, locale)
  const body = parseJsonSafe<unknown[] | null>(t?.body ?? null, null)

  const categories = article.categoryLinks.map((l) => ({
    slug: l.category.slug,
    name: pickLocale(l.category.translations, locale)?.name ?? l.category.slug,
  }))

  // ── Related targets ──
  const productIds = article.relations.filter((r) => r.targetType === 'PRODUCT').map((r) => r.targetId)
  const personIds = article.relations.filter((r) => r.targetType === 'PERSON').map((r) => r.targetId)

  const promo = productIds.length > 0 ? await getActivePromotion() : null
  const relatedProducts =
    productIds.length > 0
      ? (
          await db.product.findMany({
            where: { id: { in: productIds }, status: 'PUBLISHED' },
            include: productCardInclude,
          })
        ).map((p) => toProductCard(p, locale, promo))
      : []

  const relatedPeople =
    personIds.length > 0
      ? (
          await db.person.findMany({
            where: { id: { in: personIds }, status: 'PUBLISHED' },
            include: { translations: true },
          })
        ).map((p) => ({
          slug: p.slug,
          name: pickLocale(p.translations, locale)?.name ?? p.slug,
          portraitUrl: p.portraitUrl,
        }))
      : []

  // Other published articles sharing any category (limit 3).
  const categoryIds = article.categoryLinks.map((l) => l.articleCategoryId)
  const relatedArticles =
    categoryIds.length > 0
      ? (
          await db.article.findMany({
            where: {
              status: 'PUBLISHED',
              id: { not: article.id },
              categoryLinks: { some: { articleCategoryId: { in: categoryIds } } },
            },
            orderBy: { publishedAt: 'desc' },
            take: 3,
            include: { translations: true },
          })
        ).map((a) => {
          const at = pickLocale(a.translations, locale)
          return {
            slug: a.slug,
            title: at?.title ?? a.slug,
            heroUrl: a.heroUrl,
            publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
          }
        })
      : []

  return {
    slug: article.slug,
    title: t?.title ?? article.slug,
    excerpt: t?.excerpt ?? null,
    heroUrl: article.heroUrl,
    byline: article.byline,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    updatedAt: article.updatedAt.toISOString(),
    readingMinutes: t?.readingMinutes ?? null,
    featured: article.isFeatured,
    body,
    categories,
    relatedProducts,
    relatedPeople,
    relatedArticles,
  }
}
