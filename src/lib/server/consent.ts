// Privacy subsystem — server-authoritative cookie consent (Level 1).
// Spec: upload/COOKIE_CONSENT_BEHAVIORAL_TRACKING_IMPLEMENTATION_SPEC.md
// - `sp_consent_id`: httpOnly opaque subject id → latest CookieConsent row = verified state.
// - Fail-closed: missing cookie/record/policy mismatch ⇒ undecided ⇒ optional categories denied.
// - `sp_taste_id`: SEPARATE httpOnly personalization subject (never reuse the consent id).
// - Decisions are append-only; withdrawal deletes derived taste signals + the taste cookie.
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

export const CONSENT_POLICY_VERSION = '2026-02'

export const CONSENT_COOKIE = 'sp_consent_id' // 12 months (spec §15)
export const TASTE_COOKIE = 'sp_taste_id' // 180 days (spec §15)
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365
const TASTE_MAX_AGE = 60 * 60 * 24 * 180

export type ConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'personalization' | 'marketing'

export type ConsentCategories = {
  necessary: true
  preferences: boolean
  analytics: boolean
  personalization: boolean
  marketing: boolean
}

export type ConsentState = {
  policyVersion: string
  decided: boolean
  categories: ConsentCategories
  decidedAt?: string
}

const DENIED: ConsentState = {
  policyVersion: CONSENT_POLICY_VERSION,
  decided: false,
  categories: { necessary: true, preferences: false, analytics: false, personalization: false, marketing: false },
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    // C4: secure outside development — consent/taste cookies must not travel
    // over plaintext HTTP in production (sandbox previews stay http).
    secure: process.env.NODE_ENV === 'production',
  }
}

/** Verified consent state for the current visitor (fail-closed). */
export async function resolveConsent(): Promise<ConsentState> {
  try {
    const jar = await cookies()
    const subject = jar.get(CONSENT_COOKIE)?.value
    if (!subject) return DENIED
    const record = await db.cookieConsent.findFirst({
      where: { subjectKey: subject, policyVersion: CONSENT_POLICY_VERSION },
      orderBy: { createdAt: 'desc' },
    })
    if (!record) return DENIED
    return {
      policyVersion: record.policyVersion,
      decided: true,
      decidedAt: record.createdAt.toISOString(),
      categories: {
        necessary: true,
        preferences: record.preferences,
        analytics: record.analytics,
        personalization: record.personalization,
        marketing: record.marketing,
      },
    }
  } catch {
    return DENIED
  }
}

/** The verified personalization subject id — ONLY when personalization consent is valid. */
export async function personalizationSubject(): Promise<string | null> {
  const state = await resolveConsent()
  if (!state.decided || !state.categories.personalization) return null
  try {
    const jar = await cookies()
    return jar.get(TASTE_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

export type ConsentDecisionInput = {
  action: 'accept_all' | 'reject_optional' | 'custom'
  categories: { preferences: boolean; analytics: boolean; personalization: boolean; marketing: boolean }
  locale: string
  source: string
}

/**
 * Append a consent record and rotate cookies accordingly.
 * - necessary is forced true server-side (spec §19).
 * - withdrawal (reject_optional / custom without personalization) purges taste signals.
 */
export async function saveConsentDecision(
  input: ConsentDecisionInput,
  userId?: string | null,
): Promise<ConsentState> {
  // Resolve the subject FIRST so the append-only record is linked to the
  // httpOnly consent cookie (the GET-side lookup joins on exactly this id).
  const jar = await cookies()
  let subject = jar.get(CONSENT_COOKIE)?.value
  if (!subject) {
    subject = randomBytes(16).toString('hex')
    jar.set(CONSENT_COOKIE, subject, cookieOptions(CONSENT_MAX_AGE))
  }

  const c = input.categories
  const grantAll = input.action === 'accept_all'
  const record = await db.cookieConsent.create({
    data: {
      subjectKey: subject,
      userId: userId ?? null,
      policyVersion: CONSENT_POLICY_VERSION,
      necessary: true,
      preferences: grantAll || c.preferences,
      analytics: grantAll || c.analytics,
      personalization: grantAll || c.personalization,
      marketing: grantAll || c.marketing,
      locale: input.locale,
      source: input.source,
      action: input.action,
    },
  })

  // Personalization identifier: separate from the consent id; created only after
  // personalization consent, deleted (with derived data) on withdrawal (spec §14).
  const personalization = grantAll || c.personalization
  if (personalization) {
    if (!jar.get(TASTE_COOKIE)?.value) {
      jar.set(TASTE_COOKIE, randomBytes(16).toString('hex'), cookieOptions(TASTE_MAX_AGE))
    }
  } else {
    const taste = jar.get(TASTE_COOKIE)?.value
    if (taste) {
      await db.tasteSignal.deleteMany({ where: { sessionKey: taste } })
      jar.set(TASTE_COOKIE, '', { ...cookieOptions(0) })
    }
  }

  return {
    policyVersion: record.policyVersion,
    decided: true,
    decidedAt: record.createdAt.toISOString(),
    categories: {
      necessary: true,
      preferences: record.preferences,
      analytics: record.analytics,
      personalization: record.personalization,
      marketing: record.marketing,
    },
  }
}

// ───────────────────────── Cookie inventory (spec §7.1) ─────────────────────────
// Single source of truth: rendered on the cookie notice page and the preference
// center, and mirrored in the consent category gating. First-party only — the
// storefront loads no third-party scripts today.

export type CookieDef = {
  name: string
  provider: string
  category: Exclude<ConsentCategory, 'necessary'> | 'necessary'
  storage: string
  durationEn: string
  durationFa: string
  purposeEn: string
  purposeFa: string
  party: 'First party'
}

export const COOKIE_INVENTORY: CookieDef[] = [
  {
    name: 'sp_session',
    provider: 'Simorgh Press',
    category: 'necessary',
    storage: 'HTTP cookie (httpOnly)',
    durationEn: '30 days',
    durationFa: '۳۰ روز',
    purposeEn: 'Keeps you signed in to your account.',
    purposeFa: 'نشست ورود شما به حساب کاربری را نگه می‌دارد.',
    party: 'First party',
  },
  {
    name: 'sp_cart',
    provider: 'Simorgh Press',
    category: 'necessary',
    storage: 'HTTP cookie (httpOnly)',
    durationEn: '30 days',
    durationFa: '۳۰ روز',
    purposeEn: 'Remembers your cart between visits (guest checkout).',
    purposeFa: 'سبد خرید شما را بین بازدیدها نگه می‌دارد (خرید مهمان).',
    party: 'First party',
  },
  {
    name: 'sp_locale',
    provider: 'Simorgh Press',
    category: 'necessary',
    storage: 'HTTP cookie',
    durationEn: '12 months',
    durationFa: '۱۲ ماه',
    purposeEn: 'Stores the language you explicitly chose (English / فارسی).',
    purposeFa: 'زبانی که خودتان انتخاب کرده‌اید را نگه می‌دارد (انگلیسی / فارسی).',
    party: 'First party',
  },
  {
    name: 'sp_consent_id',
    provider: 'Simorgh Press',
    category: 'necessary',
    storage: 'HTTP cookie (httpOnly)',
    durationEn: '12 months',
    durationFa: '۱۲ ماه',
    purposeEn: 'Opaque reference to your cookie decision so we can honour it on every visit.',
    purposeFa: 'ارجاع ناشناس به تصمیم کوکی شما تا در هر بازدید رعایت شود.',
    party: 'First party',
  },
  {
    name: 'sp_recent_v1',
    provider: 'Simorgh Press',
    category: 'preferences',
    storage: 'Local storage',
    durationEn: 'Until you clear it',
    durationFa: 'تا پاک‌کردن توسط شما',
    purposeEn: 'Remembers the books you recently viewed so the shelf stays handy.',
    purposeFa: 'کتاب‌هایی که اخیراً دیده‌اید را نگه می‌دارد تا قفسهٔ «بازدیدهای اخیر» ساخته شود.',
    party: 'First party',
  },
  {
    name: 'sp_favs_v1',
    provider: 'Simorgh Press',
    category: 'preferences',
    storage: 'Local storage',
    durationEn: 'Until you clear it',
    durationFa: 'تا پاک‌کردن توسط شما',
    purposeEn: 'Keeps your wishlist on this device when you browse as a guest.',
    purposeFa: 'علاقه‌مندی‌های شما را روی همین دستگاه نگه می‌دارد.',
    party: 'First party',
  },
  {
    name: 'sp_aid_v1',
    provider: 'Simorgh Press',
    category: 'analytics',
    storage: 'Local storage (rotated daily, random)',
    durationEn: 'Rotated every 24h',
    durationFa: 'هر ۲۴ ساعت نو می‌شود',
    purposeEn: 'Anonymous, non-identifying key so page-view counts are not double-counted.',
    purposeFa: 'کلید ناشناس و غیرشناساننده‌پذیر برای شمارش بازدیدها بدون تکرار.',
    party: 'First party',
  },
  {
    name: 'sp_taste_id',
    provider: 'Simorgh Press',
    category: 'personalization',
    storage: 'HTTP cookie (httpOnly)',
    durationEn: '180 days',
    durationFa: '۱۸۰ روز',
    purposeEn: 'Anonymous key that links your interests (favourite categories and authors) to the "Inspired by your browsing" shelf. Never sold, never shared.',
    purposeFa: 'کلید ناشناسی که علایق شما (دسته‌ها و نویسنده‌های محبوب) را به قفسهٔ «بر اساس بازدیدهای شما» پیوند می‌زند. نه فروخته می‌شود و نه به‌اشتراک گذاشته می‌شود.',
    party: 'First party',
  },
]
