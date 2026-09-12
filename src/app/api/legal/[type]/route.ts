// GET /api/legal/[type]?locale= — current legal document for a type.
import { db } from '@/lib/db'
import { apiError, json, normalizeLocale } from '@/lib/server/utils'

const VALID_TYPES = ['PRIVACY', 'TERMS', 'WITHDRAWAL', 'IMPRINT', 'ACCESSIBILITY', 'COOKIES']

export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type: rawType } = await ctx.params
  const type = rawType.toUpperCase()
  if (!VALID_TYPES.includes(type)) return apiError(404, 'NOT_FOUND')

  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const doc =
    (await db.legalDocument.findFirst({
      where: { type, locale, isCurrent: true },
      orderBy: { effectiveAt: 'desc' },
    })) ??
    (locale !== 'en'
      ? await db.legalDocument.findFirst({
          where: { type, locale: 'en', isCurrent: true },
          orderBy: { effectiveAt: 'desc' },
        })
      : null)

  if (!doc) return apiError(404, 'NOT_FOUND')

  return json({
    type: doc.type,
    title: doc.title,
    body: doc.body,
    version: doc.version,
    effectiveAt: doc.effectiveAt.toISOString(),
    locale: doc.locale,
  })
}
