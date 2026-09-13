# گزارش ممیزی سئوی تکنیکال + GEO/AEO — تسک 3-b (اجرای محدود v4)

دامنه: ۱۶ URL روی :3000؛ کپی DB فقط‌خواندنی `/tmp/audit-v4/db-copy.custom.db`؛ HTML خام: `/tmp/audit-v4/3b/`؛ شواهد: `audit-output/evidence/3b-{robots,sitemap,llms}.txt*`.

> تصحیح مهم: بررسی اولیه regex به حروف بزرگ/کوچک حساس بود؛ hreflang در واقع به‌صورت `hrefLang` (حالت camel در SSR Next) صادر می‌شود و **در همه صفحات موجود است**.

## ۱. جدول متادیتا (زنده)

| URL | Status | Title | Desc | Canonical | hreflang | robots | OG/TW | H1 | lang/dir |
|---|---|---|---|---|---|---|---|---|---|
| / | 200 | برند‌دار ✔ | ✔ | absolute ✔ | en/fa/x-default ✔ | index | ✔/✔ | 1 | en/ltr |
| /fa | 200 | فارسی ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | **en/ltr ⚠** |
| /books | 200 | ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /books/the-cartographer-of-silence | 200 | ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /books/letters-to-my-city | 200 | ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /categories/fiction | 200 | **مطابق /books ⚠** | تکراری ⚠ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /articles/why-translate | 200 | ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /articles | 200 | ✔ | ✔ | ✔ | ✔ | index | ✔/✔ | 1 | en/ltr |
| /search?q=x | 200 | عمومی (title خانه) | عمومی | ✔ | ✔ | **noindex,nofollow ✔** | ✔/✔ | 1 | en/ltr |
| /cart | 200 | عمومی | عمومی | ✔ | ✔ | noindex ✔ | ✔/✔ | 1 | en/ltr |
| /checkout | 200 | عمومی | عمومی | ✔ | ✔ | noindex ✔ | ✔/✔ | **0، بدون main** | en/ltr |
| /login | 200 | عمومی | عمومی | ✔ | ✔ | noindex ✔ | ✔/✔ | 1 | en/ltr |
| /legal/privacy | 200 | **عمومی ⚠** | عمومی ⚠ | ✔ | ✔ | index | ✔/✔ | **0 H1 ⚠** | en/ltr |
| /no-such-root-xyz | 404 | — | — | — | — | noindex ✔ | ✔/✔ | 0 | — |

## ۲. JSON-LD به‌ازای هر قالب

| قالب | Types | نمونه فیلدها |
|---|---|---|
| / و /fa | Organization, WebSite | name+url مطلق (localhost در dev، خروجی `siteUrlFrom()`) |
| /books | BreadcrumbList | — |
| محصول | **Book + BreadcrumbList** | isbn ✔، author(Person) ✔، publisher ✔، image مطلق ✔، offers: price 22.00 EUR ✔، availability (InStock) ✔، aggregateRating 4.7 ✔ |
| /categories/fiction | **هیچ** | — |
| مقاله | Article + BreadcrumbList | inLanguage، datePublished ✔ |
| /articles | BreadcrumbList | — |
| search/cart/checkout/login/legal | هیچ | برای noindexها قابل قبول؛ legal قابل‌ایندکس است → SEO-403 |

- نشتی localhost در کد دیده نشد (خروجی env-driven از `src/lib/site.ts`) — در prod احتمالاً سالم (Likely).
- تزریق JSON-LD فقط در `src/components/storefront/Shell.tsx` است که **'use client'** است (SEO-407). هیچ کامپوننت کلاینتی دیگری ld+json ندارد → عدم دوباره‌سازی سرور/کلاینت در کد ✔.

## ۳. Sitemap / robots / llms.txt

- **sitemap.xml**: ۹۶ URL، همگی absolute ✔، ۵۰ مسیر /fa ✔، بدون rootهای خصوصی ✔، بدون draft ✔، lastmod **واقعی** از DB (`sitemap.xml/route.ts:26-46`، فقط fallback خانه `new Date()`) ✔. جایگزین‌های hreflang داخل sitemap: صفر (Informational).
- **robots.txt**: گروه‌های Googlebot/Bingbot/Twitterbot/facebookexternalhit/**GPTBot/PerplexityBot/ClaudeBot/Google-Extended/\*** ✔، Disallow صحیح (api/admin, api/account, search, account, admin, checkout, cart) ✔، ارجاع `Sitemap:` ✔.
- **llms.txt**: موجود و دوزبانه با بخش Books ✔ (`src/app/llms.txt/route.ts`).

## ۴. Soft-404 (۶ URL)

| URL | Status |
|---|---|
| /zzqq-woblish-999 | **404 ✔** |
| /books/no-such-book-here | **404 ✔** |
| /articles/nope-article | **404 ✔** |
| /legal/not-a-type | **404 ✔** |
| /fa/zzqq-woblish | **404 ✔** |
| /en/nonexistent | 308 → /nonexistent ✔ (رفتار لوکال-پیشوند درست) |

## ۵. پارامترهای کاتالوگ و trailing slash

| URL | Status | Canonical | robots |
|---|---|---|---|
| /books/ | 308 → /books ✔ | — | — |
| /books?page=2 | 200 | **/books** ✔ | index,follow |
| /books?sort=price | 200 | **/books** ✔ | index,follow |
| /books?q=x | 200 | **/books** ✔ | index,follow |
| /books/page/2 | 404 ✔ | — | — |

## ۶. / در برابر /en و لینک‌سازی داخلی

- `/en` → 308 به `/` و `/en/books` → 308 به `/books` ✔ (EN بدون پیشوند = پیش‌فرض؛ بدون محتوای تکراری).
- لینک از HTML خام خانه: /legal×6، /about×2، /faq×1، /shipping-returns×1، /contact×1، /articles×2، /categories×0.

## ۷. GEO/AEO — نمره **78/100**

شواهد کد-محور: E-E-A-T pages موجود (about/faq/shipping-returns/contact در KNOWN_ROOTS، صفحه.tsx:34-43)؛ تاریخ انتشار در OG `published_time` + LD `datePublished` ✔؛ ISBN هم در LD و هم در HTML دیداری محصول (۴ تکرار) ✔؛ حقایق ارسال/مرجوعی صفحه اختصاصی ✔؛ llms.txt ✔؛ robots با ۴ عامل AI ✔.
کسری: sameAs غایب، FAQPage ندارد، بلوک پاسخ‌اول ساختاریافته نامشخص، /fa با lang اشتباه، legal بدون SSR.

## یافته‌ها

| ID | عنوان | شدت | وضعیت/اطمینان | مکان | توضیح/اثر | اصلاح | زمان | ریسک | تست پذیرش |
|---|---|---|---|---|---|---|---|---|---|
| SEO-401 | `<html lang="en" dir="ltr">` حتی در /fa | High | Confirmed/بالا | `src/app/layout.tsx:75` | محتوای فارسی با lang انگلیسی و بدون rtl → نشودهای موتور و دسترس‌پذیری | خواندن locale از header/مسیر و تنظیم lang/dir داینامیک | 2-3h | کم | `curl /fa` شامل `lang="fa" dir="rtl"` |
| SEO-402 | /legal/:type محتوا را SSR نمی‌کند؛ H1=0 و title عمومی | High | Confirmed/بالا | Shell/StaticView + `page.tsx:148` (شاخه عمومی) | صفحه index فاقد متن سند در HTML خام؛ title/desc خانه | SSR متن حقوقی + title/desc اختصاصی + H1 | 4-6h | متوسط | «Privacy Policy» در HTML خام `/legal/privacy` |
| SEO-403 | title/desc تکراری /categories/fiction با /books | Medium | Confirmed/بالا | `page.tsx:148` (`root==='books'||root==='categories'`) |دسته‌بندی همان «All books» را می‌گیرد؛ خطر کاننیبالیزیشن | title «دسته‌ی …» با نام دسته + desc از CategoryTranslation | 1-2h | کم | title صفحه دسته شامل «Fiction» |
| SEO-404 | صفحات noindex عنوان/OG خانه را بازتاب می‌دهند | Low | Confirmed/بالا | `page.tsx:98` (پیش‌فرض homeTitle) | برای search/cart/checkout/login بی‌ضرر (noindex) اما OG اشتراکی | title ساده اختصاصی «سبد خرید — PersePix» | 1h | کم | title=/cart ≠ title=/ |
| SEO-405 | checkout بدون `<main>` و H1 | Low | Confirmed/بالا | Shell/checkout view | سمانتیک/دسترس‌پذیری | افزودن main+H1 | 0.5h | کم | `<main` در HTML خام |
| SEO-406 | hreflang در sitemap موجود نیست | Informational | Confirmed/بالا | `sitemap.xml/route.ts` | اختیاری؛ head hreflang کافی است | افزودن xhtml:link | 1h | کم | شمارش xhtml:link>0 |
| SEO-407 | JSON-LD داخل کامپوننت 'use client' | Low | Confirmed/متوسط | `Shell.tsx:1` | حاضر در HTML خام (SSR) ولی وابسته به باندل کلاینت؛ شکنندگی آینده | انتقال JsonLd به کامپوننت سرور | 1-2h | متوسط | حذف Shell از باندل بدون تغییر HTML خام |
| GEO-401 | `sameAs` در Organization غایب | Medium | Confirmed/بالا | Shell.tsx (سازمان LD) | پیوند هویت برند به پروفایل‌ها برای موتورهای پاسخ | افزودن sameAs با شبکه‌های اجتماعی/Google Books | 0.5h | کم | sameAs در LD خانه |
| GEO-402 | هیچ FAQPage schema | Medium | Confirmed/بالا | کل src | صفحه faq هست ولی LD پاسخ ندارد؛ از دست دادن rich answer | FAQPage LD روی /faq + بلوک پاسخ‌اول | 2-3h | کم | FAQPage در HTML خام /faq |
| GEO-403 | بلوک پاسخ‌اول/خلاصه ساختاریافته در مقالات ضعیف | Low | Likely/متوسط | قالب article | متن مقاله در HTML هست (۴۱۶ واژه) ولی پاسخ‌اول برجسته نیست | پاراگراف خلاصه ۴۰-۶۰ کلمه‌ای بالای مقاله | 1-2h | کم | وجود `<p class=...lead>` |

## نقاط قوت تأییدشده

- Canonical absolute در همه صفحات + hreflang کامل en/fa/x-default ✔
- سیاست noindex درست روی روت‌های خصوصی + robots meta صحیح ✔
- Soft-404 واقعی: ۶/۶ → 404 (فیکس پیشین SEO-001 پابرجا) ✔
- /en* → 308 به فرم بدون پیشوند؛ trailing slash نرمال ✔
- پارامترهای کاتالوگ با canonical پاک به /books ✔
- Sitemap سالم (۹۶ URL، بدون خصوصی/draft، lastmod واقعی) ✔
- robots.txt با ۴ گروه خزنده AI + ارجاع sitemap ✔ و llms.txt دوزبانه ✔
- Book LD کامل (isbn/price/EUR/availability/aggregateRating/author/publisher) ✔، Article LD با datePublished ✔
- لینک‌سازی داخلی خانه به legal/about/faq/contact ✔

## پلن پیشنهادی GEO (خلاصه)

1) sameAs + FAQPage (2h+3h) — بیشترین بازده برای موتورهای پاسخ؛ 2) رفع lang/dir فارسی؛ 3) SSR متن حقوقی با title اختصاصی؛ 4) بلوک پاسخ‌اول در مقالات و محصولات («در یک نگاه»).

---
Task ID: 3-b — اجرای دوم محدود؛ ابزارها: curl→فایل، پارس python فقط‌خلاصه؛ DB فقط‌خواندنی؛ شواهد: /tmp/audit-v4/3b/*.html + audit-output/evidence/3b-*. گزارش این فایل به‌صورت افزایشی نوشته شد.
