'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet } from './api'

/**
 * Stale-while-revalidate view-data cache.
 *
 * Keeps previously loaded view payloads in memory so locale switches and
 * back/forward navigations render instantly from cache (the main area never
 * blanks) while a fresh request revalidates in the background. SSR-provided
 * initial data seeds the cache so the first paint is fully server-rendered.
 */

interface Entry {
  data: unknown
  failed: boolean
}

const EMPTY: Entry = { data: null, failed: false }
const MAX_ENTRIES = 80

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function put(key: string, data: unknown) {
  cache.delete(key)
  cache.set(key, { data, failed: false })
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  notify()
}

function markFailed(key: string) {
  const prev = cache.get(key)
  cache.set(key, { data: prev?.data ?? null, failed: true })
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * @param key          cache key — include every variable the payload depends on
 * @param url          API URL to (re)validate; null disables fetching
 * @param initial      server-rendered payload for the MOUNT-time key only
 * @param fallbackKeys keys to fall back to for display when `key` has no data
 *                     (e.g. the other locale's payload → no blank on switch)
 */
// Keys already seeded with SSR-provided data (once per page load).
const seededKeys = new Set<string>()

export function useViewData<T>(
  key: string,
  url: string | null,
  initial?: T,
  fallbackKeys: string[] = [],
): { data: T | null; failed: boolean } {
  // On the server the module cache would be shared across concurrent requests
  // (stale-HTML poisoning) — render strictly from the fresh SSR payload there.
  const isServer = typeof window === 'undefined'

  // Seed SSR data once, only for the key it was rendered for (client only).
  if (!isServer && initial !== undefined && !seededKeys.has(key)) {
    seededKeys.add(key)
    if (!cache.has(key)) cache.set(key, { data: initial, failed: false })
  }

  const serverRead = (): Entry => ({ data: (initial ?? null) as unknown, failed: false })

  const clientRead = (): Entry => {
    const hit = cache.get(key)
    if (hit && hit.data !== null) return hit
    for (const fk of fallbackKeys) {
      const f = cache.get(fk)
      if (f && f.data !== null) return f
    }
    return hit ?? EMPTY
  }

  const read = isServer ? serverRead : clientRead

  useSyncExternalStore(subscribe, read, read)

  useEffect(() => {
    if (!url || inflight.has(key)) return
    const p = apiGet<T>(url)
      .then((r) => put(key, r))
      .catch(() => markFailed(key))
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, p as Promise<void>)
  }, [key, url])

  const e = read()
  return { data: (e.data ?? null) as T | null, failed: e.failed }
}

/** Force-refresh a cached view (used after admin publishes content). */
export function invalidateView(keyPrefix: string) {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(keyPrefix)) {
      cache.delete(k)
    }
  }
  notify()
}
