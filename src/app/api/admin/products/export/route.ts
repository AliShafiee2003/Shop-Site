// GET /api/admin/products/export — FULL catalog export (admin-only, Task 49-7).
// API-405 (audit v4): DELIBERATELY left unpaginated — this is a true one-shot
// CSV download (Content-Disposition attachment) whose contract is "every
// product, every variant, both locales" so the sheet can round-trip through the
// importer; slicing it would silently produce incomplete exports. The audit
// therefore accepts the full-catalog read here: admin-only, audited
// (PRODUCT_EXPORT row below), and the bounded daily-report alternative lives at
// /api/admin/reports/export. Revisit only if exports start timing out.
// One row per VARIANT with every field: product meta, BOTH locale translations
// (subtitle / short & long description — the raw stored markdown/blocks JSON —
// and SEO), full variant specs, categories, contributors (role:slug), gallery
// media and related slugs. The first 11 columns keep the legacy import header
// order, so the simple import flow still accepts the sheet; the full fidelity
// columns after them are extra (import ignores unknown headers by name).
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, csvCell } from '@/lib/server/utils'

export async function GET() {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const products = await db.product.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      translations: true,
      variants: { orderBy: [{ isActive: 'desc' }, { priceMinor: 'asc' }] },
      categories: { include: { category: { select: { slug: true } } }, orderBy: { isPrimary: 'desc' } },
      contributors: {
        include: { person: { select: { slug: true } } },
        orderBy: { displayOrder: 'asc' },
      },
      media: { orderBy: { sortOrder: 'asc' } },
      related: { include: { relatedProduct: { select: { slug: true } } }, orderBy: { sortOrder: 'asc' } },
    },
  })

  const header = [
    // ── legacy import columns (unchanged names/order) ──
    'slug', 'title_en', 'title_fa', 'price_eur', 'stock', 'sku',
    'format', 'status', 'category', 'cover_url', 'authors',
    // ── full fidelity (Task 49-7) ──
    'product_id', 'publisher', 'series', 'publication_date', 'audience', 'safety_note',
    'fixed_price', 'is_featured', 'created_at', 'updated_at',
    'subtitle_en', 'short_description_en', 'long_description_en', 'seo_title_en', 'seo_desc_en',
    'subtitle_fa', 'short_description_fa', 'long_description_fa', 'seo_title_fa', 'seo_desc_fa',
    'variant_id', 'isbn13', 'isbn10', 'barcode', 'book_language', 'edition_label',
    'page_count', 'width_mm', 'height_mm', 'depth_mm', 'weight_g', 'country_of_printing',
    'currency', 'low_stock_threshold', 'sold_count', 'is_active',
    'categories_all', 'contributors_all', 'media_all', 'related_slugs',
  ]
  const lines = [header.join(',')]
  let rows = 0

  for (const p of products) {
    const en = p.translations.find((t) => t.locale === 'en')
    const fa = p.translations.find((t) => t.locale === 'fa')
    const primary = p.categories.find((pc) => pc.isPrimary) ?? p.categories[0]
    const catsAll = p.categories.map((pc) => pc.category.slug).join('; ')
    const contribAll = p.contributors.map((c) => `${c.role}:${c.person.slug}`).join('; ')
    const mediaAll = p.media.map((m) => [m.url, m.altEn ?? '', m.altFa ?? ''].join('|')).join('; ')
    const relatedSlugs = p.related.map((r) => r.relatedProduct.slug).join('; ')
    const common = [
      p.slug,
      en?.title ?? '',
      fa?.title ?? '',
      p.status,
      primary?.category.slug ?? '',
      p.coverUrl ?? '',
      p.contributors.filter((c) => c.role === 'AUTHOR').map((c) => c.person.slug).join('; '),
      p.id,
      p.publisher ?? '',
      p.series ?? '',
      p.publicationDate ? p.publicationDate.toISOString().slice(0, 10) : '',
      p.audience ?? '',
      p.safetyNote ?? '',
      p.fixedPrice ? '1' : '0',
      p.isFeatured ? '1' : '0',
      p.createdAt.toISOString(),
      p.updatedAt.toISOString(),
      en?.subtitle ?? '',
      en?.shortDescription ?? '',
      en?.longDescription ?? '', // raw stored markdown/blocks JSON — complete fidelity
      en?.seoTitle ?? '',
      en?.seoDesc ?? '',
      fa?.subtitle ?? '',
      fa?.shortDescription ?? '',
      fa?.longDescription ?? '',
      fa?.seoTitle ?? '',
      fa?.seoDesc ?? '',
      catsAll,
      contribAll,
      mediaAll,
      relatedSlugs,
    ]

    if (p.variants.length === 0) {
      // slug/title_en/title_fa + empty price/stock/sku/format + product-level block + 16 empty variant cells
      lines.push([...common.slice(0, 3), '', '', '', '', ...common.slice(3), ...Array<string>(16).fill('')].map(csvCell).join(','))
      rows++
      continue
    }
    for (const v of p.variants) {
      lines.push(
        [
          p.slug,
          en?.title ?? '',
          fa?.title ?? '',
          v.isActive ? (v.priceMinor / 100).toFixed(2) : '',
          String(v.stock),
          v.sku,
          v.format,
          ...common.slice(3), // status … related_slugs (product-level block)
          v.id,
          v.isbn13 ?? '',
          v.isbn10 ?? '',
          v.barcode ?? '',
          v.bookLanguage ?? '',
          v.editionLabel ?? '',
          v.pageCount != null ? String(v.pageCount) : '',
          v.widthMm != null ? String(v.widthMm) : '',
          v.heightMm != null ? String(v.heightMm) : '',
          v.depthMm != null ? String(v.depthMm) : '',
          v.weightG != null ? String(v.weightG) : '',
          v.countryOfPrinting ?? '',
          v.currency ?? 'EUR',
          String(v.lowStockThreshold),
          String(v.soldCount),
          v.isActive ? '1' : '0',
        ].map(csvCell).join(','),
      )
      rows++
    }
  }

  await audit(
    user.email,
    'PRODUCT_EXPORT',
    'Product',
    'bulk',
    `Exported ${products.length} product(s) (${rows} variant rows) to full CSV`,
  )

  const stamp = new Date().toISOString().slice(0, 10)
  return new Response('\uFEFF' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="persepix-products-full-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
