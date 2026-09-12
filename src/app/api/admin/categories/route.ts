// GET  /api/admin/categories — list categories with EN/FA translations + product counts.
// POST /api/admin/categories — create a category (audited). Slug is auto-generated
// from the English name; uniqueness is enforced with a numeric suffix fallback.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, audit, json, zodMessage } from '@/lib/server/utils'

const createSchema = z.object({
  nameEn: z.string().min(2).max(60),
  nameFa: z.string().max(60).optional().nullable(),
  descriptionEn: z.string().max(300).optional().nullable(),
  descriptionFa: z.string().max(300).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  iconUrl: z.string().max(300).optional().nullable(),
  color: z.string().max(9).optional().nullable(),
})

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'category'
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      translations: true,
      _count: { select: { products: true } },
    },
  })

  return json({
    categories: rows.map((c) => {
      const en = c.translations.find((t) => t.locale === 'en')
      const fa = c.translations.find((t) => t.locale === 'fa')
      return {
        id: c.id,
        slug: c.slug,
        icon: c.icon,
        iconUrl: c.iconUrl,
        color: c.color,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        nameEn: en?.name ?? null,
        nameFa: fa?.name ?? null,
        descriptionEn: en?.description ?? null,
        descriptionFa: fa?.description ?? null,
        productCount: c._count.products,
      }
    }),
  })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
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

  // Unique slug with numeric fallback
  let slug = slugify(d.nameEn)
  for (let i = 2; await db.category.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(d.nameEn)}-${i}`
  }

  const maxOrder = await db.category.aggregate({ _max: { sortOrder: true } })

  const created = await db.category.create({
    data: {
      slug,
      icon: d.icon ?? null,
      iconUrl: d.iconUrl ?? null,
      color: d.color ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      isActive: true,
      translations: {
        create: [
          { locale: 'en', name: d.nameEn.trim(), description: d.descriptionEn ?? null },
          ...(d.nameFa ? [{ locale: 'fa' as const, name: d.nameFa.trim(), description: d.descriptionFa ?? null }] : []),
        ],
      },
    },
    include: { translations: true },
  })

  await audit(user.email, 'CATEGORY_CREATE', 'Category', created.id, `Created category "${d.nameEn.trim()}" (${slug})`)
  return json({ category: created }, 201)
}
