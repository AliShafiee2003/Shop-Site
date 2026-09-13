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
