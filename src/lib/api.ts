'use client'

/** Tiny typed fetch client for /api endpoints. Throws ApiError with machine code on failure. */

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, b.error ?? 'REQUEST_FAILED', b.message)
  }
  return body as T
}

export const apiGet = <T,>(path: string) => api<T>(path)
export const apiPost = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
export const apiPatch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
export const apiDelete = <T,>(path: string) => api<T>(path, { method: 'DELETE' })
export const apiPut = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })

/** Cart endpoints return `itemsCount`; the UI speaks `count`. Normalize once here. */
type RawCart = {
  items?: import('@/lib/types').CartDTO['items'] | null
  count?: number | null
  itemsCount?: number | null
  subtotalMinor?: number | null
  currency?: string | null
  vatRatePct?: number | null
  vatIncluded?: boolean | null
  promotion?: import('@/lib/types').CartDTO['promotion'] | null
}

export function normalizeCart(input: unknown): import('@/lib/types').CartDTO {
  const c = (input ?? {}) as RawCart
  return {
    items: (c.items ?? []).map((i) => ({ ...i })),
    count: c.count ?? c.itemsCount ?? c.items?.length ?? 0,
    subtotalMinor: c.subtotalMinor ?? 0,
    currency: c.currency ?? 'EUR',
    vatRatePct: c.vatRatePct ?? 10,
    vatIncluded: c.vatIncluded ?? true,
    promotion: c.promotion ?? null,
  }
}
