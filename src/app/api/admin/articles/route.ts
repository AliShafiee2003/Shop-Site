// GET  /api/admin/articles?page=&pageSize= — journal admin list: every status +
//                              translations + categories + relation ids (single
//                              round-trip for the admin editor) + the ArticleCategory
//                              meta list.
// POST /api/admin/articles — create an article (audited, slug auto-generated,
//                              body stored as blocks JSON — same contract as the
//                              product long-description / storefront ProseBlocks).
// API-405 (audit v4): the articles findMany is bounded (shared parseListQuery,
// default 50, hard cap 100) with `total` + X-Total-Count added. The body keys
// (categories/articles) are unchanged — the admin UI reads both. `categories`
// stays unpaginated on purpose: it is the tiny admin-curated meta list the
// article editor's category picker needs in full.
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, jsonWithTotal, parseListQuery, zodMessage } from '@/lib/server/utils'
import { slugify } from '@/app/api/admin/categories/route'
import { articleSchema, bodyPayload, readingMinutesFrom } from '@/lib/server/articles'

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { page, pageSize, skip, take } = parseListQuery(new URL(req.url).searchParams)
  const [rows, total, cats] = await Promise.all([
    db.article.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        translations: true,
        categoryLinks: { include: { category: { include: { translations: true } } } },
        relations: true,
      },
      skip,
      take,
    }),
    db.article.count(),
    db.articleCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { translations: true },
    }),
  ])

  return jsonWithTotal(
    {
      total,
      page,
      pageSize,
      categories: cats.map((c) => ({
        id: c.id,
        slug: c.slug,
        nameEn: c.translations.find((t) => t.locale === 'en')?.name ?? null,
        nameFa: c.translations.find((t) => t.locale === 'fa')?.name ?? null,
      })),
      articles: rows.map((a) => {
        const en = a.translations.find((t) => t.locale === 'en')
        const fa = a.translations.find((t) => t.locale === 'fa')
        return {
          id: a.id,
          slug: a.slug,
          status: a.status,
          heroUrl: a.heroUrl,
          byline: a.byline,
          isFeatured: a.isFeatured,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
          updatedAt: a.updatedAt.toISOString(),
          titleEn: en?.title ?? null,
          titleFa: fa?.title ?? null,
          excerptEn: en?.excerpt ?? null,
          excerptFa: fa?.excerpt ?? null,
          bodyEn: en?.body ?? null,
          bodyFa: fa?.body ?? null,
          readingMinutesEn: en?.readingMinutes ?? null,
          readingMinutesFa: fa?.readingMinutes ?? null,
          categoryIds: a.categoryLinks.map((l) => l.articleCategoryId),
          productIds: a.relations.filter((r) => r.targetType === 'PRODUCT').map((r) => r.targetId),
          personIds: a.relations.filter((r) => r.targetType === 'PERSON').map((r) => r.targetId),
        }
      }),
    },
    total,
  )
}

export async function POST(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = articleSchema.safeParse(raw)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  const titleEn = d.en?.title?.trim() ?? ''
  if (titleEn.length < 2) return apiError(400, 'VALIDATION_ERROR', 'English title is required (min 2 chars)')

  let slug = d.slug?.trim() || slugify(titleEn)
  if (!slug) slug = 'article'
  for (let i = 2; await db.article.findUnique({ where: { slug } }); i++) {
    slug = `${d.slug?.trim() || slugify(titleEn) || 'article'}-${i}`
  }

  const publishedAt = d.publishedAt === undefined || d.publishedAt === null || d.publishedAt === ''
    ? (d.status === 'PUBLISHED' ? new Date() : null)
    : new Date(d.publishedAt)
  if (publishedAt && Number.isNaN(publishedAt.getTime())) return apiError(400, 'VALIDATION_ERROR', 'publishedAt must be an ISO date')

  const created = await db.article.create({
    data: {
      slug,
      status: d.status ?? 'DRAFT',
      heroUrl: d.heroUrl ?? null,
      byline: d.byline ?? null,
      isFeatured: d.isFeatured ?? false,
      publishedAt,
      translations: {
        create: [
          {
            locale: 'en',
            title: titleEn,
            excerpt: d.en?.excerpt ?? null,
            body: bodyPayload(d.en?.bodyMd) ?? null,
            seoTitle: d.en?.seoTitle ?? null,
            seoDesc: d.en?.seoDesc ?? null,
            readingMinutes: readingMinutesFrom(d.en?.bodyMd),
          },
          ...(d.fa?.title?.trim()
            ? [{
                locale: 'fa' as const,
                title: d.fa.title.trim(),
                excerpt: d.fa.excerpt ?? null,
                body: bodyPayload(d.fa.bodyMd) ?? null,
                seoTitle: d.fa.seoTitle ?? null,
                seoDesc: d.fa.seoDesc ?? null,
                readingMinutes: readingMinutesFrom(d.fa.bodyMd),
              }]
            : []),
        ],
      },
      ...(d.categoryIds ? {
        categoryLinks: { create: d.categoryIds.map((articleCategoryId) => ({ articleCategoryId })) },
      } : {}),
      ...(d.productIds || d.personIds ? {
        relations: {
          create: [
            ...(d.productIds ?? []).map((targetId, sortOrder) => ({ targetType: 'PRODUCT' as const, targetId, sortOrder })),
            ...(d.personIds ?? []).map((targetId, sortOrder) => ({ targetType: 'PERSON' as const, targetId, personId: targetId, sortOrder })),
          ],
        },
      } : {}),
    },
  })

  await audit(user.email, 'ARTICLE_CREATE', 'Article', created.id, `Created article "${titleEn}" (${created.slug})`)
  return json({ article: created }, 201)
}
