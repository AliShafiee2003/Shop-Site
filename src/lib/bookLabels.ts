import type { Locale } from './types'

/**
 * Locale labels for data-level product fields that live in the DB as English
 * strings (series name, edition language, country of printing). Unknown values
 * fall back to the raw stored value so nothing ever renders blank.
 */

const BOOK_LANGUAGE_FA: Record<string, string> = {
  English: 'انگلیسی',
  Persian: 'فارسی',
  Bilingual: 'دوزبانه (فارسی و انگلیسی)',
}

const COUNTRY_FA: Record<string, string> = {
  Austria: 'اتریش',
  Germany: 'آلمان',
  Iran: 'ایران',
  Italy: 'ایتالیا',
  France: 'فرانسه',
  Netherlands: 'هلند',
  Spain: 'اسپانیا',
  Poland: 'لهستان',
  Latvia: 'لتونی',
  Lithuania: 'لیتوانی',
  'Czech Republic': 'جمهوری چک',
  Turkey: 'ترکیه',
  'United Kingdom': 'بریتانیا',
}

const SERIES_FA: Record<string, string> = {
  'Contemporary Persian Prose': 'نثر معاصر فارسی',
  'Illustrated History of Iran': 'تاریخ مصور ایران',
}

const FORMAT_FA: Record<string, string> = {
  PAPERBACK: 'جلد شومیز',
  HARDCOVER: 'جلد سخت',
  SPECIAL: 'چاپ ویژه',
}

const FORMAT_EN: Record<string, string> = {
  PAPERBACK: 'Paperback',
  HARDCOVER: 'Hardcover',
  SPECIAL: 'Special edition',
}

function mapLabel(value: string | null | undefined, map: Record<string, string>, locale: Locale): string {
  if (!value) return ''
  if (locale !== 'fa') return value
  return map[value] ?? value
}

export function bookLanguageLabel(value: string | null | undefined, locale: Locale): string {
  return mapLabel(value, BOOK_LANGUAGE_FA, locale)
}

export function countryLabel(value: string | null | undefined, locale: Locale): string {
  return mapLabel(value, COUNTRY_FA, locale)
}

export function seriesLabel(value: string | null | undefined, locale: Locale): string {
  return mapLabel(value, SERIES_FA, locale)
}

export function formatLabel(value: string | null | undefined, locale: Locale): string {
  if (!value) return ''
  return (locale === 'fa' ? FORMAT_FA[value] : FORMAT_EN[value]) ?? value
}
