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



