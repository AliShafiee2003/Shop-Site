// GET /sitemap.xml — SEO sitemap per PRD §20.1/20.2 (products, articles, people,
// categories, static pages, both locales). The audit found the static pages
// (/about, /faq, …) missing — they are now included.
import { db } from '@/lib/db'
import { siteUrlFrom } from '@/lib/site'
import { headers } from 'next/headers'
import { listSeriesSlugs } from '@/lib/server/series'

export const dynamic = 'force-dynamic'

function urlEntry(loc: string, lastmod?: Date, changefreq = 'weekly', priority = '0.7'): string {
  const parts = ['<url>', `<loc>${loc}</loc>`]
  if (lastmod) parts.push(`<lastmod>${lastmod.toISOString()}</lastmod>`)
  parts.push(`<changefreq>${changefreq}</changefreq>`, `<priority>${priority}</priority>`, '</url>')
  return parts.join('')
}

export async function GET(req: Request) {
  const hdrs = new Headers()
  ;['x-forwarded-host', 'x-forwarded-proto', 'host'].forEach((h) => {
    const v = req.headers.get(h)
    if (v) hdrs.set(h, v)
  })
  const base = siteUrlFrom({ headers: hdrs })
  const now = new Date()

  const [products, articles, people, categories, series] = await Promise.all([
    db.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    db.article.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, publishedAt: true } }),
    db.person.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    listSeriesSlugs(),
  ])

  // Static, always-indexable pages (audit §8.6). /search stays out: noindex.
  const staticPaths: { path: string; changefreq: string; priority: string }[] = [
    { path: '/about', changefreq: 'monthly', priority: '0.5' },
    { path: '/faq', changefreq: 'monthly', priority: '0.6' },
    { path: '/contact', changefreq: 'monthly', priority: '0.5' },
    { path: '/shipping-returns', changefreq: 'monthly', priority: '0.5' },
    { path: '/legal/terms', changefreq: 'yearly', priority: '0.3' },
    { path: '/legal/privacy', changefreq: 'yearly', priority: '0.3' },
    { path: '/legal/withdrawal', changefreq: 'yearly', priority: '0.3' },
    { path: '/legal/imprint', changefreq: 'yearly', priority: '0.3' },
    { path: '/legal/accessibility', changefreq: 'yearly', priority: '0.3' },
    { path: '/legal/cookies', changefreq: 'yearly', priority: '0.3' },
  ]

  const urls: string[] = []
  // Canonical URL policy: EN unprefixed (default locale), FA with /fa prefix —
  // REAL paths (no hash), mirroring lib/router.ts and the per-page canonicals
  // so exactly one crawlable URL per page.
  for (const locale of ['en', 'fa'] as const) {
    const p = locale === 'fa' ? '/fa' : ''
    urls.push(urlEntry(`${base}${p || '/'}`, now, 'daily', '1.0'))
    urls.push(urlEntry(`${base}${p}/books`, now, 'daily', '0.9'))
    urls.push(urlEntry(`${base}${p}/authors`, now, 'weekly', '0.6'))
    urls.push(urlEntry(`${base}${p}/articles`, now, 'daily', '0.8'))
    for (const c of categories) urls.push(urlEntry(`${base}${p}/categories/${c.slug}`, c.updatedAt, 'weekly', '0.6'))
    for (const pr of products) urls.push(urlEntry(`${base}${p}/books/${pr.slug}`, pr.updatedAt, 'weekly', '0.9'))
    for (const s of series) urls.push(urlEntry(`${base}${p}/series/${s.slug}`, s.updatedAt, 'weekly', '0.7'))
    for (const a of articles) urls.push(urlEntry(`${base}${p}/articles/${a.slug}`, a.publishedAt ?? a.updatedAt, 'monthly', '0.6'))
    for (const pe of people) urls.push(urlEntry(`${base}${p}/authors/${pe.slug}`, pe.updatedAt, 'monthly', '0.5'))
    for (const s of staticPaths) urls.push(urlEntry(`${base}${p}${s.path}`, undefined, s.changefreq, s.priority))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
  })
}
