// GET  /api/admin/products?q=&status=&locale= — admin catalog list with completeness flags.
// POST /api/admin/products — full atomic product create (the missing "new product" form, audit P0):
//   product + translations + variants + categories + contributors + media + related links
//   in one transaction, fully validated up-front (unknown refs → 400 before any write).
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, normalizeLocale, parseIntParam, zodMessage } from '@/lib/server/utils'

/** kebab-case whatever was typed ("The Nightingale's Atlas" → the-nightingales-atlas). */
function toKebab(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const variantSchema = z.object({
  sku: z.string().trim().min(2).max(40),
  format: z.enum(['PAPERBACK', 'HARDCOVER', 'SPECIAL']),
  bookLanguage: z.string().trim().max(60).optional(),
  priceMinor: z.number().int().min(100).max(1_000_000),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  isbn13: z.string().trim().max(20).nullable().optional(),
  editionLabel: z.string().trim().max(120).nullable().optional(),
  pageCount: z.number().int().min(1).max(20000).nullable().optional(),
  widthMm: z.number().int().min(1).max(2000).nullable().optional(),
  heightMm: z.number().int().min(1).max(2000).nullable().optional(),
  depthMm: z.number().int().min(1).max(2000).nullable().optional(),
  weightG: z.number().int().min(1).max(30000).nullable().optional(),
  countryOfPrinting: z.string().trim().max(80).nullable().optional(),
  isActive: z.boolean().optional(),
})

const createSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case (a-z, 0-9, dashes)').optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  titleEn: z.string().trim().min(1).max(300),
  titleFa: z.string().trim().max(300).optional(),
  subtitleEn: z.string().trim().max(300).optional(),
  subtitleFa: z.string().trim().max(300).optional(),
  shortDescriptionEn: z.string().trim().max(1000).optional(),
  shortDescriptionFa: z.string().trim().max(1000).optional(),
  // longDescription travels as the stored representation: blocks JSON string (storefront contract).
  longDescriptionEn: z.string().max(100_000).optional(),
  longDescriptionFa: z.string().max(100_000).optional(),
  seoTitleEn: z.string().trim().max(300).optional(),
  seoDescEn: z.string().trim().max(500).optional(),
  seoTitleFa: z.string().trim().max(300).optional(),
  seoDescFa: z.string().trim().max(500).optional(),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  publisher: z.string().trim().max(200).optional(),
  series: z.string().trim().max(200).optional(),
  publicationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'publicationDate must be an ISO date (YYYY-MM-DD)')
    .nullable()
    .optional(),
  audience: z.string().trim().max(120).optional(),
  safetyNote: z.string().trim().max(1000).optional(),
  fixedPrice: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categories: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  contributors: z
    .array(
      z.object({
        personId: z.string().min(1),
        role: z.enum(['AUTHOR', 'TRANSLATOR', 'EDITOR', 'ILLUSTRATOR', 'FOREWORD']),
        displayOrder: z.number().int().min(0).optional(),
      }),
    )
    .max(24)
    .optional(),
  media: z
    .array(
      z.object({
        url: z.string().trim().min(1).max(500).regex(/^\//, 'media url must be a local path starting with /'),
        altEn: z.string().max(300).optional(),
        altFa: z.string().max(300).optional(),
      }),
    )
    .max(48)
    .optional(),
  variants: z.array(variantSchema).min(1).max(24),
  relatedIds: z.array(z.string().min(1)).max(12).optional(),
})

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
  const status = searchParams.get('status')?.trim() || null
  const locale = normalizeLocale(searchParams.get('locale'))
  // Server-side pagination (Task 27): page/pageSize with a sane cap; legacy callers omit them.
  const page = Math.max(1, parseIntParam(searchParams.get('page'), 1, 1, 10_000) ?? 1)
  const pageSize = Math.min(200, Math.max(1, parseIntParam(searchParams.get('pageSize'), 50, 1, 200) ?? 50))

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { slug: { contains: q } },
            { translations: { some: { title: { contains: q } } } },
            { variants: { some: { sku: { contains: q } } } },
            // Task 49-9: real catalog search — ISBN (13/10) and contributor
            // names (author / translator / editor / illustrator …) in BOTH locales.
            { variants: { some: { isbn13: { contains: q } } } },
            { variants: { some: { isbn10: { contains: q } } } },
            {
              contributors: {
                some: {
                  person: { translations: { some: { name: { contains: q } } } },
                },
              },
            },
          ],
        }
      : {}),
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { translations: true, variants: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ])

  return json({
    total,
    page,
    pageSize,
    items: products.map((p) => {
      const en = p.translations.find((t) => t.locale === 'en')
      const fa = p.translations.find((t) => t.locale === 'fa')
      const active = p.variants.filter((v) => v.isActive)
      const priceMinor = active.length ? Math.min(...active.map((v) => v.priceMinor)) : null
      const completeness = (t: { publishedState: string } | undefined) =>
        t && t.publishedState === 'READY' ? 'READY' : 'INCOMPLETE'
      return {
        id: p.id,
        slug: p.slug,
        status: p.status,
        title: (locale === 'fa' ? fa?.title ?? en?.title : en?.title ?? fa?.title) ?? p.slug,
        titleEn: en?.title ?? null,
        titleFa: fa?.title ?? null,
        coverUrl: p.coverUrl,
        priceMinor,
        stock: p.variants.reduce((s, v) => s + v.stock, 0),
        isFeatured: p.isFeatured,
        fixedPrice: p.fixedPrice,
        completeness: { en: completeness(en), fa: completeness(fa) },
        updatedAt: p.updatedAt.toISOString(),
      }
    }),
  })
}

export async function POST(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const d = parsed.data

  // FA/EN translation rows need a title (storefront falls back EN→slug; an empty-titled
  // locale row would render a blank card title). Fail fast instead of dropping data.
  const hasFaContent = [d.subtitleFa, d.shortDescriptionFa, d.longDescriptionFa, d.seoTitleFa, d.seoDescFa].some(
    (v) => v !== undefined && v !== null && v !== '',
  )
  if (!d.titleFa && hasFaContent) {
    return apiError(400, 'VALIDATION_ERROR', 'titleFa is required when any Persian content field is provided')
  }

  // ── Slug: explicit (uniqueness-checked) or derived from the EN title with a numeric suffix ──
  let slug = d.slug
  if (slug) {
    const clash = await db.product.findUnique({ where: { slug } })
    if (clash) return apiError(400, 'VALIDATION_ERROR', `slug “${slug}” is already taken`)
  } else {
    const base = toKebab(d.titleEn) || 'book'
    slug = base
    for (let n = 2; await db.product.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`
  }

  // ── Referential validation BEFORE any write (all-or-nothing API contract) ──
  const categorySlugs = [...new Set(d.categories ?? [])]
  const categories = categorySlugs.length
    ? await db.category.findMany({ where: { slug: { in: categorySlugs } }, select: { id: true, slug: true } })
    : []
  const missingCategories = categorySlugs.filter((s) => !categories.some((c) => c.slug === s))
  if (missingCategories.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `Unknown category slug(s): ${missingCategories.join(', ')}`)
  }

  const personIds = [...new Set((d.contributors ?? []).map((c) => c.personId))]
  const people = personIds.length
    ? await db.person.findMany({ where: { id: { in: personIds } }, select: { id: true } })
    : []
  const missingPeople = personIds.filter((pid) => !people.some((p) => p.id === pid))
  if (missingPeople.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `Unknown contributor personId(s): ${missingPeople.join(', ')}`)
  }

  const relatedIds = [...new Set(d.relatedIds ?? [])]
  const relatedRows = relatedIds.length
    ? await db.product.findMany({ where: { id: { in: relatedIds } }, select: { id: true } })
    : []
  const missingRelated = relatedIds.filter((rid) => !relatedRows.some((r) => r.id === rid))
  if (missingRelated.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `Unknown related product id(s): ${missingRelated.join(', ')}`)
  }

  // Duplicate (personId, role) pairs would violate @@unique([productId, personId, role]).
  const seenPairs = new Set<string>()
  for (const c of d.contributors ?? []) {
    const key = `${c.personId}::${c.role}`
    if (seenPairs.has(key)) return apiError(400, 'VALIDATION_ERROR', 'Duplicate contributor (personId + role) in payload')
    seenPairs.add(key)
  }

  // ── Variant SKU / ISBN13 uniqueness: within payload AND against the whole DB ──
  const skus = (d.variants ?? []).map((v) => v.sku.toUpperCase())
  const dupSku = skus.find((s, i) => skus.indexOf(s) !== i)
  if (dupSku) return apiError(400, 'VALIDATION_ERROR', `Duplicate SKU in payload: ${dupSku}`)
  const takenSkus = await db.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true } })
  if (takenSkus.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `SKU already in use: ${takenSkus.map((v) => v.sku).join(', ')}`)
  }

  const isbns = (d.variants ?? []).map((v) => v.isbn13).filter((x): x is string => !!x)
  const dupIsbn = isbns.find((s, i) => isbns.indexOf(s) !== i)
  if (dupIsbn) return apiError(400, 'VALIDATION_ERROR', `Duplicate ISBN13 in payload: ${dupIsbn}`)
  const takenIsbns = isbns.length
    ? await db.variant.findMany({ where: { isbn13: { in: isbns } }, select: { isbn13: true } })
    : []
  if (takenIsbns.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `ISBN13 already in use: ${takenIsbns.map((v) => v.isbn13).join(', ')}`)
  }

  // ── Assemble nested rows ──
  const publishedState = (title: string, short: string | null | undefined) =>
    title && short ? 'READY' : 'INCOMPLETE'

  const translationsCreate = [
    {
      locale: 'en',
      title: d.titleEn,
      subtitle: d.subtitleEn || null,
      shortDescription: d.shortDescriptionEn || null,
      longDescription: d.longDescriptionEn || null,
      seoTitle: d.seoTitleEn || null,
      seoDesc: d.seoDescEn || null,
      publishedState: publishedState(d.titleEn, d.shortDescriptionEn),
    },
    ...(d.titleFa
      ? [
          {
            locale: 'fa',
            title: d.titleFa,
            subtitle: d.subtitleFa || null,
            shortDescription: d.shortDescriptionFa || null,
            longDescription: d.longDescriptionFa || null,
            seoTitle: d.seoTitleFa || null,
            seoDesc: d.seoDescFa || null,
            publishedState: publishedState(d.titleFa, d.shortDescriptionFa),
          },
        ]
      : []),
  ]

  // First media row also sets the cover when no explicit coverUrl was provided.
  const coverUrl = d.coverUrl !== undefined ? d.coverUrl : d.media?.[0]?.url ?? null

  const publicationDate = d.publicationDate ? new Date(d.publicationDate) : null

  try {
    const created = await db.$transaction(async (tx) => {
      return tx.product.create({
        data: {
          slug: slug!,
          status: d.status ?? 'DRAFT',
          publicationDate,
          publisher: d.publisher || 'Persepix',
          series: d.series || null,
          coverUrl,
          audience: d.audience || null,
          safetyNote: d.safetyNote || null,
          fixedPrice: d.fixedPrice ?? false,
          isFeatured: d.isFeatured ?? false,
          translations: { create: translationsCreate },
          categories: {
            create: categories.map((c, i) => ({ categoryId: c.id, isPrimary: i === 0 })),
          },
          contributors: {
            create: (d.contributors ?? []).map((c, i) => ({
              personId: c.personId,
              role: c.role,
              displayOrder: c.displayOrder ?? i,
            })),
          },
          media: {
            create: (d.media ?? []).map((m, i) => ({
              url: m.url,
              mediaType: 'IMAGE',
              altEn: m.altEn || null,
              altFa: m.altFa || null,
              sortOrder: i,
            })),
          },
          variants: {
            create: (d.variants ?? []).map((v) => ({
              sku: v.sku.toUpperCase(),
              format: v.format,
              bookLanguage: v.bookLanguage || 'English',
              priceMinor: v.priceMinor,
              stock: v.stock ?? 0,
              isbn13: v.isbn13 || null,
              editionLabel: v.editionLabel || null,
              pageCount: v.pageCount ?? null,
              widthMm: v.widthMm ?? null,
              heightMm: v.heightMm ?? null,
              depthMm: v.depthMm ?? null,
              weightG: v.weightG ?? null,
              countryOfPrinting: v.countryOfPrinting || null,
              isActive: v.isActive ?? true,
              sortOrder: d.variants!.indexOf(v),
            })),
          },
          related: {
            create: relatedIds.map((rid, i) => ({ relatedProductId: rid, sortOrder: i })),
          },
        },
        select: { id: true, slug: true },
      })
    })

    await audit(
      user.email,
      'PRODUCT_CREATE',
      'Product',
      created.id,
      `Created ${created.slug} (${d.variants.length} variant(s))`,
    )
    return json({ product: created }, 201)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'unique field'
      return apiError(400, 'VALIDATION_ERROR', `Unique constraint violated (${target})`)
    }
    throw err
  }
}
