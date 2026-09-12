// PATCH  /api/admin/articles/[id] — update an article (audited): meta, hero,
//                                    per-locale translations (markdown → blocks
//                                    JSON), category links + related targets.
// DELETE /api/admin/articles/[id] — remove an article (translations, category
//                                    links and relations cascade).
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'
import { articleSchema, bodyPayload, readingMinutesFrom } from '@/lib/server/articles'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = articleSchema.safeParse(raw)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  const existing = await db.article.findUnique({
    where: { id },
    include: { translations: true, relations: true },
  })
  if (!existing) return apiError(404, 'NOT_FOUND')

  let publishedAt: Date | null | undefined
  if (d.publishedAt !== undefined) {
    if (d.publishedAt === null || d.publishedAt === '') publishedAt = null
    else {
      const dt = new Date(d.publishedAt)
      if (Number.isNaN(dt.getTime())) return apiError(400, 'VALIDATION_ERROR', 'publishedAt must be an ISO date')
      publishedAt = dt
    }
  }

  if (d.slug !== undefined) {
    const s = d.slug.trim()
    if (s && s !== existing.slug) {
      const taken = await db.article.findUnique({ where: { slug: s } })
      if (taken) return apiError(409, 'SLUG_TAKEN', `Slug "${s}" is already in use`)
    }
  }

  const enT = existing.translations.find((t) => t.locale === 'en')
  const faT = existing.translations.find((t) => t.locale === 'fa')

  const updated = await db.$transaction(async (tx) => {
    const article = await tx.article.update({
      where: { id },
      data: {
        ...(d.slug !== undefined && d.slug.trim() ? { slug: d.slug.trim() } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.heroUrl !== undefined ? { heroUrl: d.heroUrl } : {}),
        ...(d.byline !== undefined ? { byline: d.byline } : {}),
        ...(d.isFeatured !== undefined ? { isFeatured: d.isFeatured } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
    })

    // Per-locale translation upsert; title === '' (with no other content) removes it.
    const applyTranslation = async (
      locale: 'en' | 'fa',
      t: NonNullable<(typeof d)['en']>,
      row: { id: string } | undefined,
    ) => {
      const title = t.title?.trim()
      const clearing = title === '' && (t.excerpt === undefined || t.excerpt === null || t.excerpt === '') && t.bodyMd === undefined
      if (clearing) {
        if (row) await tx.articleTranslation.delete({ where: { id: row.id } })
        return
      }
      const data = {
        ...(t.excerpt !== undefined ? { excerpt: t.excerpt } : {}),
        ...(t.bodyMd !== undefined ? { body: bodyPayload(t.bodyMd) ?? null } : {}),
        ...(t.seoTitle !== undefined ? { seoTitle: t.seoTitle } : {}),
        ...(t.seoDesc !== undefined ? { seoDesc: t.seoDesc } : {}),
        ...(t.bodyMd !== undefined ? { readingMinutes: readingMinutesFrom(t.bodyMd) } : {}),
      }
      if (row) {
        await tx.articleTranslation.update({
          where: { id: row.id },
          data: { ...data, ...(title ? { title } : {}) },
        })
      } else if (title) {
        // No translation row yet — title is required for creation (narrowed above).
        await tx.articleTranslation.create({ data: { articleId: id, locale, title, ...data } })
      }
    }
    if (d.en) await applyTranslation('en', d.en, enT)
    if (d.fa) await applyTranslation('fa', d.fa, faT)

    if (d.categoryIds) {
      await tx.articleCategoryLink.deleteMany({ where: { articleId: id } })
      if (d.categoryIds.length > 0) {
        await tx.articleCategoryLink.createMany({
          data: [...new Set(d.categoryIds)].map((articleCategoryId) => ({ articleId: id, articleCategoryId })),
        })
      }
    }

    if (d.productIds || d.personIds) {
      const products = d.productIds ?? existing.relations.filter((r) => r.targetType === 'PRODUCT').map((r) => r.targetId)
      const people = d.personIds ?? existing.relations.filter((r) => r.targetType === 'PERSON').map((r) => r.targetId)
      await tx.articleRelation.deleteMany({ where: { articleId: id } })
      const rels = [
        ...[...new Set(products)].map((targetId, sortOrder) => ({ articleId: id, targetType: 'PRODUCT' as const, targetId, sortOrder })),
        ...[...new Set(people)].map((targetId, sortOrder) => ({ articleId: id, targetType: 'PERSON' as const, targetId, personId: targetId, sortOrder })),
      ]
      if (rels.length > 0) await tx.articleRelation.createMany({ data: rels })
    }

    return tx.article.findUnique({ where: { id }, include: { translations: true } })
  })

  await audit(user.email, 'ARTICLE_UPDATE', 'Article', id, `Updated article "${existing.slug}"${d.status !== undefined ? ` — status ${d.status}` : ''}`)
  return json({ article: updated })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')
  const { id } = await ctx.params

  const existing = await db.article.findUnique({ where: { id }, include: { translations: true } })
  if (!existing) return apiError(404, 'NOT_FOUND')

  await db.article.delete({ where: { id } })
  await audit(user.email, 'ARTICLE_DELETE', 'Article', id, `Deleted article "${existing.slug}"`)
  return json({ ok: true })
}
