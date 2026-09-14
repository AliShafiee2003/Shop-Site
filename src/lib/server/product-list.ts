// Shared storefront product-listing query — used by GET /api/products AND the
// RSC catch-all page (C3: server-rendered first page of the catalog).
//
// DB-416 / user-audit PERF-001: filter + sort + price-range + skip/take now run
// IN SQL (SQLite) — the listing no longer fetches all published products with
// deep includes to filter/sort/slice in memory. Only the FINAL page of rows
// (≤ pageSize) is hydrated with card relations, so the wire contract is
// unchanged: { items, total, page, pageSize }.
//
// The effective (promotion-adjusted) price the customer sees is computed
// inside the query with the EXACT rules of promoPriceFor() (percent rounding,
// fixed-amount floor at 100 minor, fixedPrice/excluded exemptions) so the
// price-range filter and price sorts match what the cards display — without a
// denormalized column (schema is frozen for this fix). Row mapping still goes
// through toProductCard(), so card payloads are byte-identical.
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  productListCardInclude,
  toProductCard,
  type ProductCardDTO,
  type ProductSort,
} from '@/lib/server/catalog'
import { getActivePromotion, type ActivePromotion } from '@/lib/server/promotions'
import { toMinor } from '@/lib/server/money'
import { normalizeLocale, parsePage, parseIntParam } from '@/lib/server/utils'

const SORTS: ProductSort[] = ['featured', 'newest', 'bestselling', 'price-asc', 'price-desc']

/** Comma-separated multi-filter values, e.g. category=fiction,poetry. */
function splitList(raw: string | null): string[] {
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 16) : []
}

export type StorefrontProductPage = {
  items: ProductCardDTO[]
  total: number
  page: number
  pageSize: number
}

const EMPTY_PAGE = (pageSize: number): StorefrontProductPage => ({ items: [], total: 0, page: 1, pageSize })

/** Effective (promotion-adjusted) price expression over the inner row `x`.
 *  Mirrors promoPriceFor(): no promo / base ≤ 0 / fixedPrice (Buchpreisbindung)
 *  / excluded product → list price; else MIN(base, MAX(100, discount)).
 *  PERCENT uses round-half-up on the same double arithmetic as Math.round,
 *  FIXED subtracts; a "discount" that would not reduce the price collapses to
 *  the base (sale flag = effMinor < baseMinor, exactly like the card's
 *  listPriceMinor presence). */
function effectivePriceSql(promo: ActivePromotion | null): Prisma.Sql {
  const excludedCsv = promo && promo.excludedProductIds.length > 0 ? `,${promo.excludedProductIds.join(',')},` : ','
  const value = promo?.value ?? 0
  return Prisma.sql`CASE
    WHEN x."baseMinor" IS NULL THEN NULL
    WHEN ${promo ? 1 : 0} = 0 OR x."baseMinor" <= 0 OR x."fixedPrice" = 1
      OR instr(${excludedCsv}, ',' || x."id" || ',') > 0 THEN x."baseMinor"
    ELSE MIN(x."baseMinor", MAX(100, CASE WHEN ${promo?.type ?? ''} = 'PERCENT'
      THEN CAST(ROUND(x."baseMinor" * (100 - ${value}) / 100.0) AS INTEGER)
      ELSE x."baseMinor" - ${value} END))
  END`
}

/** ORDER BY mirroring sortCards() comparators, plus `rid` (rowid = insertion
 *  order) as the stable tiebreak the JS stable sort used to provide. */
function orderBySql(sort: ProductSort): Prisma.Sql {
  switch (sort) {
    case 'newest':
      // stamp = publishAt ?? createdAt ?? publicationDate; nulls FIRST, then desc.
      return Prisma.sql`(t."newStamp" IS NULL) DESC, t."newStamp" DESC, t."rid" ASC`
    case 'bestselling':
      return Prisma.sql`t."approvedCount" DESC, t."rid" ASC`
    case 'price-asc':
      return Prisma.sql`(t."effMinor" IS NULL) ASC, t."effMinor" ASC, t."rid" ASC`
    case 'price-desc':
      return Prisma.sql`(t."effMinor" IS NULL) ASC, t."effMinor" DESC, t."rid" ASC`
    case 'featured':
    default:
      // isFeatured desc, then publicationDate desc with nulls LAST.
      return Prisma.sql`t."isFeatured" DESC, (t."publicationDate" IS NULL) ASC, t."publicationDate" DESC, t."rid" ASC`
  }
}

type SqlFilters = {
  q: string | null
  categories: string[]
  person: string | null
  formats: string[]
  languages: string[]
  publishers: string[]
  series: string | null
  availability: string | null
  saleLike: boolean
  fixedOnly: boolean
  promo: ActivePromotion | null
}

/** Row-level WHERE fragments (Prisma findMany predicates translated 1:1). */
function rowFiltersSql(f: SqlFilters): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [Prisma.sql`p."status" = 'PUBLISHED'`]
  if (f.q) {
    // Same un-escaped LIKE '%q%' semantics Prisma `contains` generates.
    const needle = `%${f.q}%`
    filters.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM "ProductTranslation" pt
        WHERE pt."productId" = p."id"
          AND (pt."title" LIKE ${needle} OR pt."subtitle" LIKE ${needle} OR pt."shortDescription" LIKE ${needle}))
      OR EXISTS (SELECT 1 FROM "Variant" vq
        WHERE vq."productId" = p."id" AND (vq."sku" LIKE ${needle} OR vq."isbn13" LIKE ${needle}))
      OR EXISTS (SELECT 1 FROM "ProductContributor" pcq
        JOIN "Person" pq ON pq."id" = pcq."personId"
        JOIN "PersonTranslation" ptq ON ptq."personId" = pq."id"
        WHERE pcq."productId" = p."id" AND ptq."name" LIKE ${needle})
    )`)
  }
  if (f.categories.length > 0) {
    // Union semantics: a book matches when it belongs to ANY selected category.
    filters.push(Prisma.sql`(${Prisma.join(
      f.categories.map((c) => Prisma.sql`EXISTS (
        SELECT 1 FROM "ProductCategory" pc
        JOIN "Category" c ON c."id" = pc."categoryId"
        WHERE pc."productId" = p."id" AND c."slug" = ${c} AND c."isActive" = 1)`),
      ' OR ',
    )})`)
  }
  if (f.person) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProductContributor" pcp
      JOIN "Person" pp ON pp."id" = pcp."personId"
      WHERE pcp."productId" = p."id" AND pp."slug" = ${f.person})`)
  }
  if (f.formats.length > 0) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Variant" vf
      WHERE vf."productId" = p."id" AND vf."isActive" = 1 AND vf."format" IN (${Prisma.join(f.formats)}))`)
  }
  if (f.languages.length > 0) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Variant" vlg
      WHERE vlg."productId" = p."id" AND vlg."isActive" = 1 AND vlg."bookLanguage" IN (${Prisma.join(f.languages)}))`)
  }
  if (f.publishers.length > 0) {
    filters.push(Prisma.sql`p."publisher" IN (${Prisma.join(f.publishers)})`)
  }
  if (f.series) {
    filters.push(Prisma.sql`(p."seriesSlug" = ${f.series} OR p."series" = ${f.series})`)
  }
  if (f.availability === 'in' || f.availability === 'low') {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Variant" va
      WHERE va."productId" = p."id" AND va."isActive" = 1 AND va."stock" > 0)`)
  } else if (f.availability === 'out') {
    filters.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "Variant" vo
      WHERE vo."productId" = p."id" AND vo."isActive" = 1 AND vo."stock" > 0)`)
  }
  // 'low' ALSO needs the per-variant low-stock threshold (was a JS post-filter
  // on isLowStock): some active variant with 0 < stock ≤ lowStockThreshold.
  if (f.availability === 'low') {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Variant" vw
      WHERE vw."productId" = p."id" AND vw."isActive" = 1
        AND vw."stock" > 0 AND vw."stock" <= vw."lowStockThreshold")`)
  }
  return filters
}

/** Post-aggregate WHERE fragments (price range / on-sale / fixed-only), which
 *  must see the promotion-adjusted price and therefore sit above the row. */
function priceFiltersSql(f: SqlFilters, minPriceMinor: number | null, maxPriceMinor: number | null, hasPriceFilter: boolean): { fragments: Prisma.Sql[] } {
  const filters: Prisma.Sql[] = []
  const excludedCsv = f.promo && f.promo.excludedProductIds.length > 0 ? `,${f.promo.excludedProductIds.join(',')},` : ''
  if (hasPriceFilter) {
    // Card priceMinor == null was excluded by the in-memory filter.
    filters.push(Prisma.sql`t."effMinor" IS NOT NULL`)
    if (minPriceMinor != null) filters.push(Prisma.sql`t."effMinor" >= ${minPriceMinor}`)
    if (maxPriceMinor != null) filters.push(Prisma.sql`t."effMinor" <= ${maxPriceMinor}`)
  }
  // "On sale" = the live promotion actually reduces this book's effective
  // price (the card carries listPriceMinor only while that is true).
  if (f.saleLike) {
    filters.push(Prisma.sql`t."baseMinor" IS NOT NULL AND t."effMinor" < t."baseMinor"`)
  }
  if (f.fixedOnly) {
    // fixed=1 → only titles explicitly excluded from the live promotion.
    filters.push(Prisma.sql`instr(${excludedCsv}, ',' || t."id" || ',') > 0`)
  }
  return { fragments: filters }
}

function buildListSql(f: SqlFilters, minPriceMinor: number | null, maxPriceMinor: number | null, hasPriceFilter: boolean, sort: ProductSort, page: number, pageSize: number) {
  // Level 1: one row per product (correlated aggregates), row-level filters.
  const inner = Prisma.sql`
    SELECT x."id" AS "id", x."rid" AS "rid", x."isFeatured" AS "isFeatured", x."publicationDate" AS "publicationDate",
           x."newStamp" AS "newStamp", x."approvedCount" AS "approvedCount", x."baseMinor" AS "baseMinor",
           ${effectivePriceSql(f.promo)} AS "effMinor"
    FROM (
      SELECT p."id" AS "id", p."rowid" AS "rid", p."isFeatured" AS "isFeatured",
             p."publicationDate" AS "publicationDate", p."fixedPrice" AS "fixedPrice",
             COALESCE(p."publishAt", p."createdAt", p."publicationDate") AS "newStamp",
             (SELECT COUNT(*) FROM "Review" r
               WHERE r."productId" = p."id" AND r."moderationState" = 'APPROVED') AS "approvedCount",
             (SELECT MIN(v."priceMinor") FROM "Variant" v
               WHERE v."productId" = p."id" AND v."isActive" = 1) AS "baseMinor"
      FROM "Product" p
      WHERE ${Prisma.join(rowFiltersSql(f), ' AND ')}
    ) x`
  const where = priceFiltersSql(f, minPriceMinor, maxPriceMinor, hasPriceFilter)
  const outer = where.fragments.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(where.fragments, ' AND ')}`
  return {
    pageSql: Prisma.sql`SELECT t."id" FROM (${inner}) t ${outer} ORDER BY ${orderBySql(sort)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    countSql: Prisma.sql`SELECT COUNT(*) AS "n" FROM (${inner}) t ${outer}`,
  }
}

export async function queryStorefrontProducts(searchParams: URLSearchParams): Promise<StorefrontProductPage> {
  const locale = normalizeLocale(searchParams.get('locale'))
  const q = searchParams.get('q')?.trim() || null
  const categories = splitList(searchParams.get('category'))
  const person = searchParams.get('person')?.trim() || null
  const formats = splitList(searchParams.get('format'))
  const languages = splitList(searchParams.get('language'))
  const publishers = splitList(searchParams.get('publisher'))
  const availability = searchParams.get('availability')?.trim() || null
  const saleOnly = searchParams.get('sale') === '1'
  // "fixed" = titles explicitly excluded from the live promotion (they keep
  // their list price while everything else is discounted). Needs a live promo;
  // without one nothing is "fixed" and the result is intentionally empty.
  const fixedOnly = searchParams.get('fixed') === '1'
  // flashHours=N: homepage "Flash deals" module — like sale=1, but the live
  // promotion's deadline must sit within N hours from now, otherwise the
  // result is intentionally empty (the module hides itself via hideWhenEmpty).
  const flashHoursRaw = Number.parseFloat(searchParams.get('flashHours') ?? '')
  const flashHours = Number.isFinite(flashHoursRaw) && flashHoursRaw > 0 ? flashHoursRaw : null
  const slugsParam = searchParams.get('slugs')?.trim() || null
  const series = searchParams.get('series')?.trim() || null
  const sortParam = (searchParams.get('sort') ?? 'featured') as ProductSort
  const sort: ProductSort = SORTS.includes(sortParam) ? sortParam : 'featured'
  const page = parsePage(searchParams, 1)
  const pageSize = Math.min(48, Math.max(1, parseIntParam(searchParams.get('pageSize'), 12, 1, 48) ?? 12))

  // Price filter basis = the FINAL price the customer actually sees (i.e. the
  // effective, promotion-adjusted price — user requirement). The adjustment is
  // now computed in SQL with promoPriceFor()'s exact rules, so the range runs
  // server-side instead of as a per-card JS post-filter.
  const minPriceRaw = Number.parseFloat(searchParams.get('minPrice') ?? '')
  const maxPriceRaw = Number.parseFloat(searchParams.get('maxPrice') ?? '')
  const hasPriceFilter = Number.isFinite(minPriceRaw) || Number.isFinite(maxPriceRaw)
  const minPriceMinor = Number.isFinite(minPriceRaw) ? toMinor(minPriceRaw) : null
  const maxPriceMinor = Number.isFinite(maxPriceRaw) ? toMinor(maxPriceRaw) : null

  // The promotion shapes BOTH the effective price in SQL and the card mapping,
  // so it must be resolved before the query is built (single cheap read).
  const promo = await getActivePromotion()

  // Direct slug list (favorites / recently-viewed) — bypasses pagination,
  // preserves the given order.
  if (slugsParam) {
    const slugs = slugsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 48)
    if (slugs.length === 0) return { items: [], total: 0, page: 1, pageSize }
    const rows = await db.product.findMany({
      where: { status: 'PUBLISHED', slug: { in: slugs } },
      include: productListCardInclude,
    })
    const bySlug = new Map(rows.map((p) => [p.slug, toProductCard(p, locale, promo)]))
    const ordered = slugs.map((s) => bySlug.get(s)).filter((c): c is ProductCardDTO => Boolean(c))
    return { items: ordered, total: ordered.length, page: 1, pageSize }
  }

  // flashHours window is wall-clock knowledge — resolved in JS like before;
  // outside the window the module's result is intentionally empty.
  let saleLike = saleOnly
  if (flashHours != null) {
    const endsMs = promo?.endsAt ? new Date(promo.endsAt).getTime() : NaN
    const inWindow = Number.isFinite(endsMs) && endsMs > Date.now() && endsMs - Date.now() <= flashHours * 3_600_000
    if (!inWindow) return EMPTY_PAGE(pageSize)
    saleLike = true
  }
  if (fixedOnly && (promo?.excludedProductIds.length ?? 0) === 0) return EMPTY_PAGE(pageSize)

  const { pageSql, countSql } = buildListSql(
    { q, categories, person, formats, languages, publishers, series, availability, saleLike, fixedOnly, promo },
    minPriceMinor,
    maxPriceMinor,
    hasPriceFilter,
    sort,
    page,
    pageSize,
  )

  // Real SQL pagination: the page of ids + the exact filtered total, in
  // parallel; then ONE bounded hydration of just those rows (slim includes).
  const [idRows, countRows] = await Promise.all([
    db.$queryRaw<{ id: string }[]>(pageSql),
    db.$queryRaw<{ n: number | bigint }[]>(countSql),
  ])
  const total = Number(countRows[0]?.n ?? 0)
  const ids = idRows.map((r) => r.id)
  if (ids.length === 0) return { items: [], total, page, pageSize }

  const rows = await db.product.findMany({
    where: { status: 'PUBLISHED', id: { in: ids } },
    include: productListCardInclude,
  })
  const byId = new Map(rows.map((p) => [p.id, toProductCard(p, locale, promo)]))
  const items: ProductCardDTO[] = []
  for (const id of ids) {
    const card = byId.get(id)
    if (card) items.push(card)
  }
  return { items, total, page, pageSize }
}
