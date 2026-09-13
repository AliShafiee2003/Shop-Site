# 04 — Backend, API & Commerce Report

دامنه: فازهای ۷ و ۱۰ — ۱۱۲ مسیر API (inventory کامل)، ماتریس AuthN/AuthZ با ~۱۳۵ فراخوانی ۴-هویتی، rate-limit runtime، idempotency، و منطق فروشگاهی (pricing/TOCTOU/stock/refund/returns/notifications).
نتیجه کلان: گاردها سبز؛ TOCTOU checkout سالم؛ یافته‌های اصلی API-405 (لیست‌های بی‌سقف ادمین)، COM-401 (بن‌بست مرجوعی)، COM-404/409.

# گزارش ممیزی Backend/API — فاز ۷ (Task ID: 2-c)

- پروژه: PersePix (Next.js 16 App Router) — `/home/z/my-project`
- ممیز: Backend/API auditor — تاریخ اجرا: 2026-09-13 (UTC)
- سرور زیر آزمون: `http://localhost:3000` (و گیت‌وی `:81`) — هر دو سالم (`/api/healthz` → 200)
- دامنه: شمارش کامل و تحلیل **۱۱۲ فایل route** زیر `src/app/api/**/route.ts` + ماتریس زمان‌اجرا AuthN/AuthZ + معناشناسی پاسخ‌ها + Rate limit + Idempotency + یکدستی پاکت (envelope)
- قواعد رعایت‌شده: بدون تغییر سورس/کانفیگ، بدون توقف/اجرای سرور، بدون شبکهٔ بیرونی، بدون ارسال ایمیل واقعی، فقط نوشتنِ غیرمخرب روی سرور زنده. کوکی‌ها فقط در `/tmp/audit-v4/2c/`. هیچ مقدار `.env` یا رمزی در این گزارش چاپ نشده.

---

## ۱) خلاصهٔ Inventory (۱۱۲ مسیر)

فایل کامل: `audit-output/work/2c-api-inventory.csv` (Method | Route | File | AuthLevel | RateLimit | SideEffects | Transaction | Schema | Paginated | Notes)

### توزیع سطح دسترسی (از.guard واقعی در کد: `requireRole/requireAdmin/requireContentAdmin/requireOwner/getSessionUser` — `src/lib/server/auth.ts`)

| سطح دسترسی | تعداد مسیر | توضیح |
|---|---|---|
| anon (کاملاً عمومی) | 39 | محصولات، جستجو، تنظیمات، healthz، … |
| anon + token یک‌بارمصرف | 3 | verify-email، confirm-email-change، reset-password (توکن = اعتبار) |
| anon + HMAC signature | 1 | newsletter/unsubscribe (GET امضاشده) |
| anon / مهمان (سبد مهمان) | 2 | cart، cart/items (+ cart/items/{itemId}) |
| customer (نشست معتبر) | 19 | account/*، wishlist، auth/sessions، reviews POST، … |
| staff — `requireAdmin` (OWNER/EDITOR/ORDER_SUPPORT) | 19 | داشبورد، سفارش‌ها، مشتریان، تیکت‌ها، … |
| content-admin — `requireContentAdmin` (OWNER/EDITOR) | 25 | محصولات، مقالات، دسته‌ها، homepage، legal، upload، … |
| owner — `requireOwner` | 3 | settings، refunds، emails/dispatch |
| cron-secret (Bearer) | 1 | cron/tick |
| **جمع** | **112** | |

- **Validation**: تقریباً همه با **zod** (حدود ۹۰ فایل)؛ استثناها: مسیرهای فقط-GET ساده و `admin/emails/dispatch` و `admin/homepage/versions/[id]/restore` (بدون بدنه).
- **Rate limit**: **۲۴ فایل** دارای `rateLimit()` (۲۷ نقطهٔ فراخوانی). الگوریتم: **پنجرهٔ ثابت در-حافظه (per-process)**، کلید `ip:route` یا `user.id:route` — `src/lib/server/rate-limit.ts`. جدول سقف‌ها در CSV.
- **Paginated**: ~۱۳ لیست با صفحه‌بندی/سقف سمت سرور (products ≤48، admin products ≤200، customers ≤200، orders=20/page، account orders=10/page، emails ≤50، audit-log ≤200، back-in-stock/newsletter take 200، search bounded 200/12/12). **فاقد صفحه‌بندی**: یافتهٔ API-405.
- **$transaction**: در ۲۰ مسیر حساس (checkout، refund، cancel، bulk-stock، import، wishlist PUT، block/unblock مشتری، legal PUT، reset-password، …).

### الگوی خطا/موفقیت
- خطا: `apiError(status, code, message?)` → `{"error":"MACHINE_CODE","message":"…"}` (`src/lib/server/utils.ts:11`)
- موفقیت: `json(data)` — payload خام (بدون wrapper). خطاها هرگز stack/پیام Prisma را برنمی‌گردانند (تأیید زمان‌اجرا).

---

## ۲) ماتریس AuthN/AuthZ — نتایج زمان‌اجرا

چهار هویت: **anon** (بدون کوکی)، **forged** (کوکی ساختگی `sp_session=aaaa…`/garbage)، **customer** (نشست customer@example.com)، **admin** (نشست owner@persepix.ir — نقش OWNER). شواهد خام: `evidence-2c-matrix-{admin,account,forged,public}.tsv` در `/tmp/audit-v4/2c/`.

### ۲-۱ مسیرهای admin (۱۷ endpoint × ۴ هویت = ۶۸ درخواست)

| Route | anon | forged | customer | admin |
|---|---|---|---|---|
| GET /api/admin/dashboard | 403 | 403 | 403 | 200 |
| GET /api/admin/orders | 403 | 403 | 403 | 200 |
| GET /api/admin/customers | 403 | 403 | 403 | 200 |
| GET /api/admin/products | 403 | 403 | 403 | 200 |
| GET /api/admin/audit-log | 403 | 403 | 403 | 200 |
| GET /api/admin/reviews | 403 | 403 | 403 | 200 |
| GET /api/admin/tickets | 403 | 403 | 403 | 200 |
| GET /api/admin/newsletter | 403 | 403 | 403 | 200 |
| GET /api/admin/settings (owner-only) | 403 | 403 | 403 | 200 |
| GET /api/admin/analytics | 403 | 403 | 403 | 200 |
| GET /api/admin/emails | 403 | 403 | 403 | 200 |
| GET /api/admin/homepage | 403 | 403 | 403 | 200 |
| GET /api/admin/legal | 403 | 403 | 403 | 200 |
| GET /api/admin/products/export | 403 | 403 | 403 | 200 |
| POST /api/admin/upload | 403 | 403 | 403 | 400* |
| POST /api/admin/emails/dispatch (owner-only) | 403 | 403 | 403 | 200 (no-op: `configured:false`) |
| POST /api/admin/orders/{id}/refund (owner-only) | 403 | 403 | 403 | 404* |
| POST /api/admin/orders/{id}/ship | 403 | 403 | 403 | 404* |

\* «رسیدن به handler» بعد از عبور گارد: upload بدون فایل → 400؛ refund/ship با id ناموجود → 404 NOT_FOUND. یعنی گارد قبل از هرگونه اثر، بسته است.

**نتیجه:** صفر نفوذ؛ نقش customer هرگز به مسیر admin راه ندارد. تفاوت requireAdmin/requireContentAdmin/requireOwner در کد تفکیک‌شده است؛ در زمان‌اجرا فقط نقش OWNER در دسترس بود (اکانت EDITOR/ORDER_SUPPORT seed نشده) — تفکیک نقش‌های میانی صرفاً code-review تأیید شد (محدودیت آزمون، نه یافته).

### ۲-۲ مسیرهای account/customer (۱۰ endpoint × ۳ هویت)

| Route | anon | forged | customer |
|---|---|---|---|
| GET /api/account/orders | 401 | 401 | 200 |
| GET /api/account/summary | 401 | 401 | 200 |
| GET /api/wishlist | 401 | 401 | 200 |
| GET /api/account/addresses | 401 | 401 | 200 |
| GET /api/account/tickets | 401 | 401 | 200 |
| GET /api/account/returns | 401 | 401 | 200 |
| PUT /api/account/password | 401 | 401 | 400 (validation — رسیدن به handler) |
| PATCH /api/account/profile | 401 | 401 | 200 |
| POST /api/account/data-export | 401 | 401 | 200 (دادهٔ خود کاربر) |
| GET /api/auth/sessions | 401 | 401 | 200 |

مالکیت‌سنجی سطرها هم code-review شد: `findOwned(id, user.id)`، `ticket.userId!==user.id → 404`، `order.userId!==user.id → 404` (بدون افشای وجود) — صحیح.

### ۲-۳ هویت نامعتبر / جعل

- کوکی forged روی `/api/auth/me` → `200 {"user":null}` (قرارداد payload بوت؛ بدون 500).
- کوکی garbage (`!!garbage!!`) روی admin → 403؛ روی account → 401. **هیچ‌جا 500 دیده نشد** (۸ مسیر صراحتاً + کل ماتریس).
- token یک‌بارمصرف نامعتبر (verify-email) → 400 `TOKEN_INVALID`.

### ۲-۴ پرچم‌های کوکی نشست (Set-Cookie واقعی)

`sp_session=<64hex>; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax` — `Secure` در dev غایب است اما در کد `secure: NODE_ENV==='production'` (`src/lib/server/auth.ts:44-52`). کوکی‌های `sp_cart`/`sp_consent_id` نیز httpOnly+SameSite=lax. توکن در DB به‌صورت sha256-hash ذخیره می‌شود و ورود، نشست قبلی را revoke می‌کند (rotation — SEC-004).

### ۲-۵ CSRF / Origin

- هیچ بررسی Origin/Referer و هیچ CSRF-token در `/api/*` وجود ندارد (grep کل دایرکتوری).
- آزمون: `POST /api/cart/items` با `Origin: https://evil.example` و نشست معتبر → **200** (یافتهٔ API-403). `PUT /api/privacy/consent` با Origin شرورانه → 200.
- تخفیف ریسک: کوکی‌ها `SameSite=Lax` هستند (مرورگرهای مدرن کوکی را در POST بین‌سایتی نمی‌فرستند) و endpointهای GETِ تغییردهنده (unsubscribe) به‌جای CSRF از امضای HMAC استفاده می‌کنند. ریسک واقعی: پایین.

---

## ۳) معناشناسی مسیرها (Spot-check)

| آزمون | نتیجه |
|---|---|
| GET محصول/مقاله/person ناموجود | **404** `{"error":"NOT_FOUND"}` (بدون 200-with-error) |
| GET `/api/legal/UNKNOWN` | 404 (لیست typeها validate می‌شود) |
| GET سفارش مهمان با شماره/ایمیل ناهم‌خوان | 404 یکسان با ناموجود (ضد-enum، S9) |
| متد اشتباه (PATCH /api/products، PUT، DELETE /api/healthz، PATCH /api/admin/products) | **405** صحیح |
| `POST` JSON با `Content-Type: text/plain` | بدنه همچنان parse می‌شود (Content-Type اعمال نمی‌شود — API-411) |
| `POST` با بدنهٔ form-encoded | 400 `VALIDATION_ERROR "Request body must be JSON"` |
| صفحه‌بندی: `?pageSize=500` روی /api/products | clamp به **48** (فیلد پاسخ هم 48) |
| خطای اعتبارسنجی (login با email نامعتبر) | 400 + `{"error":"VALIDATION_ERROR","message":"Invalid email address"}` — **فقط پیام اولین issue؛ بدون stack/prisma** |
| `/api/cron/tick` بدون/با Bearer غلط | 403 `FORBIDDEN "Invalid scheduler credentials"` (مقایسهٔ timing-safe) |
| `/api/healthz` | 200 `{ok:true,db:true,…}` (پروب خالص؛ ops فقط با HEALTHZ_OPS=1) |
| checkout مهمان با سبد خالی | 400 `EMPTY_CART` قبل از هرگونه اثر جانبی |
| `/api/bootstrap` مهمان | **هیچ Set-Cookie** (مسیر فقط-خواندنی، SEC-005 — تأیید زنده) |

---

## ۴) Rate limiting

**پیاده‌سازی** (`src/lib/server/rate-limit.ts`): Map در-حافظه، پنجرهٔ ثابت، کلید رشته‌ای (`ip:route`)، prune هر ۶۰ثانیه، خروجی `{ok, remaining, retryAfterSec}`. `clientIp()` با اعتبارسنجی IPv4/IPv6 و سوییچ `TRUST_PROXY=0` (`src/lib/server/utils.ts:100-125`).

**سقف‌ها** (۲۴ فایل): login 10/min/IP + قفل اکانت DB-پشتیبان 8 خطا → 15 دقیقه (S5)؛ register 5/15m؛ forgot 5/10m؛ reset 10/m؛ newsletter 5/10m؛ confirm 20/10m؛ contact 5/10m؛ reviews 3/10m؛ search 30/m؛ cart-add 60/m؛ cart-item 120/m؛ checkout 5/m؛ analytics 60/m؛ consent 20/m؛ discount 10/m؛ order-lookup 10/m؛ change-pw 5/m؛ data-export/deletion/email-change 3/h/user؛ verify-request 4/h/user؛ back-in-stock 5/10m؛ helpful 30/m؛ google-start 20/m.

**آزمون زمان‌اجرا**:
1. **cart-add**: 65 درخواست پشت‌سرهم مهمان → دقیقاً **60×200 سپس 5×429** (و 3 درخواست اضافی بعدی همه 429). ✓ پنجرهٔ ثابت کار می‌کند.
2. **login**: 12 درخواست با رمز غلط برای آدرس ناموجود → **8×401 سپس 4×429** (قفل اکانت در 8 + پنجرهٔ IP در 10). ✓ دو لایه دفاعی فعال‌اند.

**کاستی**: پاسخ 429 فاقد هدر `Retry-After` (و `X-RateLimit-*`) است — `retryAfterSec` در `rateLimit()` محاسبه می‌شود ولی `apiError()` آن را دور می‌ریزد (API-402).

---

## ۵) Idempotency (checkout)

`src/app/api/checkout/route.ts:59-86,126-145`:
- کلید از هدر `Idempotency-Key` یا بدنهٔ `idempotencyKey`؛ بازپخشِ **پاسخ اول** (status+body) تا ۱۵ دقیقه؛ Map محدود به 1000 ورودی.
- ترتیب صحیح: بعد از validation و **قبل از هر mutation**.
- خودِ ثبت سفارش یک `$transaction` بزرگ است با: بازخوانی قیمت زنده (TOCTOU → 409 PRICE_CHANGED)، کاهش موجودی اتمی (→ 409 OUT_OF_STOCK)، سقف استفاده از کد تخفیف داخل tx (→ 422)، تولید شمارهٔ سفارش با retry روی P2002.
- fail-closed پرداخت: production بدون `PAYMENT_PROVIDER` → 503؛ provider غیرمجاز → 503. در dev با SANDBOX، شبیه‌سازی فقط برند+last4 ذخیره می‌کند (PCI-safe).
- یافته: کلید idempotency به نشست/کاربر/IP مقید نیست و پاسخ بازپخش‌شده شامل `orderNumber` و `publicRef` است (API-407).

---

## ۶) یکدستی پاکت (Envelope) — نمونهٔ ۱۰+ مسیر

| مسیر | وضعیت | شکل بدنه |
|---|---|---|
| POST /api/auth/login (401) | خطا | `{error, message}` |
| POST /api/newsletter (429) | خطا | `{error, message}` |
| GET /api/products/{slug} (404) | خطا | `{error}` فقط (بدون message) |
| GET /api/admin/* (403) | خطا | `{error:"FORBIDDEN"}` فقط |
| POST /api/checkout (400 EMPTY_CART) | خطا | `{error, message}` |
| POST /api/discount/validate (422) | خطا | `{error:"DISCOUNT_INVALID", message}` |
| GET /api/admin/orders/{id}/refund با id غلط (404) | خطا | `{error:"NOT_FOUND", message}` |
| POST /api/auth/verify-email توکن غلط (400) | خطا | `{error:"TOKEN_INVALID", message}` |
| GET /api/products | موفقیت | `{items,total,page,pageSize}` |
| GET /api/people | موفقیت | **آرایهٔ خام** |
| GET /api/categories | موفقیت | آرایهٔ خام |
| GET /api | موفقیت | `{message:"Hello, world!"}` (مسیر اسکفولت باقی‌مانده — API-406) |

ناسازگاری‌ها: (الف) گاهی `{error}` بدون message (403 های admin)، (ب) موفقیتِ لیستی دو شکلِ آرایهٔ خام و `{items,…}`، (ج) فیلد `message` در GET /api معنای موفقیت دارد ولی در بقیهٔ API فیلد خطاست — هر سه در API-414/406 ثبت شد. مورد (الف) کم‌اهمیت است چون کد ماشین (`error`) همیشه حاضر است.

---

## ۷) یافته‌ها

> مقیاس شدت: Info / Low / Medium / High. «وضعیت»: Confirmed=اثبات‌شده با کد و/یا زمان‌اجرا؛ Likely=استدلال قوی کد؛ Unverified=نیازمند شرایط محیط.

### API-401 — پاسخ anon به مسیرهای admin، به‌جای 401 همیشه 403 است (تلفیق «ناشناس» و «نقش ناکافی»)
- **شدت:** Info | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** `src/lib/server/auth.ts:141-168` (requireRole→null) + الگوی `if (!user) return apiError(403,'FORBIDDEN')` در تمام مسیرهای admin
- **شرح:** `requireAdmin/requireContentAdmin/requireOwner` برای «بدون نشست» و «نقش نامجاز» هر دو null برمی‌گردانند و مسیرها هر دو را 403 می‌کنند.
- **تحریک/شواهد:** `curl -s http://localhost:3000/api/admin/dashboard` → `403 {"error":"FORBIDDEN"}` (بدون کوکی).
- **سناریوی سوءاستفاده/اثر:** سوءاستفاده ندارد؛ فقط دشواری تشخیص در مانیتورینگ (401 spike = کاربر واردنشده نیست). ماتریس مأموریت «anon→admin = 401/403» را برآورده می‌کند (403 پذیرفته است).
- **رفع:** اختیاری — در گاردها دو وضعیت برگردانید (null-session→401، role-mismatch→403) یا دست‌نخورده بگذارید و در مستندات ثبت کنید. **زمان:** 1–2h. **ریسک رگرسیون:** کم (کلاینت ادمین فقط 403 را handle می‌کند). **تست پذیرش:** anon روی dashboard → 401 و customer → 403.

### API-402 — پاسخ 429 فاقد هدر Retry-After / X-RateLimit است
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** `src/lib/server/rate-limit.ts:33-37` (retryAfterSec محاسبه می‌شود) و `src/lib/server/utils.ts:11-16` (apiError هدر اضافه نمی‌گیرد)
- **شرح:** همهٔ 27 نقطهٔ rate-limit فقط body برمی‌گردانند؛ کلاینت/بروزر نمی‌داند کی دوباره تلاش کند.
- **تحریک/شواهد:** `curl -D- -b guest.jar -X POST /api/cart/items …` → `HTTP/1.1 429` بدون هیچ هدر RateLimit/Retry-After (bursts در `evidence-2c-ratelimit.log`).
- **سناریوی سوءاستفاده/اثر:** UX و backoff خودکار کلاینت‌ها؛ فشار تکراری روی سرور.
- **رفع:** افزودن هدرها در 429 (helper مشترک). **زمان:** 1–2h. **ریسک رگرسیون:** بسیار کم. **تست پذیرش:** 61st cart-add → `Retry-After: ≥1`.

### API-403 — هیچ اعتبارسنجی Origin/Referer/CSRF-token روی مسیرهای تغییردهندهٔ وضعیت نیست (اتکای صرف به SameSite=Lax)
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** مثال `src/app/api/cart/items/route.ts:18-21`؛ grep کل `src/app/api` = بدون origin-check؛ `src/lib/server/auth.ts:44-52` (SameSite=lax)
- **شرح:** درخواست بین‌سایتی با `Origin: https://evil.example` پذیرفته شد.
- **تحریک/شواهد:** `curl -b customer.jar -X POST /api/cart/items -H 'Origin: https://evil.example' -d '{"variantId":…,"quantity":1}'` → 200. (روی نشست خود آزمونگر؛ غیرمخرب.)
- **سناریوی سوءاستفاده:** در مرورگرهای مدرن Lax مانع ارسال کوکی در POST بین‌سایتی است؛ باقی‌ماندهٔ ریسک: مرورگرهای قدیمی/.embedهای خاص و نبود دفاع لایهٔ دوم برای endpointهای حساس (account/password).
- **اثر:** محدود؛ اما برای عمق دفاع روی مسیرهای حساس (password/data-export/deletion) توصیه می‌شود.
- **رفع:** middleware سبک مقایسهٔ Origin/Sec-Fetch-Site برای متدهای تغییردهنده. **زمان:** 3–5h (با تست). **ریسک رگرسیون:** متوسط (باید exact-origin/none را اجازه داد؛ اپ خودش همیشه Origin نمی‌فرستد). **تست پذیرش:** POST با Origin شرورانه → 403؛ POST بدون Origin (همان‌مبدأ curl) → پذیرفته.

### API-404 — Rate-limit و idempotency در-حافظه/عالی‌process؛ در دیپلوی چندنمونه‌ای بی‌اثر می‌شوند
- **شدت:** Low (مستند‌شده به‌عنوان deferred ARCH-001/SEC-002 در worklog) | **وضعیت:** Confirmed (ماهیت کد) | **اطمینان:** بالا
- **فایل:** `src/lib/server/rate-limit.ts:1-38`؛ `src/app/api/checkout/route.ts:59-86`
- **شرح:** Map داخل process است؛ در scale-out، هر instance سقف مستقل دارد و idempotency بین نودها share نمی‌شود.
- **اثر:** در دیپلوی تک‌پروسه‌ایِ مستندشده هیچ؛ در مقیاس‌افزایی بازگشت hazard.
- **رفع:** Redis/DB برای هر دو (قبل از scale-out). **زمان:** 1–3d. **ریسک رگرسیون:** متوسط. **تست پذیرش:** دو instance، سقف مشترک + replay بین‌نودی.

### API-405 — چند لیست ادمین بدون صفحه‌بندی (findMany بی‌کران)
- **شدت:** Medium (عملیاتی؛ فقط staff) | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل/خط:** `admin/reviews/route.ts:19-24` (همهٔ ریویوها + include محصول)، `admin/tickets/route.ts:15-19`، `admin/articles/route.ts:8-19` (بدنه‌های کامل هر دو زبان)، `admin/people/route.ts:7-11`، `admin/categories/route.ts:9-13`، `admin/discounts/route.ts:6`، `admin/announcements/route.ts` (raw SQL بدون LIMIT)، `admin/products/export/route.ts:27-40` (کل کاتالوگ)، `admin/reports/route.ts:14-19` (کل سفارش‌های پنجره ≤365d + items، تجمیع در JS)، `admin/customers/route.ts:6-14` (همهٔ کاربران سپس slice در JS)
- **شرح:** با رشد داده، پاسخ‌ها/حافظه بی‌کران بزرگ می‌شوند (endpoint درون staff است، پس بردار سوءاستفادهٔ بیرونی ندارد؛ خطر عملیاتی/DoS مدیریتی).
- **تحریک:** در دادهٔ seed فعلی بی‌علامت؛ آستانه در هزاران ردیف.
- **اثر:** latency/حافظه/timeout در پنل ادمین.
- **رفع:** page/pageSize با سقف 200 (همان الگوی admin/products) برای ۱۰ مسیر فوق. **زمان:** 4–8h. **ریسک رگرسیون:** متوسط (UIهای ادمین باید صفحه‌بندی را بخوانند). **تست پذیرش:** هر لیست با 2k ردیف فیک < 300ms و حداکثر pageSize پاسخ.

### API-406 — مسیر اسکفولت باقی‌مانده: GET /api → {"message":"Hello, world!"}
- **شدت:** Info | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** `src/app/api/route.ts:1-8`
- **شواهد:** `curl http://localhost:3000/api` → 200 `{"message":"Hello, world!"}`
- **اثر:** آلودگی inventory/پاکت (فیلد message موفقیت در مقابل فیلد خطا در بقیهٔ API).
- **رفع:** حذف یا تبدیل به `{"ok":true}`/index مسیرها. **زمان:** 10m. **ریسک:** صفر. **تست:** 404 یا shape استاندارد.

### API-407 — کلید Idempotency سفارش به هویت مقید نیست؛ بازپخشِ پاسخ اول شامل orderNumber/publicRef است
- **شدت:** Low | **وضعیت:** Confirmed (کد) | **اطمینان:** بالا
- **فایل:** `src/app/api/checkout/route.ts:59-86,141-145`
- **شرح:** Map سراسری است (بدون scope کاربر/IP)؛ هرکس همان کلید را بفرستد، پاسخ اول (شامل شناسه‌های سفارش) را می‌گیرد. کلید client-side تولید می‌شود (entropy دلخواه فرستنده).
- **سناریوی سوءاستفاده:** حدس/شنود کلید در یک ترافیک مشترک (proxy عمومی) → افشای orderNumber/publicRef سفارش دیگری (tracking بدون ایمیل). نیاز به پیش‌دانستن کلید دارد → ریسک پایین.
- **رفع:** کلید ذخیره‌شده را با `userId یا `ip:route` هش کنید (`scope = sha256(key+visitorKey)`). **زمان:** 1–2h. **ریسک:** کم. **تست:** همان کلید با کوکی دیگر → عدم replay.

### API-408 — حذف مشترک ادمی از خبرنامه (DELETE /api/admin/newsletter?email=) لاگ audit ندارد
- **شدت:** Low | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** `src/app/api/admin/newsletter/route.ts:34-44` (DELETE) در برابر بقیهٔ اکشن‌های ادمین که `audit()` دارند
- **اثر:** شکاف در trail (مشتری unsubscribe شده ولی معلوم نیست چه کسی/کِی).
- **رفع:** یک `await audit(...,'NEWSLETTER_ADMIN_UNSUB',...)`. **زمان:** 15m. **ریسک:** صفر. **تست:** DELETE → ردیف AuditLog جدید.

### API-409 — اتکای clientIp به XFF هنگام TRUST_PROXY≠0؛ پیکربندی غلط = چرخش کلید rate-limit
- **شدت:** Low | **وضعیت:** Likely (وابسته به دیپلوی؛ در سندباکس Caddy XFF را بازنویسی می‌کند) | **اطمینان:** متوسط-بالا
- **فایل:** `src/lib/server/utils.ts:100-125`
- **شرح:** اگر بدون پروکسیِ بازنویسی‌کننده و بدون `TRUST_PROXY=0` دیپلوی شود، مهاجم با هدر `X-Forwarded-For` تصادفی هر درخواست، bucket تازه می‌گیرد (bypass سقف login/newsletter/checkout).
- **اثر:** بی‌اثرسازی محدودیت‌ها در پیکربندی غلط؛ در پیکربندی فعلی سندباکس مشکلی دیده نشد.
- **رفع:** fail-closed پیش‌فرض (بدون TRUST_PROXY=1 فقط socket ip) + مستند دیپلوی. **زمان:** 1h. **ریسک:** کم. **تست:** با XFF غلط و TRUST_PROXY=0، کلید ثابت بماند.

### API-410 — GET /api/auth/me برای توکن نامعتبر 200 {user:null} برمی‌گرداند (نه 401)
- **شدت:** Info | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** `src/app/api/auth/me/route.ts:7-12`
- **شواهد:** `curl -H 'Cookie: sp_session=deadbeef…' /api/auth/me` → `200 {"user":null}`
- **اثر:** قرارداد عمدی برای payload بوت؛ فقط برای مستندسازی. رفتار مطابق طراحی و بدون نشت.
- **رفع:** هیچ (یا در صورت تمایل 401 برای کلاینت‌های non-boot). **زمان:** —. **ریسک:** —.

### API-411 — Content-Type در POSTهای JSON اعمال نمی‌شود (req.json() مستقل از هدر parse می‌کند)
- **شدت:** Info | **وضعیت:** Confirmed | **اطمینان:** بالا
- **فایل:** الگوی عمومی `await req.json()` (مثلاً `discount/validate/route.ts:16-19`)
- **شواهد:** `POST /api/discount/validate` با `Content-Type: text/plain` و بدنهٔ JSON → 422 `DISCOUNT_INVALID` (بدنه parse شد).
- **اثر:** تهدید امنیتی نیست (بدنه همچنان zod می‌شود)؛ صرفاً سخت‌گیری قراردادی.
- **رفع:** اختیاری — reject هدر غیر application/json. **زمان:** 1h (helper مشترک). **ریسک:** کم.

### API-412 — افشای dev-only توکن‌ها (devVerifyUrl/resetUrl) به‌درستی دوگانه gate شده — watch-item
- **شدت:** Info | **وضعیت:** Confirmed (در dev نمایان؛ gate production سالم) | **اطمینان:** بالا
- **فایل:** `auth/register/route.ts:60-63`، `auth/forgot-password/route.ts:36-39` (`DEV_EXPOSE_RESET_LINK==='1' && NODE_ENV==='development'`)
- **شواهد:** register پاسخ test-user شامل `devVerifyUrl` بود (dev). شرط دوگانه یعنی در production حتی با flag=1 هم افشا نمی‌شود.
- **اثر:** صفر در prod؛ توصیه: تست CI که ریسپانس prod فاقد این فیلدها باشد.
- **رفع:** — (قفل موجود کافی است). **زمان:** —. 

---

## ۸) نقاط قوت تأییدشده (زمان‌اجرا/کد)

1. **لایه‌بندی گاردها بی‌نقص اجرا شد**: 68 درخواست روی مسیرهای admin — صفر عبور برای anon/forged/customer (§۲-۱).
2. **کوکی جعلی/آشغال هرگز 500 نمی‌دهد**؛ account→401، admin→403، me→{user:null}. توکن در DB hash می‌شود؛ ورود نشست قبلی را revoke می‌کند (rotation).
3. **مالکیت‌سنجی سطرها** در account/* با 404-masking (بدون افشای وجود منابع دیگران).
4. **دفاع دومرحله‌ای brute-force**: پنجرهٔ IP (10/min) + قفل اکانت DB-پشتیبان (8 خطا→15 دقیقه) با پاسخ یکنواخت 401 برای اکانت موجود/ناموجود (S9) — هر دو در burst آزمون فعال شدند.
5. **checkout امن و fail-closed**: 503 بدون provider در prod؛ 400 EMPTY_CART قبل از هر اثر؛ `$transaction` با TOCTOU price-recheck، کاهش موجودی اتمی، سقف تخفیف درون-تراکنشی، retry شمارهٔ سفارش؛ idempotency با ترتیب صحیح.
6. **refund/cancel با سقف داخل تراکنش** + `SELECT … FOR UPDATE` روی Postgres؛ لغو مشتری با updateMany گاردشده (ضد race/double-click).
7. **سقف صفحه‌بندی سمت سرور** واقعاً اعمال می‌شود (pageSize=500 → 48) و لیست‌های حساس bounded هستند.
8. **پاکت خطای تمیز**: `{"error","message"}` بدون stack/Prisma؛ کدهای ماشین پایدار؛ پیام‌های validation فیلد-محور.
9. **ضد-enum سراسری (S9)**: forgot-password همیشه `{ok:true}`؛ lookup سفارش مهمان 404 یکسان + publicRef غیرقابل‌حدس + 10/min + حذف giftMessage از پاسخ عمومی.
10. **خبرنامهٔ double opt-in** با لینک‌های HMAC و پاسخ موفقیت یکنواخت (بدون oracle).
11. **رضایت کوکی server-side و fail-closed**: analytics بدون رضایت واقعی ذخیره نمی‌شود (پاسخ موفق بی‌اثر)؛ bootstrap مهمان صفر Set-Cookie (تأیید زندهٔ SEC-005).
12. **مسیرهای 404/405 معنادار** (soft-404 در API نداریم) و `cron/tick` با مقایسهٔ timing-safe + 403 DISABLED.
13. **upload ادمین** با گارد نقش + magic-byte + سقف 5MB + نام تصادفی (خودداری از نوشتن فایل در این ممیزی؛ آزمون‌های مثبت قبلی در worklog ثبت است).
14. **zod + سقف طول** تقریباً سراسری (ریویو 200/5000، تیکت 5000، …) —multi-MB payload رد می‌شود.

---

## ۹) ردپای تغییرات (Mutation Footprint) این ممیزی — ثبت کامل

هویت‌ها: ورود OWNER (نشست)، ورود customer (نشست). کل درخواست‌ها ≈ 210 (که 82 تای آن دو burst rate-limit است).

| # | موجودیت/اثر | جزئیات | وضعیت فعلی |
|---|---|---|---|
| 1 | **User** جدید | `audit4api+5999@example.com` (register؛ سپس ایمیلش با توکن dev وریفای شد تا مسیر ریویو تست شود) | باقی است (کاربر تست ممیزی) |
| 2 | **Review** | توسط کاربر تست روی محصول منتشرشدهٔ `rust-and-turquoise`، rating=5 — **PENDING** (منتشر نمی‌شود مگر با تأیید ادمین که انجام نشد) | در صف مودریشن |
| 3 | **Cart** مشتری (cmtzd5lhs…) | ساخته‌شده توسط POST تستی من (مشتری پیش از آن سبد نداشت — با خوانش فقط-خواندنی DB تأیید شد: createdAt==زمان درخواست من)؛ 1 آیتم | آیتم تستی با DELETE /api/cart پاک شد (سبد خالی) |
| 4 | **Cart مهمان** (cmtzd7wa4…) | ساخته‌شده در burst rate-limit؛ 1 آیتم (تا سقف merge شد) | آیتم پاک شد؛ ردیف سبد خالی مانده |
| 5 | **CookieConsent** | یک تصمیم reject_optional برای بازدیدکنندهٔ ناشناس خودم (پروب Origin) | مربوط به بازدیدکنندهٔ تست |
| 6 | **LoginThrottle** | 8 خطا برای `audit4api-ratelimit@example.com` (آدرس ناموجود؛ طبق طراحی ثبت می‌شود) + 0 خطا برای کاربر تست | قفل ۱۵دقیقه‌ای منقضی‌شدنی |
| 7 | POST /api/admin/emails/dispatch ×2 (با نشست OWNER) | no-op کامل: `{"configured":false,"attempted":0,"sent":0,…}` — هیچ ایمیلی واقعی ارسال/صف نشد | بدون اثر |
| 8 | Session | 3 نشست (ادمین/مشتری/کاربر تست) — متعلق به خود آزمونگر | باقی (بی‌ضرر) |

**هیچ دادهٔ seed تغییر/حذف نشد** (خوانش فقط-خواندنی SQLite برای راستی‌آزمایی سبد مشتری). هیچ آپلودی انجام نشد، هیچ refund/ship/status-change ادمین واقعی انجام نشد، هیچ ایمیل واقعی ارسال نشد (SMTP configure=false — dispatch fail-closed no-op).

---

## ۱۰) اقدامات پیشنهادی به‌ترتیب اولویت

1. **API-405**: صفحه‌بندی ۱۰ لیست ادمین (Medium، 4–8h).
2. **API-402**: هدر Retry-After روی 429 (Low، 1–2h).
3. **API-408**: audit برای unsubscribe ادمینی (Low، 15m).
4. **API-407**: scope کردن کلید idempotency به بازدیدکننده (Low، 1–2h).
5. **API-403**: بررسی Origin روی متدهای تغییردهندهٔ مسیرهای حساس (Low، 3–5h، اختیاری با توجه به Lax).
6. **API-406/411**: حذف اسکفولت / سخت‌گیری Content-Type (Info، <1h).
7. **API-404**: یادآوری برنامهٔ Redis پیش از scale-out (نقشه‌راه موجود).

---
*خام‌متریال: `/tmp/audit-v4/2c/` (ماتریس‌ها، burstها، پرچم کوکی، سورس‌های دسته‌بندی‌شده) — CSV: `audit-output/work/2c-api-inventory.csv`*


---

## پیوست — دامنهٔ فروشگاهی (3-d Part 1)

# گزارش ممیزی 3-d — دامنهٔ تجارت الکترونیک (Phase 10) + آمادگی تولید/DevOps (Phase 13)

- Task ID: 3-d · Audit protocol v4 · زبان گزارش: فارسی (شناسه‌ها/دستورات انگلیسی)
- Target: `/home/z/my-project` — Next.js 16 App Router, Prisma 6 + SQLite (`db/custom.db`), dev server :3000
- Commit runtime truth: working tree (04cf388… @ main، working tree clean)
- تاریخ ممیزی: 2026-09-13
- هماهنگی: worklog.md + audit-output/00-LEDGER.md خوانده شد. موارد پوشش‌دادهٔ دیگر تسک‌ها تکرار نشده‌اند: auth matrix + rate limits + idempotency runtime (2-c → API-40x)، DB schema/indexes/data quality (2-b → DB-40x)، خرابی تریگر CI QA-401 + migrate-status QA-402 (2-a).
- قانون طلایی رعایت شد: **AUDIT ONLY** — هیچ فایل/کانفیگ/دیتابیس زنده‌ای تغییر نکرد. تنها خواندن read-only از :3000 و کپی `/tmp/audit-v4/db-copy.custom.db` (mode=ro). شواهد: `audit-output/evidence/3d-*.log/.txt`.

---

## ۰. متدولوژی و شواهد

- خواندن کامل مسیرهای تجاری: `src/lib/server/{cart,discounts,promotions,money,shipping,giftwrap,order-mail,mail-dispatch,newsletter,housekeeping,utils,rate-limit}.ts`، روت‌های `api/checkout`، `api/checkout/quote`، `api/cart/**`، `api/orders/[orderNumber]`، `api/account/orders/**` (لیست/جزئیات/کنسل)، `api/admin/orders/[id]` (+ship/refund)، `api/account/returns`، `api/discount/validate`، `api/back-in-stock`، `api/newsletter*`، `api/cron/tick`، `api/healthz`، `api/admin/{discounts,promotions,back-in-stock,emails}/**`.
- DevOps: `Dockerfile`، `Caddyfile`، `deploy/Caddyfile.production`، `scripts/{backup-db.sh,restore-db.sh}`، `docs/production-deploy.md` (کامل)، `docs/postgres-migration.md`، `next.config.ts`، `package.json`، `.github/workflows/ci.yml`، `.env.example`، `src/lib/db.ts`.
- Probes زندهٔ read-only: healthz/`products`/guest-track 404 (evidence/3d-runtime-probes.log). ممیزی مالی روی کپی DB (evidence/3d-db-money-math.txt).
- وضعیت هر یافته: VERIFIED (کد+اجرای زنده/داده) / LIKELY / UNVERIFIED.

---

# بخش ۱ — دامنهٔ Commerce (یافته‌های COM-401..COM-415)

## COM-401 — چرخهٔ ReturnRequest بن‌بست است: هیچ API/مسیر ادمینی برای رسیدگی به مرجوعی‌ها وجود ندارد
- **Severity:** High · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/account/returns/route.ts:42-111` (فقط ایجاد)؛ grep کامل `src/app/api/admin` → تنها `admin/dashboard/route.ts:52` (count) و `admin/orders/[id]/route.ts:93-101` (نمایش در جزئیات سفارش).
- **Description:** مشتری می‌تواند ReturnRequest بسازد (وضعیت REQUESTED) اما هیچ endpoint ادمینی برای APPROVED/RECEIVED/RESTOCKED/REJECTED/REFUNDED وجود ندارد؛ restock و refundِ ناشی از مرجوعی در هیچ کدی نوشته نشده. فیلدهای status/reseolution مدل (`REQUESTED|APPROVED|RECEIVED|RESTOCKED|REJECTED|REFUNDED`) فقط در خط ۷۷ همین فایل برای «باز» بودن استفاده شده‌اند.
- **Trigger:** مشتری درخواست مرجوعی ثبت می‌کند → ردیف برای هم REQUESTED می‌ماند.
- **Failure/abuse scenario:** قانون انصراف ۱۴روزهٔ EU/AT عملاً قابل اجرا نیست؛ داشبورد تعداد باز را نشان می‌دهد ولی اقدامی ممکن نیست؛ داده انباشته می‌شود.
- **Impacts:** ریسک قانونی/ CX، دست‌کاری دستی مستقیم در DB توسط اپراتور (خطرناک).
- **Evidence:** grep `returnRequest|returns` در `src/app/api/admin` → ۳ نتیجهٔ غیرعملیاتی.
- **Fix:** `PATCH /api/admin/returns/[id]` با نقلهٔ وضعیت معتبر + restock داخل tx + refund از سقف باقی‌مانده (الگوی cancel ادمین COM-004) + دکمه در AdminOrdersSection. est: 1-2d. **Regression risk:** کم (کد جدید).
- **Acceptance test:** ایجاد مرجوعی با مشتری → ادمین APPROVED→RESTOCKED → موجودی واریانت +qty و refund row با سقف درست ساخته شود.

## COM-402 — «Notify waiting customers» واقعاً ایمیل نمی‌فرستد؛ فقط notifiedAt را مهر می‌زند
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/admin/back-in-stock/notify/route.ts:30-44`؛ `src/app/api/admin/emails/route.ts:87-92` (پیش‌نمایش از notifiedAt)؛ `src/lib/server/mail-dispatch.ts:77-92` (فقط MailMessage را dispatch می‌کند).
- **Description:** روت notify فقط `updateMany({ notifiedAt })` می‌زند. هیچ MailMessage ردیفی برای BACK_IN_STOCK ساخته نمی‌شود و dispatcher هم فقط ردیف‌های MailMessage را می‌فرستد → حتی با SMTP کامل، مشتریِ منتظر هرگز ایمیلی نمی‌گیرد؛ ولی audit-log می‌نویسد «Restock notice sent to N waiting customers» و outbox هم پیش‌نمایش BACK_IN_STOCK رندر می‌کند — توهم ارسال.
- **Trigger:** ادمین بعد از شارژ موجودی دکمهٔ notify را می‌زند.
- **Failure/abuse scenario:** مشتری منتظر می‌ماند، ایمیل هرگز نمی‌رسد؛ سواچ آفسایت بی‌معنا؛ گزارش ادمین گمراه‌کننده.
- **Impacts:** اعتماد مشتری، CV مفقودشده.
- **Evidence:** grep `backInStockSubscriber` در کل src → هیچ مسیر queueMail/produceMail برای آن وجود ندارد (فقط deletion-request پاکسازی می‌کند).
- **Fix:** در notify یک MailMessage (kind=BACK_IN_STOCK، text از عنوان/واریانت) به‌ازای هر مشتری بسازید تا از همان seam SMTP برود؛ یا در housekeeping اتوماسیون «restock detection → queue mail» اضافه کنید. est: 0.5d. **Regression risk:** کم.
- **Acceptance test:** با SMTP fake (mailhog) → بعد از notify، پیام واقعی در صندوق تست ظاهر شود و sentAt مهر شود.

## COM-403 — کنسل مشتری بدون محاسبهٔ سقف refund است (در حال حاضر با گیت وضعیت محافظت می‌شود)
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/account/orders/[orderNumber]/cancel/route.ts:54-69` در مقابل `src/app/api/admin/orders/[id]/route.ts:179-210` (الگوی صحیح) و `admin/orders/[id]/refund/route.ts:56-63`.
- **Description:** کنسل مشتری `refundedMinor = order.totalMinor` را بدون جمع زدن refundهای SUCCEEDED قبلی حساب می‌کند. الان غیرقابل‌رسیدن است چون refund پارشیالِ ادمین، `order.status = PARTIALLY_REFUNDed` می‌گذارد و cancel فقط PAID/PROCESSING را می‌پذیرد (خط ۴۱). اما این یک invariant ضمنی است: هر تغییر آیندهٔ وضعیت‌ها (مثلاً اجازهٔ کنسل روی PARTIALLY_REFUNDED) بلافاصله over-refund می‌سازد. Race باریک refund-همزمان-با-کنسل هم روی SQLite ناچیز و روی Postgres با FOR UPDATE پوشیده است.
- **Trigger:** رفع گیت وضعیت در آینده یا تغییر مسیر refund ادمین.
- **Impacts:** over-refund پنهان (پرداختِ بیشتر از دریافتی).
- **Fix:** همان محاسبهٔ ceiling داخل tx (کپی ۵ خط از مسیر ادمین) + کامنت invariant. est: 0.5h. **Regression risk:** تقریباً صفر.
- **Acceptance test:** partial refund ادمین → تلاش کنسل مشتری → 409؛ و اگر گیت باز شود، refund = remaining نه total.

## COM-404 — `customerNote` در checkout بدون سقف طول است
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/checkout/route.ts:42` (`customerNote: z.string().optional().nullable()` — بدون max) و خط ۲۷۶ (ذخیرهٔ خام). مقایسه: `giftMessage` خط ۴۴ cap=300 دارد.
- **Description:** تنها فیلد متنیِ بدون محدودیت در کل checkout. رشتهٔ چند مگابایتی ذخیره، رندر پنل ادمین (`admin/orders/[id]` GET خط ۶۵ raw برمی‌گرداند) و ایمیل‌های بعدی را خراب می‌کند.
- **Trigger:** POST /api/checkout با customerNote چند-MB (rate limit 5/min/IP پنجه را نرم می‌کند).
- **Impacts:** باد کردن DB، UI ادمین، DoS نرم.
- **Fix:** `z.string().max(1000)` (متناسب UI) + trim. est: 15m. **Regression risk:** صفر (فیلد اختیاری).
- **Acceptance test:** note با ۵۰هزار کاراکتر → 400 VALIDATION_ERROR.

## COM-405 — Idempotency checkout: کلید per-visitor نیست و پاسخ خطا را هم replay می‌کند (ارجاع به API-407)
- **Severity:** Low (در تک‌نود) · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/checkout/route.ts:59-86,141-144,426,440,452,456,462`
- **Description:** 2-c این را API-407 ثبت کرده (کلید به visitor/session گره نخورده). تأیید مستقل من + دو نکتهٔ تکمیلی: (۱) پاسخ 402 CARD_DECLINED هم با همان کلید کش می‌شود — کلاینتِ درست‌رفتار که با همان key دوباره تلاش کند ۱۵ دقیقه همان 402 را می‌گیرد (کلاینت فعلی key جدید per attempt می‌سازد — `CheckoutView.tsx:65,178-184` — پس مهار است). (۲) کش per-process است → در scale-out replay از بین می‌رود (OPS-408).
- **Fix:** کلید را با هش بدنه/visitorId scope کنید و 4xx را فقط چندثانیه cache کنید یا اصلاً نکشید. est: 2h.
- **Acceptance test:** دو visitor با یک کلید → دومی نباید orderNumber اولی را ببیند.

## COM-406 — تخصیص شمارهٔ سفارش count-محور است؛ قابل حدس + حساس به حذف ردیف
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/checkout/route.ts:219-223` + `src/lib/server/utils.ts:62-93`
- **Description:** `SP-YY-MM-DD-NNNN` از `count(سفارش‌های امروز)+attempt` ساخته می‌شود، نه از sequence جدول. حذف هر سفارشِ همان روز (مثلاً پاکسازی آینده) → بازاستفاده/برخورد؛ برخورد همزمان با P2002 و retry تا ۳ بار مدیریت می‌شود (خط ۴۴۴). قابل‌حدس بودن شماره با publicRef (۱۲۰bit random) و گیت email در مسیر عمومی مهار شده (COM strengths). یادداشت: فرمت legacy `PPX-` هم پذیرفته می‌شود (`orders/[orderNumber]/route.ts:27`).
- **Fix:** اگر روزی پاکسازی سفارش در نقشه راه است، به counter در Settings یا cuid داخلی مهاجرت کنید؛ در غیر این صورت فقط مستندسازی. est: 0 (N-A فعلاً).
- **Acceptance test:** N-A (طراحی).

## COM-407 — مدل مالیات ساده‌سازی‌شده: VAT ۱۰٪ کتاب بر کلِ total (ارسال + کادو) اعمال می‌شود؛ EUR هاردکد
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/lib/server/money.ts:3-8`؛ `src/app/api/checkout/route.ts:195-196`؛ `cart.ts:193-195`؛ currency literal در `checkout/route.ts:259` و `cart.ts:195`.
- **Description:** نرخ کتاب اتریش (10%) روی مجموع نهایی شامل هزینهٔ ارسال (نرخ استاندارد ۲۰٪ در AT) و gift wrap محاسبه می‌شود؛ tax «موجود در قیمت» است و فقط برای گزارش/نمایش. بدون پیکربندی ادمین (gap شناخته‌شدهٔ VAT editor در worklog). روی دادهٔ واقعی ۳/۳ سفارش math/tax سازگار (evidence 3d-db-money-math.txt).
- **Impacts:** اعداد tax در فاکتور رسمی قابل دفاع نیستند — تا پیش از فاکتورسازی رسمی مهلک نیست.
- **Fix:** پارامتری‌سازی نرخ بر zone/نوع قلم (post-launch؛ نیاز schema کوچک). est: 2-3d.

## COM-408 — سفارش با total صفر (تخفیف ۱۰۰٪) و منع منفی‌شدن: رفتار تأییدشده
- **Severity:** Informational · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/lib/server/discounts.ts:131-136` (cap به subtotal) + `checkout/route.ts:187-196,240-248`
- **Description:** مقدار تخفیف همیشه `min(base, subtotal)` است → total نمی‌تواند منفی شود (دادهٔ DB هم صفر/منفی ندارد). total=0 با ارسال رایگان ممکن است: Payment row با amountMinor=0/SUCCEEDED ثبت می‌شود و simulatePayment همان مسیر ۱۶رقمی را طی می‌کند. با PSP واقعی این مسیر باید به flow «no-charge» برود.
- **Fix:** برای PSP آینده: if totalMinor===0 → skip authorize, status=PAID با provider='ZERO_TOTAL'. est: 2h.

## COM-409 — کنسل ادمین race-guard ندارد (کنسل مشتری دارد) → double-restock ممکن
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High (تحلیل کد) / Medium (اجرای همزمان اجرا نشد)
- **File+line:** `src/app/api/admin/orders/[id]/route.ts:130-133` (اعتبارسنجی بیرون tx) و `151-213` (update بدون گارد status؛ restock خطی بدون شرط) در مقابل `cancel/route.ts:46-52` (updateMany گارددار).
- **Description:** دو PATCH همزمان از PAID→CANCELLED: هر دو از اعتبارسنجی TRANSITIONS می‌گذرند؛ tx دوم دوباره update+restock می‌زند (restock بدون گارد stock/وضعیت). refund دوباره اتفاق نمی‌افتد (ceiling داخل tx — خط ۱۸۴-۱۸۶ درست کار می‌کند) اما موجودی دوبرابر برمی‌گردد → فروش بیش از موجودی بعدی.
- **Trigger:** دبل‌کلیک ادمین/دو ادمین همزمان.
- **Impacts:** تحریف موجودی (oversell منطقی، نه منفی).
- **Fix:** داخل tx اول یک `updateMany({where:{id, status:{in:[...]}}})` گارددار و اگر count=0 → abort؛ restock هم شرطی به همان flip. est: 1h. **Regression risk:** کم.
- **Acceptance test:** دو POST موازی → stock دقیقاً +qty یک‌بار.

## COM-410 — ایمیل سفارش به نشانی بدنه گره می‌خورد نه به حساب کاربر
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/checkout/route.ts:255,276` (email از body) + `userId: cartRow.userId` (خط ۲۵۴)
- **Description:** کاربر لاگین‌شده می‌تواند email متفاوت بفرستد؛ سفارش در account او دیده می‌شود ولی رسید/پیگیری به نشانی بدنه می‌رود. تهاجمی نیست (نیاز به session و اقدام خود کاربر) ولی داده‌های تماس را دوپله می‌کند.
- **Fix:** برای کاربر لاگین، ایمیل را از session enforce کنید (بدنه فقط برای guest). est: 30m.

## COM-411 — فیلدهای آدرس عملاً بی‌سقف و بدون اعتبارسنجی قالب
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/app/api/checkout/route.ts:23-32`
- **Description:** `recipient/line1/city/postalCode` فقط `min(1)`؛ بدون max → رشته‌های چند-MB در `shippingAddressJson`؛ `phone` بدون الگو؛ `countryCode` فقط طول ۲ (بعداً uppercase می‌شود). UI محدودتر است ولی API مستقیم باز است.
- **Fix:** max(80..160) + trim برای همه؛ الگوی ملایم postal/phone. est: 30m.

## COM-412 — سیاست stacking تخفیف: پرامو سایت‌واید + دقیقاً یک code (ضمنی ولی سازگار)
- **Severity:** Informational · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `cart.ts:148-205` + `checkout/route.ts:171-199` + `discounts.ts:94-169`
- **Description:** همیشه حداکثر یک discountCode پذیرفته می‌شود (schema)، و پرامو سایت‌واید خودکار روی قیمت‌ها اعمال می‌شود؛ code روی subtotalِ پراموخورده حساب می‌شود (stack ضمنی). کد scoped فقط روی اقلام واجد شرایط (categories/publishers/people/products) محاسبه می‌شود؛ کد منقضی/نامعتبر در checkout 422 سخت می‌دهد (مشتری باید حذف کند — رفتار درست). کلاه‌های سرویس ادمین: PERCENT 1-90، FIXED ≤€10k، ترتیب بازه (POST) — COM strengths. ضعف کوچک: PATCH تخفیف ترتیب startsAt/endsAt را دوباره چک نمی‌کند (`admin/discounts/[id]/route.ts:100-118`) → از مسیر دو PATCH می‌شود بازهٔ وارونه ساخت (اثر: کد هرگز/همیشه فعال از نظر validate چون هر دو شرط ساده‌اند — جزئی).

## COM-413 — ماشین وضعیت سفارش: نقشهٔ کامل تأییدشده
- **Severity:** Informational (سند) · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `admin/orders/[id]/route.ts:8-23` (TRANSITIONS)؛ `cancel/route.ts:41`؛ `ship/route.ts:51`؛ `refund/route.ts:83-87`
- **Description / map:**
  - `PENDING_PAYMENT → PAID|CANCELLED` (پرداخت موفق در checkout مستقیم PAID می‌سازد؛ رد پا PENDING فقط برای پرداخت ناموفق)
  - `PAID → PROCESSING|SHIPPED|CANCELLED|PARTIALLY_REFUNDED|REFUNDED`
  - `PROCESSING → SHIPPED|CANCELLED|PARTIALLY_REFUNDED|REFUNDED`
  - `SHIPPED → DELIVERED|PARTIALLY_REFUNDED|REFUNDED` · `DELIVERED → PARTIALLY_REFUNDED|REFUNDED`
  - `CANCELLED/REFUNDED` ترمینال؛ `PARTIALLY_REFUNDED → REFUNDED`
  - مشتری: کنسل فقط PAID/PROCESSING و UNFULFILLED (خط ۴۱ cancel)؛ ship فقط از PAID/PROCESSING؛ refund فقط OWNER و همیشه با سقفِ داخل tx؛ کنسل ادمین = flip+restock+refund کامل باقیمانده در یک tx.
  - restock: در هر دو مسیر cancel (مشتری/ادمین) انجام می‌شود؛ در refund سادهٔ SHIPPED/DELIVERED نه (درست — کالا پیش مشتری است؛ restock فقط با فلوی Return که COM-401 است).
- **نقض شناخته‌شده:** نبود گارد race در مسیر ادمین (COM-409)؛ بقیهٔ map سالم است.

## COM-414 — سفارش‌های PENDING_PAYMENT (پرداخت ناموفق) هرگز پاک‌سازی نمی‌شوند
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `src/lib/server/housekeeping.ts:19-79` (سواپ session/cart/token/mail؛ چیزی برای Order ندارد) + `checkout/route.ts:423-427`
- **Description:** هر پرداخت ناموفق یک Order+Payment+Consent+Events می‌سازد و رها می‌شود؛ موجودی دست‌نخورده (بی‌خطر) ولی رشد جدول و نویز پنل/داشبورد (درآمد شامل سفارش FAILED نمی‌شود).
- **Fix:** سواپ housekeeping: PENDING_PAYMENTِ >۳۰روز → status CANCELLED (یا delete با سیاست نگه‌داشت). est: 1h.

## COM-415 — کنسل سفارش مهمان (userId=null) توسط مشتری ممکن نیست
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `cancel/route.ts:21,39` (نیاز به session + order.userId)
- **Description:** سفارش مهمان فقط با publicRef/track دیده می‌شود؛ انصراف = تماس با پشتیبانی. قابل‌قبول برای لانچ؛ فقط باید در صفحهٔ track متن راهنما باشد. (guest checkout مجاز است — verified.)

---

### نقاط قوت تأییدشدهٔ Commerce (فهرست)
1. **قیمت‌گذاری server-authoritative:** هر payload سبد کل قیمت/موجودی را سمت سرور بازمحاسبه می‌کند (`cart.ts:122-207`)؛ قیمت کلاینت هرگز مصرف نمی‌شود.
2. **TOCTOU checkout (حکم کلی: به‌درستی مهار شده):** داخل `$transaction` قیمت زندهٔ variant دوباره خوانده و با قیمتِ پرامو-آگاه مقایسه می‌شود (`checkout/route.ts:231-248`)؛ هر drift → خطای PRICE_CHANGED و abort کامل tx → پاسخ 409 برای retry.
3. **کسر موجودی اتمیک:** `updateMany` گارددار `stock ≥ qty` داخل همان tx؛ miss → OUT_OF_STOCK و rollback کل سفارش (خط ۳۴۲-۳۴۸). روی SQLite تک‌نویسنده، oversell مسدود است.
4. **کلاه مصرف کد تخفیف:** increment گارددار `timesUsed < maxRedemptions` داخل tx → loser با DISCOUNT_EXHAUSTED abort می‌شود (خط ۳۵۳-۳۶۶).
5. **سقف refund:** مسیر OWNER سقف را داخل tx از ردیف‌های SUCCEEDED بازمحاسبه می‌کند + `SELECT … FOR UPDATE` روی Postgres (refund/route.ts:46-63).
6. **سفارش اقلام immutable:** snapshot کامل عنوان دوزبانه/sku/isbn/cover/قیمت واحد در OrderItem (خط ۲۸۱-۲۹۷)؛ تغییر محصول بعدی روی سفارش اثر ندارد.
7. **fail-closed درگاه پرداخت:** production بدون PAYMENT_PROVIDER → 503؛ هر provider غیر SANDBOX → 503 (خط ۱۱۷-۱۲۴) — probing زنده هم این را تأیید کرده (worklog P0-r1).
8. **PCI-safe:** فقط brand+last4 ذخیره می‌شود؛ شمارهٔ کامل هرگز persisted نیست (خط ۲۹۹-۳۱۲).
9. **publicRef غیرقابل‌حدس (۱۲۰bit) + عدم افشا:** track عمومی با PR- بدون email؛ mismatch == not-found (S9)؛ rate limit 10/min/IP؛ giftMessage از پاسخ عمومی حذف شده (orders/[orderNumber]/route.ts).
10. **safeTrackingUrl:** فقط https?:// بدون `{{}}`؛ ساختن URL فقط برای carrier allowlist با encodeURIComponent (ship/route.ts:19-31).
11. **سبد مهمان:** توکن random ۲۴بایت، httpOnly+SameSite=lax+secure-in-prod (cart.ts:56-65)؛ SEC-005: مسیرهای GET ردیف/کوکی نمی‌سازند.
12. **merge مهمان→کاربر روی هر ۳ مسیر ورود** (login/register/google) با clamp به stock+MAX_QTY_PER_ITEM=10 و حذف سبد مهمان؛ سمت سرور اعمال می‌شود.
13. **purge اقلام کهنه:** variant غیرفعال/محصول unpublish از سبد پاک می‌شود (cart.ts:131-140) → خرید کالای غیرمنتشر ممکن نیست.
14. **Buchpreisbindung:** fixedPrice هرگز با پرامو تخفیف نمی‌گیرد + کف قیمت €1.00 (promotions.ts:28,63-81)؛ پراموی تکی-فعال با switch خودکار (admin/promotions/route.ts:75-78).
15. **سازگاری مالی دادهٔ واقعی:** ۳/۳ سفارش — `total = subtotal−discount+shipping+giftwrap` و `tax=round(total·10/110)` برقرار؛ صفر منفی/صفر-total (evidence/3d-db-money-math.txt).
16. **دبل‌سابمیت:** کلاینت `placing` + idempotencyKey per-attempt (CheckoutView.tsx)؛ سرور replay 15min (تک‌نود).
17. **consent snapshot + AuditLog/OrderEvent** در همان tx سفارش (checkout/route.ts:314-338).
18. **خارج‌کردن mail از tx:** MailMessage بعد از commit صف می‌شود؛ شکست mail سفارش پرداخت‌شده را برنمی‌گرداند (خط ۴۳۵-۴۳۹).
19. **خوش‌رفتاری checkout quote:** پیش‌نمایش نرم (کد نامعتبر = بدون تخفیف)، اعتبارسنجی قطعی فقط در POST.
20. **روی‌هم‌پوشانی مرجوعی:** جلوگیری از درخواست موازی روی همان قلم‌ها (returns/route.ts:77-84) — البته با gap سقف تجمیعی و بن‌بست ادمین (COM-401).

**حکم TOCTOU (خواستهٔ صریح پروتکل):** ✅ مهارشده — قیمت/پرامو داخل tx باز-تأیید، کسر موجودی شرطی اتمیک، کلاه تخفیف گارددار. ریسک oversell زیر همروندی SQLite عملاً صفر است (سریال‌شدن نوشتن‌ها)؛ فقط SQLITE_BUSY زیر فشار موازی است که DB-402 (نبود WAL) آن را پیش می‌کشد.

---

# بخش ۲ — DevOps / SRE / آمادگی تولید (یافته‌های OPS-401..OPS-416)

## OPS-401 — CI به‌طور مؤثر مرده است (ترکیب با حفره‌های پوشش: build/push ایمیج و deploy وجود ندارد)
- **Severity:** High · **Status:** VERIFIED (ارجاع) · **Confidence:** High
- **File+line:** `.github/workflows/ci.yml:34,36` (QA-401)؛ inventory خط ۵۴-۱۰۹.
- **Description:** طبق QA-401 بایت‌های تریگر `branches: ain]` است → هیچ gate (typecheck/lint:ci/routes/migrate-deploy/build/smoke/bun-audit blocking) اجرا نمی‌شود. علاوه بر آن در «آنچه باید باشد» غایب است: **no docker image build/push، no deploy/release job، no artifact retention**. پس حتی با رفع تریگر، خروجی CI فقط «تست سبز» است و مسیر artifact→registry→host دستی و per-runbook است (docs §2.1).
- **Impacts:** هیچ gate خودکاری بین commit و production نیست.
- **Fix:** (۱) رفع تریگر (QA-401)؛ (۲) job جدا با `docker/build-push-action@v6` + cache gha + push به GHCR با tag=sha و latest-on-tag؛ (۳) اختیاری deploy job با environment:production و manual approval. est: 0.5d.

## OPS-402 — Live DB بیرون مدیریت migration است؛ مستندات PG ادعای خلاف دارد
- **Severity:** High · **Status:** VERIFIED (ارجاع QA-402/DB-401 + drift مستند) · **Confidence:** High
- **File+line:** docs/postgres-migration.md:3-5 («step 0 DONE … migrate status clean») در برابر واقعیت runtime (2-a: exit 1، 0/5 applied، جدول `_prisma_migrations` غایب).
- **Description:** روی DB فعلی `migrate deploy` runbook (production-deploy.md §2.3 و restore §4.2) fail می‌شود. مستندات باید «باید» را توصیف کند ولی اینجا «هست» را غلط گزارش می‌کند.
- **Fix:** `prisma migrate resolve --applied` برای زنجیرهٔ موجود (یک‌بار) + اصلاح ادعای doc. est: 30m + تست.

## OPS-403 — اسنیپت cron در runbook هدر غلط دارد → 403 ابدی و مرگ خاموش housekeeping/mail در production
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `docs/production-deploy.md:119` (`-H "x-cron-secret: $CRON_SECRET"`) در برابر `src/app/api/cron/tick/route.ts:30-33` (`Authorization: Bearer`).
- **Description:** کپی‌پیست verbatim دستور §3 → هر tick پاسخ 403 FORBIDDEN و چون `curl -fsS … >/dev/null` است، خطا بی‌صدا قورت داده می‌شود: پاک‌سازی session/cart، scheduled publishing (BUG-005)، dispatch ایمیل و digest هفته‌ای هرگز اجرا نمی‌شوند. (جالب: کامنت همان خط ادعا می‌کند «exact header name per the implementation».)
- **Impacts:** in prod: outbox انباشته، محصولات SCHEDULED هرگز منتشر نمی‌شوند، سواپ‌ها نمی‌دوند.
- **Fix:** اصلاح runbook به `-H "Authorization: Bearer $CRON_SECRET"` + بهتر: tick پاسخ ۴۰۳ را در خروجی cron لاگ کند (mail به ادمین). est: 15m.
- **Acceptance test:** اجرای دستور مستند با CRON واقعی → `{"ok":true}`.

## OPS-404 — Observability = صفر (بدون error tracking/metrics/alerting/request-log)
- **Severity:** High (برای لانچ) · **Status:** VERIFIED · **Confidence:** High
- **File+line:** grep سراسری `sentry|datadog|newrelic|prometheus|pino|winston|opentelemetry` → فقط ارجاع مستند در production-deploy.md:201؛ تنها `console.error` پراکنده (۲-d: ۳ site)؛ `dev` لاگ = `tee dev.log` (package.json:6) متنی و unrotated.
- **Description:** تنها سیگنال سلامت `/api/healthz` است (`{ok,db,latencyMs}` — probe زنده تأیید). ۵۰۰ها/کندی/خطای checkout برای اپراتور نامرئی‌اند؛ هیچ uptime check و alert نیست. خود پروژه این را در §7 runbook صادقانه گپ می‌داند.
- **Fix (حداقلی):** Sentry (client+server, DSN از env) + uptime خارجی روی /api/healthz + لاگ ساختاریافته JSON با یک wrapper کوچک. est: 0.5-1d.

## OPS-405 — ایمیج Docker هرگز build نشده (review-only)؛ docker-compose هم ندارد
- **Severity:** Medium · **Status:** VERIFIED (اعلام داخل خود فایل) · **Confidence:** High
- **File+line:** `Dockerfile:13-16` (⚠ VERIFIED BY REVIEW ONLY)؛ ریشهٔ پروژه: بدون `docker-compose*.yml`.
- **Description:** Dockerfile کیفیت خوبی دارد (multi-stage، frozen-lockfile، standalone، USER node، HEALTHCHECK روی healthz، EXPOSE) اما هیچ‌گاه build/اجرا نشده؛ قدم اول deploy یک smoke build بیرون sandbox است (runbook §2.1). binaryTargets musl در schema پوشش داده شده (توضیح خط ۵۴-۵۷). نبود compose مشکلی نیست ولی تکرارپذیری run را پایین می‌آورد.
- **Fix:** build + run + `curl healthz` + probe of `/images/...` و uploads volume write در یک ماشین با Docker؛ اختیاری compose دو-سرویسی (web+caddy). est: 0.5d.

## OPS-406 — Backup فقط DB است؛ uploads بکاپ ندارد و restore drill هرگز اجرا نشده
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `scripts/backup-db.sh` (کیفیت خوب: online .backup، quick_check، gzip، retention 90d)؛ `scripts/restore-db.sh` (integrity_check، atomic rename، FORCE guard)؛ `docs/production-deploy.md:127-162`.
- **Description:** خروجی بکاپ فقط فایل DB است — `/uploads` (جلدها/تصاویر آپلودی که coverUrl سفارش‌ها به آن اشاره می‌کنند) روی volume جدا می‌ماند و بدون rsync/restic خارج-هاست گم می‌شود. آفلاین‌ بودن نسخه/رمزنگاری به توصیهٔ doc واگذار شده (بدون enforce). drill ماهانه «mandated» است ولی هیچ شاهد اجرا وجود ندارد. RPO 24h/RTO 1h هدف‌گذاری شده و با cron روزانه سازگار است (cron ثبت نشده — فقط نمونه).
- **Fix:** tar/restic دوره‌ای روی volume uploads + off-host؛ تست restore واقعی و ثبت شواهد (log + hash). est: 0.5d + drill.

## OPS-407 — Graceful shutdown وجود ندارد (بدون SIGTERM handler)
- **Severity:** Medium · **Status:** VERIFIED · **Confidence:** High
- **File+line:** grep `SIGTERM|SIGINT|process.on` در src → ۰ نتیجه؛ CMD ایمیج `node server.js` (Dockerfile:81)؛ docker stop پیش‌فرض 10s.
- **Description:** هنگام redeploy، in-flight requests (مثلاً یک checkout در میانهٔ tx) قطع می‌شوند. روی SQLite تراکنش نیمه‌کاره rollback می‌شود (آسیب داده نمی‌بیند) اما UX قطع می‌شود؛ **با PSP واقعی** سناریوی «کارت شارژ شد، process مرد قبل از persist سفارش» پیش می‌آید و reconciliation لازم می‌شود.
- **Fix:** `process.on('SIGTERM')` → server.close() + timeout 10-15s (در standalone با custom server یا پرچم graceful در نسخه‌های جدید Next بررسی شود) + `stop_grace_period` در docs. est: 0.5d.

## OPS-408 — فهرست مفروضات تک-نود (چه چیزی در scale-out می‌شکند)
- **Severity:** Medium (سند + پذیرش) · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `rate-limit.ts:4` (Map per-process)؛ `checkout/route.ts:62` (idempotencyCache per-process)؛ `mail-dispatch.ts:35-37` (transport singleton per-process)؛ `housekeeping.ts:12,21` (lastSweepAt globalThis)؛ `db.ts:5-28` (Prisma global)؛ session در DB ✅؛ newsletter HMAC stateless ✅.
- **Description:** پشت ۲+ اینستنس: سقف rate-limitها ×N ضرب می‌شود (بای‌پس نسبی)، **idempotency replay از بین می‌رود → دابل‌سفارش روی retry شبکه** (خطرناک‌ترین آیتم)، housekeeping چندبار می‌دود (عملیات idempotent deleteMany/updateMany — بی‌خطر ولی digest/notify باید DB-guard بمانند)، SQLite اصلاً shareable نیست. این دقیقاً همان سقف مستند §6 runbook است — سازگار با هدف تک-نود فعلی.
- **Fix (post-launch):** Redis/DB-store برای rate-limit + idempotency (کلید per-visitor — API-407) قبل از هر scale-out؛ مسیر Postgres در docs/postgres-migration.md آماده است (schema portable؛ raw SQL تنها `SELECT 1` و `FOR UPDATE` گارددار postgres-only — verified).

## OPS-409 — SQLite بدون WAL/tuning (ارجاع DB-402) → ریسک SQLITE_BUSY در برست checkout
- **Severity:** Low · **Status:** VERIFIED (ارجاع) · **Confidence:** High
- **File+line:** 2-b: journal_mode=delete؛ db.ts بدون هیچ PRAGMA.
- **Description:** زیر همروندی نوشتن موازی (checkout + upload + session-write) `SQLITE_BUSY` ممکن است به 500 ترجمه شود. پرچم پایین‌نگه‌داشتن نویسنده‌ها در لانچ کوچک کافی است؛ WAL + busy_timeout ارزان و مؤثر است.
- **Fix:** `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` در یک اسکریپت startup. est: 1h.

## OPS-410 — resource limits / process manager / log rotation تعریف نشده
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** docs §2.2 (فقط `--restart unless-stopped`)؛ بدون `--memory/--cpus`، بدون systemd unit نمونه برای app (فقط Caddy systemd ذکر)، لاگ prod بدون policy.
- **Fix:** افزودن `--memory=1g --cpus=1` به runbook + logrotate/docker logging driver (max-size/max-file). est: 1h.

## OPS-411 — سیاست به‌روزرسانی وابستگی‌ها: gate وجود دارد ولی مرده؛ bun unpinned؛ بدون اتوماسیون
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** ci.yml:104-109 (`bun audit --production` blocking — طراحی درست) ولی CI مرده (OPS-401)؛ `bun-version: latest` (QA-406)؛ بدون dependabot/renovate config.
- **Fix:** پین bun + فعال‌سازی dependabot (bun.lock) بعد از رفع CI. est: 1h.

## OPS-412 — Caddy production template درست است اما deploy/تأیید نشده
- **Severity:** Informational · **Status:** VERIFIED (کد) / UNVERIFIED (اجرا) · **Confidence:** High
- **File+line:** `deploy/Caddyfile.production` — TLS/ACME خودکار، HSTS 1y+includeSubDomains (بدون preload — عاقلانه)، nosniff/Referrer-Policy/Permissions-Policy، `-Server`، `admin off`، encode zstd/gzip، تفکیک مالکیت هدرها با next.config.ts (CSP/X-Frame-Options عمداً فقط در اپ).
- **Description:** الگوی خوب؛ ولی هیچ host واقعی با آن اجرا نشده (HTTPS/HSTS در عمل UNVERIFIED). Caddyfile ریشه عمداً HTTP:81 sandbox است و تلهٔ `?XTransformPort=` با کامنت واضح منع شده.
- **Fix:** بخشی از smoke اولین deploy (curl -sI | grep strict-transport-security — در runbook §2.5 هست).

## OPS-413 — مدیریت secrets بالغ است (سند + اسکریپت + چرخش)
- **Severity:** Informational (قوت) · **Status:** VERIFIED · **Confidence:** High
- **File+line:** `.env.example` (ماتریس کامل متغیرها با الزام/پیش‌فرض امن)؛ production-deploy.md §1 و §8 (env-file 600، ممنوعیت commit، rotate بعد از purge، rewrite-git-history.sh)؛ DEV_EXPOSE_RESET_LINK گارد development-only (2-c/2-d تأیید قبلی).

## OPS-414 — RPO/RTO هدف‌گذاری شده ولی اثبات اجرای drill وجود ندارد
- **Severity:** Informational · **Status:** UNVERIFIED (اجرا) · **Confidence:** High (نبود شواهد)
- **File+line:** production-deploy.md:129 (`RPO 24h · RTO 1h`)، §4.2 drill ماهانه؛ هیچ log/hash/screenshot از اجرا در repo نیست.

## OPS-415 — جدا سازی محیط‌ها: منطق fail-closed خوب؛ خطر پیکربندی دستی باقی است
- **Severity:** Low · **Status:** VERIFIED · **Confidence:** High
- **File+line:** checkout/route.ts:117-124 (SANDBOX در prod فقط به‌عنوان override صریح)، healthz SEC-015 (ops default 0 در prod)، DEV_EXPOSE guards، allowedDevOrigins dev-only (next.config.ts:47-51).
- **Description:** هر متغیر «دامنی» به‌سوی dev-default امن رفته است؛ آنچه باقی می‌ماند خطای اپراتور است (مثلاً PAYMENT_PROVIDER=sandbox در prod برای «تست» جا بماند → سفارش واقعیِ جعلی). توصیه: alert روی وجود SANDBOX در prod (خط startup warning) + environment separation در CI/registry tags.

## OPS-416 — کامنت Dockerfile از رفتار قدیمی healthz می‌گوید (drift داخلی)
- **Severity:** Informational · **Status:** VERIFIED · **Confidence:** High
- **File+line:** Dockerfile:75-78 («healthz currently also drives lazy housekeeping») در برابر healthz/route.ts (SEC-015: prod پیش‌فرض pure probe).
- **Fix:** یک‌خطی: کامنت را با HEALTHZ_OPS=0 پیش‌فرض prod هم‌تراز کنید. est: 5m.

---

### نقاط قوت تأییدشدهٔ DevOps (فهرست)
1. Dockerfile چندمرحله‌ای تمیز: frozen-lockfile، prisma generate قبل از build، standalone، non-root (USER node)، HEALTHCHECK واقعی، bind 0.0.0.0 مستند.
2. `output: "standalone"` + build script که static/public را داخل standalone کپی می‌کند — سازگار با ایمیج.
3. Production Caddyfile template با مرزبندی مالکیت هدر (تکرار CSP نکردن — جلوگیری از intersection headers).
4. امن‌سازی probes: healthz در prod pure (SEC-015) و scheduler جدا با CRON_SECRET + timing-safe compare.
5. cron/tick: re-run بی‌خطر (گارد 6h داخل housekeeping؛ dispatch و digest با freshness guard) — «missed run» فقط به تأخیر ۱۰دقیقه‌ای می‌رسد.
6. backup/restore scripts با integrity check دوطرفه (quick_check در بکاپ، integrity_check در restore)، retention، atomic rename، FORCE guard.
7. Runbook واقعاً قابل‌اجرا: ماتریس env، ترتیب deploy، backup قبل از migrate، smoke check، rollback tag-based و مسیر بازگشت با بکاپ، سقف SQLite صادقانه مستند.
8. نقشهٔ مهاجرت Postgres با type-mapping caveats و «db push ban» — schema portable تأیید (بدون raw SQL وابسته به SQLite؛ FOR UPDATE فقط روی postgres URL).
9. session در DB (scale-out-safe) و HMAC newsletter بدون state.
10. .env.example بی‌نقص به‌عنوان قرارداد پیکربندی؛ هیچ secret در کد (2-a/3 قبلی).

### فهرست Cron / Scheduler (خواستهٔ صریح)
| ورودی | محافظ | کاری که می‌کند | idempotent؟ |
|---|---|---|---|
| `GET /api/cron/tick` | CRON_SECRET Bearer (403 DISABLED اگر unset) | runHousekeeping + dispatchQueuedMails(20) + queueSalesDigestIfDue | بله (گارد زمانی + گارد داده) |
| `GET /api/healthz` (prod: بدون side-effect) | عمومی | فقط SELECT 1 + latency | بله |
| Housekeeping (داخل tick، گارد ۶ساعت per-process) | — | حذف session منقضی ۷d، ABANDON سبد مهمان ۶۰d، حذف سبد خالی ۷d، حذف token/throttle منقضی، حذف mail sent ۳۰d، انتشار SCHEDULED سررسید | بله (deleteMany/updateMany شرطی) |
| Mail dispatch | SMTP_* env | ۱۰-۲۰ ردیف MailMessage قدیمی‌ترین؛ شکست per-mail؛ بدون dead-letter/attempt cap | نیمه (ردیف تا موفقیت دوباره تلاش می‌شود) |
| Sales digest | — | هفتگی با freshness guard | بله |
| trigger بیرونی | سند §3 (هر ۱۰min) — ⚠ هدر غلط OPS-403 | — | — |
| نبودها | پاک‌سازی PENDING_PAYMENT (COM-414)، restock-automation برای back-in-stock (COM-402)، پردازش Return (COM-401) | — | — |

### Checklist آمادگی Production (خواستهٔ §14)
| # | آیتم | وضعیت | توضیح یک‌خطی |
|---|---|---|---|
| 1 | Deploy pipeline (CI→build→deploy) | **FAIL** | CI مرده (QA-401) + job ایمیج/deploy وجود ندارد (OPS-401) |
| 2 | TLS | **PARTIAL** | template آماده (ACME) — deploy نشده/تأیید نشده |
| 3 | HSTS | **PARTIAL** | در template (1y+subdomains) — فعال نشده |
| 4 | Secrets management | **PASS** | .env.example + runbook چرخش + scripts؛ env-file 600 |
| 5 | Migration deployment | **FAIL** | DB زنده unbaselined (QA-402/DB-401) → migrate deploy fail؛ runbook درست است ولی روی «هست» فعلی اجرا نمی‌شود |
| 6 | Rollback plan | **PASS** | tag-based + مسیر backup؛ مستند و سازگار |
| 7 | Blue/green | **FAIL** | تک-کانتینر، قطعی در redeploy (قابل‌قبول برای لانچ کوچک) |
| 8 | Backup | **PARTIAL** | DB فقط؛ uploads/افلاین/رمزنگاری نه؛ cron ثبت نشده |
| 9 | Restore drill | **FAIL** | هرگز اجرا نشده؛ شاهد صفر |
| 10 | Monitoring | **FAIL** | فقط healthz؛ هیچ metrics/uptime |
| 11 | Error tracking | **FAIL** | Sentry/… صفر |
| 12 | Alerting | **FAIL** | هیچ |
| 13 | Log rotation | **FAIL** | tee dev.log متنی؛ policy prod ندارد |
| 14 | Dependency update policy | **PARTIAL** | bun audit blocking (طرح درست) ولی مرده؛ bun unpinned؛ بدون dependabot |
| 15 | Resource limits | **FAIL** | بدون memory/cpu caps و systemd/limits |
| 16 | Autoscaling | **FAIL** | تک-نود by design؛ scale-out الان ممنوع (OPS-408) — بلوکر لانچ نیست |
| 17 | Cache/CDN | **PARTIAL** | immutable /images؛ بدون CDN/edge cache؛ HTML همه force-dynamic |
| 18 | Object storage | **FAIL** | uploads روی volume به‌عنوان پل؛ S3/CDN نیست |
| 19 | DR (disaster recovery) | **PARTIAL** | سند+اسکریپت‌ها خوب؛ تست نشده؛ uploads gap |
| 20 | RPO/RTO | **PARTIAL** | هدف 24h/1h مستند؛ تحقق (cron/drill) اثبات‌نشده |

**جمع:** PASS=2 · PARTIAL=7 · FAIL=11 · UNVERIFIED=0 (اجراهای فعال‌تر: TLS/HSTS/image-build به‌عنوان UNVERIFIED-of-execution داخل PARTIAL/Medium لحاظ شد)

---

## ۱۵. Go / No-Go صریح

### حکم: **NO-GO** برای production امروز (با ۷ بلوکر؛ ۳ تا از آن‌ها متعلق به تسک‌های دیگر است و اینجا فقط ارجاع می‌شود)

| # | بلوکر | Severity | مالک/ارجاع |
|---|---|---|---|
| B1 | PSP واقعی سیم‌کشی نشده → checkout در prod 503 (طراحی fail-closed درست است؛ لانچ بدون فروش ممکن نیست) | Critical | COM-001 قبلی / runbook §7 |
| B2 | CI مرده (QA-401) — هیچ gate بین commit و prod | High | 2-a |
| B3 | Live DB بیرون migration management (QA-402/DB-401) — runbook deploy/restore می‌شکند | High | 2-a/2-b |
| B4 | Observability صفر (OPS-404) — سفارش‌های شکسته/ایمیل‌های نرسیده نامرئی‌اند | High | این گزارش |
| B5 | Restore drill/تست ایمیج انجام نشده (OPS-405/406/414) | High | این گزارش |
| B6 | بازپرداخت/مرجوعی بدون مسیر عملیاتی (COM-401) + back-in-stock بی‌اثر (COM-402) | High/Medium | این گزارش |
| B7 | cron runbook هدر غلط → housekeeping/mail در prod بی‌صدا نمی‌دوند (OPS-403) | Medium | این گزارش |

### حداقل اقدامات پیش از go-live (مسیر کوتاه، ~۵-۷ روز کاری)
1. **PSP:** انتخاب درگاه + سیم‌کشی در seam موجود (`simulatePayment` → provider adapter) + webhook path با امضا و «who can set PAID» (فقط webhook تأییدشده) — 3-5d.
2. **رفع QA-401** (یک‌خطی تریگر) و **QA-402/DB-401** (migrate resolve baseline) — 1h.
3. **Sentry + uptime check + اصلاح هدر cron در runbook** (OPS-403/404) — 0.5d.
4. **build+smoke ایمیج، drill کامل restore، cron واقعی** (OPS-405/406) — 0.5d.
5. **`admin/returns` حداقلی** (approve/reject + restock/refund با الگوی cancel ادمین) و **cap customerNote** (COM-401/404) — 1d.
6. WAL+busy_timeout، resource limits، logrotate — 0.5d.

### بک‌لاگ پس از go-live (اولویت‌دار)
- Redis/DB-store برای rate-limit + idempotency (با scope per-visitor — API-407/COM-405) قبل از هر افق‌گشایی دومین اینستنس.
- S3/CDN برای uploads (OPS-003 پل فعلی)، ISR/output caching (PERF-002)، Postgres cutover (docs آماده)، HSTS preload پس از ممیزی زیردامنه.
- ATOM/REST fapiao رسمی و VAT بر zone (COM-407)، اتوماسیون back-in-stock (COM-402)، پاک‌سازی PENDING_PAYMENT (COM-414)، dependabot + پین bun (OPS-411)، blue/green با healthcheck-based switch.
- drill ماهانهٔ restore به‌صورت تقویمی با ثبت شواهد (OPS-414).

### Cross-references (بدون باز-اشتقاق)
QA-401/402 (2-a) · DB-401/402/407 (2-b) · API-402/405/407 (2-c) · ARCH-401/408 (2-d) · COM-001/PSP و SEC-014 (audit v2) · B1-B5 roadmap (worklog AUDIT3-fix).

---

*گزارش پایان — 3-d · evidence: audit-output/evidence/3d-runtime-probes.log، 3d-db-money-math.txt · هیچ write روی سورس/DB زنده انجام نشد.*
