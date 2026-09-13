import type { MetadataRoute } from 'next'
import { siteUrlFrom } from '@/lib/site'
import { headers } from 'next/headers'

// Dynamic robots.txt — the static public/robots.txt carried a RELATIVE
// `Sitemap: /sitemap.xml` value, which the spec requires to be absolute.
export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers()
  const base = siteUrlFrom({ headers: hdrs })
  // Audit SEO-002: a specific UA group REPLACES the '*' group for that bot
  // ("most specific group wins"), so every named group needs the SAME
  // disallow list — otherwise Googlebot/GPTBot & co. could crawl /admin,
  // /checkout, /api/admin, etc. despite the '*' policy.
  const privatePaths = ['/api/admin', '/api/account', '/search', '/account', '/admin', '/checkout', '/cart']
  const namedAgents = [
    'Googlebot', 'Bingbot', 'Twitterbot', 'facebookexternalhit',
    // AI-assisted search crawlers (PRD §20.5 — documented configuration decision)
    'GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended',
  ]
  return {
    rules: [
      ...namedAgents.map((userAgent) => ({ userAgent, allow: '/', disallow: privatePaths })),
      {
        userAgent: '*',
        allow: '/',
        disallow: privatePaths,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
