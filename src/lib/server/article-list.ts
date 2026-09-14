// Shared articles-list loader — used by GET /api/articles AND the RSC page (C3 SSR).
import { db } from '@/lib/db'
import { normalizeLocale, pickLocale } from '@/lib/server/utils'

export async function getArticleList(rawLocale: string | null, category: string | null) {
  const locale = normalizeLocale(rawLocale)
  const articles = await db.article.findMany({
    where: {
      status: 'PUBLISHED',
      ...(category ? { categoryLinks: { some: { category: { slug: category } } } } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    include: { translations: true, categoryLinks: { include: { category: { include: { translations: true } } } } },
  })

  return articles.map((a) => {
    const t = pickLocale(a.translations, locale)
    return {
      slug: a.slug,
      title: t?.title ?? a.slug,
      excerpt: t?.excerpt ?? null,
      heroUrl: a.heroUrl,
      publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
      readingMinutes: t?.readingMinutes ?? null,
      categories: a.categoryLinks.map((l) => ({
        slug: l.category.slug,
        name: pickLocale(l.category.translations, locale)?.name ?? l.category.slug,
      })),
      featured: a.isFeatured,
    }
  })
}
