'use client'

import { create } from 'zustand'
import type { Locale, UserDTO } from '@/lib/types'

/** Granular, server-verified cookie consent state (Level 1). The server
 *  (CookieConsent rows behind the httpOnly sp_consent_id cookie) is
 *  authoritative — the client store only mirrors the verified decision so
 *  banner/dialog/analytics gating read one consistent shape. */
export type ConsentState = {
  decided: boolean
  policyVersion: string
  categories: {
    necessary: boolean
    preferences: boolean
    analytics: boolean
    personalization: boolean
    marketing: boolean
  }
}

interface AppState {
  locale: Locale
  setLocale: (l: Locale) => void
  user: UserDTO | null
  userLoaded: boolean
  setUser: (u: UserDTO | null) => void
  cartCount: number
  cartSubtotalMinor: number
  setCartSummary: (count: number, subtotalMinor: number) => void
  miniCartOpen: boolean
  setMiniCartOpen: (o: boolean) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (o: boolean) => void
  consentAccepted: boolean
  setConsentAccepted: (v: boolean) => void
  /** Verified granular consent (server mirror) + preference-center dialog. */
  consent: ConsentState | null
  setConsent: (s: ConsentState | null) => void
  cookiePrefsOpen: boolean
  setCookiePrefsOpen: (o: boolean) => void
  /** Wishlist (product slugs). localStorage for guests; synced to the account when signed in. */
  favorites: string[]
  favsLoaded: boolean
  favsSynced: boolean
  initFavorites: () => void
  toggleFavorite: (slug: string) => boolean
  /** Merge local favorites into the server list (login), adopt result. */
  syncWishlistOnLogin: () => Promise<void>
}

const CONSENT_KEY = 'sp_consent_v1'
const FAVS_KEY = 'sp_favs_v1'

function readFavorites(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVS_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, 48) : []
  } catch {
    return []
  }
}

function writeFavorites(slugs: string[]) {
  try {
    window.localStorage.setItem(FAVS_KEY, JSON.stringify(slugs.slice(0, 48)))
  } catch { /* private mode */ }
}

/**
 * Wishlist write queue — syncWishlistOnLogin (merge PUT) and toggleFavorite
 * (replace-all PUT) both write the whole list; racing them could silently drop
 * a just-added favorite. Every server write now goes through one promise chain,
 * so writes execute in issue order with the LATEST local list.
 */
let wishlistWriteChain: Promise<void> = Promise.resolve()
function enqueueWishlistWrite(write: () => Promise<void>): Promise<void> {
  const run = wishlistWriteChain.then(write, write)
  wishlistWriteChain = run.catch(() => { /* keep the chain alive */ })
  return run
}

export const useApp = create<AppState>((set, get) => ({
  locale: 'en',
  setLocale: (l) => set({ locale: l }),
  user: null,
  userLoaded: false,
  setUser: (u) => set({ user: u, userLoaded: true }),
  cartCount: 0,
  cartSubtotalMinor: 0,
  setCartSummary: (count, subtotalMinor) => set({ cartCount: count, cartSubtotalMinor: subtotalMinor }),
  miniCartOpen: false,
  setMiniCartOpen: (o) => set({ miniCartOpen: o }),
  mobileMenuOpen: false,
  setMobileMenuOpen: (o) => set({ mobileMenuOpen: o }),
  consentAccepted: false,
  setConsentAccepted: (v) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(CONSENT_KEY, v ? '1' : '0')
    set({ consentAccepted: v })
  },
  consent: null,
  setConsent: (s) => set({ consent: s }),
  cookiePrefsOpen: false,
  setCookiePrefsOpen: (o) => set({ cookiePrefsOpen: o }),
  favorites: [],
  favsLoaded: false,
  favsSynced: false,
  initFavorites: () => set({ favorites: readFavorites(), favsLoaded: true }),
  toggleFavorite: (slug) => {
    const current = get().favorites
    const has = current.includes(slug)
    const next = has ? current.filter((s) => s !== slug) : [slug, ...current].slice(0, 48)
    writeFavorites(next)
    set({ favorites: next })
    // Write-through to the account when signed in; local state stays authoritative.
    // Surface a soft signal (custom event) if the sync fails so the UI can toast it.
    if (get().user && get().favsSynced) {
      void enqueueWishlistWrite(async () => {
        const res = await fetch('/api/wishlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: get().favorites }) })
        if (!res.ok) throw new Error('wishlist sync failed')
      }).catch(() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sp:wishlist-sync-error')) })
    }
    return !has
  },
  syncWishlistOnLogin: async () => {
    if (!get().user || get().favsSynced) return
    try {
      await enqueueWishlistWrite(async () => {
        const res = await fetch('/api/wishlist')
        if (!res.ok) throw new Error('wishlist read failed')
        const server = (await res.json()) as { slugs: string[] }
        const local = readFavorites()
        // Merge: server order first, then local-only items (newest first), capped.
        const merged = Array.from(new Set([...server.slugs, ...local])).slice(0, 48)
        await fetch('/api/wishlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: merged }) })
        writeFavorites(merged)
        set({ favorites: merged, favsSynced: true })
      })
    } catch {
      // Offline / failure: keep working locally, retry on next login boot.
    }
  },
}))

/** Read consent flag from localStorage once on client mount. */
export function readStoredConsent(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}
