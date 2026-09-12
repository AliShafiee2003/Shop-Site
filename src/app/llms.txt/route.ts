// GET /llms.txt — AEO/GEO summary for AI answer engines (audit report 06 §B,
// operational plan P2: "llms.txt with publisher summary, series/author listing
// and canonical links"). Plain-text markdown: brand + one-paragraph publisher
// description, then the site's key surfaces with absolute canonical URLs.
// Bounded read load: one settings row + three take-limited/grouped queries.
import { db } from '@/lib/db'
import { siteUrlFrom } from '@/lib/site'
import { getDict } from '@/lib/i18n'
import { seriesLabel } from '@/lib/bookLabels'
import { getSetting } from '@/lib/server/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const base = siteUrlFrom({ headers: req.headers })
  const en = getDict('en')
  const fa = getDict('fa')

  const [store, products, seriesRows, authors] = await Promise.all([
    getSetting<{ name?: string; nameFa?: string }>('store', {}),
    // Top 10 published books: featured first, then publication recency (the
    // catalog's default ordering) — a bounded representative shelf, not the
    // full catalog (that is what /books and the sitemap are for).
    db.product.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ isFeatured: 'desc' }, { publicationDate: 'desc' }],
      take: 10,
      select: { slug: true, translations: { select: { locale: true, title: true } } },
    }),
    // Series identity is denormalized on Product — group published products.
    db.product.groupBy({
      by: ['seriesSlug', 'series'],
      where: { seriesSlug: { not: null }, status: 'PUBLISHED' },
      _count: { _all: true },
    }),
    db.person.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { slug: true, translations: { select: { locale: true, name: true } } },
    }),
  ])

  const brand = store.name || en.brand.name
  const brandFa = store.nameFa || fa.brand.name
  const pick = <T extends { locale: string }>(rows: T[]): T | undefined =>
    rows.find((r) => r.locale === 'en') ?? rows[0]

  const lines: string[] = []
  lines.push(`# ${brand} (${brandFa})`)
  lines.push('')
  lines.push(`> ${en.footer.about}`)
  lines.push('>')
  lines.push(`> ${fa.footer.about}`)
  lines.push('')

  lines.push(`## ${en.nav.books} (${fa.nav.books})`)
  lines.push('')
  lines.push(`- [${en.nav.allBooks}](${base}/books): the complete published catalog.`)
  for (const p of products) {
    const title = pick(p.translations)?.title ?? p.slug
    lines.push(`- [${title}](${base}/books/${p.slug})`)
  }
  lines.push('')

  lines.push(`## ${en.series.indexTitle} (${fa.series.indexTitle})`)
  lines.push('')
  lines.push(`- [${en.series.indexTitle}](${base}/series): every collection, volume by volume.`)
  const series = seriesRows
    .filter((r): r is typeof r & { seriesSlug: string } => Boolean(r.seriesSlug))
    .sort((a, b) => b._count._all - a._count._all)
  for (const s of series) {
    const name = seriesLabel(s.series, 'en') || s.seriesSlug
    lines.push(`- [${name}](${base}/series/${s.seriesSlug})`)
  }
  lines.push('')

  lines.push(`## ${en.authors.title} (${fa.authors.title})`)
  lines.push('')
  lines.push(`- [${en.authors.title}](${base}/authors)`)
  for (const a of authors) {
    const name = pick(a.translations)?.name ?? a.slug
    lines.push(`- [${name}](${base}/authors/${a.slug})`)
  }
  lines.push('')

  lines.push(`## ${en.articles.title} (${fa.articles.title})`)
  lines.push('')
  lines.push(`- [${en.articles.title}](${base}/articles): ${en.articles.subtitle}`)
  lines.push('')

  // Key trust/policy surfaces (the /legal/* documents, FAQ, contact) —
  // the pages an answer engine should cite for purchase/return questions.
  lines.push(`## ${en.footer.house} & ${en.footer.legal}`)
  lines.push('')
  const policyPages: [string, string][] = [
    [en.nav.about, '/about'],
    [en.nav.contact, '/contact'],
    [en.nav.faq, '/faq'],
    [en.nav.shipping, '/shipping-returns'],
    ['Terms of sale', '/legal/terms'],
    ['Privacy notice', '/legal/privacy'],
    ['Right of withdrawal', '/legal/withdrawal'],
    ['Imprint', '/legal/imprint'],
    ['Accessibility', '/legal/accessibility'],
    ['Cookies', '/legal/cookies'],
  ]
  for (const [label, path] of policyPages) lines.push(`- [${label}](${base}${path})`)

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
