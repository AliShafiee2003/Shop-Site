// Shared contract for the admin journal endpoints (articles) — kept out of the
// route files because Next.js route modules may only export HTTP handlers.
// Body format: the editor sends MARKDOWN; the DB stores blocks JSON
// (textToBlocks) — the exact same contract as the product long-description and
// the storefront <ProseBlocks/> renderer.
import { z } from 'zod'
import { textToBlocks, blocksToText } from '@/lib/markdown'

const translationSchema = z.object({
  title: z.string().max(300).optional().nullable(),
  excerpt: z.string().max(2000).optional().nullable(),
  // Markdown source from the editor — server converts to blocks JSON.
  bodyMd: z.string().max(120_000).optional().nullable(),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDesc: z.string().max(500).optional().nullable(),
})

export const articleSchema = z.object({
  slug: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-with-dashes').optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  heroUrl: z.string().max(300).nullable().optional(),
  byline: z.string().max(200).nullable().optional(),
  isFeatured: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(), // ISO string or null (= now when first PUBLISHED)
  en: translationSchema.optional(),
  fa: translationSchema.optional(),
  categoryIds: z.array(z.string()).max(24).optional(),
  productIds: z.array(z.string()).max(40).optional(),
  personIds: z.array(z.string()).max(40).optional(),
})

export type ArticlePayload = z.infer<typeof articleSchema>

/** blocks payload for a locale — the editor sends markdown; DB stores blocks JSON.
 *  Null clears the body; undefined leaves it untouched. */
export function bodyPayload(bodyMd: string | null | undefined): string | null | undefined {
  if (bodyMd === undefined) return undefined
  if (bodyMd === null) return null
  if (!bodyMd.trim()) return null
  return JSON.stringify(textToBlocks(bodyMd))
}

/** Auto reading time from the blocks text (~190 wpm), min 1 — mirrors the
 *  public card's «N دقیقه مطالعه / N min read» line. */
export function readingMinutesFrom(bodyMd: string | null | undefined): number | null {
  if (!bodyMd || !bodyMd.trim()) return null
  const words = blocksToText(JSON.stringify(textToBlocks(bodyMd))).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 190))
}
