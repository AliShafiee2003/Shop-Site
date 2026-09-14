// GET  /api/admin/people?page=&pageSize= — list contributors with EN/FA translations + book counts.
// POST /api/admin/people — create a contributor (audited, slug auto-generated).
// API-405 (audit v4): bounded list — shared parseListQuery (default 50, hard cap
// 100); `total`/`page`/`pageSize` added, the `people` key is unchanged. NOTE: the
// admin product/discount/article editors also use this endpoint as a picker —
// with >100 contributors the picker sees only the newest 100 (X-Total-Count
// exposes the overflow for a future paginated picker).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContentAdmin } from '@/lib/server/auth'
import { apiError, audit, json, jsonWithTotal, parseListQuery, zodMessage } from '@/lib/server/utils'
import { slugify } from '@/app/api/admin/categories/route'

const createSchema = z.object({
  nameEn: z.string().min(2).max(80),
  nameFa: z.string().max(80).optional().nullable(),
  shortBioEn: z.string().max(600).optional().nullable(),
  shortBioFa: z.string().max(600).optional().nullable(),
  profession: z.string().max(80).optional().nullable(),
})

export async function GET(req: Request) {
  const user = await requireContentAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const { page, pageSize, skip, take } = parseListQuery(new URL(req.url).searchParams)
  const [rows, total] = await Promise.all([
    db.person.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        translations: true,
        _count: { select: { contributions: true } },
      },
      skip,
      take,
    }),
    db.person.count(),
  ])

  return jsonWithTotal(
    {
      total,
      page,
      pageSize,
      people: rows.map((p) => {
        const en = p.translations.find((t) => t.locale === 'en')
        const fa = p.translations.find((t) => t.locale === 'fa')
        return {
          id: p.id,
          slug: p.slug,
          status: p.status,
          portraitUrl: p.portraitUrl,
          nationality: p.nationality,
          profession: p.profession,
          nameEn: en?.name ?? null,
          nameFa: fa?.name ?? null,
          shortBioEn: en?.shortBio ?? null,
          shortBioFa: fa?.shortBio ?? null,
          bookCount: p._count.contributions,
        }
      }),
    },
    total,
  )
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

  let slug = slugify(d.nameEn)
  for (let i = 2; await db.person.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(d.nameEn)}-${i}`
  }

  const created = await db.person.create({
    data: {
      slug,
      status: 'PUBLISHED',
      profession: d.profession ?? null,
      translations: {
        create: [
          { locale: 'en', name: d.nameEn.trim(), shortBio: d.shortBioEn ?? null },
          ...(d.nameFa ? [{ locale: 'fa' as const, name: d.nameFa.trim(), shortBio: d.shortBioFa ?? null }] : []),
        ],
      },
    },
  })

  await audit(user.email, 'PERSON_CREATE', 'Person', created.id, `Created contributor "${d.nameEn.trim()}" (${slug})`)
  return json({ person: created }, 201)
}
