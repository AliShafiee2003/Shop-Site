'use client'

import { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Search, User, ShoppingCart, Menu, X, Globe, ChevronDown, Loader2, Trash2, Heart, ChevronLeft, ChevronRight, Gift, Library, Check, Megaphone } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { navigate, useRoute, useLocaleSwitch, localePath } from '@/lib/router'
import { apiGet, apiPost, apiPatch, apiDelete, normalizeCart } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useSettings } from '@/lib/use-settings'
import { FreeShippingBar } from './FreeShippingBar'
import type { Locale, CartDTO, SearchResults, CategoryDTO } from '@/lib/types'

const NAV = [
  { key: 'books', href: '/books' },
  { key: 'authors', href: '/authors' },
  { key: 'articles', href: '/articles' },
  { key: 'about', href: '/about' },
] as const

export function Logo({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  return (
    <Link
      href={localePath(locale, '/')}
      onClick={(e) => { e.preventDefault(); navigate('/') }}
      className="flex rounded-md focus-visible:outline-brand"
      aria-label={t.brand.name}
    >
      {/* PersePix seal — uploaded brand logo (transparent PNG, seal + wordmark).
          User: the separate text wordmark is REMOVED — «خود لوگو کافی هست» —
          the seal alone carries the brand and the freed width tidies the bar.
          The link keeps an aria-label so screen readers still announce the name. */}
      <img
        src="/images/logo.png"
        alt=""
        width={512}
        height={512}
        className="h-[72px] w-[72px] object-contain sm:h-[88px] sm:w-[88px]"
        aria-hidden
      />
    </Link>
  )
}

const LANGS: { code: Locale; native: string; en: string; badge: string }[] = [
  { code: 'en', native: 'English', en: 'English edition', badge: 'EN' },
  { code: 'fa', native: 'فارسی', en: 'Persian edition', badge: 'فا' },
]

/** Refined language switcher (user: «خیلی ظرافت نداره») — a small globe pill
 *  opening a menu with native names, edition sublabels and an active check.
 *  `id` is pinned by callers (Radix otherwise mints a useId-based id that can
 *  diverge between a stale SSR HTML snapshot and a newer client bundle after
 *  a dev-server restart — the reported hydration warning on this trigger). */
function LanguageSwitcher({ locale, id }: { locale: Locale; id?: string }) {
  const switchLocale = useLocaleSwitch()
  return (
    <DropdownMenu dir={locale === 'fa' ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id={id}
          aria-haspopup="menu"
          aria-label={locale === 'fa' ? 'زبان: فارسی' : 'Language: English'}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white ps-2.5 pe-2 text-xs font-semibold text-ink-2 shadow-sm transition hover:border-brand/40 hover:text-ink data-[state=open]:border-brand/40 data-[state=open]:bg-soft data-[state=open]:text-ink"
        >
          <Globe className="h-3.5 w-3.5 text-ink-3" aria-hidden />
          <span className="min-w-5 text-center">{locale === 'fa' ? 'فا' : 'EN'}</span>
          <ChevronDown className="h-3 w-3 opacity-60 transition-transform data-[state=open]:rotate-180" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          {locale === 'fa' ? 'زبان' : 'Language'}
        </DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} asChild>
            <button
              type="button" lang={l.code}
              onClick={() => switchLocale(l.code)}
              aria-pressed={locale === l.code}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start"
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  locale === l.code ? 'bg-brand text-white' : 'bg-soft text-ink-2',
                )}
                aria-hidden
              >
                {l.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', locale === l.code ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
                  {l.native}
                </span>
                <span className="block truncate text-[10px] text-ink-3">{l.en}</span>
              </span>
              {locale === l.code && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />}
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchOverlay({ locale, onDone, autoFocus = true, inputClassName }: { locale: Locale; onDone?: () => void; autoFocus?: boolean; inputClassName?: string }) {
  const t = getDict(locale)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autofocus is for the overlay/card variants — the inline header box must
  // NOT steal focus on every page load.
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    if (debounce.current) clearTimeout(debounce.current)
    setLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const r = await apiGet<SearchResults>(`/api/search?locale=${locale}&q=${encodeURIComponent(q.trim())}`)
        setResults(r)
      } catch { setResults(null) } finally { setLoading(false) }
    }, 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [q, locale])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) { navigate(`/search?q=${encodeURIComponent(q.trim())}`); onDone?.() }
  }

  /** Inline variant: blur/Escape collapse the dropdown (delayed just enough
   *  for a result click to land first). */
  const collapse = () => { setResults(null); setLoading(false) }
  const onBlur = () => { setTimeout(collapse, 180) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setQ(''); collapse(); inputRef.current?.blur() }
  }

  return (
    <form onSubmit={submit} role="search" className="w-full">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={t.common.searchPlaceholder}
          className={cn('h-11 ps-9 pe-9', inputClassName)}
          aria-label={t.nav.search}
        />
        {loading && <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-3" aria-hidden />}
      </div>
      {results && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[420px] overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg scrollbar-slim">
          {results.products.length === 0 && results.people.length === 0 && results.articles.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-3">{t.common.noResults} “{q}”</p>
          ) : (
            <>
              {results.products.slice(0, 5).map((p) => (
                <button
                  key={p.id} type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-soft"
                  onClick={() => { navigate(`/books/${p.slug}`); onDone?.() }}
                >
                  { }
                  <img src={p.coverUrl ?? ''} alt="" className="h-12 w-9 rounded-sm border border-line object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                    <span className="block text-xs text-ink-3">{p.contributors?.[0]?.name}</span>
                  </span>
                  <span className="ms-auto text-xs font-semibold text-ink bdi">{formatMoney(p.priceMinor, locale)}</span>
                </button>
              ))}
              {results.people.slice(0, 3).map((p) => (
                <button
                  key={p.slug} type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-soft"
                  onClick={() => { navigate(`/authors/${p.slug}`); onDone?.() }}
                >
                  {p.portraitUrl ? (
                     
                    <img src={p.portraitUrl} alt="" className="h-9 w-9 rounded-full border border-line object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{p.name[0]}</span>
                  )}
                  <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="ms-auto text-xs text-ink-3">{p.profession}</span>
                </button>
              ))}
              {results.articles.slice(0, 3).map((a) => (
                <button
                  key={a.slug} type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-soft"
                  onClick={() => { navigate(`/articles/${a.slug}`); onDone?.() }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-soft text-xs text-ink-3" aria-hidden>✎</span>
                  <span className="truncate text-sm text-ink-2">{a.title}</span>
                </button>
              ))}
              <button
                type="submit"
                className="mt-1 w-full rounded-md bg-brand-soft px-3 py-2 text-center text-sm font-medium text-brand hover:bg-brand/15"
              >
                {t.common.searchResults} “{q}”
              </button>
            </>
          )}
        </div>
      )}
    </form>
  )
}

export function MiniCart({ locale, open, onOpenChange }: { locale: Locale; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = getDict(locale)
  const [cart, setCart] = useState<CartDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const setCartSummary = useApp((s) => s.setCartSummary)

  useEffect(() => {
    if (open) {
      apiGet<CartDTO>('/api/cart').then((c) => { const n = normalizeCart(c); setCart(n); setCartSummary(n.count, n.subtotalMinor) }).catch(() => setCart(null))
    }
  }, [open, setCartSummary])

  const mutate = async (fn: () => Promise<CartDTO>) => {
    setBusy(true)
    try {
      const c = normalizeCart(await fn())
      setCart(c)
      setCartSummary(c.count, c.subtotalMinor)
    } catch { /* toast via checkout */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} side={locale === 'fa' ? 'left' : 'right'} className="flex w-full max-w-md flex-col p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-line px-5 py-4">
          <SheetTitle className="text-base font-semibold">{t.cart.title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 scrollbar-slim">
          {!cart ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ink-3" /></div>
          ) : cart.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ShoppingCart className="h-8 w-8 text-ink-3" aria-hidden />
              <p className="text-sm text-ink-3">{t.cart.empty}</p>
              <Button onClick={() => { onOpenChange(false); navigate('/books') }}>{t.cart.emptyCta}</Button>
            </div>
          ) : (
            <>
              <div className="pt-4"><FreeShippingBar subtotalMinor={cart.subtotalMinor} locale={locale} /></div>
              <ul className="divide-y divide-line py-2">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-4">
                  <button
                    type="button" className="shrink-0" aria-label={item.title}
                    onClick={() => { onOpenChange(false); navigate(`/books/${item.slug}`) }}
                  >
                    { }
                    <img src={item.coverUrl ?? ''} alt="" className="h-20 w-14 rounded-sm border border-line object-cover" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{item.format} · {item.bookLanguage}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-md border border-line">
                        <button
                          type="button" disabled={busy} aria-label="Decrease quantity"
                          className="flex h-8 w-8 items-center justify-center rounded-s-md text-ink-2 hover:bg-soft disabled:opacity-40"
                          onClick={() => mutate(() => apiPatch<CartDTO>(`/api/cart/items/${item.id}`, { quantity: item.quantity - 1 }))}
                        >−</button>
                        <span className="flex h-8 min-w-7 items-center justify-center border-x border-line text-xs font-medium tabular-nums">{item.quantity}</span>
                        <button
                          type="button" disabled={busy || item.quantity >= Math.min(10, item.stock)} aria-label="Increase quantity"
                          className="flex h-8 w-8 items-center justify-center rounded-e-md text-ink-2 hover:bg-soft disabled:opacity-40"
                          onClick={() => mutate(() => apiPatch<CartDTO>(`/api/cart/items/${item.id}`, { quantity: item.quantity + 1 }))}
                        >+</button>
                      </div>
                      <span className="ms-auto text-sm font-semibold text-ink bdi">{formatMoney(item.lineTotalMinor, locale)}</span>
                    </div>
                    {item.quantity >= item.stock && item.stock > 0 && (
                      <p className="mt-1 text-[11px] text-warning">{t.common.lowStock.replace('{n}', locale === 'fa' ? faDigits(String(item.stock)) : String(item.stock))}</p>
                    )}
                  </div>
                  <button
                    type="button" disabled={busy} aria-label={t.cart.remove}
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-soft hover:text-error"
                    onClick={() => mutate(() => apiDelete<CartDTO>(`/api/cart/items/${item.id}`))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>
        {cart && cart.items.length > 0 && (
          <div className="border-t border-line bg-white px-5 py-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-ink-2">{t.common.subtotal}</span>
              <span className="font-semibold text-ink bdi">{formatMoney(cart.subtotalMinor, locale)}</span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-ink-3">{t.common.vatIncludedNote}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); navigate('/cart') }}>{t.cart.title}</Button>
              <Button onClick={() => { onOpenChange(false); navigate('/checkout') }}>{t.common.goCheckout}</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const ROTATE_MS = 5200
const DISMISS_KEY = 'sp:announce-dismissed-at'
const DISMISS_TTL_MS = 12 * 3600 * 1000 // re-show after half a day

const noopSubscribe = () => () => {}

/** Announcement strip: rotates the live promotion, free-shipping threshold and
 *  the newsletter invite. Pauses on hover/focus; manual prev/next + dismiss
 *  (remembered for half a day); each message deep-links to its related page. */
function AnnouncementBar({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const settings = useSettings()
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(0)
  const [dismissedNow, setDismissedNow] = useState(false)

  // Hydration-safe persisted dismiss read (same pattern as the cookie banner)
  const dismissedStored = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0)
        return at > 0 && Date.now() - at < DISMISS_TTL_MS
      } catch { return false }
    },
    () => false, // show during SSR & first hydration pass
  )
  const dismissed = dismissedNow || dismissedStored

  const dismiss = () => {
    setDismissedNow(true)
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  const messages = useMemo(() => {
    const out: { key: string; node: React.ReactNode; href?: string }[] = []
    // Admin-authored announcements lead the rotation, ahead of the system messages.
    for (const a of settings?.announcements ?? []) {
      out.push({
        key: `ann-${a.id}`,
        href: a.href ?? undefined,
        node: (
          <span className="inline-flex items-center gap-1.5">
            <Megaphone className="h-3 w-3 shrink-0 text-orange-accent" aria-hidden />
            {locale === 'fa' ? a.textFa || a.textEn : a.textEn || a.textFa}
          </span>
        ),
      })
    }
    const promo = settings?.promotion
    if (promo) {
      const note = locale === 'fa' ? promo.noteFa ?? promo.name : promo.noteEn ?? promo.name
      const badge = locale === 'fa' ? faDigits(promo.badge).replace('-', '−') : promo.badge
      out.push({
        key: 'promo',
        href: '/books?sale=1',
        node: (
          <span className="inline-flex items-center gap-2">
            <span className="promo-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-accent" aria-hidden />
            <span className="font-semibold">{note}</span>
            <span className="rounded-full bg-orange-accent px-1.5 py-px text-[10px] font-bold text-white bdi" dir="ltr">{badge}</span>
          </span>
        ),
      })
    }
    const threshold = settings?.store?.freeShippingThresholdMinor ?? 6000
    out.push({
      key: 'ship',
      href: '/shipping-returns',
      node: (
        <span>
          {tf(t.announce.freeShipping, { amount: formatMoney(threshold, locale) })}
          <span className="hidden sm:inline">{t.announce.suffixShip}</span>
        </span>
      ),
    })
    if (settings?.giftWrap?.enabled) {
      out.push({
        key: 'gift',
        href: '/shipping-returns',
        node: (
          <span className="inline-flex items-center gap-1.5">
            <Gift className="h-3 w-3 shrink-0 text-orange-accent" aria-hidden />
            {tf(t.announce.giftWrap, { amount: formatMoney(settings.giftWrap.priceMinor ?? 250, locale) })}
          </span>
        ),
      })
    }
    out.push({ key: 'letter', href: '/contact', node: t.announce.letter })
    return out
  }, [settings, locale, t])

  useEffect(() => {
    if (messages.length < 2 || paused) return
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [messages.length, paused])

  if (dismissed || messages.length === 0) return null
  const active = messages[index % messages.length]
  const step = (dir: 1 | -1) => setIndex((i) => (i + dir + messages.length) % messages.length)

  const onMessageClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (active.href) navigate(active.href)
    else step(1)
  }

  return (
    <div
      className="group/announce relative bg-brand text-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="mx-auto flex h-8 max-w-6xl items-center justify-center gap-1 overflow-hidden px-9 sm:px-11"
        aria-label={t.announce.live}
      >
        {/* key re-mounts on rotation → replay the slide-in animation */}
        <button
          type="button"
          onClick={onMessageClick}
          className="min-w-0 max-w-full truncate rounded px-1 text-xs font-medium text-white/95 transition hover:text-white"
          aria-live="off"
        >
          <span key={active.key + locale} className="announce-item block w-full truncate">
            {active.node}
          </span>
        </button>
      </div>
      {/* Manual rotation controls */}
      <div className="absolute inset-y-0 start-2 hidden items-center gap-0.5 sm:flex" dir="ltr">
        <button
          type="button" onClick={() => step(-1)} aria-label={t.announce.prev}
          className="flex h-5.5 w-5.5 items-center justify-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button" onClick={() => step(1)} aria-label={t.announce.next}
          className="flex h-5.5 w-5.5 items-center justify-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <button
        type="button" onClick={dismiss} aria-label={t.announce.dismiss}
        className="absolute inset-y-0 end-2 my-auto flex h-5.5 w-5.5 items-center justify-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

function useBookCategories(locale: Locale) {
  // Always-fresh categories: the header outlives admin edits in this SPA, so
  // we refetch (a) on locale change and (b) whenever a consumer menu OPENS —
  // a category added in the admin therefore appears the next time the menu is
  // opened, without a page reload.
  const [cats, setCats] = useState<CategoryDTO[] | null>(null)
  const localeRef = useRef(locale)
  const load = useCallback((forLocale: Locale) => {
    let stale = false
    apiGet<CategoryDTO[]>(`/api/categories?locale=${forLocale}`)
      .then((r) => { if (!stale) setCats(r) })
      .catch(() => { if (!stale) setCats([]) })
    return () => { stale = true }
  }, [])
  useEffect(() => {
    localeRef.current = locale
    return load(locale)
  }, [locale, load])
  const refresh = useCallback(() => load(localeRef.current), [load])
  return { cats, refresh }
}

function BooksDropdown({ locale, active, label, cats, onOpen }: {
  locale: Locale
  active: boolean
  label: string
  cats: CategoryDTO[] | null
  onOpen?: () => void
}) {
  const t = getDict(locale)
  const go = (href: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault()
    navigate(href)
  }
  return (
    <DropdownMenu
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      onOpenChange={(open) => { if (open) onOpen?.() }}
    >
      <DropdownMenuTrigger id="sp-books-nav" asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-controls="sp-books-menu"
          className={cn(
            // Tab row item (Task 53): quiet text + a brand underline that
            // lights up for the active section and sits on the header's own
            // border-b — level with the logo, below the search box.
            'relative inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition',
            active ? 'text-brand' : 'text-ink-2 hover:bg-soft hover:text-ink',
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span aria-hidden className={cn('absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-brand transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent id="sp-books-menu" align="start" className="w-64 p-1.5">
        <DropdownMenuItem asChild>
          <a
            href={localePath(locale, '/books')}
            onClick={go('/books')}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm font-semibold text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Library className="h-4 w-4" aria-hidden />
            </span>
            {t.nav.allBooks}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {t.nav.browseByCategory}
        </DropdownMenuLabel>
        {(cats ?? []).map((c) => (
          <DropdownMenuItem key={c.slug} asChild>
            <a
              href={localePath(locale, `/books?category=${c.slug}`)}
              onClick={go(`/books?category=${c.slug}`)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:text-ink"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? '#014B74' }} aria-hidden />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-ink-3">{locale === 'fa' ? faDigits(String(c.productCount ?? 0)) : String(c.productCount ?? 0)}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const user = useApp((s) => s.user)
  const cartCount = useApp((s) => s.cartCount)
  const miniCartOpen = useApp((s) => s.miniCartOpen)
  const setMiniCartOpen = useApp((s) => s.setMiniCartOpen)
  const mobileMenuOpen = useApp((s) => s.mobileMenuOpen)
  const setMobileMenuOpen = useApp((s) => s.setMobileMenuOpen)
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const { cats: bookCats, refresh: refreshBookCats } = useBookCategories(locale)
  const isActive = (href: string) => route.segments[0] === href.slice(1)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const searchCardRef = useRef<HTMLDivElement>(null)

  // Close the desktop search when clicking/tapping anywhere outside it —
  // both the toggle button and the card itself keep it open (user request:
  // «با کلیک خارج از کادر جستجو، کادر بسته شود») — or on Escape.
  useEffect(() => {
    if (!desktopSearchOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (searchCardRef.current?.contains(target) || searchBtnRef.current?.contains(target)) return
      setDesktopSearchOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDesktopSearchOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [desktopSearchOpen])

  return (
    <>
      <a href="#main" className="skip-link">{t.common.skipToContent}</a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        {/* Announcement strip — rotating promo / shipping / newsletter (keyed by locale to reset rotation) */}
        <AnnouncementBar key={locale} locale={locale} />

        {/* Task 53: back to 80px mobile / 96px desktop TOTAL — the separate tab
            strip is gone; the tabs are absolutely positioned inside this row
            (see nav below). Search + actions form one deck that lifts to the
            top on lg+ so the centered tab row fits BELOW the search box but
            level with the logo (the user's red rectangle). */}
        <div className="relative mx-auto flex h-20 max-w-6xl items-center gap-2 px-4 sm:h-24 sm:px-6">
          <Logo locale={locale} />

          {/* Deck = inline search box + action icons, pushed to the end (logo
              side keeps all free space — Task 52's green-rectangle position).
              lg-only self-start/pt-4: y 16–56 in the 96px row, leaving exactly
              a 4px air gap above the 36px tab row (y 60–96). Below lg there
              are no tabs, so the deck stays vertically centered. */}
          <div className="ms-auto flex items-center gap-2 lg:self-start lg:pt-4">
            {/* Inline search box — web (≥md) only (user: «بخش سرچ میتونه یک باکس
                برای تایپ داشته باشه، به جای اینکه فقط آیکون باشه»). Below md
                it collapses back to an icon (user: «اگر از یه حدی کوچکتر شد…
                آیکون بشه»). */}
            <div className="relative hidden w-full max-w-[15rem] md:block lg:max-w-sm">
              <SearchOverlay locale={locale} autoFocus={false} inputClassName="h-10 rounded-full border-line bg-soft/70 focus:bg-white" />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search ICON — small screens only now; ≥md uses the inline box above.
                Opens the same anchored card. */}
            <button
              type="button"
              ref={searchBtnRef}
              onClick={() => setDesktopSearchOpen((o) => !o)}
              aria-expanded={desktopSearchOpen}
              aria-label={t.nav.search}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-soft hover:text-ink md:hidden',
                desktopSearchOpen && 'bg-soft text-ink'
              )}
            >
              <Search className="h-5 w-5" aria-hidden />
            </button>

            {/* Language switcher — desktop header only; on mobile it lives in the
                hamburger menu to keep the bar uncluttered (user request). The
                explicit id keeps SSR/hydration stable across bundle updates. */}
            <div className="hidden sm:block">
              <LanguageSwitcher locale={locale} id="sp-lang-trigger" />
            </div>

            {/* Favorites — account feature, hidden for guests (same as product cards) */}
            {user && (
              <Link
                href={localePath(locale, '/favorites')}
                onClick={(e) => { e.preventDefault(); navigate('/favorites') }}
                aria-label={t.favorites.title}
                className="hidden h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-soft hover:text-orange-accent sm:flex"
              >
                <Heart className="h-5 w-5" aria-hidden />
              </Link>
            )}

            <Link
              href={localePath(locale, `/${user ? 'account' : 'login'}`)}
              onClick={(e) => { e.preventDefault(); navigate(user ? '/account' : '/login') }}
              aria-label={t.nav.account}
              className="flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-soft hover:text-ink"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-line object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="h-5 w-5" aria-hidden />
              )}
            </Link>

            {/* Cart with badge */}
            <button
              type="button" onClick={() => setMiniCartOpen(true)}
              aria-label={`${t.nav.cart} (${cartCount})`}
              className="relative flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-soft hover:text-ink"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden />
              {cartCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -end-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-orange-accent px-1 text-[10px] font-bold text-white"
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
              <span className="sr-only" aria-live="polite">{cartCount} items</span>
            </button>

            {/* Mobile menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={(o) => { setMobileMenuOpen(o); if (o) refreshBookCats() }}>
              <SheetTrigger asChild>
                <button
                  type="button" aria-label={t.nav.menu} aria-controls="sp-mobile-menu"
                  className="flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-soft lg:hidden"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
              </SheetTrigger>
              <SheetContent id="sp-mobile-menu" aria-describedby={undefined} side={locale === 'fa' ? 'right' : 'left'} dir={locale === 'fa' ? 'rtl' : 'ltr'} className="w-80 overflow-y-auto p-0">
                <SheetHeader className="border-b border-line px-4 py-4">
                  <SheetTitle><Logo locale={locale} /></SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-1 p-4">
                  {mobileSearchOpen ? (
                    <div className="relative pb-2">
                      <SearchOverlay locale={locale} onDone={() => { setMobileSearchOpen(false); setMobileMenuOpen(false) }} />
                    </div>
                  ) : (
                    <Button variant="outline" className="justify-start gap-2" onClick={() => setMobileSearchOpen(true)}>
                      <Search className="h-4 w-4" aria-hidden /> {t.nav.search}
                    </Button>
                  )}
                  <Link
                    href={localePath(locale, '/books')}
                    onClick={(e) => { e.preventDefault(); navigate('/books'); setMobileMenuOpen(false) }}
                    className="flex h-11 items-center gap-2 rounded-md px-3 text-[15px] font-semibold text-ink hover:bg-soft"
                  >
                    <Library className="h-4 w-4 text-brand" aria-hidden /> {t.nav.allBooks}
                  </Link>
                  {(bookCats ?? []).map((c) => (
                    <Link
                      key={c.slug}
                      href={localePath(locale, `/books?category=${c.slug}`)}
                      onClick={(e) => { e.preventDefault(); navigate(`/books?category=${c.slug}`); setMobileMenuOpen(false) }}
                      className="flex h-10 items-center gap-2.5 rounded-md px-3 ps-8 text-sm text-ink-2 hover:bg-soft hover:text-ink"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? '#014B74' }} aria-hidden />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-ink-3">{locale === 'fa' ? faDigits(String(c.productCount ?? 0)) : String(c.productCount ?? 0)}</span>
                    </Link>
                  ))}
                  {NAV.filter((item) => item.key !== 'books').map((item) => (
                    <Link
                      key={item.key} href={localePath(locale, item.href)}
                      onClick={(e) => { e.preventDefault(); navigate(item.href); setMobileMenuOpen(false) }}
                      className="flex h-11 items-center rounded-md px-3 text-[15px] font-medium text-ink-2 hover:bg-soft hover:text-ink"
                    >
                      {t.nav[item.key]}
                    </Link>
                  ))}
                  <Separator className="my-2" />
                  {user && (
                    <Link
                      href={localePath(locale, '/favorites')}
                      onClick={(e) => { e.preventDefault(); navigate('/favorites'); setMobileMenuOpen(false) }}
                      className="flex h-11 items-center gap-2 rounded-md px-3 text-[15px] font-medium text-ink-2 hover:bg-soft"
                    >
                      <Heart className="h-4 w-4" aria-hidden /> {t.favorites.title}
                    </Link>
                  )}
                  <Link
                    href={localePath(locale, '/track')}
                    onClick={(e) => { e.preventDefault(); navigate('/track'); setMobileMenuOpen(false) }}
                    className="flex h-11 items-center rounded-md px-3 text-[15px] font-medium text-ink-2 hover:bg-soft"
                  >
                    {t.track.title}
                  </Link>
                  <Link
                    href={localePath(locale, `/${user ? 'account' : 'login'}`)}
                    onClick={(e) => { e.preventDefault(); navigate(user ? '/account' : '/login'); setMobileMenuOpen(false) }}
                    className="flex h-11 items-center gap-2 rounded-md px-3 text-[15px] font-medium text-ink-2 hover:bg-soft"
                  >
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full border border-line object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="h-4 w-4" aria-hidden />
                    )}
                    {' '}{user ? (user.name ?? t.nav.account) : t.auth.login}
                  </Link>
                  <Link
                    href={localePath(locale, '/contact')}
                    onClick={(e) => { e.preventDefault(); navigate('/contact'); setMobileMenuOpen(false) }}
                    className="flex h-11 items-center rounded-md px-3 text-[15px] font-medium text-ink-2 hover:bg-soft"
                  >
                    {t.nav.contact}
                  </Link>
                  <div className="mt-2 flex items-center gap-2 px-3">
                    <LanguageSwitcher locale={locale} />
                    <ChevronDown className="h-4 w-4 text-ink-3" aria-hidden />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            </div>
          </div>

          {/* Tab row (Task 53, the user's red rectangle) — absolutely
              positioned INSIDE the main row: horizontally centered (inset-x-0
              + justify-center is direction-agnostic), bottom flush with the
              header's own border-b, vertically level with the logo's lower
              half and directly below the search box — NOT in a strip below
              the header. Desktop only; phones use the hamburger sheet. The
              active section's brand underline sits on the border-b line. */}
          <nav aria-label={t.nav.menu} className="absolute inset-x-0 bottom-0 hidden justify-center gap-1 lg:flex">
            {NAV.map((item) =>
              item.key === 'books' ? (
                <BooksDropdown key={item.key} locale={locale} active={isActive(item.href)} label={t.nav[item.key]} cats={bookCats} onOpen={refreshBookCats} />
              ) : (
                <Link
                  key={item.key}
                  href={localePath(locale, item.href)}
                  onClick={(e) => { e.preventDefault(); navigate(item.href) }}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium transition',
                    isActive(item.href) ? 'text-brand' : 'text-ink-2 hover:bg-soft hover:text-ink',
                  )}
                >
                  {t.nav[item.key]}
                  <span aria-hidden className={cn('absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-brand transition-opacity', isActive(item.href) ? 'opacity-100' : 'opacity-0')} />
                </Link>
              ),
            )}
          </nav>
        </div>

        {/* Compact search card (≤md icon toggle) — HORIZONTALLY CENTERED under
            the header row. left-1/2 + -translate-x-1/2 is direction-agnostic,
            so it centers identically in RTL. */}
        {desktopSearchOpen && (
          <div
            ref={searchCardRef}
            className="panel-pop absolute left-1/2 top-full z-50 w-[min(36rem,calc(100vw-2rem))] origin-top -translate-x-1/2 rounded-xl border border-line bg-white p-2 shadow-xl"
          >
            <SearchOverlay locale={locale} onDone={() => setDesktopSearchOpen(false)} />
          </div>
        )}
      </header>

      <MiniCart locale={locale} open={miniCartOpen} onOpenChange={setMiniCartOpen} />
    </>
  )
}
// MARKER-1788662492
