// Server-side legal document loader — the SAME query shape + serialization as
// GET /api/legal/[type] (that route stays untouched), exposed for the RSC
// catch-all's SSR prefetch: SEO-402 — /legal/:type is indexable, so its HTML
// must carry the document title + body on FIRST paint instead of a client-fetch
// spinner.
import { db } from '@/lib/db'

const VALID_TYPES = ['PRIVACY', 'TERMS', 'WITHDRAWAL', 'IMPRINT', 'ACCESSIBILITY', 'COOKIES']

/** Wire format of /api/legal/[type] — the view consumes either the API
 *  response or this prefetch interchangeably. */
export type LegalDocDTO = {
  type: string
  title: string
  body: string
  version: string
  effectiveAt: string
  locale: string
}

/** Current legal document for a type + locale, with the API's EN fallback.
 *  Returns null for an unknown type or when no current document exists
 *  (the caller turns null into a REAL 404). */
export async function getLegalDocument(rawType: string, locale: 'en' | 'fa'): Promise<LegalDocDTO | null> {
  const type = String(rawType ?? '').toUpperCase()
  if (!VALID_TYPES.includes(type)) return null

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

  if (!doc) return null

  return {
    type: doc.type,
    title: doc.title,
    body: doc.body,
    version: doc.version,
    effectiveAt: doc.effectiveAt.toISOString(),
    locale: doc.locale,
  }
}
