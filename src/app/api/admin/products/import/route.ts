// POST /api/admin/products/import — bulk-create products from CSV (admin-only).
// Body: { csv: string } — quoted-CSV, header row required:
//   slug,title_en,title_fa,price_eur,stock,sku,format,status,category,cover_url,authors
// Only slug / title_en / price_eur are mandatory; everything else is defaulted.
// `authors` is a semicolon-separated list of EXISTING person slugs — each slug
// links a ProductContributor (role AUTHOR) to the new product; an unknown slug
// skips the whole row so imports never invent ghost contributors.
// Valid rows still import when siblings fail — per-row problems are reported so
// one typo never blocks a whole catalog drop (each import is audited).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'
import { z } from 'zod'

/** Columns that MUST be present in the header — everything else defaults. */
const REQUIRED_HEADER = ['slug', 'title_en', 'price_eur'] as const

const rowSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  title_en: z.string().trim().min(1).max(300),
  title_fa: z.string().trim().max(300).optional(),
  price_eur: z.number().positive().max(10_000),
  stock: z.number().int().min(0).max(100_000).default(0),
  sku: z.string().trim().max(40).optional(),
  format: z.enum(['PAPERBACK', 'HARDCOVER', 'SPECIAL']).default('PAPERBACK'),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  category: z.string().trim().max(60).optional(),
  cover_url: z.string().trim().max(300).optional(),
  authors: z.string().trim().max(500).optional(),
})

type Row = z.infer<typeof rowSchema>

/** Minimal RFC-4180-ish CSV splitter: handles quoted cells, "" escapes, CRLF. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = input.replace(/^\uFEFF/, '') // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** kebab-case whatever was typed ("The Nightingale's Atlas" → the-nightingales-atlas). */
function toKebab(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: { csv?: unknown }
  try { body = await req.json() } catch { return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON') }
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (!csv.trim()) return apiError(400, 'VALIDATION_ERROR', 'csv is required')

  const parsed = parseCsv(csv)
  if (parsed.length < 2) return apiError(400, 'VALIDATION_ERROR', 'CSV needs a header row and at least one data row')

  const header = parsed[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const missing = REQUIRED_HEADER.filter((h) => !header.includes(h))
  if (missing.length > 0) {
    return apiError(400, 'VALIDATION_ERROR', `Missing column(s): ${missing.join(', ')}`)
  }
  const col = (name: string) => header.indexOf(name)

  // Load categories + existing slugs/SKUs/persons once for uniqueness & link checks.
  const [existingSlugs, existingSkus, categories, persons] = await Promise.all([
    db.product.findMany({ select: { slug: true } }),
    db.variant.findMany({ select: { sku: true } }),
    db.category.findMany({ select: { id: true, slug: true } }),
    db.person.findMany({ select: { id: true, slug: true } }),
  ])
  const takenSlugs = new Set(existingSlugs.map((p) => p.slug))
  const takenSkus = new Set(existingSkus.map((v) => v.sku))
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]))
  const personBySlug = new Map(persons.map((p) => [p.slug, p.id]))

  const valid: (Row & { authorSlugs: string[] })[] = []
  const skipped: { row: number; reason: string }[] = []

  parsed.slice(1).forEach((cells, idx) => {
    const rowNo = idx + 2 // 1-based, counting the header
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '')
    const priceRaw = get('price_eur').replace(',', '.').replace(/[^\d.]/g, '')
    const stockRaw = get('stock').replace(/[^\d-]/g, '')
    const candidate = {
      slug: toKebab(get('slug') || get('title_en')),
      title_en: get('title_en'),
      ...(get('title_fa') ? { title_fa: get('title_fa') } : {}),
      price_eur: Number(priceRaw),
      ...(stockRaw !== '' ? { stock: Number(stockRaw) } : {}),
      ...(get('sku') ? { sku: get('sku') } : {}),
      ...(get('format') ? { format: get('format').toUpperCase() } : {}),
      ...(get('status') ? { status: get('status').toUpperCase() } : {}),
      ...(get('category') ? { category: get('category').toLowerCase() } : {}),
      ...(get('cover_url') ? { cover_url: get('cover_url') } : {}),
      ...(get('authors') ? { authors: get('authors') } : {}),
    }
    const check = rowSchema.safeParse(candidate)
    if (!check.success) {
      skipped.push({ row: rowNo, reason: zodMessage(check.error) })
      return
    }
    if (takenSlugs.has(check.data.slug)) {
      skipped.push({ row: rowNo, reason: `duplicate slug “${check.data.slug}”` })
      return
    }
    // Authors: semicolon-separated (commas would break CSV cells).
    // Dedupe case-insensitively, keep first-seen order for displayOrder.
    const seen = new Set<string>()
    const authorSlugs = (check.data.authors ?? '')
      .split(';')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== '' && !seen.has(s) && (seen.add(s), true))
    const unknown = authorSlugs.filter((s) => !personBySlug.has(s))
    if (unknown.length > 0) {
      skipped.push({ row: rowNo, reason: `unknown author slug “${unknown[0]}”` })
      return
    }
    takenSlugs.add(check.data.slug)
    valid.push({ ...check.data, authorSlugs })
  })

  // Create everything in one transaction; SKUs are generated per row when absent.
  const created: { id: string; slug: string; title: string }[] = []
  if (valid.length > 0) {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i]
        let sku = r.sku
        if (!sku || takenSkus.has(sku)) {
          const base = 'SP-' + r.slug.toUpperCase().replace(/-/g, '').slice(0, 10)
          sku = base
          for (let n = 2; takenSkus.has(sku); n++) sku = `${base}-${n}`
        }
        takenSkus.add(sku)
        const categoryId = r.category ? categoryBySlug.get(r.category) : undefined
        const product = await tx.product.create({
          data: {
            slug: r.slug,
            status: r.status,
            coverUrl: r.cover_url || null,
            translations: {
              create: [
                { locale: 'en', title: r.title_en, publishedState: 'READY' },
                ...(r.title_fa ? [{ locale: 'fa', title: r.title_fa, publishedState: 'READY' }] : []),
              ],
            },
            variants: {
              create: {
                sku,
                format: r.format,
                priceMinor: Math.round(r.price_eur * 100),
                stock: r.stock,
              },
            },
            ...(categoryId ? { categories: { create: { categoryId, isPrimary: true } } } : {}),
            ...(r.authorSlugs.length > 0
              ? {
                  contributors: {
                    create: r.authorSlugs.map((slug, i) => ({
                      personId: personBySlug.get(slug)!,
                      role: 'AUTHOR',
                      displayOrder: i,
                    })),
                  },
                }
              : {}),
          },
          select: { id: true, slug: true },
        })
        created.push({ id: product.id, slug: product.slug, title: r.title_en })
      }
    })
  }

  await audit(
    user.email,
    'PRODUCT_IMPORT',
    'Product',
    'bulk',
    `Imported ${created.length} product(s) from CSV${skipped.length > 0 ? `, ${skipped.length} row(s) skipped` : ''}` +
      (created.length > 0 ? ` — ${created.slice(0, 5).map((c) => c.slug).join(', ')}${created.length > 5 ? '…' : ''}` : ''),
  )
  return json({ created, skipped })
}
