import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { Shell, JsonLd } from '@/components/storefront/Shell'
import { ServerRouteProvider, type SsrPageData } from '@/components/storefront/SsrProviders'
import { routeStateFromParams } from '@/lib/route-state'
import { siteUrlFrom } from '@/lib/site'
import { getProductDetail } from '@/lib/server/product-detail'
import { getArticleDetail } from '@/lib/server/article-detail'
import { getArticleList } from '@/lib/server/article-list'
import { getHomeSections } from '@/lib/server/home-sections'
import { queryStorefrontProducts } from '@/lib/server/product-list'
import { getSetting } from '@/lib/server/utils'
import { getSeriesDetail, seriesMeta, getSeriesIndex } from '@/lib/server/series'
import { loadShippingSettings } from '@/lib/server/shipping'

export const dynamic = 'force-dynamic'

type Params = { slug?: string[] }
type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_OG_IMAGE = '/images/hero-season.png'

/** Page roots that must NEVER be indexed (private / utility surfaces). */
const NOINDEX_ROOTS = new Set([
  'search', 'account', 'admin', 'checkout', 'cart', 'favorites', 'track', 'login', 'register',
  'forgot-password', 'reset-password', 'verify-email', 'newsletter-confirm', 'confirm-email-change',
])

function absUrl(site: string, path: string): string {
  return `${site}${path}`
}

/** Absolute URL for a locale-scoped path. Canonical URL policy: EN is the
 *  UNPREFIXED default (/, /books/…), FA carries /fa — mirrors lib/router.ts,
 *  so metadata, sitemap and the SPA all agree on ONE form per page. */
function localePath(locale: 'en' | 'fa', path: string): string {
  return locale === 'fa' ? `/fa${path}` : path || '/'
}

/** Per-page canonical + hreflang (en/fa + x-default → EN: the SEO base). */
function pageAlternates(site: string, locale: 'en' | 'fa', path: string) {
  return {
    canonical: absUrl(site, localePath(locale, path)),
    languages: {
      en: absUrl(site, path || '/'),
      fa: absUrl(site, `/fa${path}`),
      'x-default': absUrl(site, path || '/'),
    },
  }
}

export async function generateMetadata({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const [{ slug }, sp, hdrs] = await Promise.all([params, searchParams, headers()])
  const site = siteUrlFrom({ headers: hdrs })
  const route = routeStateFromParams(slug, sp)
  const { locale, segments } = route
  const [root, second] = segments
  const fa = locale === 'fa'
  const brand = fa ? 'پرس‌پیکس' : 'PersePix'
  const homeTitle = fa ? 'پرس‌پیکس — کتاب‌های مستقل از تهران و وین' : 'PersePix — Independent books from Tehran & Vienna'
  const homeDesc = fa
    ? 'ادبیات معاصر ایران به انگلیسی و در نسخه‌های دوزبانه — رمان، شعر، سفرنامه، کتاب هنر و کودک. ارسال به سراسر اروپا از وین.'
    : 'Contemporary Persian literature in English and bilingual editions: novels, poetry, memoir, art books and children\'s books. Ships across Europe from Vienna.'
  // Page path WITHOUT the locale prefix, e.g. '' | '/books' | '/books/slug'
  const path = segments.length ? `/${segments.join('/')}` : ''

  const build = async (): Promise<Metadata> => {
    let title = homeTitle
    let description = homeDesc
    let ogType: 'website' | 'article' = 'website'
    let image = DEFAULT_OG_IMAGE
    let publishedTime: string | undefined

    if (root === 'books' && second) {
      const p = await db.product.findFirst({
        where: { slug: second, status: 'PUBLISHED' },
        include: { translations: true },
      })
      if (p) {
        const t = p.translations.find((x) => x.locale === locale) ?? p.translations.find((x) => x.locale === 'en')
        title = t?.seoTitle || t?.title || p.slug
        description = t?.seoDesc || t?.shortDescription || t?.subtitle || homeDesc
        if (p.coverUrl) image = p.coverUrl
      } else {
        title = fa ? 'همه کتاب‌ها' : 'All books'
      }
    } else if (root === 'articles' && second && second !== 'categories') {
      const a = await db.article.findUnique({ where: { slug: second }, include: { translations: true } })
      if (a) {
        const t = a.translations.find((x) => x.locale === locale) ?? a.translations.find((x) => x.locale === 'en')
        title = t?.seoTitle || t?.title || a.slug
        description = t?.seoDesc || t?.excerpt || homeDesc
        ogType = 'article'
        publishedTime = (a.publishedAt ?? a.createdAt).toISOString()
      } else {
        title = fa ? 'مجله' : 'Journal'
      }
    } else if (root === 'authors' && second) {
      const person = await db.person.findUnique({ where: { slug: second }, include: { translations: true } })
      if (person) {
        const t = person.translations.find((x) => x.locale === locale) ?? person.translations.find((x) => x.locale === 'en')
        title = t?.name ?? person.slug
        description = t?.shortBio ?? homeDesc
      } else {
        title = fa ? 'نویسندگان و مترجمان' : 'Authors & translators'
      }
    } else if (root === 'series' && second) {
      const s = await seriesMeta(second)
      title = s?.name ?? (fa ? 'مجموعه‌ها' : 'Series')
      description = s?.description ?? homeDesc
    } else if (root === 'series') {
      title = fa ? 'مجموعه‌های کتاب' : 'Book series'
      description = fa
        ? 'مجموعه‌های کتاب پرس‌پیکس — از تاریخ مصور ایران تا نثر معاصر فارسی. همهٔ جلدهای هر مجموعه در یک نگاه.'
        : 'The PersePix book series — from the Illustrated History of Iran to contemporary Persian prose. Every volume of each collection, in one place.'
    } else if (root === 'books' || root === 'categories') {
      title = fa ? 'همه کتاب‌ها' : 'All books'
    } else if (root === 'articles') {
      title = fa ? 'مجله' : 'Journal'
    } else if (root === 'authors') {
      title = fa ? 'نویسندگان و مترجمان' : 'Authors & translators'
    }

    // Home keeps the full brand title as-is; every other page gets the brand suffix once.
    // seoTitle rows are seeded as "Title — PersePix", so strip any baked-in
    // brand suffix first — the single append below must never double it.
    const stripped = title.replace(new RegExp(`\\s*—\\s*${brand}\\s*$`), '')
    const absTitle = title === homeTitle ? title : `${stripped} — ${brand}`
    const imageUrl = image.startsWith('http') ? image : absUrl(site, image)
    const base: Metadata = {
      title: { absolute: absTitle },
      description,
      alternates: pageAlternates(site, locale, path),
      openGraph: {
        title: absTitle,
        description,
        siteName: brand,
        locale: fa ? 'fa_IR' : 'en_US',
        alternateLocale: fa ? 'en_US' : 'fa_IR',
        type: ogType,
        url: absUrl(site, localePath(locale, path)),
        images: [{ url: imageUrl }],
        ...(ogType === 'article' && publishedTime ? { publishedTime } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title: absTitle,
        description,
        images: [imageUrl],
      },
    }
    if (root && NOINDEX_ROOTS.has(root)) {
      // Private/utility surfaces (search, cart, checkout, account, admin…):
      // keep them out of every index (audit §8.7).
      return { ...base, robots: { index: false, follow: false } }
    }
    return base
  }

  try {
    return await build()
  } catch {
    // Metadata is best-effort; never break rendering.
    return {
      title: { absolute: homeTitle },
      description: homeDesc,
      alternates: pageAlternates(site, locale, path),
      openGraph: { siteName: brand, locale: fa ? 'fa_IR' : 'en_US', type: 'website', url: absUrl(site, localePath(locale, path)), images: [absUrl(site, DEFAULT_OG_IMAGE)] },
      twitter: { card: 'summary_large_image', title: homeTitle, description: homeDesc, images: [absUrl(site, DEFAULT_OG_IMAGE)] },
    }
  }
}

async function buildJsonLd(site: string, locale: 'en' | 'fa', segments: string[]): Promise<unknown[]> {
  const [root, second] = segments
  const payloads: unknown[] = []
  const fa = locale === 'fa'
  const brand = fa ? 'پرس‌پیکس' : 'PersePix'

  const crumb = (items: { name: string; path: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(site, it.path),
    })),
  })

  try {
    if (segments.length === 0) {
      // Richer Organization entity (GEO §9: logo/sameAs/contactPoint).
      const store = await getSetting<{ name?: string; email?: string; phone?: string; address?: string; instagram?: string; x?: string; youtube?: string }>('store', {})
      // GEO: sameAs ties the Organization entity to its social profiles —
      // stored on the 'store' settings row (written through SEC-012's
      // http(s)-only validation) and re-filtered to absolute http(s) at read.
      const sameAs = [store.instagram, store.x, store.youtube]
        .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
        .map((u) => u.trim())
      payloads.push({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: brand,
        url: absUrl(site, localePath(locale, '')),
        logo: absUrl(site, '/logo.svg'),
        ...(store.email ? { contactPoint: { '@type': 'ContactPoint', email: store.email, contactType: 'customer service' } } : {}),
        ...(sameAs.length ? { sameAs } : {}),
      })
      payloads.push({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: brand,
        url: absUrl(site, localePath(locale, '')),
        potentialAction: {
          '@type': 'SearchAction',
          target: `${site}${localePath(locale, '/search')}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      })
    } else if (root === 'books' && second) {
      const p = await db.product.findFirst({
        where: { slug: second, status: 'PUBLISHED' },
        include: {
          translations: true,
          variants: true,
          contributors: { include: { person: { include: { translations: true } } } },
          reviews: { where: { moderationState: 'APPROVED' }, select: { rating: true } },
        },
      })
      if (p) {
        const t = p.translations.find((x) => x.locale === locale) ?? p.translations.find((x) => x.locale === 'en')
        const v = p.variants.filter((x) => x.isActive).sort((a, b) => a.priceMinor - b.priceMinor)[0]
        const avg = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : undefined
        // ── GEO/AEO Offer enrichment (audit §B P1) ──
        // Everything below mirrors facts the storefront itself states
        // (settings + published policy) — never data the page doesn't show.
        const priceValidUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
        // Return window: the published withdrawal policy (legal doc + FAQ)
        // grants EU consumers 14 days and there is no settings field for a
        // configurable window — so 14, NOT the audit template's 30, keeping
        // the structured data consistent with the visible legal text.
        const hasMerchantReturnPolicy = {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'AT',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 14,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/FreeReturn',
        }
        // Shipping: the cheapest settings method serving AT (the store's home
        // market). Skipped entirely when settings define no such method.
        const atMethod = (await loadShippingSettings()).methods
          .filter((m) => Array.isArray(m.countries) && (m.countries.includes('AT') || m.countries.includes('*')))
          .sort((a, b) => a.priceMinor - b.priceMinor)[0]
        payloads.push({
          '@context': 'https://schema.org',
          '@type': 'Book',
          name: t?.title ?? p.slug,
          url: absUrl(site, localePath(locale, `/books/${p.slug}`)),
          ...(p.coverUrl ? { image: absUrl(site, p.coverUrl) } : {}),
          author: p.contributors
            .filter((c) => c.role === 'AUTHOR')
            .map((c) => ({ '@type': 'Person', name: c.person.translations.find((x) => x.locale === 'en')?.name ?? c.person.slug })),
          isbn: p.variants.find((x) => x.isbn13)?.isbn13 ?? undefined,
          numberOfPages: v?.pageCount ?? undefined,
          publisher: { '@type': 'Organization', name: brand },
          inLanguage: v?.bookLanguage ?? undefined,
          ...(avg && p.reviews.length
            ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(avg * 10) / 10, reviewCount: p.reviews.length } }
            : {}),
          ...(v
            ? {
                offers: {
                  '@type': 'Offer',
                  price: (v.priceMinor / 100).toFixed(2),
                  priceCurrency: 'EUR',
                  availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                  itemCondition: 'https://schema.org/NewCondition',
                  url: `${site}${localePath(locale, `/books/${p.slug}`)}`,
                  priceValidUntil,
                  hasMerchantReturnPolicy,
                  ...(atMethod
                    ? {
                        shippingDetails: {
                          '@type': 'OfferShippingDetails',
                          shippingRate: { '@type': 'MonetaryAmount', value: (atMethod.priceMinor / 100).toFixed(2), currency: 'EUR' },
                          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'AT' },
                        },
                      }
                    : {}),
                },
              }
            : {}),
        })
        payloads.push(crumb([
          { name: fa ? 'خانه' : 'Home', path: localePath(locale, '') },
          { name: fa ? 'همه کتاب‌ها' : 'All books', path: localePath(locale, '/books') },
          { name: t?.title ?? p.slug, path: localePath(locale, `/books/${p.slug}`) },
        ]))
      }
    }
    if (root === 'articles' && second && second !== 'categories') {
      const a = await db.article.findUnique({ where: { slug: second }, include: { translations: true } })
      if (a && a.status === 'PUBLISHED') {
        const t = a.translations.find((x) => x.locale === locale) ?? a.translations.find((x) => x.locale === 'en')
        const articleUrl = absUrl(site, localePath(locale, `/articles/${a.slug}`))
        payloads.push({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: t?.title ?? a.slug,
          url: articleUrl,
          mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
          datePublished: a.publishedAt?.toISOString() ?? a.createdAt.toISOString(),
          dateModified: a.updatedAt.toISOString(),
          inLanguage: locale,
          // E-E-A-T: a real human byline is a Person; fall back to the brand.
          author: a.byline
            ? { '@type': 'Person', name: a.byline }
            : { '@type': 'Organization', name: brand },
          publisher: { '@type': 'Organization', name: brand, logo: { '@type': 'ImageObject', url: absUrl(site, '/logo.svg') } },
          ...(t?.excerpt ? { description: t.excerpt } : {}),
        })
        payloads.push(crumb([
          { name: fa ? 'خانه' : 'Home', path: localePath(locale, '') },
          { name: fa ? 'مجله' : 'Journal', path: localePath(locale, '/articles') },
          { name: t?.title ?? a.slug, path: localePath(locale, `/articles/${a.slug}`) },
        ]))
      }
    }
    if (root === 'authors' && second) {
      const person = await db.person.findUnique({ where: { slug: second }, include: { translations: true } })
      if (person) {
        const t = person.translations.find((x) => x.locale === locale) ?? person.translations.find((x) => x.locale === 'en')
        const sameAs = [person.website, ...parseSocials(person.socialLinks)].filter((u): u is string => Boolean(u))
        payloads.push({
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: t?.name ?? person.slug,
          url: absUrl(site, localePath(locale, `/authors/${person.slug}`)),
          ...(person.portraitUrl ? { image: absUrl(site, person.portraitUrl) } : {}),
          ...(person.nationality ? { nationality: person.nationality } : {}),
          ...(sameAs.length ? { sameAs } : {}),
        })
        payloads.push(crumb([
          { name: fa ? 'خانه' : 'Home', path: localePath(locale, '') },
          { name: fa ? 'نویسندگان و مترجمان' : 'Authors & translators', path: localePath(locale, '/authors') },
          { name: t?.name ?? person.slug, path: localePath(locale, `/authors/${person.slug}`) },
        ]))
      }
    }
    // FAQPage schema on /faq (GEO §9 — was missing entirely).
    if (root === 'faq') {
      const store = await getSetting<{ freeShippingThresholdMinor?: number }>('store', {})
      const freeShip = `€${((store.freeShippingThresholdMinor ?? 6000) / 100).toFixed(2)}`
      const items = fa
        ? [
            { q: 'کتاب‌ها از کجا ارسال می‌شوند؟', a: 'همهٔ سفارش‌ها از وین، اتریش ارسال می‌شود. ارسال در اتریش ۲ تا ۴ روز کاری و در اتحادیهٔ اروپا ۳ تا ۷ روز کاری طول می‌کشد. ارسال بین‌المللی ۵ تا ۱۴ روز.' },
            { q: 'هزینهٔ ارسال چقدر است؟', a: `اتریش ۴.۹۰ یورو؛ اتحادیهٔ اروپا ۷.۹۰ یورو (برای خرید بالای ${freeShip} رایگان)؛ مقصدهای بین‌المللی ۱۴.۹۰ یورو.` },
            { q: 'آیا می‌توانم سفارشم را مرجوع کنم؟', a: 'بله، مصرف‌کنندگان در اتحادیهٔ اروپا ۱۴ روز فرصت انصراف دارند. کتاب باید دست‌نخورده باشد. از صفحهٔ سفارش‌ها در حساب کاربری درخواست مرجوعی ثبت کنید.' },
            { q: 'نسخه‌های دوزبانه چگونه کار می‌کنند؟', a: 'در نسخه‌های دوزبانه، متن اصلی فارسی و ترجمهٔ انگلیسی در صفحات روبه‌رو چاپ می‌شوند؛ با یادداشت‌های مترجم و شاعر.' },
            { q: 'چگونه کتاب من منتشر می‌شود؟', a: 'در حال حاضر ما فقط از طریق پیشنهاد مستقیم نویسندگان و متصدیان حق نشر کار می‌کنیم. برای حقوق ترجمه به صفحهٔ تماس بنویسید.' },
            { q: 'آیا کتاب‌ها به ایران ارسال می‌شوند؟', a: 'ارسال بین‌المللی به اکثر کشورها انجام می‌شود؛ اما ممکن است محدودیت‌های پرداخت و گمرکی وجود داشته باشد. پیش از سفارش با ما تماس بگیرید.' },
          ]
        : [
            { q: 'Where do the books ship from?', a: 'All orders ship from Vienna, Austria. Delivery takes 2–4 business days in Austria, 3–7 days across the EU, and 5–14 days internationally.' },
            { q: 'How much is shipping?', a: `Austria €4.90; EU €7.90 (free over ${freeShip}); worldwide destinations €14.90. All shipments are tracked.` },
            { q: 'Can I return my order?', a: 'Yes — EU consumers have a 14-day right of withdrawal. Books should be unused. Request a return from the orders page in your account.' },
            { q: 'How do bilingual editions work?', a: 'Bilingual editions print the Persian original and the English translation on facing pages, with notes by the translator and the author.' },
            { q: 'How do I submit a manuscript?', a: 'We currently work through direct author and rights-holder proposals only. For translation rights, write to us via the contact page.' },
            { q: 'Do you ship to Iran?', a: 'International shipping covers most countries, but payment and customs limitations may apply. Please contact us before ordering.' },
          ]
      payloads.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((it) => ({
          '@type': 'Question',
          name: it.q,
          acceptedAnswer: { '@type': 'Answer', text: it.a },
        })),
      })
    }
    // Index pages get a two-step breadcrumb (Home → section).
    if (root === 'books' && !second) payloads.push(crumb([{ name: fa ? 'خانه' : 'Home', path: localePath(locale, '') }, { name: fa ? 'همه کتاب‌ها' : 'All books', path: localePath(locale, '/books') }]))
    if (root === 'series' && !second) {
      const idx = await getSeriesIndex(locale)
      payloads.push({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: fa ? 'مجموعه‌های کتاب' : 'Book series',
        url: absUrl(site, localePath(locale, '/series')),
        isPartOf: { '@type': 'WebSite', name: brand, url: absUrl(site, localePath(locale, '')) },
        ...(idx.length
          ? {
              mainEntity: {
                '@type': 'ItemList',
                itemListElement: idx.map((s, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  name: s.name,
                  url: absUrl(site, localePath(locale, `/series/${s.slug}`)),
                })),
              },
            }
          : {}),
      })
      payloads.push(crumb([
        { name: fa ? 'خانه' : 'Home', path: localePath(locale, '') },
        { name: fa ? 'همه کتاب‌ها' : 'All books', path: localePath(locale, '/books') },
        { name: fa ? 'مجموعه‌ها' : 'Series', path: localePath(locale, '/series') },
      ]))
    }
    if (root === 'series' && second) {
      const s = await seriesMeta(second)
      if (s) {
        payloads.push({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: s.name,
          url: absUrl(site, localePath(locale, `/series/${second}`)),
          ...(s.description ? { description: s.description } : {}),
          isPartOf: { '@type': 'WebSite', name: brand, url: absUrl(site, localePath(locale, '')) },
        })
        payloads.push(crumb([
          { name: fa ? 'خانه' : 'Home', path: localePath(locale, '') },
          { name: fa ? 'همه کتاب‌ها' : 'All books', path: localePath(locale, '/books') },
          { name: s.name, path: localePath(locale, `/series/${second}`) },
        ]))
      }
    }
    if (root === 'articles' && (!second || second === 'categories')) payloads.push(crumb([{ name: fa ? 'خانه' : 'Home', path: localePath(locale, '') }, { name: fa ? 'مجله' : 'Journal', path: localePath(locale, '/articles') }]))
    if (root === 'authors' && !second) payloads.push(crumb([{ name: fa ? 'خانه' : 'Home', path: localePath(locale, '') }, { name: fa ? 'نویسندگان و مترجمان' : 'Authors & translators', path: localePath(locale, '/authors') }]))
  } catch {
    // JSON-LD is best-effort.
  }
  return payloads
}

/** Person.socialLinks stores JSON [{platform,url}] — extract URL strings (best effort). */
function parseSocials(raw: string | null | undefined): (string | null)[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => (x && typeof x === 'object' && 'url' in x ? (x as { url?: unknown }).url : x))
      .filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/** C3: server-side prefetch of the page body data, mirrored from the exact
 *  loaders the API routes use — the SSR HTML carries REAL CONTENT, not a
 *  client-rendered skeleton. Best-effort: any failure degrades to the
 *  client-side fetch path, never to a broken page. */
async function prefetchPageData(locale: 'en' | 'fa', segments: string[], query: Record<string, string>): Promise<SsrPageData> {
  const [root, second, third] = segments
  try {
    if (segments.length === 0) {
      const home = await getHomeSections(locale)
      // Feed the homepage SERIES shelf module in the same server round-trip
      // (only when the module is actually on the page).
      const seriesIndex = home.some((s) => s.type === 'SERIES' && s.enabled)
        ? await getSeriesIndex(locale)
        : null
      return { locale, home, seriesIndex }
    }
    if (root === 'books' && second) {
      return {
        locale,
        // The loader is the SAME source /api/products/[slug] serializes — its
        // structural shape is the wire format lib/types documents. The cast
        // marks that the TS declaration (not the data) lags the API.
        product: (await getProductDetail(second, locale, {
          // R8: keep SSR in sync with the client's review sort param.
          reviewsSort: query.reviewsSort === 'helpful' ? 'helpful' : 'recent',
        })) as unknown as SsrPageData['product'],
      }
    }
    if ((root === 'books' && !second) || root === 'categories') {
      // The dispatcher hands CatalogView `{category}` for category routes and
      // the URL query for /books — mirror EXACTLY that contract so the seeded
      // first page matches the client's own load key.
      const effectiveQuery: Record<string, string> =
        root === 'categories' && second ? { category: second } : { ...query }
      const sp = new URLSearchParams({ locale })
      for (const [k, v] of Object.entries(effectiveQuery)) {
        if (k === 'locale') continue
        sp.set(k, v)
      }
      const page = await queryStorefrontProducts(sp)
      return { locale, catalog: { items: page.items, total: page.total, query: effectiveQuery } }
    }
    if (root === 'articles' && second && second !== 'categories') {
      return {
        locale,
        article: (await getArticleDetail(second, locale)) as unknown as SsrPageData['article'],
      }
    }
    if (root === 'articles' && second === 'categories' && third) {
      return { locale, articles: await getArticleList(locale, third), articlesCategory: third }
    }
    if (root === 'articles' && !second) {
      return { locale, articles: await getArticleList(locale, null), articlesCategory: null }
    }
    if (root === 'series' && second) {
      return { locale, series: await getSeriesDetail(second, locale) }
    }
    if (root === 'series') {
      return { locale, seriesIndex: await getSeriesIndex(locale) }
    }
    return { locale }
  } catch {
    return { locale }
  }
}

export default async function CatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const [{ slug }, sp, hdrs] = await Promise.all([params, searchParams, headers()])
  // Legacy /en/… REAL paths collapse permanently to the canonical unprefixed
  // form (/en/books/x → /books/x, /en → /) — mirrors lib/router.ts so the
  // server and the SPA never mint a duplicate /en URL. (Legacy #/en/… hash
  // forms are migrated client-side by the router's migrateLegacyHash.)
  if (slug?.[0] === 'en') {
    permanentRedirect(`/${slug.slice(1).join('/')}`)
  }
  const site = siteUrlFrom({ headers: hdrs })
  const route = routeStateFromParams(slug, sp)
  const jsonLd = await buildJsonLd(site, route.locale, route.segments)
  const ssrData = await prefetchPageData(route.locale, route.segments, route.query)
  ssrData.siteOrigin = site

  return (
    <ServerRouteProvider route={route} ssrData={ssrData}>
      <Shell />
      <JsonLd payloads={jsonLd} />
    </ServerRouteProvider>
  )
}
