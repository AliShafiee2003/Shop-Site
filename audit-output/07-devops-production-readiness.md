# 07 — DevOps, SRE & Production Readiness Report

دامنه: فاز ۱۳ — CI/CD، تصویر Docker، بکاپ/restore، observability، hardening، مقیاس‌پذیری، cron؛ + چک‌لیست آمادگی (PASS=2/PARTIAL=7/FAIL=11) و Go/No-Go.
یادآوری: جزئیات زنجیرهٔ build/ابزار در work/2a-build-tests.md (فایل 01 شامل آن است).

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
