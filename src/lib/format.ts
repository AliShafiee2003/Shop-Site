import type { Locale } from './types'

/** Money: integer minor units (EUR cents) → localized display. Never floating-point math (PRD 10.4). */
export function formatMoney(minor: number, locale: Locale = 'en', currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-IE', {
      style: 'currency',
      currency,
    }).format(minor / 100)
  } catch {
    return `€${(minor / 100).toFixed(2)}`
  }
}

/** Latin digits for non-localized contexts (ISBN, order numbers) — kept LTR-isolated (PRD 19.3). */
export function latinDigits(s: string): string {
  return s
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹' as const
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩' as const

/** Convert Persian AND Arabic-Indic digits to Latin — for parsing user input
 *  (a Persian-localized keyboard/OS types ۱۲۳ into text fields). */
export function toLatinDigits(s: string): string {
  return String(s)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

/** Convert Latin digits to Persian digits (for badges/short labels in the FA locale). */
/** Customer-facing order code — SP2612130011 (the stored SP-26-12-13-0011 with
 *  dashes stripped). Admin keeps the structured dashed form; customers quote the
 *  compact one in tickets (user spec, Task 49-10). */
export function compactOrderNumber(n: string): string {
  return n.replace(/-/g, '')
}

export function faDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export function formatDate(iso?: string | null, locale: Locale = 'en'): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
      year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function formatDateTime(iso?: string | null, locale: Locale = 'en'): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export function formatDims(v: { widthMm?: number | null; heightMm?: number | null; depthMm?: number | null }): string {
  const parts = [v.widthMm, v.heightMm, v.depthMm].filter((n): n is number => typeof n === 'number' && n > 0)
  if (!parts.length) return '—'
  return `${parts.join(' × ')} mm`
}
