import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Shell, JsonLd } from '@/components/storefront/Shell'
import { ServerRouteProvider } from '@/components/storefront/SsrProviders'
import { routeStateFromParams } from '@/lib/route-state'
import { siteUrlFrom } from '@/lib/site'
import { getHomeSections } from '@/lib/server/home-sections'
import { getSeriesIndex } from '@/lib/server/series'

export const dynamic = 'force-dynamic'

/**
 * Home route (`/`). The catch-all ([...slug]) never matches `/`, so this page
 * exists — but unlike the old duplicated client dispatcher, it is a thin RSC
 * wrapper around the SAME <Shell/> the other routes use (one dispatcher, no
 * drift) and provides the real route + SSR-prefetched home sections so the
 * homepage body renders with content (C3). It also emits the Organization /
 * WebSite JSON-LD that the old code wrote for a route that could never
 * receive it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const hdrs = await headers()
  const site = siteUrlFrom({ headers: hdrs })
  const fa = false // EN is the canonical unprefixed home (hreflang below covers fa)
  const brand = fa ? 'پرس‌پیکس' : 'PersePix'
  const title = 'PersePix — Independent books from Tehran & Vienna'
  const description = 'Contemporary Persian literature in English and bilingual editions: novels, poetry, memoir, art books and children\'s books. Ships across Europe from Vienna.'
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: `${site}/`,
      languages: { en: `${site}/`, fa: `${site}/fa`, 'x-default': `${site}/` },
    },
    openGraph: {
      title,
      description,
      siteName: brand,
      locale: 'en_US',
      alternateLocale: 'fa_IR',
      type: 'website',
      url: `${site}/`,
      images: [{ url: `${site}/images/hero-season.png` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${site}/images/hero-season.png`] },
  }
}

export default async function HomePage() {
  const hdrs = await headers()
  const site = siteUrlFrom({ headers: hdrs })
  const route = routeStateFromParams(undefined, undefined)

  let home: Awaited<ReturnType<typeof getHomeSections>> | null = null
  let seriesIndex: Awaited<ReturnType<typeof getSeriesIndex>> | null = null
  try {
    home = await getHomeSections(route.locale)
    // Same round-trip feeds the homepage SERIES shelf module (when enabled).
    if (home.some((s) => s.type === 'SERIES' && s.enabled)) {
      seriesIndex = await getSeriesIndex(route.locale)
    }
  } catch {
    home = null
    seriesIndex = null
  }

  const brand = 'PersePix'
  const jsonLd: unknown[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: brand,
      url: `${site}/`,
      logo: `${site}/images/logo.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: brand,
      url: `${site}/`,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${site}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ]

  return (
    <ServerRouteProvider route={route} ssrData={{ locale: route.locale, siteOrigin: site, home, seriesIndex }}>
      <Shell />
      <JsonLd payloads={jsonLd} />
    </ServerRouteProvider>
  )
}
