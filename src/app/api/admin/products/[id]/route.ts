// GET/PATCH/DELETE /api/admin/products/[id] — product detail for editor + status/price/stock mutations + hard delete for drafts (audited).
// Task 27-f: GET now carries the FULL editor payload (media, contributors, related, SEO, longDescription,
// publishAt, audience, safetyNote). PATCH gains full-product editing while keeping every legacy field
// (status / isFeatured / fixedPrice / stockAdjust / variantPrices / inline translations) working unchanged.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, parseJsonSafe, zodMessage } from '@/lib/server/utils'

const translationEditSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  subtitle: z.string().max(300).nullable().optional(),
  shortDescription: z.string().max(1000).nullable().optional(),
  // longDescription = stored blocks JSON string (storefront contract) or null to clear.
  longDescription: z.string().max(100_000).nullable().optional(),
  seoTitle: z.string().max(300).nullable().optional(),
  seoDesc: z.string().max(500).nullable().optional(),
})

const variantRowSchema = z.object({
  id: z.string().min(1).optional(),
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

const patchSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  isFeatured: z.boolean().optional(),
  fixedPrice: z.boolean().optional(),
  stockAdjust: z
    .array(z.object({ variantId: z.string().min(1), delta: z.number().int() }))
    .optional(),
  /** Absolute price edits (minor units) — every change lands in PriceHistory. */
  variantPrices: z
    .array(z.object({ variantId: z.string().min(1), priceMinor: z.number().int().min(100).max(1_000_000) }))
    .optional(),
  /** Inline content edits per locale (title/subtitle/shortDescription) — plus full-editor fields. */
  translations: z.object({ en: translationEditSchema.optional(), fa: translationEditSchema.optional() }).optional(),
  // ── Task 27-f: full-editor fields ──
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case (a-z, 0-9, dashes)').optional(),
  publisher: z.string().trim().max(200).nullable().optional(),
  series: z.string().trim().max(200).nullable().optional(),
  /** 'YYYY-MM-DD' (or full ISO) or null to clear — validated manually for a friendlier message. */
  publicationDate: z.string().max(40).nullable().optional(),
  audience: z.string().trim().max(120).nullable().optional(),
  safetyNote: z.string().trim().max(1000).nullable().optional(),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  /** Category SLUGS — replaces the full set; first entry becomes isPrimary. */
  categories: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  /** Contributors — replaces the full set; displayOrder defaults to the array index. */
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
  /** Gallery — replaces the full set; sortOrder = array index; media[0] syncs coverUrl when no explicit coverUrl. */
  media: z
    .array(
      z.object({
        url: z.string().trim().min(1).max(500).regex(/^\//, 'media url must be a local path starting with /'),
        altEn: z.string().max(300).nullable().optional(),
        altFa: z.string().max(300).nullable().optional(),
      }),
    )
    .max(48)
    .optional(),
  /** Related product ids — replaces the full set (self-references are stripped silently). */
  relatedIds: z.array(z.string().min(1)).max(12).optional(),
  /** Variant create (no id) / update (id present) — sku+format+priceMinor required per row. */
  variants: z.array(variantRowSchema).max(24).optional(),
})

/** GET — full editor payload: variants, translations (incl. longDescription/SEO), media, contributors, related, price history. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    include: {
      translations: {
        select: {
          locale: true,
          title: true,
          subtitle: true,
          shortDescription: true,
          longDescription: true,
          seoTitle: true,
          seoDesc: true,
          publishedState: true,
        },
      },
      variants: { orderBy: { sortOrder: 'asc' } },
      categories: { include: { category: { include: { translations: true } } } },
      media: { orderBy: { sortOrder: 'asc' } },
      contributors: {
        orderBy: { displayOrder: 'asc' },
        include: { person: { include: { translations: true } } },
      },
      related: {
        orderBy: { sortOrder: 'asc' },
        include: { relatedProduct: { include: { translations: true } } },
      },
    },
  })
  if (!product) return apiError(404, 'NOT_FOUND', 'Product not found')

  const variantIds = product.variants.map((v) => v.id)
  const history = variantIds.length
    ? await db.priceHistory.findMany({
        where: { variantId: { in: variantIds } },
        orderBy: { effectiveAt: 'desc' },
        take: 12,
      })
    : []
  const variantById = new Map(product.variants.map((v) => [v.id, v]))

  // Waiting back-in-stock subscribers per variant (only those not yet notified) —
  // drives the "notify waiting customers" affordance when restocking.
  const waiting = variantIds.length
    ? await db.backInStockSubscriber.groupBy({
        by: ['variantId'],
        where: { variantId: { in: variantIds }, notifiedAt: null },
        _count: { _all: true },
      })
    : []
  const waitingByVariant = new Map(waiting.map((w) => [w.variantId, w._count._all]))

  const personName = (t: { locale: string; name: string }[]) =>
    t.find((x) => x.locale === 'en')?.name ?? t.find((x) => x.locale === 'fa')?.name ?? ''

  return json({
    product: {
      id: product.id,
      slug: product.slug,
      status: product.status,
      coverUrl: product.coverUrl,
      publisher: product.publisher,
      series: product.series,
      isFeatured: product.isFeatured,
      fixedPrice: product.fixedPrice,
      publicationDate: product.publicationDate,
      publishAt: product.publishAt,
      audience: product.audience,
      safetyNote: product.safetyNote,
      translations: Object.fromEntries(product.translations.map((tr) => [tr.locale, tr])),
      categories: product.categories.map((pc) => ({
        slug: pc.category.slug,
        name: pc.category.translations.find((tr) => tr.locale === 'en')?.name ?? pc.category.slug,
        isPrimary: pc.isPrimary,
      })),
      media: product.media.map((m) => ({
        id: m.id,
        url: m.url,
        altEn: m.altEn,
        altFa: m.altFa,
        sortOrder: m.sortOrder,
      })),
      contributors: product.contributors.map((c) => ({
        personId: c.personId,
        role: c.role,
        displayOrder: c.displayOrder,
        name: personName(c.person.translations),
      })),
      related: product.related.map((r) => ({
        id: r.relatedProductId,
        title:
          r.relatedProduct.translations.find((t) => t.locale === 'en')?.title ??
          r.relatedProduct.translations.find((t) => t.locale === 'fa')?.title ??
          r.relatedProduct.slug,
        slug: r.relatedProduct.slug,
      })),
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        isbn13: v.isbn13,
        format: v.format,
        bookLanguage: v.bookLanguage,
        editionLabel: v.editionLabel,
        pageCount: v.pageCount,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        depthMm: v.depthMm,
        weightG: v.weightG,
        countryOfPrinting: v.countryOfPrinting,
        priceMinor: v.priceMinor,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        soldCount: v.soldCount,
        isActive: v.isActive,
        waitingCount: waitingByVariant.get(v.id) ?? 0,
      })),
      priceHistory: history.map((h) => ({
        id: h.id,
        variantSku: variantById.get(h.variantId)?.sku ?? '—',
        oldPriceMinor: h.oldPriceMinor,
        newPriceMinor: h.newPriceMinor,
        reason: h.reason,
        actorEmail: h.actorEmail,
        effectiveAt: h.effectiveAt,
      })),
    },
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const product = await db.product.findUnique({ where: { id }, include: { variants: true } })
  if (!product) return apiError(404, 'NOT_FOUND', 'Product not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const {
    status,
    isFeatured,
    fixedPrice,
    stockAdjust,
    variantPrices,
    translations,
    slug,
    publisher,
    series,
    publicationDate,
    audience,
    safetyNote,
    coverUrl,
    categories,
    contributors,
    media,
    relatedIds,
    variants,
  } = parsed.data

  // ── Up-front referential validation — a 400 must never leave partial writes behind ──

  // publicationDate: '' / null clears; otherwise must parse as a date.
  let pubDate: Date | null | undefined
  if (publicationDate !== undefined) {
    if (publicationDate === null || publicationDate === '') pubDate = null
    else {
      const parsedDate = new Date(publicationDate)
      if (Number.isNaN(parsedDate.getTime())) {
        return apiError(400, 'VALIDATION_ERROR', 'publicationDate must be an ISO date (YYYY-MM-DD) or null')
      }
      pubDate = parsedDate
    }
  }

  if (slug && slug !== product.slug) {
    const clash = await db.product.findUnique({ where: { slug } })
    if (clash) return apiError(400, 'VALIDATION_ERROR', `slug “${slug}” is already taken`)
  }

  let categoryRows: { id: string; slug: string }[] = []
  if (categories) {
    const wanted = [...new Set(categories)]
    const found = wanted.length
      ? await db.category.findMany({ where: { slug: { in: wanted } }, select: { id: true, slug: true } })
      : []
    const missing = wanted.filter((s) => !found.some((c) => c.slug === s))
    if (missing.length > 0) return apiError(400, 'VALIDATION_ERROR', `Unknown category slug(s): ${missing.join(', ')}`)
    categoryRows = found
  }

  let contributorRows: { personId: string; role: string; displayOrder: number }[] = []
  if (contributors) {
    const personIds = [...new Set(contributors.map((c) => c.personId))]
    const found = personIds.length
      ? await db.person.findMany({ where: { id: { in: personIds } }, select: { id: true } })
      : []
    const missing = personIds.filter((pid) => !found.some((p) => p.id === pid))
    if (missing.length > 0) return apiError(400, 'VALIDATION_ERROR', `Unknown contributor personId(s): ${missing.join(', ')}`)
    const seen = new Set<string>()
    for (const c of contributors) {
      const key = `${c.personId}::${c.role}`
      if (seen.has(key)) return apiError(400, 'VALIDATION_ERROR', 'Duplicate contributor (personId + role) in payload')
      seen.add(key)
    }
    contributorRows = contributors.map((c, i) => ({
      personId: c.personId,
      role: c.role,
      displayOrder: c.displayOrder ?? i,
    }))
  }

  let relatedRows: string[] = []
  if (relatedIds) {
    const cleaned = [...new Set(relatedIds.filter((rid) => rid !== id))] // strip self-references
    const found = cleaned.length
      ? await db.product.findMany({ where: { id: { in: cleaned } }, select: { id: true } })
      : []
    const missing = cleaned.filter((rid) => !found.some((r) => r.id === rid))
    if (missing.length > 0) return apiError(400, 'VALIDATION_ERROR', `Unknown related product id(s): ${missing.join(', ')}`)
    relatedRows = cleaned
  }

  // Variant SKU / ISBN13 uniqueness: within payload AND against the DB (other products
  // or sibling variants not part of this payload would violate the unique constraints).
  if (variants && variants.length > 0) {
    const skus = variants.map((v) => v.sku.trim().toUpperCase())
    const dupSku = skus.find((s, i) => skus.indexOf(s) !== i)
    if (dupSku) return apiError(400, 'VALIDATION_ERROR', `Duplicate SKU in payload: ${dupSku}`)
    const skuClashes = await db.variant.findMany({ where: { sku: { in: skus } }, select: { id: true, productId: true, sku: true } })
    for (const row of skuClashes) {
      if (row.productId !== id) return apiError(400, 'VALIDATION_ERROR', `SKU already in use by another product: ${row.sku}`)
      const payloadRow = variants.find((v) => v.sku.trim().toUpperCase() === row.sku)
      // Same-product clash: only OK when the payload row IS that variant (an update of itself).
      // A create row (no id) or a different id means a duplicate — 400, not a P2002 500.
      if (payloadRow && (payloadRow.id ?? null) !== row.id) {
        return apiError(
          400,
          'VALIDATION_ERROR',
          `SKU ${row.sku} already belongs to variant ${row.id} of this product — send that variant id to update it`,
        )
      }
    }
    const isbns = variants.map((v) => v.isbn13).filter((x): x is string => !!x)
    const dupIsbn = isbns.find((s, i) => isbns.indexOf(s) !== i)
    if (dupIsbn) return apiError(400, 'VALIDATION_ERROR', `Duplicate ISBN13 in payload: ${dupIsbn}`)
    if (isbns.length > 0) {
      const isbnClashes = await db.variant.findMany({
        where: { isbn13: { in: isbns } },
        select: { isbn13: true, id: true, productId: true },
      })
      for (const row of isbnClashes) {
        if (row.productId !== id) {
          return apiError(400, 'VALIDATION_ERROR', `ISBN13 already in use: ${row.isbn13}`)
        }
        // Same rule as SKUs: an ISBN owned by a sibling variant of this product may only be
        // re-sent by the payload row that already owns it.
        const payloadRow = variants.find((v) => v.isbn13 === row.isbn13)
        if (payloadRow && (payloadRow.id ?? null) !== row.id) {
          return apiError(
            400,
            'VALIDATION_ERROR',
            `ISBN13 ${row.isbn13} already belongs to variant ${row.id} of this product`,
          )
        }
      }
    }
  }

  // ── Simple product fields (legacy status/isFeatured/fixedPrice + new detail fields) ──
  const simple: Record<string, unknown> = {
    ...(status ? { status } : {}),
    ...(isFeatured !== undefined ? { isFeatured } : {}),
    ...(fixedPrice !== undefined ? { fixedPrice } : {}),
    ...(slug !== undefined && slug !== product.slug ? { slug } : {}),
    ...(publisher !== undefined ? { publisher: publisher || 'Persepix' } : {}),
    ...(series !== undefined ? { series: series || null } : {}),
    ...(pubDate !== undefined ? { publicationDate: pubDate } : {}),
    ...(audience !== undefined ? { audience: audience || null } : {}),
    ...(safetyNote !== undefined ? { safetyNote: safetyNote || null } : {}),
    ...(coverUrl !== undefined ? { coverUrl: coverUrl || null } : {}),
  }
  const updated = Object.keys(simple).length > 0 ? await db.product.update({ where: { id }, data: simple }) : product

  const simpleChanges: string[] = []
  if (slug !== undefined && slug !== product.slug) simpleChanges.push(`slug ${product.slug} → ${slug}`)
  if (publisher !== undefined && (publisher || 'Persepix') !== product.publisher) simpleChanges.push('publisher')
  if (series !== undefined && (series || null) !== product.series) simpleChanges.push('series')
  if (pubDate !== undefined && pubDate?.toJSON() !== product.publicationDate?.toJSON()) simpleChanges.push('publicationDate')
  if (audience !== undefined && (audience || null) !== product.audience) simpleChanges.push('audience')
  if (safetyNote !== undefined && (safetyNote || null) !== product.safetyNote) simpleChanges.push('safetyNote')
  if (coverUrl !== undefined && (coverUrl || null) !== product.coverUrl) simpleChanges.push('coverUrl')
  if (isFeatured !== undefined && isFeatured !== product.isFeatured) simpleChanges.push(`isFeatured → ${isFeatured}`)
  if (fixedPrice !== undefined && fixedPrice !== product.fixedPrice) simpleChanges.push(`fixedPrice → ${fixedPrice}`)
  if (simpleChanges.length > 0) {
    await audit(user.email, 'PRODUCT_UPDATE', 'Product', id, `${product.slug}: ${simpleChanges.join(', ')}`)
  }

  if (status && status !== product.status) {
    await audit(user.email, 'PRODUCT_STATUS', 'Product', id, `Status ${product.status} → ${status} (${product.slug})`)
  }

  if (stockAdjust && stockAdjust.length > 0) {
    for (const adj of stockAdjust) {
      const variant = await db.variant.findUnique({ where: { id: adj.variantId } })
      if (!variant || variant.productId !== id) continue
      const newStock = Math.max(0, variant.stock + adj.delta)
      await db.variant.update({ where: { id: variant.id }, data: { stock: newStock } })
      // PriceHistory keeps an old/new record (price unchanged) with the stock delta in reason.
      await db.priceHistory.create({
        data: {
          variantId: variant.id,
          market: 'EU',
          oldPriceMinor: variant.priceMinor,
          newPriceMinor: variant.priceMinor,
          reason: `STOCK_ADJUST ${variant.stock} → ${newStock}`,
          actorEmail: user.email,
        },
      })
      await audit(
        user.email,
        'STOCK_ADJUST',
        'Variant',
        variant.id,
        `Stock ${variant.stock} → ${newStock} (sku ${variant.sku}, delta ${adj.delta})`,
      )
    }
  }

  if (variantPrices && variantPrices.length > 0) {
    for (const change of variantPrices) {
      const variant = product.variants.find((v) => v.id === change.variantId)
      if (!variant || variant.priceMinor === change.priceMinor) continue
      await db.$transaction([
        db.variant.update({ where: { id: variant.id }, data: { priceMinor: change.priceMinor } }),
        db.priceHistory.create({
          data: {
            variantId: variant.id,
            market: 'EU',
            oldPriceMinor: variant.priceMinor,
            newPriceMinor: change.priceMinor,
            reason: product.fixedPrice ? 'PRICE_CHANGE (fixed-price market)' : 'PRICE_CHANGE',
            actorEmail: user.email,
          },
        }),
      ])
      await audit(
        user.email,
        'PRICE_CHANGE',
        'Variant',
        variant.id,
        `Price ${(variant.priceMinor / 100).toFixed(2)} → ${(change.priceMinor / 100).toFixed(2)} EUR (sku ${variant.sku})`,
      )
    }
  }

  if (translations) {
    for (const locale of ['en', 'fa'] as const) {
      const edit = translations[locale]
      if (!edit) continue
      const provided = [
        edit.title,
        edit.subtitle,
        edit.shortDescription,
        edit.longDescription,
        edit.seoTitle,
        edit.seoDesc,
      ].some((v) => v !== undefined)
      if (!provided) continue

      const existing = await db.productTranslation.findUnique({
        where: { productId_locale: { productId: id, locale } },
      })

      if (!existing) {
        // Task 27-f: create the missing locale row (books imported without FA used to stay
        // FA-less forever). A title is mandatory — the storefront renders card titles from
        // the locale row, and an empty-titled row would blank the card.
        if (!edit.title) {
          return apiError(
            400,
            'VALIDATION_ERROR',
            `${locale.toUpperCase()} translation does not exist yet — provide a ${locale.toUpperCase()} title to create it`,
          )
        }
        const created = await db.productTranslation.create({
          data: {
            productId: id,
            locale,
            title: edit.title,
            subtitle: edit.subtitle ?? null,
            shortDescription: edit.shortDescription ?? null,
            longDescription: edit.longDescription ?? null,
            seoTitle: edit.seoTitle ?? null,
            seoDesc: edit.seoDesc ?? null,
            publishedState: edit.title && edit.shortDescription ? 'READY' : 'INCOMPLETE',
          },
        })
        await audit(
          user.email,
          'CONTENT_EDIT',
          'ProductTranslation',
          created.id,
          `[${locale.toUpperCase()}] ${product.slug}: created translation ("${edit.title}")`,
        )
        continue
      }

      // Existing row — diff-driven update + publishedState recompute on every write.
      const next = {
        title: edit.title !== undefined ? edit.title : existing.title,
        subtitle: edit.subtitle !== undefined ? edit.subtitle : existing.subtitle,
        shortDescription: edit.shortDescription !== undefined ? edit.shortDescription : existing.shortDescription,
        longDescription: edit.longDescription !== undefined ? edit.longDescription : existing.longDescription,
        seoTitle: edit.seoTitle !== undefined ? edit.seoTitle : existing.seoTitle,
        seoDesc: edit.seoDesc !== undefined ? edit.seoDesc : existing.seoDesc,
      }
      const changes: string[] = []
      if (next.title !== existing.title) changes.push(`title "${existing.title}" → "${next.title}"`)
      if (next.subtitle !== existing.subtitle) changes.push('subtitle')
      if (next.shortDescription !== existing.shortDescription) changes.push('shortDescription')
      if (next.longDescription !== existing.longDescription) changes.push('longDescription')
      if (next.seoTitle !== existing.seoTitle) changes.push('seoTitle')
      if (next.seoDesc !== existing.seoDesc) changes.push('seoDesc')
      if (changes.length === 0) continue
      await db.productTranslation.update({
        where: { id: existing.id },
        data: {
          ...next,
          publishedState: next.title && next.shortDescription ? 'READY' : 'INCOMPLETE',
        },
      })
      await audit(user.email, 'CONTENT_EDIT', 'ProductTranslation', existing.id, `[${locale.toUpperCase()}] ${product.slug}: ${changes.join(', ')}`)
    }
  }

  // ── Variants: create (no id) or update (id present) ──
  if (variants && variants.length > 0) {
    const byId = new Map(product.variants.map((v) => [v.id, v]))
    let nextSort = product.variants.reduce((m, v) => Math.max(m, v.sortOrder), -1) + 1
    for (const row of variants) {
      const sku = row.sku.trim().toUpperCase()
      const nextPriceMinor = row.priceMinor
      const nextStock = row.stock
      const data = {
        ...(row.format !== undefined ? { format: row.format } : {}),
        ...(row.bookLanguage !== undefined ? { bookLanguage: row.bookLanguage || 'English' } : {}),
        ...(nextPriceMinor !== undefined ? { priceMinor: nextPriceMinor } : {}),
        ...(nextStock !== undefined ? { stock: nextStock } : {}),
        ...(row.isbn13 !== undefined ? { isbn13: row.isbn13 || null } : {}),
        ...(row.editionLabel !== undefined ? { editionLabel: row.editionLabel || null } : {}),
        ...(row.pageCount !== undefined ? { pageCount: row.pageCount } : {}),
        ...(row.widthMm !== undefined ? { widthMm: row.widthMm } : {}),
        ...(row.heightMm !== undefined ? { heightMm: row.heightMm } : {}),
        ...(row.depthMm !== undefined ? { depthMm: row.depthMm } : {}),
        ...(row.weightG !== undefined ? { weightG: row.weightG } : {}),
        ...(row.countryOfPrinting !== undefined ? { countryOfPrinting: row.countryOfPrinting || null } : {}),
        ...(row.isActive !== undefined ? { isActive: row.isActive } : {}),
      }

      if (!row.id) {
        const created = await db.variant.create({
          data: {
            productId: id,
            sku,
            format: row.format,
            priceMinor: row.priceMinor,
            bookLanguage: row.bookLanguage || 'English',
            stock: row.stock ?? 0,
            isbn13: row.isbn13 || null,
            editionLabel: row.editionLabel || null,
            pageCount: row.pageCount ?? null,
            widthMm: row.widthMm ?? null,
            heightMm: row.heightMm ?? null,
            depthMm: row.depthMm ?? null,
            weightG: row.weightG ?? null,
            countryOfPrinting: row.countryOfPrinting || null,
            isActive: row.isActive ?? true,
            sortOrder: nextSort++,
          },
        })
        await audit(
          user.email,
          'VARIANT_CREATE',
          'Variant',
          created.id,
          `Created variant ${created.sku} (${created.format}, ${(created.priceMinor / 100).toFixed(2)} EUR, stock ${created.stock})`,
        )
        continue
      }

      const variant = byId.get(row.id)
      if (!variant || variant.productId !== id) {
        return apiError(400, 'VALIDATION_ERROR', `Variant ${row.id} does not belong to this product`)
      }
      const changes: string[] = []
      if (sku !== variant.sku) changes.push(`sku ${variant.sku} → ${sku}`)
      const current = variant as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(data)) {
        if (key === 'priceMinor' || key === 'stock') continue // price/stock get their own summaries below
        if (value !== current[key]) changes.push(key)
      }
      if (nextPriceMinor !== undefined && nextPriceMinor !== variant.priceMinor) {
        await db.priceHistory.create({
          data: {
            variantId: variant.id,
            market: 'EU',
            oldPriceMinor: variant.priceMinor,
            newPriceMinor: nextPriceMinor,
            reason: product.fixedPrice ? 'PRICE_CHANGE (fixed-price market)' : 'PRICE_CHANGE',
            actorEmail: user.email,
          },
        })
        changes.push(`price ${(variant.priceMinor / 100).toFixed(2)} → ${(nextPriceMinor / 100).toFixed(2)} EUR`)
      }
      if (nextStock !== undefined && nextStock !== variant.stock) {
        await db.priceHistory.create({
          data: {
            variantId: variant.id,
            market: 'EU',
            oldPriceMinor: variant.priceMinor,
            newPriceMinor: variant.priceMinor,
            reason: `STOCK_ADJUST ${variant.stock} → ${nextStock}`,
            actorEmail: user.email,
          },
        })
        changes.push(`stock ${variant.stock} → ${nextStock}`)
      }
      if (changes.length === 0) continue
      await db.variant.update({ where: { id: variant.id }, data: { ...data, sku } })
      await audit(user.email, 'VARIANT_UPDATE', 'Variant', variant.id, `${variant.sku}: ${changes.join(', ')}`)
    }
  }

  // ── Full-set replacements (categories / contributors / media / related) ──
  const setSummaries: string[] = []

  if (categories !== undefined) {
    const current = await db.productCategory.findMany({
      where: { productId: id },
      include: { category: { select: { slug: true } } },
    })
    const currentKey = current
      .map((pc) => `${pc.category.slug}${pc.isPrimary ? '*' : ''}`)
      .sort()
      .join('|')
    const nextKey = categoryRows
      .map((c, i) => `${c.slug}${i === 0 ? '*' : ''}`)
      .sort()
      .join('|')
    if (currentKey !== nextKey) {
      await db.$transaction(async (tx) => {
        await tx.productCategory.deleteMany({ where: { productId: id } })
        if (categoryRows.length > 0) {
          await tx.productCategory.createMany({
            data: categoryRows.map((c, i) => ({ productId: id, categoryId: c.id, isPrimary: i === 0 })),
          })
        }
      })
      setSummaries.push(`categories → ${categoryRows.map((c, i) => `${c.slug}${i === 0 ? ' (primary)' : ''}`).join(', ') || 'none'}`)
    }
  }

  if (contributors !== undefined) {
    const current = await db.productContributor.findMany({
      where: { productId: id },
      orderBy: [{ displayOrder: 'asc' }],
    })
    const currentKey = current.map((c) => `${c.personId}:${c.role}:${c.displayOrder}`).join('|')
    const nextKey = contributorRows.map((c) => `${c.personId}:${c.role}:${c.displayOrder}`).join('|')
    if (currentKey !== nextKey) {
      await db.$transaction(async (tx) => {
        await tx.productContributor.deleteMany({ where: { productId: id } })
        if (contributorRows.length > 0) {
          await tx.productContributor.createMany({ data: contributorRows.map((c) => ({ productId: id, ...c })) })
        }
      })
      setSummaries.push(`contributors → ${contributorRows.length} row(s)`)
    }
  }

  if (media !== undefined) {
    const current = await db.productMedia.findMany({ where: { productId: id }, orderBy: { sortOrder: 'asc' } })
    const currentKey = current.map((m) => `${m.url}|${m.altEn ?? ''}|${m.altFa ?? ''}`).join('|')
    const nextKey = media.map((m) => `${m.url}|${m.altEn ?? ''}|${m.altFa ?? ''}`).join('|')
    if (currentKey !== nextKey) {
      await db.$transaction(async (tx) => {
        await tx.productMedia.deleteMany({ where: { productId: id } })
        if (media.length > 0) {
          await tx.productMedia.createMany({
            data: media.map((m, i) => ({
              productId: id,
              url: m.url,
              mediaType: 'IMAGE',
              altEn: m.altEn || null,
              altFa: m.altFa || null,
              sortOrder: i,
            })),
          })
        }
      })
      setSummaries.push(`media → ${media.length} row(s)`)
    }
    // Gallery sync: first media row becomes the cover unless an explicit coverUrl rode along.
    if (coverUrl === undefined && media.length > 0 && (product.coverUrl ?? null) !== media[0].url) {
      await db.product.update({ where: { id }, data: { coverUrl: media[0].url } })
      setSummaries.push(`coverUrl synced → ${media[0].url}`)
    }
  }

  if (relatedIds !== undefined) {
    const current = await db.relatedProduct.findMany({ where: { productId: id }, orderBy: { sortOrder: 'asc' } })
    const currentKey = current.map((r) => r.relatedProductId).join('|')
    const nextKey = relatedRows.join('|')
    if (currentKey !== nextKey) {
      await db.$transaction(async (tx) => {
        await tx.relatedProduct.deleteMany({ where: { productId: id } })
        if (relatedRows.length > 0) {
          await tx.relatedProduct.createMany({
            data: relatedRows.map((rid, i) => ({ productId: id, relatedProductId: rid, sortOrder: i })),
          })
        }
      })
      setSummaries.push(`related → ${relatedRows.length} product(s)`)
    }
  }

  for (const summary of setSummaries) {
    const action = summary.startsWith('categories')
      ? 'CATEGORY_SET'
      : summary.startsWith('media')
        ? 'MEDIA_SET'
        : summary.startsWith('related')
          ? 'RELATED_SET'
          : 'PRODUCT_UPDATE'
    await audit(user.email, action, 'Product', id, `${product.slug}: ${summary}`)
  }

  const fresh = await db.product.findUnique({ where: { id } })
  return json({ product: fresh ?? updated })
}

/** DELETE — permanently remove a DRAFT/ARCHIVED product and all of its rows.
 *  Referential guards first: published/scheduled titles must be archived before
 *  deletion, and any product with order history can never be hard-deleted
 *  (OrderItem.variant is nulled on cascade — we refuse up front instead).
 *  Everything else (translations, variants, media, contributors, categories,
 *  related links, reviews, cart items, wishlist rows, back-in-stock subscribers)
 *  goes away through schema cascades in one transaction. Stale promotion
 *  exclusion ids (a JSON column, no FK) are scrubbed in the same tx. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true, sku: true } } },
  })
  if (!product) return apiError(404, 'NOT_FOUND', 'Product not found')

  if (product.status === 'PUBLISHED' || product.status === 'SCHEDULED') {
    return apiError(
      409,
      'CONFLICT',
      `“${product.slug}” is ${product.status.toLowerCase()} — unpublish/archive it before deleting.`,
    )
  }

  // Order history guard: any order line pointing at this product's variants
  // makes the product part of the shop's books — archive instead.
  const variantIds = product.variants.map((v) => v.id)
  const orderLines =
    variantIds.length > 0
      ? await db.orderItem.count({ where: { variantId: { in: variantIds } } })
      : 0
  if (orderLines > 0) {
    return apiError(
      409,
      'CONFLICT',
      `“${product.slug}” has ${orderLines} order line(s) on record — it cannot be deleted. Archive it instead.`,
    )
  }

  await db.$transaction(async (tx) => {
    await tx.product.delete({ where: { id } })
    // Promotion.excludedProductIds is a JSON column — prune the dead id so the
    // admin exclusions dialog never shows a ghost row.
    const promos = await tx.promotion.findMany({
      where: { excludedProductIds: { contains: id } },
      select: { id: true, excludedProductIds: true },
    })
    for (const promo of promos) {
      const ids = parseJsonSafe<string[]>(promo.excludedProductIds, [])
      if (ids.includes(id)) {
        await tx.promotion.update({
          where: { id: promo.id },
          data: { excludedProductIds: JSON.stringify(ids.filter((x) => x !== id)) },
        })
      }
    }
  })

  await audit(
    user.email,
    'PRODUCT_DELETE',
    'Product',
    id,
    `Deleted ${product.status.toLowerCase()} “${product.slug}” (1 product, ${variantIds.length} variant(s), ${orderLines} order lines)`,
  )
  return json({ deleted: true, slug: product.slug })
}
