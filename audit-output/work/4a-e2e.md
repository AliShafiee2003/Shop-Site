# 4-a — Phase 14: Browser/API E2E Verification (بازسازی‌شده از evidence پس از timeout عامل)

> وضعیت: عامل اصلی قبل از نوشتن گزارش، evidence کامل را روی دیسک گذاشت؛ این گزارش توسط ممیزیِ اصلی از روی همان evidence بازسازی و مکمل‌های runtime (story slider، search overlay، discount، double-submit، locale) تکمیل شد.

## Part 1 — Smoke routes (curl + browser)

| Route | HTTP | Render | H1 | console errors |
|---|---|---|---|---|
| / | 200 | ✔ | 1 ("PersePix — Independent books…") | 0 |
| /fa | 200 | ✔ | 1 (فارسی) | 0 |
| /books | 200 | ✔ | 1 "All books" | 0 |
| /books/fiction | 404 | ✔ (درست — دسته‌ها در /categories/… هستند) | — | — |
| /books/the-cartographer-of-silence | 200 | ✔ | 1 | 0 |
| /categories/fiction | 200 | ✔ | 1 "Fiction" | 0 |
| /authors/neda-ahmadi | 200 | ✔ | 0 (A11Y محتمل — Person page بدون H1 مرئی در متن خام) | 0 |
| /articles + /articles/why-translate | 200 | ✔ | 1 / 1 | 0 |
| /search?q=tea | 200 | ✔ | 1 | 0 |
| /cart, /checkout, /login, /register | 200 | ✔ | 1/—/1/1 | 0 |
| /account, /admin (anon) | 200 | ✔ (فرم ورود/ری‌دایرکت سمت کلاینت) | — | 0 |
| /sitemap.xml, /robots.txt, /api/healthz | 200 | — | — | — |
| /legal/privacy | 200 | ✔ | 1 (Placeholder) | 0 |
| /xyz-nope | 404 | ✔ برندشده | — | — |

توضیح /account و /admin به‌صورت anon → 200: صفحات shell رندر می‌شوند و گارد در API/کلاینت اعمال می‌شود (ماتریس 2-c: endpointهای account/admin خودشان 401/403 می‌دهند). console error واقعی: صفر (فقط نویز HMR dev + هشدار شناخته‌شدهٔ script-tag/JsonLd).

## Part 2 — Critical journeys

| # | Journey | نتیجه | Evidence |
|---|---|---|---|
| 1 | ثبت‌نام | **PASS** | کاربر audit4e2e+81679@example.com ساخته شد (verified=1) — `4a-audit-footprint.txt` |
| 2 | ورود | **PASS** | POST /api/auth/login → 200 |
| 3 | افزودن به سبد | **PASS** | POST /api/cart/items → 200؛ دکمه → «Added» |
| 4 | تغییر تعداد | **PARTIAL** | تغییر qty در UI مستند نشد؛ clamp سمت سرور قبلاً در 2-c/runtime (MAX_QTY، stock clamp) تأیید شده — Unverified در UI |
| 5 | merge سبد مهمان | **PASS** | سفارش‌ها با 2 آیتم (از سبد مهمان + کاربر) ساخته شدند؛ ۳ مسیر merge در 3-d کد-تأیید |
| 6 | کد تخفیف نامعتبر | **PASS** | POST /api/discount/validate {"code":"TOTALLY-FAKE-99"} → **422** `{"error":"DISCOUNT_INVALID"}` بدنهٔ تمیز؛ UI: promoInput/promoError در CheckoutView.tsx:71-129 |
| 7 | Checkout | **PASS (dev sandbox)** | ۲ سفارش SP-26-09-13-0001/0002 **PAID** با provider=PERSEPIX_SANDBOX (در dev فعال؛ در prod fail-closed 503 — 2-c/3-d). totalMinor=4590 = 4100+490 دقیق |
| 8 | جلوگیری از دابل‌سابمیت | **PASS** | CheckoutView.tsx:421 `disabled={!validCard \|\| !consents \|\| placing}` + spinner/«submitting» هنگام placing |
| 9 | کاهش موجودی | **PASS** | DB پس از ۲ سفارش: stock 29/9 و soldCount افزایش یافته — `4a-live-db-after-checkout.txt` |
| 10 | نمایش سفارش | **PASS** | MY ORDERS → ۲ سفارش با آیتم‌ها و جمع صحیح (snapshot غیموتغیر آیتم‌ها) |
| 11 | پیگیری مهمان | **PASS** | SP-99-99-99-9999 و سفارش واقعی با ایمیل اشتباه → **404 یکسان** (ضد enumeration) — network log |
| 12 | ثبت ریویو | **PASS** | "Audit review title" → moderationState=PENDING |
| 13 | Newsletter | **PASS** | subscribe → status=PENDING (double opt-in)؛ dedupe: ۱ رکورد |
| 14 | فرم تماس | **PASS** | Ticket TK-0003 «E2E audit contact test» → OPEN |
| 15 | سوییچ زبان | **PARTIAL** | /fa مستقیم: dir=rtl/lang=fa ✔؛ باز شدن منوی DropdownMenu با کلیک synthetic ناموفق (احتمالاً artifact اتوماسیون — Radix pointerdown + blur هنگام eval؛ کد درست: Header.tsx:63-95 aria-label/aria-pressed) — Unverified در UI |
| 16 | اسلایدر داستانی | **PASS** | ۴ صحنهٔ pinned روی هم (y≈5888)؛ در عمق pin صحنهٔ ۴ opacity=0.75 و صحنه‌های ۱-۳ → 0 (scrub زنده) |
| 17 | Search overlay | **PASS** | کلیک دکمهٔ aria-labeled → تایپ "poetry" → ArrowDown×2 → Enter → /search با نتایج |
| 18 | خروج | **PASS** | POST /api/auth/logout → 200 |
| 19 | موبایل ۳۹۰px | **PASS** | توسط 3-c: صفر overflow در همهٔ سناریوها + hamburger/filter drawer/search overlay |

## Console errors (کل جلسات)
- صفر خطای واقعی؛ فقط: هشدار شناخته‌شدهٔ «script tag inside React component» (JsonLd در کامپوننت کلاینت — SEO-407) + نویز HMR dev.

## ردپای mutation این فاز (مستند)
2 کاربر تست، ۲ سفارش + ۴ OrderItem، ۲ پرداخت sandbox موفق، ۳ MailMessage (EMAIL_VERIFY/NEWSLETTER_CONFIRM/ORDER_CONFIRMATION ×2)، ۱ ریویو PENDING، ۱ اشتراک خبرنامهٔ PENDING، ۱ تیکت OPEN، تغییر stock/soldCount، ۱ CookieConsent. هیچ دادهٔ seed تغییر/حذف نشد.

## یافته‌های جدید این فاز
- **E2E-401 (Low, Confirmed, High)** — stale cart badge: بلافاصله بعد از ورود مستقیم به /cart، هدر «0 items» نشان داد در حالی که /api/cart دو آیتم داشت؛ refresh badge فقط بعد از bootstrap/event رخ می‌دهد. اثر: سردرگمی ظاهری گذرا. فایل: Header.tsx (bootstrap refresh timing). اصلاح: refresh badge در mount مسیر cart یا SWR revalidateOnFocus. زمان: 1h. تست پذیرش: badge بعد از F5 روی /cart برابر تعداد واقعی.
- **E2E-402 (Informational, Unverified)** — باز نشدن منوی زبان با کلیک synthetic؛ شواهد به artifact اتوماسیون اشاره می‌کند (کاور قبل از dismiss، blur بعد از آن). نیازمند تأیید دستی انسانی.
- **نکته (Informational)** — PERSEPIX_SANDBOX در dev پرداخت موفق می‌سازد: رفتار درست و مستند (prod fail-closed)؛ ولی باید در docs صراحتاً «فقط dev»-tag شود تا اشتباه گرفته نشود (ارجاع B1 در 3-d).

## نقاط قوت تأییدشدهٔ این فاز
404 واقعی و برندشده در همهٔ مسیرهای بی‌معنا؛ ضد-enumeration پیگیری مهمان؛ snapshot غیموتغیر آیتم سفارش؛ double-submit guard؛ stock decrement واقعی پس از سفارش؛ double opt-in خبرنامه؛ بدنه‌های خطای تمیز (DISCOUNT_INVALID)؛ صفحه‌گرد checkout ۴ مرحله‌ای با گاردهای مرحله‌ای.
