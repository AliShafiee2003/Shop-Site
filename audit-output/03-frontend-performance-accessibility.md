# 03 — Frontend, Performance & Accessibility Report

دامنه: فازهای ۴/۵/۶ (React/state/forms استاتیک + timing/bundle-signals + WCAG 2.2 AA + Responsive 320→1440 + RTL).
روش: خوانش ایستا + curl timing + agent-browser (keyboard/contrast/overflow) — بدون production build (ممنوعیت محیط؛ CWV عددی UNVERIFIED).

# گزارش ممیزی Phase 5+6 — کارایی و دسترس‌پذیری/ریسپانسیو (Task 3-c)

- Agent: Frontend Performance Engineer + Accessibility Specialist
- محیط: Next.js 16 App Router / React 19 / dev server :3000 (bun 1.3.14) — **حالت dev، نه production build**
- قواعد: AUDIT ONLY — هیچ فایل سورس تغییر نکرد. Evidence → `audit-output/evidence/3c-*`، خام‌ها → `/tmp/audit-v4/3c/`
- **محدودیت سندشدهٔ sandbox:** اجرای `bun run build` ممنوع است (بازنویسی `.next` سرور dev در حال اجرا را خراب می‌کند) → تمام متریک‌های مبتنی بر build (حجم واقعی باندل، Lighthouse/CWV عددی) = **UNVERIFIED**. تحلیل باندل به‌صورت «سیگنال استاتیک» (grep سورس) انجام شد.

---

## ۵.۱ — Runtime timing (curl -w، ۳ اجرا، میانه)

Evidence: `audit-output/evidence/3c-timing-*.txt`، `3c-api-timing.txt`. حالت dev (کامپایل درجا؛ سرور گرم). بدون gzip چون curl `Accept-Encoding` نفرستاد — اعداد خام است.

| Route (EN) | TTFB میانه | Total میانه | Size (HTML خام) |
|---|---|---|---|
| `/` (home) | 67ms | 68ms | 83.7KB |
| `/fa` | 128ms | 128ms | 87.4KB |
| `/books` (کاتالوگ) | 167ms | 167ms | 130.1KB |
| `/books/rust-and-turquoise` (جزئیات محصول) | 162ms | 162ms | 94.3KB |
| `/search?q=rood` | 83ms | 83ms | 45.7KB |
| `/cart` | 101ms | 101ms | 45.6KB |
| `/checkout` | 227ms | 253ms | 44.8KB |

API: `/api/bootstrap` ≈ 10–33ms (2.4KB)، `/api/search` ≈ 15–23ms، `/api/products?pageSize=24` ≈ 38–112ms (7KB).

- هیچ مسیری در dev انسانی نیست؛ کندترین حالت checkout (227ms TTFB) قابل‌قبول است. پرحجم‌ترین پاسخ: کاتالوگ 130KB HTML.
- **هشدار:** این‌ها متریک dev هستند؛ اعداد prod باید بعد از unblock build اندازه‌گیری شود → هر نتیجهٔ نهایی latency = UNVERIFIED برای prod.
- `/fa` حروف بیشتر + فونت فارسی — ۲ برابر home EN در dev (کامپایل). مسیر یادگیری: بعد از گرم‌شدن تفاوت به <10ms رسید (اجراهای ۲و۳).

## ۵.۲ — وزن HTML dev (پارس پایتون)

Evidence: `audit-output/evidence/3c-html-weight.json` + HTML خام در `/tmp/audit-v4/3c/html-*.html`.

| Page | bytes | `<script>` | script با src | inline-script chars | css link | inline style attr | `<img>` | preload (font) |
|---|---|---|---|---|---|---|---|---|
| home-en | 83.7KB | 35 | 29 | 27,040 | 1 | 30 | 23 | 4 |
| home-fa | 87.4KB | 35 | 29 | 27,848 | 1 | 30 | 23 | 4 |
| catalog | 130.1KB | 34 | 29 | 27,775 | 1 | 20 | 11 | 4 |
| product | 94.3KB | 35 | 29 | 26,546 | 1 | 2 | 3 | 4 |

- ~27KB inline script در هر صفحه = RSC flight payload + bootstrap — طبیعی RSC.
- 29 script src در **dev** طبیعی است (تکه‌تکه بودن ماژول‌های dev + HMR)؛ در prod تجمیع می‌شود → این عدد برای prod معنادار نیست (caveat documented).
- CSS: یک فایل (globals.css). 30 inline style attr در home (اسلایدر/استوری) — کم‌خطر.
- preload تصویر: logo.png + hero (fetchPriority=high) + story — هدفمند (کد layout.tsx:82-99، کامنت «فقط فونت‌های first paint» از ممیزی قبلی اجرا شده).

## ۵.۳ — سیگنال‌های باندل استاتیک (بدون build — `bun run build` ممنوع در این sandbox)

Evidence: `audit-output/evidence/3c-bundle-signals.txt`. **همهٔ متریک‌های حجم باندل prod = UNVERIFIED** (دلیل سندشده: build فایل‌های `.next` سرور dev زنده را clobber می‌کند).

- **next/image: عملاً استفاده نشده.** فقط `src/components/views/admin/AdminHomepageSection.tsx` (پنل ادمین) آن را import می‌کند. کل صفحهٔ فروشگاه با `<img>` خام رندر می‌شود: 49+ سایت `<img>` در 21+ فایل tsx (هوم 23، کاتالوگ 11، محصول 3). یعنی: بدون srcset/resize/format-negotiation خودکار؛ browser خودش فایل PNG اصلی (تا 225KB برای هر جلد) را می‌گیرد. → **PERF-401**
- **`<img>` بدون width/height:** (فهرست از سورس؛ ریسک CLS) — بررسی جزئی‌تر در §6.3 و یافتهٔ A11Y/CLS. ScrollStory/HeroSlider ابعاد inline دارند (30 style attr)؛ ProductCard/CatalogView بررسی شد — نتیجه در جدول CLS.
- **dynamic():** فقط ۱ سایت — `Shell.tsx:45` AdminView (lazy, ssr:false + skeleton). کامنت در سورس: «~313KB از باندل eager حذف شد». عالی؛ ولی SearchOverlay/بقیه همه eager در Header هستند.
- **سهم client components:** 65/275 فایل ts/tsx با `'use client'` (57/105 tsx در components ≈ 54%) — یکپارچگی server/client تمیز (تأیید مجدد 2-d).
- **وابستگی‌های سنگین:** `recharts` فقط در `ui/chart.tsx`، `embla-carousel-react` فقط در `ui/carousel.tsx`، `react-day-picker` در `ui/calendar.tsx`، `vaul` در `ui/drawer.tsx`، `react-hook-form` در `ui/form.tsx`، `cmdk` در `ui/command.tsx`، `input-otp`، `react-resizable-panels` — **هیچ‌کدام توسط هیچ ویو/کامپوننتی import نمی‌شوند** (importer=0 برای همهٔ wrapperها). یعنی یا tree-shake در prod (متوقع: بله، چون import chain وجود ندارد) یا باندل اضافه. `effect` صفر import (همان QA-407). `framer-motion` در deps نیست. `zustand` فقط `src/store/store.ts`. → **PERF-402 (dead UI wrappers)** — با SEC-403 (dead deps) هم‌راستا؛ برای storefront هیچ ریسک زمان‌اجرای فعلی، فقط weight سورس + سطح حملهٔ وابستگی.
- **فونت:** self-hosted woff2 (Inter 400/700 + Vazirmatn Regular/Bold)، 8 بلاک `@font-face`، همه `font-display: swap`، 4 preload هدفمند با crossOrigin (layout.tsx:18-28). استراتژی درست و مستند. → نقطهٔ قوت (با نکتهٔ swap→CLS جزئی).
- **فرمت تصاویر `/public`:** **90 PNG در برابر 2 WebP، صفر AVIF**. 61MB کل، 53MB فقط products. بزرگ‌ترین: cover PNGها 160–225KB، logo.png=301KB (پیش‌لود می‌شود!). sharp در deps موجود است ولی برای /_next/image استفاده نمی‌شود (چون next/image استفاده نمی‌شود). → بخشی از PERF-401.

## ۵.۴ — سیگنال‌های آبشار API

- **Boot:** `Shell.tsx:109-135` — یک `GET /api/bootstrap` جای ۵ درخواست قبلی (auth/me+cart+settings+consent+wishlist) با degradation مستقل. → نقطهٔ قوت. `/api/bootstrap` = 2.4KB، ~15ms.
- **دادهٔ صفحه:** SSR — `[...slug]/page.tsx:588` `prefetchPageData` → `SsrProviders` context → ویوها بدون fetch اولیه (CatalogView/ProductView/HomeSections صفر `fetch(` در mount). یعنی content-first-render بدون آبشار کلاینت. → نقطهٔ قوت (بهای آن: force-dynamic + HTML 130KB — هم‌راستا با ARCH-402/PERF-002).
- **جست‌وجو:** debounce 300ms + حداقل ۲ حرف + پاک‌سازی تایمر در cleanup (Header.tsx:128-140). ARCH-418/419 (اسپینر گیرکردهٔ <2 char و onBlur timeout) قبلاً گزارش شده — تکرار نمی‌شود.
- **AdminView lazy** (بالاتر). Network دیگری در boot نیست (initFavorites از localStorage).

## ۵.۵ — کش (هدرهای پاسخ)

Evidence: `/tmp/audit-v4/3c/headers.txt` (کپی در evidence). هم‌راستا با **ARCH-402** (force-dynamic، صفر ISR/revalidate — بازگزارش نشد):

- `/` → `Cache-Control: no-cache, must-revalidate` — HTML هر بار revalidate (dev + force-dynamic؛ در prod هم با force-dynamic همین است).
- `/api/products` → **هیچ Cache-Control صادر نمی‌شود** (فقط Vary) → کش‌ناپذیر/احتیاط پیش‌فرض.
- `/images/*` → `public, max-age=31536000, immutable` + ETag Weak + Last-Modified → **PERF-003 قبلی درست اعمال شده** (نقطهٔ قوت).
- `/fonts/*` → `public, max-age=0` + ETag — فونت‌ها از قاعدهٔ immutable جا مانده‌اند (rule فقط `/images/:path*` است، next.config.ts:56-61) → هر بار 304 revalidate. → **PERF-403**.

## ۵.۶ — CWV

- **LCP/INP/CLS عددی: UNVERIFIED** — بدون Lighthouse و بدون prod build در این sandbox (دلیل بالا).
- **تحلیل کیفی CLS (ریسک = Low):** (۱) تصاویر بدون width/height attr ولی داخل کانتینر aspect-ratio ثابت (hero `aspect-[7/4] min-h-[360px]`، کارت محصول `aspect-[3/4]` — HeroSlider.tsx:354, ProductCard.tsx:71) → رزرو فضا موجود؛ (۲) `font-display: swap` → جابه‌جایی متن هنگام swap (کم، چون fallback در تعریف @font-face است)؛ (۳) بنر کوکی `fixed inset-x-3 bottom-3` (CookieBanner.tsx:98) → overlay، صفر shift؛ (۴) نوار اعلان/فری‌شیپینگ در SSR HTML اولیه‌اند، نه تزریق دیرهنگام؛ (۵) استوری اسلایدر تصاویر preload شده با ابعاد کانتینر ثابت. جمع‌بندی: ریسک CLS ساختاری پایین؛ عدد نهایی نیازمند Lighthouse prod (PERF-405).

---

# Phase 6 — دسترس‌پذیری و ریسپانسیو (agent-browser، session=3c-audit)

بخش‌بنر کوکی اول با «Accept all» بسته شد تا کلیک‌ها مسدود نشود. همهٔ بررسی‌ها با evalهای کوچک JSON (بدون snapshotهای سنگین) انجام شد. Evidence: `3c-tab-home.json`، `3c-responsive-overflow.txt`، `3c-rtl-fa-390.png`، `3c-html-*.html`.

## ۶.۱ — کیبورد (home + product)

- **Skip link موجود است:** اولین Tab → `A "Skip to main content"` (visible, outline solid).
- **۱۵ توقف Tab در home:** ۱۵/۱۵ focus دیده‌شده — `outline-style: solid`، عرض **2px**، رنگ `rgb(1,75,116)`، offset 2px. شامل: skip link، نوار اعلان‌ها (۳ دکمه)، لوگو، جست‌وجو، زبان، Account، Cart، منو (Books)، لینک‌ها، CTA هیرو. → **نقطهٔ قوت**.
- **Dialog focus trap:** «View larger» (radix dialog) — focus خودکار وارد دیالوگ شد؛ ۳ Tab متوالی داخل دیالوگ چرخید؛ Esc بست و focus به تریگر برگشت. aria-modal=null (radix از aria-hidden روی بقیهٔ صفحه استفاده می‌کند — الگوی درست radix).
- **Search overlay با کیبورد:** تایپ «poetry» (دسکتاپ) → کارت نتایج زیر input ظاهر شد (`shadow-lg` card)؛ Esc کارت را بست و input را خالی کرد. results rows = `<button>` + navigate() (→ A11Y-404).
- **Cart live region (runtime):** click «Add to cart» → span sr-only `0 items` → `1 items` (`aria-live=polite`, Header.tsx:725). aria-live=off روی نوار اعلان (Header.tsx:464) — عمدی است (جلوگیری از re-announce) و مشکلی ایجاد نمی‌کند.
- **aria-live در کد (grep):** qty stepper (bits.tsx:213, CartView.tsx:90)، فرم‌های خطا با `role=alert` (CheckoutView.tsx:228/498, Footer.tsx:175, CookiePreferencesDialog.tsx:154)، loading `role=status` (bits.tsx:15). پوشش خوب. → نقطهٔ قوت.

## ۶.۲ — فرم‌ها (login) + inputMode

- **label association:** `label[for=auth-email]→Email`، `label[for=auth-pass]→Password` ✓؛ footer newsletter ✓.
- **autocomplete:** email → `autocomplete="email"`، password → `current-password` ✓. checkout (استاتیک، تأیید 2-d + grep): `co-email inputMode=email autoComplete=email`، `cc-number/cc-exp/cc-cvc inputMode=numeric autoComplete=cc-*`، phone `type=tel autoComplete=tel` (CheckoutView.tsx:259,377-395,549-550) → **نقطهٔ قوت**.
- **required:** هر دو input `required` (native validation فعال).
- **خطای سرور:** wrong-password → `role=alert "Invalid email or password."` نمایش/announce می‌شود؛ اما **بدون `aria-invalid` و بدون `aria-describedby` روی فیلدها** → A11Y-402.
- **QtyStepper (bits.tsx:201-222):** `role=group` + aria-label، دکمه‌های +/− با aria-label، مقدار با `aria-live=polite` — بدون input، پس inputMode لازم ندارد. track form بدون inputMode = قبلاً ARCH-431/2-d (تکرار نشد).

## ۶.۳ — alt-text

- **home:** 39 `<img>` — صفر بدون alt؛ 9 خالی (logo + ۴ hero desktop/mobile ×۲) — logo `aria-hidden` + متن برند مجاور ✓؛ hero با متن روی تصویر.
- **catalog:** 13 `<img>` — صفر بدون alt؛ 3 خالی: logo (aria-hidden ✓)، دو cover با عنوان مجاور در کارت (الگوی قابل‌قبول «تکرار نکردن متن مجاور»).
- **product:** 3 `<img>` — همگی alt دارند (۱ خالی/تزئینی).
- **جست‌وجو:** result thumbnails `alt=""` (Header.tsx:189) با عنوان مجاور ✓.
- جمع‌بندی: **no bad alt found** → نقطهٔ قوت.

## ۶.۴ — کنتراست (computed styles، ۶+ المان در هر صفحه)

| Element | ratio | حد | نتیجه |
|---|---|---|---|
| nav links (header) | 7.79 | ≥4.5 | ✓ |
| دکمه primary | 16.52 | ≥4.5 | ✓ |
| footer link/p (71,84,93) | 7.24 | ≥4.5 | ✓ |
| ink-2 متن | 7.79 | ≥4.5 | ✓ |
| **ink-3 muted text (113,128,138)** | **4.07** | ≥4.5 | **FAIL** (16px) |
| ink-3 روی /fa | 4.07 | ≥4.5 | FAIL |

- token `ink-3` در caption/راهنما/قیمت-فرعی استفاده می‌شود → A11Y-401 (Medium).
- برای متن درشت (≥24px/18.66px bold) حد 3:1 است → ink-3 فقط در متن درشت قابل‌قبول می‌شد؛ کاربرد فعلی عمدتاً 11–16px.

## ۶.۵ — Headings

| Page | H1 | ساختار |
|---|---|---|
| home EN | 1 («PersePix — …») | h2×12، h3×22، بدون skip ✓ |
| product | 1 («Rust and Turquoise») | h2×4، h3×7، بدون skip ✓ |
| catalog | 1 («All books») | h2 صفر! h1→h3 skip ×19 → **A11Y-403** |
| /fa home | 1 (فارسی) | ✓ |
| login | 1 («Welcome back») | ✓ |

## ۶.۶ — Carousel/slider + reduced-motion (کد + DOM)

- **فلش‌ها:** همه labeled — «Previous/Next categories»، «Previous/Next books» (HomeSections.tsx:363/371)، «Previous/Next announcement»، qty stepper، هیرو. صفر دکمهٔ SVG بی‌نام در probe. ✓
- **HeroSlider autoplay:** `setInterval` با gate `matchMedia('(prefers-reduced-motion: reduce)')` (HeroSlider.tsx:58-72,187) + pause روی hover/drag.
- **reduced-motion در کد:** shelf-icons.tsx:176، HomeSections.tsx:304، ProductRow.tsx:176، ScrollStory.tsx:143 + `@media (prefers-reduced-motion: reduce)` در globals.css:266/318 → ۵ سایت + CSS. ✓ نقطهٔ قوت.
- **ScrollStory:** scroll-driven با aria-hidden درست روی عناصر تزئینی (204,208,229,272,354)؛ chapter nav با aria-label (246).
- شبیه‌سازی prefers-reduced-motion در agent-browser (media command موجود است ولی سنجش رفتار پس از تغییر نیاز به اسلایدر فعال دارد) → اتکا به کد-چک بالا کافی قلمداد شد.

## ۶.۷ — ریسپانسیو (جدول overflow + اجزا)

`(scrollWidth > innerWidth)` — سه صفحهٔ اصلی:

| Width | home | catalog | product | sticky hdr | hamburger/nav |
|---|---|---|---|---|---|
| 320 | 0px | 0px | 0px | ✓ | burger + nav 0 |
| 375 | 0px | 0px | 0px | ✓ | burger + nav 0 |
| 768 | 0px | 0px | 0px | ✓ | burger + nav 0 |
| 1024 | 0px | 0px | 0px | ✓ | nav 4 items |
| 1280 | 0px | 0px | 0px | ✓ | nav 4 items |
| 1440 | 0px | 0px | 0px | ✓ | nav 4 items |

- **بازهٔ شکست:** hamburger ≤768، منوی کامل ≥1024 (هر دو حالت درست).
- **mobile menu (375):** باز می‌شود؛ شیت با همهٔ لینک‌ها + دکمهٔ Close؛ **Esc می‌بندد** ✓؛ focus هنگام بازشدن وارد شیت نمی‌شود → A11Y-405.
- **filter drawer (375):** دکمهٔ «Filters» → پنل inline با ۱۲ checkbox visible و labeled (role=checkbox) — قابل استفاده ✓ (dialog role ندارد؛ پنل inline است).
- **search overlay (375):** آیکن Search → input visible (h=44px)؛ تایپ → کارت نتایج؛ Esc می‌بندد ✓. (روی catalog یک بار تداخل state از کلیک‌های خودم؛ روی home مسیر کامل OK.)
- **zoom-200% proxy:** عرض 640 (پروکسی 1280@200%) روی home/catalog/product/cart/checkout — **صفر overflow**. *محدودیت سندشده:* deviceScaleFactor و browser-zoom واقعی در agent-browser CLI در دسترس نبود؛ 640px proxy + بررسی اجزای خم‌شونده (flex/grid/wrap) جایگزین شد.
- RTL/zoom ترکیبی: در §۶.۸.

## ۶.۸ — RTL (/fa)

- `html dir="rtl" lang="fa"` روی /fa، /fa/books، /fa/books/rust-and-turquoise ✓ (runtime).
- overflow در 390px: صفر در هر سه صفحه. scrollWidth=innerWidth=390.
- تراز: logo در x=302 (راست‌چین ✓ در viewport 390)؛ از logical properties (`start-3`, `ms-auto`, `rounded-s-md`) در سورس استفاده گسترده شده (Header/bits) → آیکن‌ها بی‌مشکل جهت.
- h2 استوری فارسی رندر درست («ترانه‌هایی برای پل سوخته»).
- Screenshot: `audit-output/evidence/3c-rtl-fa-390.png` (390×844، درصدمشاهدهٔ بصری چیدمان RTL).

---

# یافته‌ها

## PERF-401 — عدم استفاده از next/image + انحصار PNG (بدون WebP/AVIF/srcset)
- **Severity: High** | **Status: Confirmed** | **Confidence: High**
- **Site:** کل storefront (`src/components/storefront/*`، `views/*`) — فقط `AdminHomepageSection.tsx` از next/image استفاده می‌کند؛ `/public/images`: 90 PNG / 2 WebP / 0 AVIF؛ 61MB کل (53MB products)؛ covers 160–225KB؛ `logo.png` = 301KB و در preload اول-صفحه.
- **Evidence:** `3c-bundle-signals.txt` (grep)؛ `3c-html-weight.json` (`next_img_tags: 0` در HTML رندرشده)؛ `curl -sI /images/logo.png → Content-Length: 301619`.
- **Impact:** صفحهٔ home حدود ۱MB+ تصویر PNG اولیه (preloadها)؛ بدون resize adaptive برای موبایل؛ LCP/پهنای‌باند 3G ضربه می‌خورد. sharp موجود است (deps) ولی مسیر استفاده از آن (/_next/image) خاموش است.
- **Fix:** مهاجرت تصاویر محتوایی (ProductCard/HeroSlider/ScrollStory/Header logo) به `next/image` با `sizes` و `priority` فقط برای LCP؛ یا حداقل: تولید مشتقات WebP/AVIF در build-time + `<picture>`. توجه: پورت /_next/image نیازمند تست در prod.
- **Est: 3–5 روز** (مهاجرت کامل) / 1 روز (فقط WebP + srcset دستی) | **Regression risk: Medium** (layout aspectها باید حفظ شود) | **Acceptance:** `next_img_tags > 0` در HTML، ترافیک تصویر home < 400KB در موبایل، بدون CLS جدید.

## PERF-402 — UI wrapperهای مرده با وابستگی سنگین (importer=0)
- **Severity: Low** | **Status: Confirmed (importers=0) / تاثیر prod باندل UNVERIFIED (بدون build)** | **Confidence: High**
- **Site:** `src/components/ui/`: chart.tsx (recharts)، carousel.tsx (embla)، calendar.tsx (react-day-picker)، drawer.tsx (vaul)، form.tsx (react-hook-form)، command.tsx (cmdk)، input-otp.tsx، resizable.tsx (react-resizable-panels)، sidebar.tsx — هیچ importکننده‌ای در src ندارند. `effect` dep هم بدون import (همان QA-407/SEC-403).
- **Impact:** وزن سورس/نگه‌داری + سطح حملهٔ وابستگی (recharts→lodash زنجیره advisory دارد). اگر tree-shake prod درست باشد، باندل کاربر تحت تاثیر نیست (متوقع: بله، چون زنجیرهٔ import از entry وجود ندارد) → کاربردی بودن در باندل UNVERIFIED.
- **Evidence:** `3c-bundle-signals.txt` (هر wrapper + خروجی rg importer).
- **Fix:** حذف wrapperها و deps مرده از package.json (uninstall) یا نگه‌داری با کامنت «scaffold» و gate در bundle-analyzer.
- **Est: 2 ساعت** | **Regression risk: Very low** | **Acceptance:** `bun install` بعد از حذف، typecheck/lint سبز، dev بالا.

## PERF-403 — فونت‌ها بدون کش طولانی‌مدت (max-age=0)
- **Severity: Low** | **Status: Confirmed** | **Confidence: High**
- **Site:** `next.config.ts:56-61` — قاعدهٔ immutable فقط `/images/:path*`؛ `/fonts/*` پاسخ می‌دهد `Cache-Control: public, max-age=0` + ETag.
- **Evidence:** `3c-cache-headers.txt` (`GET /fonts/inter-latin-400-normal.woff2 → max-age=0`).
- **Impact:** در هر مراجعهٔ جدید (و هر tab جدید) ۴ فایل فونت revalidate می‌شوند (304 با RTT/تأخیر شبکه)؛ در LCP-fight، فونت swap را عقب می‌اندازد.
- **Fix:** اضافه‌کردن `{source: "/fonts/:path*", headers: [{key:"Cache-Control", value:"public, max-age=31536000, immutable"}]}` (فایل‌ها fingerprint نیستند ولی content-locked؛ در تغییر فونت، نام فایل را bump کنید).
- **Est: 15 دقیقه** | **Regression risk: Very low** | **Acceptance:** `curl -I /fonts/... → immutable`.

## PERF-404 — کش‌ناپذیری کامل HTML/API (هم‌راستا با ARCH-402/PERF-002 — ارجاع، بازگزارش نشد)
- **Severity: Low** | **Status: Confirmed (هدرها)** | **Confidence: High**
- **Evidence:** `3c-cache-headers.txt`: `/` → `no-cache, must-revalidate`؛ `/api/products` → بدون Cache-Control. با ARCH-402 (force-dynamic ×6، صفر ISR) سازگار — هر درخواست catalog/product مسیر کامل prefetchPageData + RSC render می‌رود.
- **Impact:** در بار همزمان، TTFB صفحات دیتادار (catalog 130KB) خطی بالا می‌رود؛ مبنای کالیبره‌شدن پس از PERF-002.
- **Fix:** بعد از SQL pagination (PERF-001): revalidate-ISR برای /books و جزئیات منتشرشده + `Cache-Control: private, no-store` فقط برای صفحات session-دار؛ برای /api/products خواندنی-عمومی: s-maxage کوتاه در لبه (در صورت CDN).
- **Est: پس از PERF-001، 1–2 روز** | **Regression risk: Medium** (x-cart-cookie Vary باید رعایت شود — بدون آن نشست leak) | **Acceptance:** دومین GET catalog در prod با `x-nextjs-cache: HIT` یا هدر s-maxage.

## PERF-405 (Informational) — متریک‌های CWV و باندل prod اندازه‌گیری‌نشده
- **Status: Unverified — علت سندشده:** ممنوعیت `bun run build` در این workspace (clobber `.next` سرور dev زنده) و نبود Lighthouse. اعداد §۵.۱/۵.۲ فقط dev هستند. توصیه: پس از lift ممنوعیت، اجرای build + Lighthouse mobile (مسیر مستقل از سرور dev) و ثبت در ledger.

## A11Y-401 — token رنگ muted (`ink-3`) زیر حد AA متن معمولی
- **Severity: Medium** | **Status: Confirmed** | **Confidence: High**
- **Site:** `rgb(113,128,138)` — 4.07:1 روی بسترهای روشن (home/catalog//fa، 16px) — کاربرد در caption/قیمت-فرعی/hint‌ها.
- **Evidence:** eval contrast (§۶.۴) — nav 7.79، دکمه 16.52، footer 7.24 ولی ink-3=4.07.
- **Impact:** متن کمکی برای کم‌بینایان/نور کم ناخوانا؛ WCAG 2.1 AA fail (1.4.3) در تمام صفحات.
- **Fix:** تیره‌کردن ink-3 به حداقل #6B7683→ (4.5+) — مثلاً `rgb(100,113,124)`≈4.6:1 یا تیره‌تر؛ فقط یک token در tailwind/theme (البته با تست بصری چارت‌ها).
- **Est: 1 ساعت** | **Regression risk: Very low** | **Acceptance:** eval کنتراست ink-3 ≥ 4.5 در هر دو تم.

## A11Y-402 — خطای لاگین به فیلد متصل نیست (aria-invalid/aria-describedby ندارد)
- **Severity: Low** | **Status: Confirmed** | **Confidence: High**
- **Site:** AuthView (login) — خطای سرور با `role=alert` announce می‌شود ولی فیلدها aria-invalid نمی‌گیرند و خطا با aria-describedby به input وصل نیست.
- **Evidence:** eval پس از wrong-password: `alertEls:["Invalid email or password."]`، `inv:[]`، `descTargets:[]`.
- **Impact:** کاربر SR بعد از پیام باید حدس بزند کدام فیلد مشکل دارد (اینجا واضح است، اما الگو در فرم‌های دیگر هم تکرار می‌شود).
- **Fix:** set `aria-invalid` + `aria-describedby→<id پیام>` هنگام خطا؛ الگوی موجود فرم‌های پروژه قابل تعمیم است.
- **Est: 1–2 ساعت** (تمام فرم‌های auth) | **Regression risk: Very low** | **Acceptance:** بعد از 401: `[aria-invalid=true]` + describedby→المان خطا.

## A11Y-403 — پرش سطوح هدینگ در catalog (h1→h3، بدون h2)
- **Severity: Low** | **Status: Confirmed** | **Confidence: High**
- **Site:** CatalogView دسکتاپ — 19 h3 بدون هیچ h2 (فیلترها/سورت فقط در موبایل h2 دارند).
- **Evidence:** eval headings `/books` → `counts {1:1, 3:19}`.
- **Impact:** ناوبری هدینگ SR گمراه می‌شود (WCAG 1.3.1 نرم).
- **Fix:** تبدیل «All books» نتیجه-متریک/عناوین بخش به h2 یا پایین‌آوردن کارت‌ها به h2.
- **Est: 30 دقیقه** | **Regression risk: Very low** | **Acceptance:** eval بدون skip.

## A11Y-404 — نتایج جست‌وجوی overlay با `<button>` به‌جای لینک
- **Severity: Low** | **Status: Confirmed** | **Confidence: High**
- **Site:** Header.tsx:181-217 — ردیف‌های product/people/article نتایج، `onClick → navigate()`؛ بدون href.
- **Impact:** قابل‌کیبورد هستند ولی semantics لینک از بین می‌رود: open-in-new-tab/middle-click، و SR آن را «button» اعلام می‌کند نه «link».
- **Fix:** `<a href={localePath(...)}>` با onClick preventDefault + navigate (همان الگوی Favorites در Header).
- **Est: 1–2 ساعت** | **Regression risk: Low** | **Acceptance:** snapshot → `link` نه `button`؛ middle-click کار می‌کند.

## A11Y-405 — focus هنگام بازشدن منوی موبایل وارد شیت نمی‌شود
- **Severity: Low** | **Status: Confirmed** | **Confidence: Medium**
- **Site:** Header mobile menu (Header.tsx:745 اطراف) — Esc می‌بندد ✓ ولی focus روی تریگر/بادی می‌ماند.
- **Evidence:** eval پس از بازکردن: `focusIn:false`.
- **Impact:** کاربر کیبورد باید چند Tab بزند تا اولین لینک منو؛ SR context منوی باز را نمی‌شنود (بدون focus move ممکن است محتوای زیر خوانده شود).
- **Fix:** focus به اولین لینک/دکمهٔ Close بعد از open (radix Dialog.Content auto-focus یا ref)؛ برگرداندن focus به تریگر در close (این بخش سالم است).
- **Est: 30 دقیقه** | **Regression risk: Very low** | **Acceptance:** بعد از بازکردن: `document.activeElement` داخل شیت.

## A11Y-406 (Informational) — live region «1 items»
- فرم جمع/مفرد (`1 items`) در sr-only cart (Header.tsx:725). برای EN: «1 item». کم‌اثر؛ fix در i18n dict.

---

# نقاط قوت تأییدشده (runtime/static)

1. **Skip link + focus visible همه‌جا:** 15/15 توقف Tab با outline 2px `rgb(1,75,116)` + offset (home)؛ skip link اولین stop.
2. **Focus trap دیالوگ radix درست** (View larger): focus-in، چرخش داخل، Esc + بازگشت focus.
3. **aria-live کاربردی:** cart count (runtime تأیید: 0→1 items)، qty steppers، خطاهای فرم role=alert، loading role=status.
4. **فرم‌ها:** label/for کامل، autocomplete درست (login/checkout)، inputMode نقاط حساس، QtyStepper دکمه‌محور با aria کامل.
5. **Headings:** home/product//fa/login دقیقاً ۱ H1 بدون skip (فقط catalog استثنا — A11Y-403).
6. **alt-text:** صفر `<img>` بی‌alt در 4 صفحهٔ audited؛ تزئینی‌ها aria-hidden/empty-alt درست.
7. **reduced-motion:** ۵ component + CSS media — از جمله gate واقعی روی autoplay هیرو.
8. **ریسپانسیو بدون overflow:** 0px overflow در 18 سناریو (3 صفحه × 6 عرض) + 640px zoom-proxy + 390px RTL؛ sticky header؛ hamburger/nav سوییچ درست؛ filter drawer و search overlay موبایل کارا؛ Esc همه‌جا.
9. **RTL:** dir/lang runtime درست، logical properties (`start-3/ms-auto/rounded-s-*`)، تراز RTL درست (logo راست در 390px).
10. **Boot تک‌درخواستی** `/api/bootstrap` (جای ۵ fetch) + SSR prefetchPageData بدون آبشار کلاینت + debounce 300ms پاک‌شونده.
11. **AdminView lazy** (dynamic, ssr:false + skeleton) — ~313KB از باندل eager حذف (کامنت سورس).
12. **فونت استراتژی:** self-host + preload هدفمند ۴ فایل first-paint + `font-display: swap`.
13. **کش تصاویر immutable** (`max-age=31536000`) + ETag — هدر واقعی تأیید شد.
14. **CLS-defensive:** aspect-ratio containers (hero `aspect-[7/4] + min-h`، کارت `aspect-[3/4]`)، بنر کوکی `fixed` (بدون shift)، نوار اعلان در SSR HTML (نه تزئین دیرهنگام).

---

# ردپای ممیزی (mutation footprint)

- ۱ افزودن به سبد مهمان (rust-and-turquoise ×1) → **حذف شد** (DELETE /api/cart/items/… → count:0)؛ ردیف Cart مهمان + ۱ CookieConsent مهمان باقی می‌ماند (الگوی 2-c).
- ۱ LoginThrottle failCount برای `probe-3c@example.com` (پروب wrong-password، بدون مصرف تلاش حساب واقعی) + native-validation submits بدون write.
- هیچ write ادمین/سورس/کانفیگ. سرور و DB دست‌نخورده.





---

## پیوست — معماری و کیفیت کد فرانت‌اند (2-d)

# گزارش ممیزی معماری + استاتیک فرانت‌اند — Task 2-d

- پروژه: `/home/z/my-project` — Next.js 16 App Router / React 19 / TypeScript 5 / Prisma
- دامنه: فاز ۳ (معماری/کیفیت کد) + بخش‌های استاتیک فاز ۴ (React correctness، Routing، Forms/UX)
- روش: تحلیل استاتیکِ فقط-خواندنی (بدون اجرا، بدون تغییر فایل پروژه). ادعاهای worklog.md به‌صورت مستقل re-verify شدند.
- تاریخ: 2025-02 (session 2-d)
- شواهد: `audit-output/evidence/2d-import-cycles.json`، `2d-fanin-top30.json`، `2d-dep-violations.json`، `2d-dead-exports.json`

> ⚠️ نکتهٔ متدولوژیک: خروجی ترمینال دنباله‌های `[m` را می‌بلعد (ANSI). چند مورد که در خروجی خام «کلاس Tailwind خراب» به نظر می‌رسیدند (مثل `w-in(...)` در Header.tsx:169) با بررسی پایتونی تایید شدند که سالم‌اند (`w-[min(...)]`). چنین مواردی در این گزارش به‌عنوان یافته ثبت نشده‌اند.

---

## ۱. نقشهٔ معماری (Layer Map)

```
src/app/[...slug]/page.tsx (RSC catch-all، force-dynamic)
   │  metadata + JSON-LD + prefetchPageData() (سرور)
   ▼
ServerRouteProvider (context)  ──►  <Shell /> (کلاینت SPA dispatcher، ۲۹ روت)
   │                                     │
   │                                     ├── components/storefront/* (Header/Footer/bits/…)
   │                                     └── components/views/* (۲۹ View، AdminView با dynamic import)
   │                                              │
src/app/api/**/route.ts (۱۱۲ route)              │  lib/api.ts (apiGet/apiPost + ApiError)
   └──► lib/server/* (۴۷ ماژول سرویس)            │  lib/router.ts (History-API router)
          └──► lib/db.ts (Prisma singleton)      └── store/store.ts (zustand) + hooks/*
```

**سنجه‌های کلیدی (اندازه‌گیری‌شده):**
- ۲۷۵ فایل TS/TSX در `src/`، ۱۰۵۵ یال import استاتیک (شواهد: `2d-import-cycles.json`)
- ۱۰۵ فایل `'use client'`
- صفر `import type` ناقض → فقط ۱ نقض جهت وابستگی (ARCH-405)
- `as any`: **۰** — `: any`: **۰** — `as unknown as`: **۱۰** (همه موجه: الگوی globalThis و lag نوع DTO)
- TODO/FIXME/HACK/XXX: **صفر** در کل `src/`
- `console.*`: فقط **۳** مورد (ProductView.tsx:262، checkout/route.ts:438 و :465)

### یافته‌های معماری

---

#### ARCH-401 — نبود `error.tsx` / `global-error.tsx` (بدون Error Boundary)
- **شدت:** High | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** کل `src/app/` — فقط `not-found.tsx` موجود است؛ `error.tsx`، `global-error.tsx`، `loading.tsx` وجود ندارند.
- **توضیح:** صفحهٔ RSC (`[...slug]/page.tsx`) به‌شدت دفاعی نوشته شده (سه try/catch برای metadata، JSON-LD و prefetch)، ولی کامپوننت‌های کلاینت (Shell و ۲۹ View) هیچ boundary ندارند. یک پرتاب استثنا در رندر کلاینت (مثلاً پاسخ API با شکل غیرمنتظره که در متد رندر consume شود، یا باگ در یک View) در production به **صفحهٔ سفید بدون برند و بدون مسیر بازیابی** می‌رسد، چون نزدیک‌ترین boundary، root است که وجود ندارد.
- **تریگر:** هر throw در رندر/هیدریشن کلاینت.
- **سناریوی خرابی:** کاربر در PDP یا Checkout صفحهٔ خالی می‌بیند؛ هیچ toast/دکمهٔ retry/لینک خانه نیست؛ نرخ bounce مستقیم روی مسیرهای پرداخت.
- **تأثیر:** تجربهٔ کاربری فاجعه‌بار در خطاها + از دست رفتن دیاگنوستیک (لاگی برای مشتری ثبت نمی‌شود).
- **شواهد:**
  ```
  $ ls src/app/*error* src/app/**/error.tsx  →  (empty)
  src/app/not-found.tsx  ✔ (تنها فایل خطای موجود)
  ```
- **روش اصلاح:** افزودن `src/app/error.tsx` (client component با `reset()`, پیام دوزبانه, دکمهٔ retry + خانه) و `src/app/global-error.tsx` برای خطاهای layout. رعایت CSP nonce (اسکریپت inline ممنوع).
- **زمان تخمینی:** ۲–۴ ساعت | **ریسک رگرسیون:** کم (فایل جدید، بدون تغییر مسیرهای موجود)
- **آزمون پذیرش:** در dev یک View را موقتاً throw کنید → UI خطای برندشده با دکمهٔ retry رندر شود؛ بعد از حذف، typecheck/lint سبز.

---

#### ARCH-402 — همهٔ صفحات `force-dynamic`؛ صفر ISR/کش خروجی
- **شدت:** Medium | **وضعیت:** Confirmed (وجود) / Likely (برخورد در مقیاس) | **اطمینان:** بالا
- **فایل+خط:** `src/app/[...slug]/page.tsx:18`، `src/app/page.tsx:10`، `sitemap.xml/route.ts:8`، `llms.txt/route.ts:12`، `robots.ts:7`، `api/bootstrap/route.ts:27`
- **توضیح:** تک-مسیر catch-all با `force-dynamic` یعنی هر درخواست HTML = اجرای prefetchPageData (چند کوئری Prisma: home sections، series index، جزئیات محصول، shipping settings) + buildJsonLd (کوئری‌های بیشتر). هیچ‌جا `revalidate`/ISR/`unstable_cache` وجود ندارد (grep کامل: صفر). این کار کشِ صفحه را کامل می‌بندد.
- **سناریوی خرابی:** ترافیک خزنده‌ها (هر URL پیمایش sitemap = چند کوئری) یا لینک ترند → فشار مستقیم روی DB. با SQLite فعلی و تک-پروسسه قابل تحمل؛ با رشد، latency P95 بالا می‌رود.
- **تأثیر:** هزینهٔ سرور/DB خطی با ترافیک؛ مقیاس‌پذیری محدود.
- **شواهد:** `export const dynamic = 'force-dynamic'` در ۶ نقطه؛ `cache: 'no-store'` فقط در `lib/api.ts:19` (سمت کلاینت — بی‌اثر روی کش سرور).
- **روش اصلاح:** جداسازی بخش‌های personalization (cart/user در Header از bootstrap می‌آیند، نه RSC) و استفاده از `revalidate` معقول برای صفحات محتوایی (PDP/catalog/home) + `unstable_cache` روی getHomeSections/getSetting. توجه: با معماری فعلی که HTML شامل cart count نمی‌شود، عبارت‌شده‌اند که force-dynamic برای settings-محور بودن لازم است — نیاز به تصمیم معماری دارد.
- **زمان تخمینی:** ۲–۳ روز (پس از cutover Postgres) | **ریسک رگرسیون:** متوسط (خطر HTML کهنه برای settings/قیمت) — آیتم PERF-002 ممیزی v3 را مجدد تأیید می‌کند.
- **آزمون پذیرش:** `curl -I /books/x` بعد از تغییر → `x-nextjs-cache: HIT` در درخواست دوم؛ تغییر قیمت در ادمین پس از revalidate منعکس شود.

---

#### ARCH-403 — Singletonهای درون-حافظه‌ای: در deployment تک-نمونه‌ای امن، در multi-instance ناامن
- **شدت:** Medium | **وضعیت:** Confirmed (کد) / Likely (سناریوی scale-out) | **اطمینان:** بالا برای کد
- **فایل+خط (فهرست کامل singletonهای mutable در سطح ماژول):**
  - `src/lib/server/rate-limit.ts:4` — `const buckets = new Map<string, Bucket>()` (با prune هر ۶۰ث)
  - `src/app/api/checkout/route.ts:62` — `idempotencyCache` (TTL ۱۵دقیقه، سقف ۱۰۰۰ با پاکسازی)
  - `src/lib/server/housekeeping.ts:12` — `lastSweepAt` (globalThis)
  - `src/lib/server/mail-dispatch.ts:35` — `globalForMail` (transport مشترک)
  - `src/lib/db.ts:5-28` — Prisma client روی globalThis (استاندارد، درست)
  - سمت کلاینت (به‌ازای تب بی‌خطر): `lib/view-cache.ts:23-24`، `lib/use-settings.ts:16-17`، `hooks/use-toast.ts:57`، `store/store.ts:78` (wishlist write chain)، `lib/router.ts:54,71`
- **توضیح:** هر دو cache سرور **bounded** و مستندند («per-process» در کامنت) — تلاش دبل-کلیک سفارش و rate limit را در تک-پروسسه می‌بندد، اما در ۲+ instance، attacker می‌تواند با چرخش بین instanceها rate limit را دور بزند و idempotency replay بین گره‌ها کار نمی‌کند (سفارش تکراری در retry بین‌گره‌ای).
- **سناریوی خرابی:** scale-out آینده → 429-ها ناپدید می‌شوند، duplicate order در retry ظاهر می‌شود.
- **تأثیر:** مسدودکنندهٔ scale-out، نه باگ امروز. (هم‌راستا با SEC-002/ARCH-001 ممیزی v3 که «deferred by design» ثبت شد.)
- **روش اصلاح:** مهاجرت هر دو به Redis/جدول DB هنگام تصمیم به multi-instance؛ تا آن‌موقع docblock فعلی کافی است.
- **زمان تخمینی:** ۲–۳ روز | **ریسک رگرسیون:** متوسط | **آزمون پذیرش:** دو instance، ارسال موازی با Idempotency-Key یکسان → دقیقاً ۱ سفارش.

---

#### ARCH-404 — سه‌گانگی تعریف روت: KNOWN_ROOTS / dispatch در Shell / prefetchPageData
- **شدت:** Medium | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `src/app/[...slug]/page.tsx:34-43` (KNOWN_ROOTS)، `src/components/storefront/Shell.tsx:147-211` (dispatch)، `src/app/[...slug]/page.tsx:490-567` (prefetch dispatch)، و سومین آینهٔ ناقص `hasOwnMain` در `Shell.tsx:214-223`
- **توضیح:** افزودن یک root جدید حداقل ۴ نقطهٔ هماهنگ می‌خواهد؛ اگر یکی جا بماند یا root به 404 می‌خورد (KNOWN_ROOTS)، یا SSR بدنهٔ خالی می‌دهد (prefetch)، یا layout اسکلت اشتباه رندر می‌شود (hasOwnMain). invariant کارگاهی («هر root جدید باید به KNOWN_ROOTS اضافه شود») این را مستند کرده ولی خودِ ساختار همچنان مستعد است.
- **سناریوی خرابی:** روت جدید `/deals` به Shell اضافه می‌شود ولی به KNOWN_ROOTS نه → 404 واقعی برای همه.
- **تأثیر:** باگ خاموش در آیندهٔ نزدیک؛ هزینهٔ شناختی مداوم.
- **روش اصلاح:** یک `ROUTES` registry واحد (آرایهٔ `{ root, view, prefetch?, noindex?, ownMain? }`) که هر سه مصرف‌کننده از آن بخوانند.
- **زمان تخمینی:** ۴–۶ ساعت | **ریسک رگرسیون:** متوسط (بازآرایی مسیرِ حیاتی؛ نیاز به smook ۲۲ صفحهٔ موجود) | **آزمون پذیرش:** اسکریپت `scripts/check-routes.ts` موجود باید بدون تغییر پاس شود + یک root آزمایشی فقط با یک خط اضافه شود.

---

#### ARCH-405 — نقض جهت وابستگی: `lib/router.ts` → `components/storefront/SsrProviders`
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `src/lib/router.ts:6` (`import { ServerRouteContext } from '@/components/storefront/SsrProviders'`) — تنها نقض در کل گراف (شواهد: `2d-dep-violations.json`)
- **توضیح:** لایهٔ پایه (lib) به لایهٔ UI (components) import دارد. Context باید در لایهٔ مشترک باشد، نه در کامپوننت. `import type`های مشابه در SeriesView و… مجازند (type-only).
- **تأثیر:** خالص‌سازی معماری؛ در عمل چون هر دو client-side‌اند، هزینهٔ رانتایم صفر.
- **روش اصلاح:** انتقال `ServerRouteContext` + نوع `RouteState` به `lib/route-state.ts` (که از قبل isomorphic است) و import معکوس در SsrProviders.
- **زمان تخمینی:** ۳۰ دقیقه | **ریسک رگرسیون:** کم | **آزمون پذیرش:** typecheck + رندر SSR صفحهٔ اول با متن واقعی (C3 همچنان کار کند).

---

#### ARCH-406 — ماتریس RBAC در کلاینت تکرار شده (role literal)
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `src/components/views/AdminView.tsx:62-64` (`['OWNER','EDITOR','ORDER_SUPPORT']` و `['OWNER','EDITOR']` literal) در برابر منبع حقیقت `src/lib/server/auth.ts:148,158` (ADMIN_ROLES / CONTENT_ROLES)
- **توضیح:** چون server هم enforce می‌کند fail-safe است، اما افزودن نقش جدید (مثلاً 'MARKETING') دو نقطهٔ به‌روزرسانی دارد و literal ها در ۳ نقطهٔ دیگر هم باقی‌اند: `app/api/admin/customers/[id]/route.ts:132`، `lib/server/report-mail.ts:82` (literal 'OWNER').
- **روش اصلاح:** ثابت‌های نقش به یک ماژول بدون-side-effect مشترک (مثلاً `lib/roles.ts`) و مصرف در auth.ts + AdminView.
- **زمان تخمینی:** ۱ ساعت | **ریسک رگرسیون:** کم | **آزمون پذیرش:** typecheck + ورود ORDER_SUPPORT → بخش‌های content مخفی و API آن‌ها 403.

---

#### ARCH-407 — الگوی تکراری نگه‌داشت env در ۴ فایل
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `app/api/auth/forgot-password/route.ts:50-51`، `app/api/auth/register/route.ts:75-76`، `app/api/account/email/change/route.ts:76-77`، `app/api/account/email/verification-request/route.ts:36-37` — همه همان `DEV_EXPOSE_RESET_LINK === '1' && NODE_ENV === 'development'`
- **توضیح:** معماری env در مجموع سالم است: مصرف process.env فقط ۳۶ نقطه، هر متغیر در ماژولِ مالک خودش (google.ts برای GOOGLE_*، mail-dispatch برای SMTP_*، db.ts، proxy.ts) و fail-fastهای production واقعی‌اند (STATE_SECRET، NEXT_PUBLIC_SITE_URL، PAYMENT_PROVIDER). فقط این guard تکراری باید به helper (`isDevExposeEnabled()` در lib/server/utils) برود.
- **زمان تخمینی:** ۳۰ دقیقه | **ریسک رگرسیون:** کم | **آزمون پذیرش:** grep = یک تعریف، چهار مصرف.

---

#### ARCH-408 — لاگ‌گذاری: هیچ structured logging وجود ندارد (اما PII هم نیست)
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** فقط ۳ مورد console: `components/views/ProductView.tsx:262` (`console.error('ADDCART_FAIL', e)`)، `app/api/checkout/route.ts:438` (`outbox: order confirmation mail failed`, mailErr)، `:465` (`checkout failed`, err)
- **توضیح:** سکوت لاگ کنسولی نشان‌دهندهٔ بهداشت خوب است (خطاها به‌جای لاگ، به مشتری با ApiError کد-دار برمی‌گردند و در audit-log جدولی ثبت می‌شوند — `lib/server/utils.ts` تابع `audit()`), اما ۳ لاگِ unstructured فعلی: (۱) آبجکت خام err را لاگ می‌کنند که در آینده ممکن است PII (ایمیل در پیام خطای SMTP) داشته باشد، (۲) بدون request-id correlation هستند، (۳) عملیاتی‌ها برای داشبورد خطا هیچ منبعی ندارند.
- **روش اصلاح:** یک logger مینیمال (سطح + کد + request-id، بدون PII) برای همین ۳ نقطه؛ بقیهٔ مسیرها همان ApiError/audit-log.
- **زمان تخمینی:** ۲–۳ ساعت | **ریسک رگرسیون:** کم | **آزمون پذیرش:** شبیه‌سازی خطای mail → خروجی لاگ JSON بدون ایمیل مشتری.

---

#### قوت‌های تأییدشدهٔ معماری (Verified Strengths)
1. **صفر وابستگی حلقوی** — DFS روی ۱۰۵۵ یال استاتیک: هیچ cycle‌ای (شواهد JSON ضمیمه).
2. **مرز server/client تمیز** — هیچ کامپوننت کلاینتی Prisma/`lib/db` یا secret را import نمی‌کند؛ تنها اتصال components→lib/server از نوع `import type` است (۵ فایل، رانتایم صفر).
3. **singletonهای پرکاربرد استاندارد و bounded** — db.ts الگوی globalThis صحیح؛ idempotencyCache و rate-limit سقف‌دار و prune-شونده؛ view-cache سقف ۸۰ LRU-مانند.
4. **استراتژی env سالم** — ۳۶ مصرف، مالکیت ماژولی، fail-fastهای production (STATE_SECRET/APP_URL/PAYMENT_PROVIDER/HEALTHZ_OPS)؛ لاگ کوئری Prisma فقط dev + opt-in (db.ts:16-20).
5. **مدیریت خطای API یکدست** — `apiError(status, code, message)` در ۹۳ فایل route؛ ۷۷ بلوک try؛ خطاهای best-effort (metadata/JSON-LD/audit) آگاهانه و کامنت‌شده swallow می‌شوند.
6. **SSR حقیقی با degradation امن** — prefetchPageData برای entity غایب `null` → 404 واقعی؛ خطای DB → 200 با بدنهٔ client-render (SEO-001 ممیزی v3، مجدداً تأیید شد).
7. **CSP دو-لایهٔ درست** — proxy.ts (nonce + strict-dynamic در prod) برای صفحات؛ CSP استاتیک برای api/* در next.config؛ جلوگیری از intersection دو header مستند و درست.
8. **Code-splitting هدفمند** — AdminView (~۹.۴k خط درخت ادمین) با `dynamic(ssr:false)` از باندل ویترین خارج شده (Shell.tsx:45-65).
9. **طیف i18n متمرکز** — `getDict` با fan-in ۵۱، typed dict (`type Dict = typeof en`)، fa معادل کامل en.

---

## ۲. نقاط داغ کیفیت کد (Top-15)

### جدول تجزیهٔ ۱۵ فایل بزرگ (هر ردیف یک خط)

| # | فایل | خطوط | ساختار فعلی | مسئولیت‌های مجزا | fan-in | پیشنهاد تجزیه |
|---|------|------|-------------|------------------|--------|----------------|
| 1 | `components/views/admin/ProductEditor.tsx` | ۲۱۲۰ | **۱ کامپوننت غول** (`FullProductEditor` از خط ۱۵۳ تا انتها ≈۱۹۶۰ خط) + ۳ factory | بارگذاری/ذخیره، محتوا×۲زبان، رسانه/گالری+drag، طبقه‌بندی، واریانت‌ها، مرتبط (search debounce)، سئو، انتشار/زمان‌بندی، ساخت person درجا، **دیکشنری fa کامل inline** (خط ۲۲۲+) | ۱ (AdminProducts) | split به ۸ فایل + state reducer/context؛ دیکشنری به i18n |
| 2 | `components/views/AccountView.tsx` | ۱۲۲۷ | ۱۵ زیرکامپوننت داخلی + AccountView | dashboard، orders، order-detail (۲۲۶ خط)، addresses، returns، tickets، ticket-detail، privacy، email، security، sessions، UA-parser | ۱ (Shell) | هر سکشن فایل خودش (`account/` dir)؛ الگوی `load` مشترک به hook |
| 3 | `lib/i18n.ts` | ۱۲۱۶ | دو آبجکت ۶۰۰-خطی en/fa + getDict/tf | ترجمهٔ کل ویترین+اکانت+ادمین | **۵۱** | split به namespace-per-file (auth/cart/admin/…) + merge؛ تایپ‌سیف باقی بماند |
| 4 | `components/views/admin/AdminProductsSection.tsx` | ۱۰۷۱ | AdminProducts (۵۶۰ خط!) + BulkStockDialog + ImportProductsDialog + ۲ parser CSV | جدول، bulk stock، import CSV، export، ویرایش سریع | ۱ (AdminView) | جدول/dialogs به فایل جدا؛ import CSV به `admin/products/import.tsx` |
| 5 | `components/views/admin/AdminDiscountsSection.tsx` | ۹۵۷ | ۶ کامپوننت (ScopeEditor ۱۷۶ خط، PromoExclusionsDialog، AdminPromotionCard، DiscountUsageDialog، AdminDiscounts) + **۴۷ useState** | تخفیف‌ها، پرومو، scope، استثناها، usage | ۱ | هر dialog فایل خودش؛ ScopeSel به ماژول مشترک |
| 6 | `components/views/admin/AdminHomepageSection.tsx` | ۹۲۰ | AdminHomepage (۳۴۸ خط) + ۱۰ SectionEditor جدا (Hero/Poster/Shelf/Series/…) | نسخه‌ها/انتشار + ۱۰ نوع سکشن | ۱ | Section editor ها فایل جدا؛ فقط Administrator بماند |
| 7 | `components/storefront/Header.tsx` | ۸۷۳ | ۸ واحد (Logo، LanguageSwitcher، SearchOverlay، MiniCart، AnnouncementBar، BooksDropdown، useBookCategories، Header) | ناوبری، جست‌وجو، مینی‌کارت، اعلان، زبان | ۱ (Shell) | SearchOverlay/MiniCart/AnnouncementBar به فایل‌های جدا (همگی مستقل‌اند) |
| 8 | `components/views/ProductView.tsx` | ۸۷۳ | **تک-تابع** (ProductView از ۴۱ تا انتها) + ۱۹ useState/۳ useEffect | گالری، مشخصات، نقد+آرا (optimistic+rollback)، فرم نقد، back-in-stock، share، deep-link review | ۱ (Shell) | استخراج `ReviewSection` و `Gallery`؛ state نقد به hook |
| 9 | `components/storefront/HomeSections.tsx` | ۸۶۱ | ۱۳ کامپوننت سکشن (ترکیب تمیز) | هر نوع HomeSection | ۱ (HomeView) | از همهٔ لیست، سالم‌ترین؛ فقط به پوشهٔ `home/` منتقل شود |
| 10 | `app/api/admin/products/[id]/route.ts` | ۸۳۷ | GET (۱۳۳) / **PATCH (۵۵۰!)** / DELETE (۶۰) | خواندن، آپدیت ترجمه‌ها+واریانت‌ها+contributors+related+SEO، حذف | ۰ (endpoint) | PATCH به `lib/server/product-update.ts` (سرویس) با transaction شفاف |
| 11 | `components/ui/sidebar.tsx` | ۷۲۶ | vendored shadcn-ui | — | ۴ | دست‌نخورده (کتابخانه)؛ اگر مصرف ندارد → حذف (ARCH-422) |
| 12 | `components/views/admin/CustomersTable.tsx` | ۶۷۷ | جدول + drawer جزئیات + تیکت | مشتریان | ۱ | drawer جدا شود |
| 13 | `components/views/CatalogView.tsx` | ۶۳۲ | فیلترها + اسلایدر قیمت + گرید + loadMore | کاتالوگ | ۱ (Shell) | FiltersPanel فایل جدا |
| 14 | `components/views/admin/ArticlesAdmin.tsx` | ۶۱۸ | لیست + ادیتور کامل | مقالات | ۱ | ادیتور جدا شود |
| 15 | `app/[...slug]/page.tsx` | ۶۰۰ | generateMetadata (۱۲۰) + buildJsonLd (۲۶۰) + prefetch (۷۸) + dispatch | متادیتا، JSON-LD، prefetch | ۰ | builders per-root به `lib/server/seo.ts` |

### یافته‌های کیفیت

---

#### ARCH-409 — ProductEditor: یک کامپوننت ۱۹۶۰ خطی با ۴۰ useState
- **شدت:** High | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `src/components/views/admin/ProductEditor.tsx:153` (شروع)، `:112-151` (factoryها)، `:222-380` (دیکشنری fa inline)، `:516` و `:660` (تنها ۲ useEffect — هر دو تمیز)
- **توضیح:** ۴۰ useState مستقل (فرم محتوا، گالری، drag state، لایت‌باکس، واریانت‌ها، person جدید، related، publish، tab). خطر: هر re-render کل درخت ادیتور را رندر مجدد می‌کند؛ تست‌پذیری صفر؛ دو useEffect با آرایهٔ وابستگی دستی + eslint-disable (خودشان درست‌اند ولی شکننده).
- **تریگر:** افزودن قابلیت جدید به ادیتور → تداخل state و رگرسیون در بخش‌های دور.
- **تأثیر:** کندی توسعه، ریسک باگ، bundle ادمین بزرگ‌تر.
- **روش اصلاح:** state به `useReducer` یا چند hook دامنه‌ای (`useVariantDraft`, `useGallery`)؛ tabها به کامپوننت فایل-جداشده با props صریح؛ دیکشنری inline به `i18n/admin-editor.ts`.
- **زمان تخمینی:** ۳–۵ روز (بالای کار انجام‌شدهٔ قبلی ۵۷۶۱→۲۱۲۰) | **ریسک رگرسیون:** متوسط-بالا (فرم غنی؛ نیاز به تست دستی کامل گردش publish) | **آزمون پذیرش:** ذخیرهٔ محصول با تغییر در هر ۷ تب + آپلود تصویر + drag گالری بدون رگرسیون.

---

#### ARCH-410 — ناسازگاری تقویم/لوکیل تاریخ: دو مسیر فرمت موازی
- **شدت:** Medium | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** منبع واحد: `lib/format.ts:43-52` (`formatDate` — fa: `fa-IR-u-ca-persian`، en: `en-GB`) در ۳۶+ نقطه درست مصرف می‌شود؛ **اما** `components/storefront/HomeSections.tsx:644` فرمت را دوباره inline نوشته: `new Date(iso).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', …)` بدون calendar فارسی و با en-US به‌جای en-GB.
- **توضیح:** تاریخ مقاله در صفحهٔ اصلی (fa) **میلادی** و همان تاریخ در لیست مقالات (fa) **شمسی** نمایش داده می‌شود. en هم ۲ فرمت متفاوت (US vs GB).
- **تریگر:** مشاهدهٔ سکشن ARTICLES در home با لوکیل fa.
- **سناریوی خرابی:** ناسازگاری آشکار محتوایی برای کاربر فارسی؛ بی‌اعتمادی.
- **روش اصلاح:** حذف تابع inline و استفاده از `formatDate(iso, locale)`.
- **زمان تخمینی:** ۱۵ دقیقه | **ریسک رگرسیون:** تقریباً صفر | **آزمون پذیرش:** `/fa` و `/fa/articles` → هر دو تاریخ یکسان شمسی.

---

#### ARCH-411 — خوشهٔ تکرار A: الگوی «رقم‌های فارسی» ×۲۵+ به‌صورت ternary دستی
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط (نمونه‌ها):** `Header.tsx:305,391,579,768`؛ `bits.tsx:121-122,149,183,213`؛ `ProductView.tsx:407,657,660,788,795`؛ `HomeSections.tsx:706,762`؛ `ScrollStory.tsx:191`؛ `AccountView.tsx:289`؛ `ProductCard.tsx:164` — و **دو کپی محلی یکسان**: `const dig = (n) => (isFa ? faDigits(String(n)) : String(n))` در `SeriesView.tsx:25` و `HomeSections.tsx:762`
- **توضیح:** فرمول `locale === 'fa' ? faDigits(String(x)) : String(x)` بیست‌وپنج بار کپی شده. کافی است یک بار تغییر شرط (مثلاً پشتیبانی از ar) لازم شود.
- **روش اصلاح:** `localDigits(v: string|number, locale: Locale): string` در `lib/format.ts` + جایگزینی تدریجی.
- **زمان تخمینی:** ۱.۵ ساعت | **ریسک رگرسیون:** کم | **آزمون پذیرش:** `/fa` — همهٔ شمارنده‌ها فارسی؛ `/` — لاتین.

---

#### ARCH-412 — خوشهٔ تکرار C: سقف تعداد در سبد (۱۰) به‌صورت literal در ۳ نقطهٔ کلاینت
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** منبع حقیقت `lib/server/cart.ts:13` (`MAX_QTY_PER_ITEM = 10`) — کلاینت literal: `Header.tsx:297`، `CartView.tsx:92`، `ProductView.tsx:577` (هر سه `Math.min(10, …)`)
- **توضیح:** ثابت سرور قابل import به کلاینت نیست (ماژول سرور)، پس عدد لایه‌بندی شده. تغییر سقف در سرور → UI سه‌جا غلط می‌ماند.
- **روش اصلاح:** انتقال ثابت به `lib/types.ts` یا `lib/constants.ts` (بدون وابستگی) و import دوطرفه.
- **زمان تخمینی:** ۳۰ دقیقه | **ریسک رگرسیون:** کم | **آزمون پذیرش:** تغییر ثابت → stepper هر سه سطح محدود شود.

---

#### ARCH-413 — خوشهٔ تکرار D: الگوی admin load/refresh + `window.confirm` ×۹
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `load = useCallback(() => { apiGet… })` تکراری ۱۵+ بار (AdminPeopleSection:38، AdminDiscountsSection:427/593/677، AdminCategoriesSection:47، ArticlesAdmin:102، AdminOrdersSection:37، AdminTicketsSection:25، AccountView ×۵، …)؛ `window.confirm` در ۹ فایل ادمین (AdminHomepageSection ×۲، ProductEditor، LegalEditor، ArticlesAdmin، AnnouncementsEditor، AdminProductsSection، AdminOrdersSection، AdminDiscountsSection، AdminCategoriesSection)
- **توضیح:** (۱) hook مشترک `useResource(url)` بار/apiGet/error-state را حذف می‌کند؛ (۲) `window.confirm` ناهمگون با radix `AlertDialog` موجود در `components/ui/` است (خام/غيرقابل-ترجمه/غير RTL).
- **روش اصلاح:** hook مشترک + یک `ConfirmDialog` بر پایهٔ AlertDialog.
- **زمان تخمینی:** ۴–۶ ساعت | **ریسک رگرسیون:** کم | **آزمون پذیرش:** حذف یک دسته در fa → دیالوگ RTL فارسی.

---

#### ARCH-414 — fetch خام (بای‌پس `api()`) در quickAdd کارت محصول
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل+خط:** `components/storefront/ProductCard.tsx:48` (`fetch('/api/products/…').then(r => r.json())`)
- **توضیح:** پوشهٔ `lib/api.ts` (ApiError + parse امن JSON + no-store) دور زده شده؛ پاسخ خطای API به‌صورت envelope خطا json می‌شود و `detail.variants` undefined → به `NO_VARIANT` ترجمهٔ غلط. ۶ سایت fetch خام در کلاینت وجود دارد (بقیه: store.ts ×۳، uploadImageFile در shared.tsx — توجیه‌پذیر برای FormData).
- **روش اصلاح:** جایگزینی با `apiGet<ProductDetail>(…)`.
- **زمان تخمینی:** ۲۰ دقیقه | **ریسک رگرسیون:** کم | **آزمون پذیرش:** quickAdd روی محصول ناموجود → toast خطای درست.

---

#### ARCH-415 — کد مردهٔ تأییدشده (dead exports)
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا (grep سراسری src)
- **فهرست (شواهد کامل: `2d-dead-exports.json` — ۶۰ نماد با صفر مصرف خارجی؛ مهم‌ترین‌ها):**
  - **`lib/view-cache.ts` — کل ماژول (۱۱۷ خط) مرده است**: `useViewData` و `invalidateView` هیچ importکننده‌ای در src ندارند (جایگزین‌شده با SsrProviders/useRoute pattern). با tree-shaking به باندل نمی‌رود ولی نگهداری/سردرگمی ایجاد می‌کند.
  - **`lib/sp-path.ts` — کل ماژول مرده**: `setSpPath`/`getSpPath` صفر مصرف (not-found.tsx خودش header را می‌خواند).
  - `lib/router.ts:35,38,52` — `normalizeHashPath` و `localeHash` (aliasهای deprecated) و `homeHref` (غیرمنتظره — صفر مصرف).
  - `lib/format.ts:16` — `latinDigits` (no-op stub، صفر مصرف).
  - `lib/markdown.ts:266` — `stripInline` (صفر مصرف).
  - `store/store.ts:153` — `readStoredConsent` (صفر مصرف؛ مسیر جدید consent-client است).
- **روش اصلاح:** حذف دو ماژول کامل + ۶ export؛ aliasهای deprecated را هم (هیچ مصرف خارجی/مستندی ندارند). توجه: نوع‌های export-only (مثل ProductDetailDTO) عمداً نگه داشته شوند.
- **زمان تخمینی:** ۱ ساعت | **ریسک رگرسیون:** کم (هر مورد با grep مجدد قبل حذف) | **آزمون پذیرش:** typecheck + lint سبز؛ grep مجدد صفر مصرف.

---

#### ARCH-416 — ایمنی نوع: نمرهٔ کامل (قوت)
- **وضعیت:** Confirmed | `as any`: ۰ | `: any`: ۰ | `as unknown as`: ۱۰ مورد که ۶ موردش الگوی استاندارد globalThis است (db.ts:5، mail-dispatch.ts:35، housekeeping.ts:12) و ۴ مورد lag نوع DTO با کامنت توضیحی ([...slug]/page.tsx:514,546، AccountView.tsx:906، use-settings.ts:28). بدترین‌ها عملاً `[...slug]/page.tsx:514` (product detail → SsrPageData) و `admin/products/[id]/route.ts:623` (variant as Record) هستند که هر دو کامنت توجیه دارند. هیچ اقدام فوری؛ فقط در refactor بعدی DTOهای lib/types را کامل کنید.

---

#### ARCH-417 — magic numbers پراکنده (بدون ثابت مشترک)
- **شدت:** Informational | **وضعیت:** Confirmed
- **موارد:** `pageSize = 12` (CatalogView.tsx:102) در برابر سرور `Math.min(48,…,12)` (product-list.ts:47)؛ `slice(0, 48)` علاقه‌مندی‌ها ×۳ (store.ts:68,114,141)؛ `MAX_ENTRIES = 80` (view-cache)؛ debounce 300ms ×۲ مستقل (Header.tsx:133، ProductEditor.tsx:664)؛ `Math.min(10,…)` (ARCH-412)؛ take:12 (ForYouShelf.tsx:30). هیچ‌کدام بحرانی؛ جایی که سرور و کلاینت قرارداد مشترک دارند (pageSize، maxQty) ارزش ثابت مشترک دارد.

---

## ۳. صحت React (استاتیک)

### جدول بدترین ۱۰ مورد

| # | ID | فایل:خط | مشکل | چرا در رانتایم مهم است |
|---|----|---------|-------|------------------------|
| 1 | ARCH-418 | Header.tsx:126-140 (SearchOverlay effect) | هنگام کوچک‌شدن query به <۲ حرف، `loading=true` قبلی reset نمی‌شود (early-return فقط `setResults(null)`) | اسپینر جست‌وجو تا تایپ بعدی یا blur گیر می‌کند؛ کاربر «در حال جست‌وجوی بی‌پایان» می‌بیند |
| 2 | ARCH-419 | Header.tsx:160 (`onBlur = () => setTimeout(collapse, 180)`) | setTimeout بدون نگه‌داری/پاک‌سازی | setState پس از unmount (React 18: no-op ولی بی‌نظم) + با هر blur یک تایمر زنده؛ در پنجره‌های سریع race با focus بعدی |
| 3 | ARCH-420 | کل src/ — ۰ مورد AbortController در برابر ۱۷ سایت alive-flag (CatalogView:112-121 چهار fetch موازی، SearchView:33، ProductView:171، …) | fetchها کنسل نمی‌شوند، فقط پاسخ‌شان دور ریخته می‌شود | پهنای باند/کوئری سرور تلف می‌شود؛ روی موبایل/data جست‌وجوی پشت‌سرهم کامل دانلود می‌شود؛ سرورِ rate-limit دار (۳۰/min) سریع‌تر سهمیه را می‌سوزاند |
| 4 | ARCH-421 | AccountView.tsx:240-242 (Dashboard)، ForYouShelf.tsx:34-44، CartView.tsx:29 (refresh)، CheckoutView.tsx:82-88، HomeView/PeopleView/SeriesView/SeriesIndexView/ArticlesView effectها | fetch-in-effect بدون alive/abort/cleanup | setState پس از unmount (بی‌خطر ولی کار بیهوده)؛ در Dashboard ناوبری سریع بین سکشن‌ها پاسخ‌های رقیب می‌توانند نتیجهٔ نهایی شوند — ناسازگاری نمایشی گذرا |
| 5 | ARCH-422 | CheckoutView.tsx:82-88 و :90-104 | `setEmail(user.email)` در دو effect تکراری + effect دوم fetch آدرس بدون cleanup | نگهداری دوگانه؛ تغییر یکی و جا-mاندن دیگری → ایمیل پیش‌فرض ناهمگون با آدرس |
| 6 | ARCH-423 | lib/use-settings.ts:23-31 | fetch شکست → `cache` null می‌ماند، effect deps `[]` پس هرگز retry نمی‌شود تا remount کامل | کاربرِ یک سشن، هدر بدون هزینهٔ ارسال/announce می‌ماند حتی بعد از برگشت شبکه |
| 7 | ARCH-424 | CheckoutView.tsx:138-144 (refreshQuote effect) | deps شامل `cart` و `discount` (آبجکت) است؛ هر setCart/setDiscount یک POST /api/checkout/quote جدید | در گردش «اعمال کد تخفیف» و refetch سبد، quote POST اضافه صادر می‌شود (سرور rate-limit ندارد روی این endpoint در حد کم) — هزینهٔ جزئی، نوسان UI روش |
| 8 | ARCH-425 | Header.tsx:297، CartView.tsx:92، ProductView.tsx:577 | سقف تعداد `Math.min(10, stock)` از state سرور می‌آید ولی اگر stock پاسخ سبدی قدیمی باشد، UI سقف کهنه | add-to-cart در مرز موجودی → خطای MAX_QTY از سرور با toast عمومی (ARCH-412 هم همین) |
| 9 | ARCH-426 | HomeSections.tsx:445، AdminHomepageSection.tsx:245,503,578,823، StaticView.tsx:110 | `key={i}` روی لیست‌های ایستا/فقط-افزایشی | امروز بی‌خطر (لیست reorder نمی‌شود؛ posterها static)؛ اگر drag-reorder به poster grid اضافه شود state داخلی به ردیف اشتباه می‌چسبد. در جاهای دیتا-محور (AccountView:259,348 orderNumber؛ :674 a.id؛ :710 r.id) keyها هویتی‌اند — درست |
| 10 | ARCH-427 | AdminDiscountsSection.tsx (۴۷ useState)، AccountView (۳۹)، ProductEditor (۴۰) | state انبوه بدون reducer؛ چند useState که با هم تغییر می‌کنند (loading/error/data) | درخ‌های رندر اضافه و وضعیت‌های میانی ناسازگار (مثلاً busy بدون disabled یکی از دکمه‌ها) — ریسک رگرسیون در توسعهٔ آینده |

### قوت‌های تأییدشدهٔ React
1. **بهینه‌سازی خوش: alive-flag در ۱۷ سایت / ۱۵ فایل** با cleanup درست — الگوی واحد و یکدست.
2. **پاک‌سازی تایمر/listener همه‌جا چک شد**: setInterval (Header:433، HeroSlider:182) هر دو `clearInterval` در cleanup؛ addEventListener ×۱۶ همه با removeEventListener؛ rAF (HomeSections:225-233، ScrollStory:176-188) با cancelAnimationFrame + reset stamp (فیکس StrictMode کارگاهی مجدداً تأیید شد).
3. **hydratation-safe بودن localStorage**: همهٔ ۱۷ نقطهٔ دسترسی localStorage یا در effect است، یا `typeof window` گارد، یا `useSyncExternalStore` با server snapshot (CookieBanner.tsx:31-46 الگوی نمونه).
4. **optimistic با rollback**: toggleHelpful (ProductView.tsx:152-172) مقدار قبلی را در catch برمی‌گرداند + کد خطای مشخص؛ wishlist یک write-queue ترتیبی دارد (store.ts:78-83) تا merge/replace همدیگر را پاک نکنند؛ سبد به‌جای optimistic، refetch authoritative (CartView) — انتخاب سالم.
5. **render-phase state sync استاندارد** (CatalogView.tsx:104-110 — الگوی endorsed React برای sync prop→state).
6. **کلیدهای هویتی** در همهٔ لیست‌های دیتا-محور (سفارش/تیکت/آدرس/پیام)؛ index فقط روی لیست‌های ایستا.
7. **SSR data guard**: مصرف `useSsrPageData` با تطبیق slug+locale (ProductView.tsx:60) → دادهٔ SSR منقضی هرگز به روت اشتباه نمی‌چسبد.

---

## ۴. روتینگ و رندر (استاتیک)

#### ARCH-428 — پالیسی لوکیل و روت: تمیز و ایزومورفیک (قوت + یک edge)
- **وضعیت:** Confirmed
- **سازوکار:** EN بدون پیشوند (`/books/x`)، FA با `/fa`، `/en/…` سمت سرور `permanentRedirect` (page.tsx:581-583) و سمت کلاینت normalize (route-state.ts:29-33). پارسر واحد isomorphic (`lib/route-state.ts`) هم برای RSC هم برای History-API router مصرف می‌شود — SSR و SPA هرگز دو شکل URL نمی‌سازند. hash لینک‌های قدیمی با اسکریپت pre-hydration (layout.tsx:59-60) و migrateLegacyHash مهاجرت می‌شوند. `/?lang=` وجود ندارد — بدون دوشکلی.
- **edge (Informational):** slugهایی که با سگمنت محفوظ تداخل دارند — محصولی با slug `"fa"` هرگز قابل آدرس‌دهی نیست (`/fa/x` همیشه locale). در seed فعلی وجود ندارد؛ برای CMS آینده در اعتبارسنجی slug بنشیند (`normalizePathShared` باید در zod slug چک شود).
- **dispatch 404:** KNOWN_ROOTS (page.tsx:34) + KNOWN_LEGAL_TYPES + prefetch-null → 404 واقعی؛ ۲۲ صفحهٔ معتبر 200 (تست کارگاهی قبلی).

#### ARCH-429 — فهرست کامل directiveهای کش
- **وضعیت:** Confirmed
- `force-dynamic`: page.tsx:18، app/page.tsx:10، sitemap.xml/route.ts:8، llms.txt/route.ts:12، robots.ts:7، api/bootstrap/route.ts:27 → **تمام HTML و bootstrap هیچ کشی ندارند** (به ARCH-402 گره خورده).
- `cache: 'no-store'`: lib/api.ts:19 — فقط fetchهای کلاینت (بی‌اثر روی کش سرور؛ حذفش هم بی‌ضرر است).
- `revalidate`/ISR/unstable_cache: **صفر** در src.
- کش استاتیک درست: `/images/:path*` با `max-age=31536000, immutable` (next.config.ts) — قوت.

#### ARCH-430 — ناوبری کلاینت، Next prefetch را دور می‌زند (tradeoff آگاهانه)
- **وضعیت:** Confirmed | **شدت:** Informational
- `navigate()` با `history.pushState` + store دستی (router.ts:103-126) کار می‌کند؛ Next از این ناوبری بی‌خبر است، پس RSC/RSC-payload prefetch در ناوبری‌های داخلی انجام نمی‌شود و هر View خودش JSON می‌گیرد. برای معماری فعلی (یک catch-all همیشه mount) سازگار و کارآمد است؛ فقط بدانید مزیت App Router (prefetch/RSC-per-route) عملاً استفاده نمی‌شود و هزینه‌اش ARCH-402 است.

---

## ۵. فرم‌ها و UX (استاتیک)

#### فهرست فرم‌های کلاینت و وضعیت هر یک

| فرم | فایل:خط | اعتبارسنجی کلاینت | parity با سرور | maxLength | disabled هنگام ارسال | autocomplete | inputMode | ارقام فارسی |
|-----|---------|--------------------|-----------------|-----------|----------------------|--------------|-----------|--------------|
| ورود/ثبت‌نام | AuthView.tsx:120 | required + minLength ۸ | zod سمت سرور min ۸ (تأیید از مسیر reset) | — | ✔ (busy) | name/email/current-password/new-password ✔ | — (email type) | n/a |
| فراموشی/بازنشانی رمز | PasswordResetView.tsx:97,147 | minLength ۸ ×۲ | هم‌خوان | — | ✔ | new-password/email ✔ | — | n/a |
| نقد کتاب | ProductView.tsx:816 | required + minLength ۱۰ | **هم‌خوان کامل** (zod: title≤200/body≤5000/name≤80 = COM-001) | ✔ ۸۰/۲۰۰/۵۰۰۰ + شمارندهٔ زنده | ✔ (reviewBusy) | — | — | شمارنده با faDigits |
| back-in-stock | ProductView.tsx:593 | type=email required | zod سمت سرور | — | ✔ (bisBusy) | — | — | n/a |
| پرداخت/آدرس | CheckoutView.tsx:259-550 | required + validCard | zod سمت سرور | ✔ (یادداشت ۳۰۰) | ✔ (placing — دبل‌سابمیت بسته) | email/name/address-line1-2/level2/postal-code/tel/cc-* ✔ **کامل‌ترین فرم** | email/numeric ✔ + dir=ltr روی همهٔ فیلدهای لاتین | ورودی قیمت نه (پرداخت EUR) |
| تماس (تیکت) | StaticView.tsx:212 | regex ایمیل + طول پیام ≥۱۰ | zod سمت سرور | **✘ ندارد** (ARCH-431) | ✔ (`!valid || busy`) | — | — | n/a |
| خبرنامهٔ فوتر | Footer.tsx:150 | type=email required (+خطای دستی با noValidate) | zod | — | ✔ | — | — | n/a |
| رهگیری سفارش | TrackView.tsx:86 | required | — | — | ✔ | — | **✘** (ARCH-431) | n/a |
| پروفایل/ایمیل/رمز اکانت | AccountView.tsx:1026,1097 | required | zod | — | ✔ | — | — | n/a |
| آدرس اکانت | AccountView.tsx (Addresses) | required | zod (اشتراک با checkout) | — | ✔ | — | — | n/a |
| فرم‌های ادمین | People/Categories/Articles/ProductEditor | دستی | zod سرور | ✔ گسترده (۸۰/۲۰۰/۳۰۰/۶۰۰/۱۰۰۰/۲۰۰۰) | ✔ | — | decimal در قیمت‌ها ✔ | ARCH-432 |

#### ARCH-431 — parity اعتبارسنجی: zod فقط-سرور؛ کلاینت attribute-محور + دو شکاف
- **شدت:** Low | **وضعیت:** Confirmed
- zod در ۲۰+ route سرور؛ هیچ schema مشترک client/server (grep: zod فقط در app/api و lib/server). عملاً parity در نقد (COM-001) و رمز برقرار است؛ دو شکاف: فرم تماس `maxLength` ندارد (پیام ۱۰۰KB فقط در سرور 400 می‌شود — تجربهٔ کاربر بد بعد از آپلود کامل) و TrackView `inputMode` ندارد.
- **روش اصلاح:** maxLength روی ct-name/ct-subject/ct-msg (مطابق zod)؛ `inputMode="numeric"` روی فرم رهگیری.
- **زمان تخمینی:** ۳۰ دقیقه | **ریسک رگرسیون:** صفر | **آزمون پذیرش:** paste ۱۰۰k در فرم تماس → تایپ متوقف در حد سقف، نه خطای سرور.

#### ARCH-432 — ورودی رقم فارسی فقط در کاتالوگ هندل می‌شود
- **شدت:** Low | **وضعیت:** Confirmed
- `toLatinDigits` (lib/format.ts:25) فقط در CatalogView.tsx:80 مصرف می‌شود (فیلتر قیمت). فیلدهای قیمت/موجودی ادمین به `type=number` تکیه دارند که رقم‌های ۰-۹ فارسی کیبورد را معمولاً رد می‌کند (تجربهٔ تایپ ادمین فارسی-OS). اگر تیم محتوای فارسی گزارش «تایپ نمی‌شود» داد، راه‌حل: text + toLatinDigits مثل CatalogView.
- **زمان تخمینی:** ۲ ساعت در صورت لزوم | **ریسک رگرسیون:** کم

#### قوت‌های تأییدشدهٔ فرم/UX
1. **گارد دبل-سابمیت فراگیر**: ۴۹ سایت `disabled={busy/…}`؛ پرداخت با `placing` + اسپینر + متن تغییرکننده (CheckoutView:421-422)؛ idempotency سمت سرور هم پشتش است.
2. **پوشش autocomplete/inputMode/dir**: به‌ویژه Checkout (cc-number/cc-exp/cc-csc/address-*/tel با dir="ltr") — نمونهٔ مرجع.
3. **پارسر isomorphic route** و برچسب‌گذاری bdi/dir="ltr" روی شناسه‌ها (شماره سفارش، ایمیل، قیمت) در سراسر UI فارسی.
4. **فرمت پول واحد**: formatMoney (minor-unit، Intl با fa-IR/en-IE + fallback) — کلاینت هیچ‌جا پول را دستی نمی‌سازد (تنها exceptions: JSON-LD سرور که /100 مستقیم می‌کند — قابل قبول).

---

## ۶. جمع‌بندی اولویت‌دار

| اولویت | IDها | تیتر |
|--------|------|------|
| **High** | ARCH-401 | error boundary مفقود |
| **High** | ARCH-409 | ProductEditor تجزیه |
| **Medium** | ARCH-402، ARCH-403، ARCH-404، ARCH-410 | کش خروجی / multi-instance / registry روت / ناسازگاری تقویم تاریخ |
| **Low** | ARCH-405..408، ARCH-411..415، ARCH-418..427، ARCH-431..432 | لیست کامل در متن |
| **Info/قوت** | ARCH-416، ARCH-417، ARCH-428..430 | ایمنی نوع، magic numbers، لوکیل/کش/ناوبری |

**تناقض یا lead تأییدنشده از worklog:** هیچ — همهٔ ادعاهای قابل-بررسی worklog (فیکس ScrollStory StrictMode، KNOWN_ROOTS 404، nonce CSP، bounded cacheها، idempotency) به‌صورت مستقل در کد تأیید شدند. باگ جدیدی که worklog نمی‌دانست: ARCH-401 (error boundary)، ARCH-410 (تقویم)، ARCH-415 (view-cache/sp-path مرده)، ARCH-418/419 (SearchOverlay).

*پایان گزارش — Task 2-d.*
