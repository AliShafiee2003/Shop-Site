'use client'

/** Recently-viewed products (localStorage, max 12 slugs, most recent first). */
const KEY = 'sp_recent_v1'
const MAX = 12

export function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function pushRecent(slug: string): void {
  if (typeof window === 'undefined') return
  try {
    const next = [slug, ...readRecent().filter((s) => s !== slug)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* private mode */ }
}
