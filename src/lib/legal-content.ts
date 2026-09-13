// Shared legal/FAQ content constants — importable from BOTH server code
// ([...slug]/page.tsx metadata + JSON-LD) and client components (StaticView),
// so the labels and the FAQ Q&A rendered on the page and emitted as structured
// data can never drift apart (SEO-402 titles / GEO-402 FAQPage parity).
import { formatMoney } from '@/lib/format'

/** The legal document types the storefront renders (lowercase URL form —
 *  mirrors /api/legal/[type]'s VALID_TYPES). Single source for
 *  KNOWN_LEGAL_TYPES in the RSC catch-all and the LegalView label map. */
export const LEGAL_TYPES = ['privacy', 'terms', 'withdrawal', 'imprint', 'accessibility', 'cookies'] as const

export type LegalType = (typeof LEGAL_TYPES)[number]

/** Human label per legal type + locale — H1/document.title/metadata fallback
 *  when the document row itself carries no title. */
export const LEGAL_TYPE_LABELS: Record<LegalType, { en: string; fa: string }> = {
  privacy: { en: 'Privacy notice', fa: 'حریم خصوصی' },
  terms: { en: 'Terms of sale', fa: 'شرایط فروش' },
  withdrawal: { en: 'Right of withdrawal', fa: 'حق انصراف' },
  imprint: { en: 'Imprint', fa: 'اطلاعات ناشر' },
  accessibility: { en: 'Accessibility statement', fa: 'دسترس‌پذیری' },
  cookies: { en: 'Cookie notice', fa: 'کوکی‌ها' },
}

/** Locale-resolved label for a URL legal type (null = unknown type). */
export function legalTypeLabel(type: string, locale: 'en' | 'fa'): string | null {
  const label = LEGAL_TYPE_LABELS[String(type ?? '').toLowerCase() as LegalType]
  return label ? label[locale] : null
}

/** The /faq Q&A — ONE source for the visible accordion (FAQView) AND the
 *  FAQPage JSON-LD (buildJsonLd in [...slug]/page.tsx), parameterised by the
 *  store's free-shipping threshold so both always mirror the live setting. */
export function faqItems(locale: 'en' | 'fa', freeShippingThresholdMinor: number): { q: string; a: string }[] {
  const freeShipAmount = formatMoney(freeShippingThresholdMinor, locale)
  return locale === 'fa'
    ? [
        { q: 'کتاب‌ها از کجا ارسال می‌شوند؟', a: 'همهٔ سفارش‌ها از وین، اتریش ارسال می‌شود. ارسال در اتریش ۲ تا ۴ روز کاری و در اتحادیهٔ اروپا ۳ تا ۷ روز کاری طول می‌کشد. ارسال بین‌المللی ۵ تا ۱۴ روز.' },
        { q: 'هزینهٔ ارسال چقدر است؟', a: `اتریش ۴.۹۰ یورو؛ اتحادیهٔ اروپا ۷.۹۰ یورو (برای خرید بالای ${freeShipAmount} رایگان)؛ مقصدهای بین‌المللی ۱۴.۹۰ یورو.` },
        { q: 'آیا می‌توانم سفارشم را مرجوع کنم؟', a: 'بله، مصرف‌کنندگان در اتحادیهٔ اروپا ۱۴ روز فرصت انصراف دارند. کتاب باید دست‌نخورده باشد. از صفحهٔ سفارش‌ها در حساب کاربری درخواست مرجوعی ثبت کنید.' },
        { q: 'نسخه‌های دوزبانه چگونه کار می‌کنند؟', a: 'در نسخه‌های دوزبانه، متن اصلی فارسی و ترجمهٔ انگلیسی در صفحات روبه‌رو چاپ می‌شوند؛ با یادداشت‌های مترجم و شاعر.' },
        { q: 'چگونه کتاب من منتشر می‌شود؟', a: 'در حال حاضر ما فقط از طریق پیشنهاد مستقیم نویسندگان و متصدیان حق نشر کار می‌کنیم. برای حقوق ترجمه به صفحهٔ تماس بنویسید.' },
        { q: 'آیا کتاب‌ها به ایران ارسال می‌شوند؟', a: 'ارسال بین‌المللی به اکثر کشورها انجام می‌شود؛ اما ممکن است محدودیت‌های پرداخت و گمرکی وجود داشته باشد. پیش از سفارش با ما تماس بگیرید.' },
      ]
    : [
        { q: 'Where do the books ship from?', a: 'All orders ship from Vienna, Austria. Delivery takes 2–4 business days in Austria, 3–7 days across the EU, and 5–14 days internationally.' },
        { q: 'How much is shipping?', a: `Austria €4.90; EU €7.90 (free over ${freeShipAmount}); worldwide destinations €14.90. All shipments are tracked.` },
        { q: 'Can I return my order?', a: 'Yes — EU consumers have a 14-day right of withdrawal. Books should be unused. Request a return from the orders page in your account.' },
        { q: 'How do bilingual editions work?', a: 'Bilingual editions print the Persian original and the English translation on facing pages, with notes by the translator and the author.' },
        { q: 'How do I submit a manuscript?', a: 'We currently work through direct author and rights-holder proposals only. For translation rights, write to us via the contact page.' },
        { q: 'Do you ship to Iran?', a: 'International shipping covers most countries, but payment and customs limitations may apply. Please contact us before ordering.' },
      ]
}
