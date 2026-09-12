'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { DirectionProvider } from '@radix-ui/react-direction'
import { navigate, useRoute, useScrollTopOnNavigate } from '@/lib/router'
import { apiGet, normalizeCart } from '@/lib/api'
import { useApp } from '@/store/store'
import { fetchAndAdoptConsent, adoptConsentResponse, type ConsentResponse } from '@/lib/consent-client'
import { getDict } from '@/lib/i18n'
import { useToast } from '@/hooks/use-toast'
import { Header } from '@/components/storefront/Header'
import { Footer } from '@/components/storefront/Footer'
import { CookieBanner } from '@/components/storefront/CookieBanner'
import { CookiePreferencesDialog } from '@/components/storefront/CookiePreferencesDialog'
import { HomeView } from '@/components/views/HomeView'
import { CatalogView } from '@/components/views/CatalogView'
import { ProductView } from '@/components/views/ProductView'
import { SearchView } from '@/components/views/SearchView'
import { AuthorsView, AuthorView } from '@/components/views/PeopleView'
import { ArticlesView, ArticleView } from '@/components/views/ArticlesView'
import { CartView } from '@/components/views/CartView'
import { CheckoutView, SuccessPanel } from '@/components/views/CheckoutView'
import { AuthView } from '@/components/views/AuthView'
import { PasswordResetView } from '@/components/views/PasswordResetView'
import { AccountView } from '@/components/views/AccountView'
import { FavoritesView } from '@/components/views/FavoritesView'
import { TrackView } from '@/components/views/TrackView'
import { AboutView, FAQView, ShippingView, ContactView, LegalView } from '@/components/views/StaticView'
import { SeriesView } from '@/components/views/SeriesView'
import { SeriesIndexView } from '@/components/views/SeriesIndexView'
import { VerifyEmailView } from '@/components/views/VerifyEmailView'
import { ConfirmEmailChangeView } from '@/components/views/ConfirmEmailChangeView'
import { NewsletterConfirmView } from '@/components/views/NewsletterConfirmView'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/storefront/bits'
import type { ShippingSettings, StoreSettings, CartDTO, UserDTO } from '@/lib/types'

/**
 * Code-splitting (audit §6/§11): AdminView (+ its 9.4k-line editor tree) used
 * to be in the eager bundle every storefront visitor downloaded (~313 KB).
 * It is noindex, auth-gated and never needed on first paint — load it lazily,
 * client-only, with a skeleton that keeps the page-shaped layout.
 */
const AdminView = dynamic(
  () => import('@/components/views/AdminView').then((m) => m.AdminView),
  {
    ssr: false,
    loading: () => (
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </main>
    ),
  },
)

/**
 * Client SPA shell — dispatched by the path router (real URLs, no hash).
 * Mounted by the RSC catch-all page, which serves every real path
 * (/, /books/…, /fa/...) with per-URL server metadata; the router store
 * adopts window.location at module init, so deep links bootstrap directly.
 */

export function Shell() {
  const route = useRoute()
  const locale = route.locale
  const setLocale = useApp((s) => s.setLocale)
  const setUser = useApp((s) => s.setUser)
  const setCartSummary = useApp((s) => s.setCartSummary)
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [shipping, setShipping] = useState<ShippingSettings | null>(null)
  const [series, setSeries] = useState<{ slug: string; name: string; nameFa: string }[]>([])
  const { toast } = useToast()

  useScrollTopOnNavigate(route.segments)

  // Wishlist write-through failures surface as a soft toast (event from the store).
  useEffect(() => {
    const onWishlistError = () => {
      toast({ title: getDict(useApp.getState().locale).favorites.syncError, variant: 'destructive' })
    }
    window.addEventListener('sp:wishlist-sync-error', onWishlistError)
    return () => window.removeEventListener('sp:wishlist-sync-error', onWishlistError)
  }, [toast])

  // Boot: locale sync, html lang/dir (PRD 19.3), session, cart, consent
  useEffect(() => {
    setLocale(locale)
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr'
  }, [locale, setLocale])

  // Deep-link bootstrap is no longer needed: the path router parses
  // window.location (pathname + search) at module init and silently migrates
  // legacy `#/…` hash links to their real-path form.

  useEffect(() => {
    // One boot request instead of 4–5 parallel dispatches (audit P2):
    // /api/auth/me + /api/cart + /api/settings + /api/privacy/consent + /api/wishlist.
    // Every section is best-effort — same degradation semantics as the old
    // separate calls. Guest wishlists stay localStorage-authoritative (null).
    useApp.getState().initFavorites()
    apiGet<{
      user: UserDTO | null
      cart: CartDTO | null
      settings: { store: StoreSettings; shipping: ShippingSettings; series?: { slug: string; name: string; nameFa: string }[] } | null
      consent: ConsentResponse | null
      wishlist: { slugs: string[] } | null
    }>('/api/bootstrap')
      .then((b) => {
        setUser(b.user)
        if (b.cart) {
          const n = normalizeCart(b.cart)
          setCartSummary(n.count, n.subtotalMinor)
        }
        if (b.settings) {
          setSettings(b.settings.store)
          setShipping(b.settings.shipping)
          setSeries(b.settings.series ?? [])
        }
        if (b.consent) adoptConsentResponse(b.consent)
        if (b.user) void useApp.getState().syncWishlistOnLogin(b.wishlist?.slugs)
      })
      .catch(() => {
        setUser(null)
        // Bootstrap itself failed (offline?) — degrade to the standalone calls.
        fetchAndAdoptConsent().catch(() => {})
      })
  }, [])

  const segs = route.segments
  const [root, second, third] = segs

  let view: React.ReactNode

  if (segs.length === 0) {
    view = <HomeView />
  } else if (root === 'books' && second) {
    view = <ProductView slug={second} />
  } else if (root === 'books') {
    view = <CatalogView query={route.query as Record<string, string>} />
  } else if (root === 'categories' && second) {
    view = <CatalogView query={{ category: second }} heading={undefined} />
  } else if (root === 'search') {
    view = <SearchView q={route.query.q ?? ''} />
  } else if (root === 'authors' && second) {
    view = <AuthorView slug={second} />
  } else if (root === 'authors') {
    view = <AuthorsView />
  } else if (root === 'articles' && second === 'categories' && third) {
    view = <ArticlesView category={third} />
  } else if (root === 'articles' && second) {
    view = <ArticleView slug={second} />
  } else if (root === 'articles') {
    view = <ArticlesView />
  } else if (root === 'cart') {
    view = <CartView />
  } else if (root === 'checkout' && second === 'success') {
    view = <SuccessPanel locale={locale} orderNumber={route.query.order ?? ''} email="" refCode={route.query.ref ?? null} />
  } else if (root === 'checkout' && second === 'cancelled') {
    view = <CancelledPanel locale={locale} />
  } else if (root === 'checkout') {
    view = <CheckoutView />
  } else if (root === 'favorites') {
    view = <FavoritesView />
  } else if (root === 'track') {
    view = <TrackView />
  } else if (root === 'about') {
    view = <AboutView settings={settings} />
  } else if (root === 'faq') {
    view = <FAQView />
  } else if (root === 'shipping-returns') {
    view = <ShippingView settings={settings} shipping={shipping} />
  } else if (root === 'contact') {
    view = <ContactView settings={settings} />
  } else if (root === 'legal' && second) {
    view = <LegalView type={second} />
  } else if (root === 'login') {
    view = <AuthView mode="login" />
  } else if (root === 'register') {
    view = <AuthView mode="register" />
  } else if (root === 'forgot-password' || root === 'reset-password') {
    view = <PasswordResetView />
  } else if (root === 'series' && second) {
    view = <SeriesView slug={second} />
  } else if (root === 'series') {
    view = <SeriesIndexView />
  } else if (root === 'verify-email') {
    view = <VerifyEmailView />
  } else if (root === 'confirm-email-change') {
    view = <ConfirmEmailChangeView />
  } else if (root === 'newsletter-confirm') {
    view = <NewsletterConfirmView />
  } else if (root === 'account') {
    view = <AccountView section={second ?? ''} sub={third} />
  } else if (root === 'admin') {
    view = <AdminView section={second ?? ''} />
  } else {
    view = <NotFound locale={locale} />
  }

  // Views that render their own <main id="main"> landmark
  const hasOwnMain = segs.length > 0 && root !== undefined && (
    (root === 'books' && Boolean(second))
    || root === 'categories' || root === 'search' || root === 'authors' || root === 'articles'
    || root === 'cart' || root === 'checkout' || root === 'about' || root === 'faq' || root === 'favorites' || root === 'track'
    || root === 'shipping-returns' || root === 'contact' || root === 'legal'
    || root === 'login' || root === 'register' || root === 'forgot-password' || root === 'reset-password'
    || root === 'series'
    || root === 'verify-email' || root === 'newsletter-confirm' || root === 'confirm-email-change'
    || root === 'account' || root === 'admin'
  )

  return (
    // DirectionProvider: Radix primitives (dropdowns, popovers, sheets,
    // selects, sliders) portal to <body> OUTSIDE the [dir=rtl] html attribute
    // set below, so they must learn the direction via context — otherwise the
    // FA category menu renders left-aligned with LTR row order (user-reported).
    <DirectionProvider dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        {hasOwnMain ? view : <main id="main">{view}</main>}
        <Footer settings={settings} series={series} />
        <CookieBanner />
        <CookiePreferencesDialog />
      </div>
    </DirectionProvider>
  )
}

/** JSON-LD scripts in ONE opaque node — React tree-context cannot see inside,
 *  so SSR/flight id divergence (radix hydration errors) can never be triggered
 *  by structured data again. `<` is escaped for safe inline embedding. */
export function JsonLd({ payloads }: { payloads: unknown[] }) {
  if (!payloads || payloads.length === 0) return null
  const html = payloads
    .map((p) => `<script type="application/ld+json">${JSON.stringify(p).replace(/</g, '\\u003c')}</script>`)
    .join('')
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function CancelledPanel({ locale }: { locale: 'en' | 'fa' }) {
  const t = getDict(locale)
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-8 text-center">
        <h1 className="text-2xl font-bold text-ink">{t.checkout.cancelledTitle}</h1>
        <p className="mt-2 text-sm text-ink-2">{t.checkout.cancelledBody}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => navigate('/cart')}>{t.checkout.backToCart}</Button>
          <Button variant="outline" onClick={() => navigate('/contact')}>{t.nav.contact}</Button>
        </div>
      </div>
    </main>
  )
}

function NotFound({ locale }: { locale: 'en' | 'fa' }) {
  const t = getDict(locale)
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <p className="text-6xl font-bold text-brand-soft" aria-hidden>404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink">{t.errors.notFound}</h1>
      <p className="mt-2 text-sm text-ink-3">{t.errors.notFoundBody}</p>
      <Button className="mt-6" onClick={() => navigate(locale === 'fa' ? '/fa' : '/')}>{t.errors.goHome}</Button>
    </main>
  )
}
