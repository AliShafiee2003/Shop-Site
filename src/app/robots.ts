import type { MetadataRoute } from 'next'
import { siteUrlFrom } from '@/lib/site'
import { headers } from 'next/headers'

// Dynamic robots.txt — the static public/robots.txt carried a RELATIVE
// `Sitemap: /sitemap.xml` value, which the spec requires to be absolute.
export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers()
  const base = siteUrlFrom({ headers: hdrs })
  return {
    rules: [
      { userAgent: 'Googlebot', allow: '/' },
      { userAgent: 'Bingbot', allow: '/' },
      { userAgent: 'Twitterbot', allow: '/' },
      { userAgent: 'facebookexternalhit', allow: '/' },
      // AI-assisted search crawlers (PRD §20.5 — documented configuration decision)
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/admin', '/api/account', '/search', '/account', '/admin', '/checkout', '/cart'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
