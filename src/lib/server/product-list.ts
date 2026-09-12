// Shared storefront product-listing query — used by GET /api/products AND the
// RSC catch-all page (C3: server-rendered first page of the catalog).
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fetchCards, sortCards, type ProductSort } from '@/lib/server/catalog'
import { getActivePromotion } from '@/lib/server/promotions'
import { toMinor } from '@/lib/server/money'
import { normalizeLocale, parsePage, parseIntParam } from '@/lib/server/utils'

const SORTS: ProductSort[] = ['featured', 'newest', 'bestselling', 'price-asc', 'price-desc']

/** Comma-separated multi-filter values, e.g. category=fiction,poetry. */
function splitList(raw: string | null): string[] {
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 16) : []
}

export type StorefrontProductPage = {
  items: Awaited<ReturnType<typeof fetchCards>>
  total: number
  page: number
  pageSize: number
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
  // effective, promotion-adjusted price — user requirement), NOT the raw list
  // price. Because sale prices are decoration applied per-card AFTER the DB
  // query, the range check runs on the fetched cards below, not in SQL.
  const minPriceRaw = Number.parseFloat(searchParams.get('minPrice') ?? '')
  const maxPriceRaw = Number.parseFloat(searchParams.get('maxPrice') ?? '')
  const hasPriceFilter = Number.isFinite(minPriceRaw) || Number.isFinite(maxPriceRaw)
  const minPriceMinor = Number.isFinite(minPriceRaw) ? toMinor(minPriceRaw) : null
  const maxPriceMinor = Number.isFinite(maxPriceRaw) ? toMinor(maxPriceRaw) : null

  const and: Prisma.ProductWhereInput[] = [{ status: 'PUBLISHED' }]

  // Direct slug list (favorites view) — bypasses pagination, preserves given order.
  if (slugsParam) {
    const slugs = slugsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 48)
    if (slugs.length === 0) return { items: [], total: 0, page: 1, pageSize }
    const cards = await fetchCards({ AND: [...and, { slug: { in: slugs } }] }, locale)
    const bySlug = new Map(cards.map((c) => [c.slug, c]))
    const ordered = slugs.map((s) => bySlug.get(s)).filter((c): c is NonNullable<typeof c> => Boolean(c))
    return { items: ordered, total: ordered.length, page: 1, pageSize }
  }

  if (q) {
    and.push({
      OR: [
        {
          translations: {
            some: {
              OR: [
                { title: { contains: q } },
                { subtitle: { contains: q } },
                { shortDescription: { contains: q } },
              ],
            },
          },
        },
        { variants: { some: { OR: [{ sku: { contains: q } }, { isbn13: { contains: q } }] } } },
        { contributors: { some: { person: { translations: { some: { name: { contains: q } } } } } } },
      ],
    })
  }
  if (categories.length > 0) {
    // Union semantics: a book matches when it belongs to ANY selected category.
    and.push({ OR: categories.map((c) => ({ categories: { some: { category: { slug: c, isActive: true } } } })) })
  }
  if (person) and.push({ contributors: { some: { person: { slug: person } } } })
  if (formats.length > 0) and.push({ variants: { some: { format: { in: formats }, isActive: true } } })
  if (languages.length > 0) and.push({ variants: { some: { bookLanguage: { in: languages }, isActive: true } } })
  if (publishers.length > 0) and.push({ publisher: { in: publishers } })
  if (series) and.push({ OR: [{ seriesSlug: series }, { series }] })

  // 'low' needs per-variant thresholds → start from in-stock set, post-filter below.
  if (availability === 'in' || availability === 'low') {
    and.push({ variants: { some: { isActive: true, stock: { gt: 0 } } } })
  } else if (availability === 'out') {
    and.push({ variants: { none: { isActive: true, stock: { gt: 0 } } } })
  }

  const cards = await fetchCards({ AND: and }, locale)
  let filtered = cards
  if (availability === 'low') filtered = cards.filter((c) => c.isLowStock)
  // Final-price range: card.priceMinor IS the effective (promo-adjusted) price
  // of the cheapest active variant — exactly what the PDP/card displays.
  if (hasPriceFilter) {
    filtered = filtered.filter((c) => {
      if (c.priceMinor == null) return false
      if (minPriceMinor != null && c.priceMinor < minPriceMinor) return false
      if (maxPriceMinor != null && c.priceMinor > maxPriceMinor) return false
      return true
    })
  }
  // "On sale" = the live promotion actually reduces this book's effective price
  // (cards carry listPriceMinor only while a promo discount is applied).
  if (saleOnly) filtered = filtered.filter((c) => c.listPriceMinor != null && c.priceMinor != null && c.priceMinor < c.listPriceMinor)
  if (flashHours != null) {
    const promo = await getActivePromotion()
    const endsMs = promo?.endsAt ? new Date(promo.endsAt).getTime() : NaN
    const inWindow = Number.isFinite(endsMs) && endsMs > Date.now() && endsMs - Date.now() <= flashHours * 3_600_000
    filtered = inWindow
      ? filtered.filter((c) => c.listPriceMinor != null && c.priceMinor != null && c.priceMinor < c.listPriceMinor)
      : []
  }
  if (fixedOnly) {
    const promo = await getActivePromotion()
    const excludedIds = promo?.excludedProductIds ?? []
    filtered = excludedIds.length > 0 ? filtered.filter((c) => excludedIds.includes(c.id)) : []
  }

  const sorted = sortCards(filtered, sort)
  const total = sorted.length
  const start = (page - 1) * pageSize

  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  }
}
