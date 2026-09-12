'use client'

// C3 SSR plumbing.
//
// ServerRouteProvider receives (a) the URL-parsed RouteState and (b) the
// server-prefetched page data from the RSC entry pages, and exposes both via
// context:
//
//   - ServerRouteContext → consumed by useRoute() as the SSR/hydration
//     snapshot, so the FIRST server-rendered paint is the real page for the
//     URL (previously every URL rendered the homepage body — the audit's C3).
//
//   - SsrPageDataContext → consumed by the data views (ProductView,
//     ArticleView, HomeView, CatalogView). When a prefetched payload for the
//     current route+locale exists, the view renders FULL CONTENT in SSR and
//     skips its initial client fetch.
import { createContext, useContext, type ReactNode } from 'react'
import type { RouteState } from '@/lib/route-state'
import type { ArticleDetail, ArticleListItem, HomeSection, ProductCard as ProductCardDTO, ProductDetail } from '@/lib/types'
import type { SeriesDetail, SeriesIndexEntry } from '@/lib/server/series'

export const ServerRouteContext = createContext<RouteState | null>(null)

export type SsrPageData = {
  locale: 'en' | 'fa'
  /** canonical deployment origin (from the server) — lets share links render
   *  identical absolute URLs on server and client (no hydration mismatch) */
  siteOrigin?: string
  product?: ProductDetail | null
  article?: ArticleDetail | null
  home?: HomeSection[] | null
  catalog?: { items: ProductCardDTO[]; total: number; query: Record<string, string> } | null
  articles?: ArticleListItem[] | null
  /** category slug the prefetched article list was filtered by (null = all) */
  articlesCategory?: string | null
  /** /series/[slug] payload (CollectionPage shelf) */
  series?: SeriesDetail | null
  /** /series index payload (also feeds the homepage SERIES shelf module) */
  seriesIndex?: SeriesIndexEntry[] | null
}

export const SsrPageDataContext = createContext<SsrPageData | null>(null)

export function ServerRouteProvider({
  route,
  ssrData,
  children,
}: {
  route: RouteState
  ssrData?: SsrPageData | null
  children: ReactNode
}) {
  return (
    <ServerRouteContext.Provider value={route}>
      <SsrPageDataContext.Provider value={ssrData ?? null}>{children}</SsrPageDataContext.Provider>
    </ServerRouteContext.Provider>
  )
}

/** Prefetched page data for the current route (null outside an SSR boot). */
export function useSsrPageData(): SsrPageData | null {
  return useContext(SsrPageDataContext)
}
