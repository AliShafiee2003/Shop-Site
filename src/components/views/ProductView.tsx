'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star, Truck, RotateCcw, ShieldCheck, ZoomIn, BadgeCheck, Heart, Share2, Link2, Check, Tag, BellRing, ChevronLeft, ChevronRight, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPost, normalizeCart } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, formatDims, faDigits } from '@/lib/format'
import { RatingStars, StockBadge, PriceTag, SalePriceTag, QtyStepper, Breadcrumbs, ProseBlocks, Spinner, EmptyState, Skeleton } from '@/components/storefront/bits'
import { ProductCard } from '@/components/storefront/ProductCard'
import { useApp } from '@/store/store'
import { useSettings } from '@/lib/use-settings'
import { useToast } from '@/hooks/use-toast'
import { track } from '@/lib/analytics'
import { pushRecent } from '@/lib/recent'
import { RecentlyViewed } from '@/components/storefront/RecentlyViewed'
import { useSsrPageData } from '@/components/storefront/SsrProviders'
import { bookLanguageLabel, countryLabel, seriesLabel } from '@/lib/bookLabels'
import type { Locale, ProductDetail } from '@/lib/types'

const FORMAT_LABEL: Record<string, { en: string; fa: string }> = {
  PAPERBACK: { en: 'Paperback', fa: 'جلد شومیز' },
  HARDCOVER: { en: 'Hardcover', fa: 'جلد سخت' },
  SPECIAL: { en: 'Special edition', fa: 'چاپ ویژه' },
}

/** Review row plus the press-reply fields served by GET /api/products/[slug]
 *  (reply/repliedAt are optional in the DTO — older responses simply omit them). */
type ReviewWithReply = ProductDetail['reviews']['items'][number] & {
  reply?: string | null
  repliedAt?: string | null
}

export function ProductView({ slug }: { slug: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const settings = useSettings()
  const freeShipAmount = formatMoney(settings?.store?.freeShippingThresholdMinor ?? 6000, locale)
  const setCartSummary = useApp((s) => s.setCartSummary)
  const setMiniCartOpen = useApp((s) => s.setMiniCartOpen)
  const favorites = useApp((s) => s.favorites)
  const favsLoaded = useApp((s) => s.favsLoaded)
  const toggleFavorite = useApp((s) => s.toggleFavorite)

  // C3: when the RSC entry prefetched this exact book in this locale, the SSR
  // HTML already contains the full PDP — seed state from it and skip the
  // initial client fetch (the refetch only fires on slug/locale changes).
  const ssr = useSsrPageData()
  const ssrProduct = ssr && ssr.locale === locale && ssr.product && ssr.product.slug === slug ? ssr.product : null
  // Deterministic share URL — identical on server and client (no hydration
  // mismatch; no bare `window` in SSR render — audit C3 follow-up).
  const shareUrl = `${ssr?.siteOrigin ?? ''}${route.raw}`
  const [product, setProduct] = useState<ProductDetail | null>(ssrProduct)
  const [failed, setFailed] = useState(false)
  const loadedSlug = useRef<string>(ssrProduct ? slug : '')
  const ssrConsumed = useRef<boolean>(Boolean(ssrProduct))
  const [variantId, setVariantId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [activeImg, setActiveImg] = useState(0)
  /** Hero image — gallery selection first, then cover; empty string → placeholder
   *  (an empty src="" makes the browser re-fetch the whole page — never render that). */
  const heroSrc = product ? product.gallery[activeImg]?.url || product.coverUrl || '' : ''
  const [adding, setAdding] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', body: '', name: '' })
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [bisEmail, setBisEmail] = useState('')
  const [bisBusy, setBisBusy] = useState(false)
  const [bisDone, setBisDone] = useState(false)
  /** Helpfulness votes — local overlay over the SSR/fetched DTO so a toggle
   *  updates instantly (optimistic) and is corrected by the API response. */
  const [votes, setVotes] = useState<Record<string, { helpfulCount: number; voted: boolean }>>({})
  const [voteBusy, setVoteBusy] = useState<string | null>(null)

  const voteState = (r: ReviewWithReply) => votes[r.id] ?? { helpfulCount: r.helpfulCount ?? 0, voted: Boolean(r.voted) }

  const toggleHelpful = async (r: ReviewWithReply) => {
    if (!user) {
      // Guests get a pointer to sign in — votes must be attributable to keep
      // the signal spam-safe (same policy as review submission).
      toast({ title: t.product.helpfulSignIn, duration: 5000 })
      return
    }
    if (voteBusy === r.id) return
    const cur = voteState(r)
    setVoteBusy(r.id)
    setVotes((m) => ({ ...m, [r.id]: { helpfulCount: Math.max(0, cur.helpfulCount + (cur.voted ? -1 : 1)), voted: !cur.voted } }))
    try {
      const res = await apiPost<{ helpfulCount: number; voted: boolean }>(`/api/reviews/${r.id}/helpful`, {})
      setVotes((m) => ({ ...m, [r.id]: res }))
    } catch (err) {
      setVotes((m) => ({ ...m, [r.id]: cur }))
      const code = (err as { code?: string }).code
      if (code === 'SELF_VOTE') toast({ title: t.product.helpfulSelf, variant: 'destructive' })
      else if (code === 'UNAUTHORIZED') toast({ title: t.product.helpfulSignIn, duration: 5000 })
      else toast({ title: t.common.error, variant: 'destructive' })
    } finally { setVoteBusy(null) }
  }

  useEffect(() => {
    let alive = true
    // Keep the previous book rendered while a DIFFERENT slug loads; but when only
    // the locale changes (same book), keep showing it — the DTO carries both
    // translations, so text swaps instantly and the refetch only refreshes
    // locale-specific extras (related, reviews). No blank flash on language switch.
    if (loadedSlug.current !== slug) { setProduct(null); setVariantId(null) }
    setFailed(false); setActiveImg(0); setQty(1); setReviewDone(false); setBisDone(false); setBisEmail('')
    if (ssrConsumed.current) {
      // SSR boot: the prefetched book is already on screen — no refetch.
      ssrConsumed.current = false
      loadedSlug.current = slug
      const p = ssrProduct
      if (p) {
        if (p.variants.length > 0) setVariantId((cur) => cur ?? p.variants[0].id)
        document.title = p.seoTitle || `${p.title} — Persepix`
        track('view_product', { productSlug: p.slug })
        pushRecent(p.slug)
      }
      return
    }
    apiGet<ProductDetail>(`/api/products/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((r) => {
        if (!alive) return
        setProduct(r)
        loadedSlug.current = slug
        if (r.variants.length > 0) setVariantId(r.variants[0].id)
        document.title = r.seoTitle || `${r.title} — Persepix`
        // Consent-gated first-party analytics + recently-viewed history.
        track('view_product', { productSlug: r.slug })
        pushRecent(r.slug)
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [slug, locale])

  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId) ?? product?.variants[0] ?? null, [product, variantId])
  const isFav = favsLoaded && !!product && favorites.includes(product.slug)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  if (failed) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState title={t.errors.notFound} body={t.errors.notFoundBody} action={<Button onClick={() => navigate('/books')}>{t.nav.books}</Button>} />
      </main>
    )
  }
  if (!product) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-[4/5] rounded-lg" />
          <div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-12 w-40" /><Skeleton className="h-12 w-full" /></div>
        </div>
      </main>
    )
  }

  const title = isFa ? (product.translations?.fa?.title || product.title) : product.title
  const subtitle = isFa ? (product.translations?.fa?.subtitle || product.subtitle) : product.subtitle
  const shortDesc = isFa ? (product.translations?.fa?.shortDescription || product.shortDescription) : product.shortDescription
  const inStock = variant ? variant.stock > 0 : product.inStock
  // Promotion-aware pricing: salePriceMinor is set only while a promo reduces the list price.
  const effPrice = variant ? (variant.salePriceMinor ?? variant.priceMinor) : product.priceMinor ?? null
  const onSale = variant
    ? variant.salePriceMinor != null && variant.salePriceMinor < variant.priceMinor
    : product.listPriceMinor != null && product.priceMinor != null && product.listPriceMinor > product.priceMinor

  const addToCart = async () => {
    if (!variant) return
    setAdding(true)
    try {
      const raw = await apiPost('/api/cart/items', { variantId: variant.id, quantity: qty })
      const res = normalizeCart(raw)
      setCartSummary(res.count, res.subtotalMinor)
      track('add_to_cart', { productSlug: product.slug, valueMinor: (effPrice ?? 0) * qty })
      toast({ title: t.common.added, description: `${title} × ${qty}` })
      setMiniCartOpen(true)
    } catch (e) {
      console.error('ADDCART_FAIL', e)
      const err = e as { code?: string }
      toast({
        title: err.code === 'OUT_OF_STOCK' ? t.common.outOfStock : t.common.error,
        variant: 'destructive',
      })
    } finally { setAdding(false) }
  }

  const submitNotify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!variant || bisBusy) return
    setBisBusy(true)
    try {
      await apiPost('/api/back-in-stock', { variantId: variant.id, email: bisEmail.trim(), locale })
      setBisDone(true)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'EMAIL_NOT_VERIFIED') {
        // The signed-in account owns this (unverified) address — point at the
        // account verification banner, same guidance as the review gate.
        toast({ title: t.bis.verifyNeeded, variant: 'destructive', duration: 6000 })
      } else {
        toast({ title: t.common.error, variant: 'destructive' })
      }
    } finally { setBisBusy(false) }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (reviewForm.body.trim().length < 10) return
    setReviewBusy(true)
    try {
      await apiPost('/api/reviews', {
        productId: product.id,
        rating: reviewForm.rating,
        title: reviewForm.title || undefined,
        body: reviewForm.body.trim(),
        name: user ? undefined : (reviewForm.name.trim() || undefined),
        locale,
      })
      setReviewDone(true)
      setReviewForm({ rating: 5, title: '', body: '', name: '' })
      toast({ title: t.product.reviewPending })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'EMAIL_NOT_VERIFIED') {
        // S13 residual — the account has not confirmed its address. Point at
        // the account banner (which can resend the verification mail).
        toast({ title: t.product.reviewVerifyNeeded, variant: 'destructive', duration: 6000 })
      } else {
        toast({ title: t.common.error, variant: 'destructive' })
      }
    } finally { setReviewBusy(false) }
  }

  // JSON-LD (PRD 20.3): rendered ONCE, server-side, by the RSC catch-all
  // (Book + Breadcrumb). The client used to inject a second identical copy —
  // duplicate schemas in the DOM confuse parsers (audit §8.4).

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: t.nav.home, href: '/' },
          { label: t.nav.books, href: '/books' },
          ...(product.categories[0] ? [{ label: product.categories[0].name, href: `/categories/${product.categories[0].slug}` }] : []),
          { label: title },
        ]}
      />

      <div className="mb-4 flex items-center justify-end gap-1.5">
        <button
          type="button" onClick={() => { toggleFavorite(product.slug) }}
          aria-pressed={isFav}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition',
            isFav ? 'border-orange-accent/40 bg-orange-accent/10 text-orange-dark' : 'border-line text-ink-3 hover:border-orange-accent/40 hover:text-orange-accent')}
        >
          <Heart className={cn('h-4 w-4', isFav && 'fill-current')} aria-hidden />
          {isFav ? t.favorites.title : t.favorites.added.replace(' to favorites', '')}
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareUrl)}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink-3 transition hover:border-brand/40 hover:text-brand"
        >
          <Share2 className="h-4 w-4" aria-hidden />{t.share.email}
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink-3 transition hover:border-brand/40 hover:text-brand"
        >
          𝕏 {t.share.x}
        </a>
        <button
          type="button" onClick={copyLink}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition',
            copied ? 'border-success/40 bg-success/10 text-success' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand')}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {copied ? t.share.copied : t.share.copy}
        </button>
      </div>

      {/* Gallery keeps its original proportions — the enlarging the user asked
          for lives in the LIGHTBOX (click → 1000px stage), not here. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:gap-12">
        {/* Gallery */}
        <div>
          <Dialog>
            <DialogTrigger asChild>
              <button className="group relative block w-full overflow-hidden rounded-lg border border-line bg-soft focus-visible:outline-brand" aria-label={t.product.viewLarger}>
                {heroSrc ? (
                <img
                  src={heroSrc}
                  alt={product.gallery[activeImg]?.alt ?? title}
                  width={800}
                  height={1000}
                  className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  fetchPriority="high"
                />
                ) : (
                  <span className="flex aspect-[4/5] w-full items-center justify-center text-4xl text-ink-3/50" aria-hidden>❑</span>
                )}
                {/* prev/next image navigation */}
                {product.gallery.length > 1 && (
                  <>
                    <span
                      role="button" tabIndex={-1} aria-hidden
                      data-gallery-nav="prev"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveImg((i) => (i - 1 + product.gallery.length) % product.gallery.length) }}
                      className="absolute start-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur-sm transition hover:bg-white group-hover:opacity-100 md:opacity-0"
                    >
                      <ChevronLeft className="h-4.5 w-4.5 mirror-rtl" />
                    </span>
                    <span
                      role="button" tabIndex={-1} aria-hidden
                      data-gallery-nav="next"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveImg((i) => (i + 1) % product.gallery.length) }}
                      className="absolute end-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur-sm transition hover:bg-white group-hover:opacity-100 md:opacity-0"
                    >
                      <ChevronRight className="h-4.5 w-4.5 mirror-rtl" />
                    </span>
                    <span className="absolute bottom-3 end-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white bdi" dir="ltr">
                      {isFa ? faDigits(`${activeImg + 1} / ${product.gallery.length}`) : `${activeImg + 1} / ${product.gallery.length}`}
                    </span>
                  </>
                )}
                <span className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink-2 opacity-0 transition group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4" aria-hidden />
                </span>
              </button>
            </DialogTrigger>
            {/* LIGHTBOX is what the user wanted wide: 1000px on a full desktop
                screen, fluid below that. `!` so the component's default
                sm:max-w-lg can never win the cascade; min() keeps it on-screen
                on small viewports (user request: ۱۰۰۰ پیکسل تمام‌صفحه + ریسپانسیو). */}
            <DialogContent aria-describedby={undefined} className="p-2" style={{ maxWidth: 'min(1000px, calc(100% - 2rem))' }}>
              <DialogTitle className="sr-only">{title}</DialogTitle>
              {/* FIXED frame: the stage has a constant height regardless of each
                  image's aspect ratio, so the controls below never move when the
                  user flips from a portrait cover to a landscape spread — no
                  mouse re-chasing (user request). */}
              <div className="flex h-[74vh] max-h-[74vh] w-full items-center justify-center overflow-hidden rounded bg-soft">
                <img
                  key={activeImg}
                  src={product.gallery[activeImg]?.url || product.coverUrl || undefined}
                  alt={title}
                  className="max-h-full max-w-full object-contain animate-in fade-in duration-300"
                />
              </div>
              {product.gallery.length > 1 && (
                <div className="mt-2.5 flex items-center justify-center gap-2 pb-1">
                  <button
                    type="button"
                    aria-label={t.home.heroPrev}
                    onClick={() => setActiveImg((i) => (i - 1 + product.gallery.length) % product.gallery.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-2 transition hover:bg-soft hover:text-ink"
                  >
                    <ChevronLeft className="h-4 w-4 mirror-rtl" aria-hidden />
                  </button>
                  <div className="flex items-center gap-1.5" role="tablist" aria-label={t.product.gallery}>
                    {product.gallery.map((g, i) => (
                      <button
                        key={i} type="button" role="tab" aria-selected={i === activeImg}
                        onClick={() => setActiveImg(i)}
                        className={cn('h-1.5 rounded-full transition-all', i === activeImg ? 'w-6 bg-brand' : 'w-1.5 bg-ink/20 hover:bg-ink/40')}
                      >
                        <span className="sr-only">{g.alt ?? title}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={t.home.heroNext}
                    onClick={() => setActiveImg((i) => (i + 1) % product.gallery.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-2 transition hover:bg-soft hover:text-ink"
                  >
                    <ChevronRight className="h-4 w-4 mirror-rtl" aria-hidden />
                  </button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          {product.gallery.length > 1 && (
            <div className="mt-3 flex gap-2.5" role="tablist" aria-label={t.product.gallery}>
              {product.gallery.map((g, i) => (
                <button
                  key={i} type="button" role="tab" aria-selected={i === activeImg}
                  onClick={() => setActiveImg(i)}
                  className={cn('overflow-hidden rounded-md border-2 transition', i === activeImg ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100')}
                >
                  { }
                  <img src={g.url} alt="" className="h-20 w-15 object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Purchase panel */}
        <div>
          {product.series ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-dark">
              {product.seriesSlug ? (
                <button type="button" onClick={() => navigate(`/series/${product.seriesSlug}`)} className="transition hover:text-orange-accent hover:underline focus-visible:outline-brand">
                  {seriesLabel(product.series, locale)}
                </button>
              ) : (
                seriesLabel(product.series, locale)
              )}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-[15px] text-ink-3">{subtitle}</p> : null}
          <p className="mt-2 text-sm text-ink-2">
            {product.contributors.map((c, i) => (
              <span key={c.slug + c.role}>
                {i > 0 && ' · '}
                <button onClick={() => navigate(`/authors/${c.slug}`)} className="font-medium text-brand hover:underline">
                  {c.name}
                </button>
                <span className="ms-1 text-xs text-ink-3">
                  {c.role === 'AUTHOR' ? '' : c.role === 'TRANSLATOR' ? (isFa ? '(مترجم)' : `(${t.authors.translator.toLowerCase()})`) : ''}
                </span>
              </span>
            ))}
          </p>

          {/* FA (RTL) layout fix (user request): the commercial block — rating,
              price/stock and the discount pill — anchors to the visual LEFT
              edge in Persian. `items-end` resolves against the RTL inline
              direction (end = left), so FA lands left while EN keeps its
              default start alignment. */}
          <div className={cn(isFa && 'flex flex-col items-end')}>
            {product.rating && product.rating.count > 0 && (
              <div className="mt-3"><RatingStars value={product.rating.avg} count={product.rating.count} size="md" locale={locale} /></div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {variant && onSale ? (
                <SalePriceTag minor={effPrice ?? variant.priceMinor} listMinor={variant.priceMinor} locale={locale} className="text-3xl [&>span:nth-child(2)]:text-sm [&>span:nth-child(3)]:text-xs" />
              ) : variant ? (
                <PriceTag minor={variant.priceMinor} locale={locale} className="text-3xl" />
              ) : null}
              <StockBadge inStock={inStock} isLowStock={variant?.isLowStock} lowCount={variant?.stock} locale={locale} />
            </div>
            {onSale && product.promotion ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-orange-accent/30 bg-orange-accent/10 px-2 py-1 text-xs font-medium text-orange-dark">
                <Tag className="h-3.5 w-3.5 mirror-rtl" aria-hidden />
                {isFa ? product.promotion.noteFa || product.promotion.name : product.promotion.noteEn || product.promotion.name}
              </p>
            ) : !onSale && product.promoExcluded && product.promotion ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-brand/25 bg-brand-soft/60 px-2 py-1 text-xs font-medium text-brand">
                <ShieldCheck className="h-3.5 w-3.5 mirror-rtl" aria-hidden />
                {t.product.fixedPriceBadge}
              </p>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">{t.common.vatIncludedNote}</p>

          {product.variants.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-ink">{t.product.selectFormat}</p>
              <div className="grid grid-cols-2 gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id} type="button" onClick={() => { setVariantId(v.id); setQty(1) }}
                    aria-pressed={v.id === variantId}
                    className={cn('rounded-lg border p-3 text-start transition',
                      v.id === variantId ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-ink-3',
                      v.stock === 0 && 'opacity-55')}
                  >
                    <span className="block text-sm font-semibold text-ink">{FORMAT_LABEL[v.format]?.[locale] ?? v.format}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {v.stock === 0 ? t.common.outOfStock : (
                        v.salePriceMinor != null && v.salePriceMinor < v.priceMinor ? (
                          <>
                            <span className="font-semibold text-orange-dark"><span className="bdi">{formatMoney(v.salePriceMinor, locale)}</span></span>
                            {' '}
                            <span className="line-through opacity-70"><span className="bdi">{formatMoney(v.priceMinor, locale)}</span></span>
                          </>
                        ) : formatMoney(v.priceMinor, locale)
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-3">{bookLanguageLabel(v.bookLanguage, locale)}{v.editionLabel ? ` · ${v.editionLabel}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {inStock ? (
            <div className="mt-5 flex items-stretch gap-3">
              <QtyStepper value={qty} onChange={setQty} max={Math.min(10, variant?.stock ?? 10)} disabled={!inStock} locale={locale} />
              <Button
                size="lg" className="h-11 flex-1 text-[15px]" disabled={!inStock || adding}
                onClick={addToCart}
              >
                {adding ? t.common.loading : t.common.addToCart}
              </Button>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-line bg-soft/60 p-4">
              {bisDone ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success" role="status">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15"><Check className="h-3.5 w-3.5" aria-hidden /></span>
                  {t.bis.success}
                </p>
              ) : (
                <form onSubmit={submitNotify} className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <BellRing className="h-4 w-4 text-brand mirror-rtl" aria-hidden />
                    {t.bis.notify}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email" required value={bisEmail} dir="ltr"
                      onChange={(e) => setBisEmail(e.target.value)}
                      placeholder={t.bis.email} aria-label={t.bis.email}
                      className="h-10 flex-1 bg-white"
                    />
                    <Button type="submit" variant="outline" disabled={bisBusy} className="h-10 border-brand/40 text-brand hover:bg-brand-soft">
                      {bisBusy ? t.bis.submitting : t.bis.submit}
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-3">{t.bis.hint}</p>
                </form>
              )}
            </div>
          )}

          {/* Trust row */}
          <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg border border-line bg-soft px-3 py-3 text-center">
            <div className="flex flex-col items-center gap-1 text-[11px] text-ink-2">
              <Truck className="h-4.5 w-4.5 text-brand" aria-hidden />{t.product.shipsIn}
            </div>
            <div className="flex flex-col items-center gap-1 text-[11px] text-ink-2">
              <RotateCcw className="h-4.5 w-4.5 text-brand" aria-hidden />{isFa ? 'بازگشت ۱۴ روزه' : '14-day returns'}
            </div>
            <div className="flex flex-col items-center gap-1 text-[11px] text-ink-2">
              <ShieldCheck className="h-4.5 w-4.5 text-brand" aria-hidden />{t.product.secureOrder}
            </div>
          </div>

          {/* Short description */}
          {shortDesc && <p className="mt-6 text-[15px] leading-relaxed text-ink-2">{shortDesc}</p>}

          {/* Shipping note */}
          <div className="mt-4 rounded-lg border border-line px-4 py-3">
            <p className="text-sm font-medium text-ink">{t.product.shippingReturns}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{tf(t.product.shippingNote, { amount: freeShipAmount })}</p>
          </div>
        </div>
      </div>

      {/* Long description */}
      {product.longDescription && product.longDescription.length > 0 && (
        <section className="mt-12 border-t border-line pt-10" aria-label={t.common.by}>
          <ProseBlocks blocks={product.longDescription} locale={locale} />
        </section>
      )}

      {/* Specs + contributors */}
      <section className="mt-12 grid gap-10 border-t border-line pt-10 lg:grid-cols-2" aria-label={t.product.specs}>
        <div>
          <h2 className="mb-4 text-lg font-semibold text-ink">{t.product.specs}</h2>
          <dl className="divide-y divide-line rounded-lg border border-line">
            {[
              [t.common.publisher, product.publisher],
              [t.common.pubDate, formatDate(product.publicationDate, locale)],
              product.series ? [t.common.series, seriesLabel(product.series, locale)] : null,
              variant ? [t.common.format, FORMAT_LABEL[variant.format]?.[locale] ?? variant.format] : null,
              variant ? [t.common.language, bookLanguageLabel(variant.bookLanguage, locale)] : null,
              variant?.pageCount ? [t.common.pages, isFa ? faDigits(String(variant.pageCount)) : String(variant.pageCount)] : null,
              variant ? [t.common.isbn, variant.isbn13 ?? ''] : null,
              variant ? [t.common.dimensions, isFa ? faDigits(formatDims(variant)) : formatDims(variant)] : null,
              variant?.weightG ? [t.common.weight, isFa ? faDigits(`${variant.weightG} g`) : `${variant.weightG} g`] : null,
              variant?.countryOfPrinting ? [t.common.printedIn, countryLabel(variant.countryOfPrinting, locale)] : null,
              product.audience ? [isFa ? 'گروه سنی' : 'Audience', product.audience] : null,
            ].filter(Boolean).map((row, i) => {
              const [k, v] = row as [string, string]
              return (
                <div key={i} className="grid grid-cols-[130px_1fr] gap-4 px-4 py-2.5 text-sm odd:bg-soft/60">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-ink-2 bdi">{v || '—'}</dd>
                </div>
              )
            })}
          </dl>
          {product.safetyNote && (
            <Accordion type="single" collapsible className="mt-3">
              <AccordionItem value="safety" className="border-line">
                <AccordionTrigger className="py-3 text-sm font-medium">{t.product.safety}</AccordionTrigger>
                <AccordionContent className="text-sm text-ink-3">{product.safetyNote}</AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
        <div>
          <h2 className="mb-4 text-lg font-semibold text-ink">{t.product.contributors}</h2>
          <ul className="space-y-4">
            {product.contributors.map((c) => (
              <li key={c.slug} className="flex items-center gap-4 rounded-lg border border-line p-3">
                <button onClick={() => navigate(`/authors/${c.slug}`)} className="shrink-0" aria-label={c.name}>
                  <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-soft text-lg font-bold text-brand">
                    {c.name[0]}
                  </span>
                </button>
                <div className="min-w-0">
                  <button onClick={() => navigate(`/authors/${c.slug}`)} className="text-sm font-semibold text-ink hover:text-brand hover:underline">
                    {c.name}
                  </button>
                  <p className="text-xs text-ink-3">{c.role === 'AUTHOR' ? t.authors.author : c.role === 'TRANSLATOR' ? t.authors.translator : c.role}</p>
                </div>
                <Button variant="ghost" size="sm" className="ms-auto h-9 shrink-0 text-xs text-brand" onClick={() => navigate(`/authors/${c.slug}`)}>
                  {t.product.viewProfile}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Reviews */}
      <section className="mt-12 border-t border-line pt-10" aria-label={t.common.reviews}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{t.common.reviews} {product.rating && product.rating.count > 0 ? `(${product.rating.count})` : ''}</h2>
          {product.rating && product.rating.count > 0 && <RatingStars value={product.rating.avg} count={product.rating.count} size="md" locale={locale} />}
        </div>
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {product.reviews.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-3">{t.common.empty}</p>
            ) : (product.reviews.items as ReviewWithReply[]).map((r) => (
              <article key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <RatingStars value={r.rating} locale={locale} />
                  <h3 className="text-sm font-semibold text-ink">{r.title}</h3>
                  {r.isVerifiedPurchase && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                      <BadgeCheck className="h-3 w-3" aria-hidden />{t.common.verifiedPurchase}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{r.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-3">{r.authorName ?? (isFa ? 'خوانندهٔ پرس‌پیکس' : 'Persepix reader')} · {formatDate(r.createdAt, locale)}</p>
                  {(() => {
                    const v = voteState(r)
                    return (
                      <button
                        type="button"
                        onClick={() => toggleHelpful(r)}
                        aria-pressed={v.voted}
                        aria-label={`${t.product.helpful}${v.helpfulCount > 0 ? ` (${isFa ? faDigits(String(v.helpfulCount)) : v.helpfulCount})` : ''}`}
                        disabled={voteBusy === r.id}
                        className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-60',
                          v.voted ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line text-ink-3 hover:border-brand/40 hover:text-brand')}
                      >
                        <ThumbsUp className={cn('h-3.5 w-3.5', v.voted && 'fill-current')} aria-hidden />
                        {t.product.helpful}
                        {v.helpfulCount > 0 && <span className="bdi">({isFa ? faDigits(String(v.helpfulCount)) : v.helpfulCount})</span>}
                      </button>
                    )
                  })()}
                </div>
                {/* Press response — visually nested under the review it answers. */}
                {r.reply ? (
                  <div className="mt-3 ms-3 rounded-e-md border-s-2 border-brand/30 bg-soft/60 px-4 py-3" role="note" aria-label={isFa ? 'پاسخ پرس‌پیکس' : 'Response from Persepix'}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">{isFa ? 'پاسخ پرس‌پیکس' : 'Response from Persepix'}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{r.reply}</p>
                    {r.repliedAt ? <p className="mt-1.5 text-[11px] text-ink-3">{formatDate(r.repliedAt, locale)}</p> : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <div>
            {reviewDone ? (
              <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">{t.product.reviewPending}</div>
            ) : (
              <form onSubmit={submitReview} className="rounded-lg border border-line p-4">
                <h3 className="mb-3 text-sm font-semibold text-ink">{t.product.writeReview}</h3>
                <div className="mb-3">
                  <Label className="mb-1.5 text-xs">{t.product.yourRating}</Label>
                  <div className="flex gap-1" role="radiogroup" aria-label={t.product.yourRating}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n} type="button" role="radio" aria-checked={reviewForm.rating === n} aria-label={`${n} ★`}
                        onClick={() => setReviewForm((f) => ({ ...f, rating: n }))}
                        className="rounded p-0.5"
                      >
                        <Star className={cn('h-6 w-6', n <= reviewForm.rating ? 'fill-orange-accent text-orange-accent' : 'text-line')} />
                      </button>
                    ))}
                  </div>
                </div>
                {!user && (
                  <div className="mb-3">
                    <Label htmlFor="rev-name" className="mb-1.5 text-xs">{t.product.reviewName}</Label>
                    <Input id="rev-name" required value={reviewForm.name} onChange={(e) => setReviewForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                )}
                <div className="mb-3">
                  <Label htmlFor="rev-title" className="mb-1.5 text-xs">{t.product.reviewTitle}</Label>
                  <Input id="rev-title" value={reviewForm.title} onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <Label htmlFor="rev-body" className="mb-1.5 text-xs">{t.product.reviewBody}</Label>
                  <Textarea id="rev-body" required minLength={10} rows={4} value={reviewForm.body} onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))} />
                </div>
                <Button type="submit" disabled={reviewBusy} className="w-full">{reviewBusy ? t.common.submitting : t.product.submitReview}</Button>
                <p className="mt-2 text-center text-[11px] text-ink-3">{t.product.reviewLogin}</p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Related */}
      {product.related.length > 0 && (
        <section className="mt-12 border-t border-line pt-10" aria-label={t.product.related}>
          <h2 className="mb-6 text-lg font-semibold text-ink">{t.product.related}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {product.related.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} locale={locale} />)}
          </div>
        </section>
      )}

      {/* Recently viewed (hidden until the visitor has a history) */}
      <RecentlyViewed excludeSlug={product.slug} className="mt-12 border-t border-line pt-10" />
    </main>
  )
}
