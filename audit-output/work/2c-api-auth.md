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
