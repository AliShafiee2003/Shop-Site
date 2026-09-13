# گزارش ممیزی امنیتی Enterprise — Task 3-a (Phase 8: OWASP Top 10 / ASVS / API Top 10)

- **Agent:** Application Security Auditor · **Task ID:** 3-a · **Date:** 2026-09-13
- **Target:** /home/z/my-project (working tree = runtime truth) · Next.js 16 App Router, React 19, Prisma 6 + SQLite, dev server :3000 (caddy :81)
- **Commit:** 04cf388b7026650fc3d012f76763313681ce2303 @ main
- **Protocol:** AUDIT ONLY — صفر تغییر در سورس/دیتابیس/سرور. کلیدها/رمزها هرگز چاپ نشدند (فقط نوع + محل + نکات ساختاری). کاوش‌های runtime فقط read-only علیه localhost.
- **هماهنگی:** مطالب تکراری با 2-c عمداً گزارش نشد (auth matrix 403/401، rate-limit runtime، CSRF/Origin API-403، idempotency API-407، XFF API-409، unbounded admin lists API-405). ادعاهای worklog به‌عنوان lead در نظر گرفته و مستقلاً روی کد فعلی بازرستی شد.
- **Evidence:** `audit-output/evidence/3a-*.txt` (۱۲ فایل) + خوانش مستقیم کد با file:line.

---

## ۰) خلاصهٔ مدیریتی

پسورد سطح امنیتی پروژه **بالاتر از میانگین انتظار برای یک فروشگاه single-process** ارزیابی می‌شود: نشست‌ها (entropy ۲۵۶ بیت، hash-at-rest، چرخش روی ورود، idle-timeout)، توکن‌های one-time (همه hash-at-rest و single-use)، ضد-enumeration ورود/فراموشی رمز، OAuth state با HMAC+cookie، CSRF-safe CSP با nonce در production، آپلود با magic-byte و نام تصادفی، فیلدهای سفید‌فهرست‌شده در همهٔ writeها (بدون mass-assignment)، و re-auth برای عملیات حساس — همه در کد فعلی **تأیید** شدند.

هیچ یافتهٔ Critical/High در حوزهٔ اختصاصی این ممیزی یافت نشد. سه یافتهٔ Medium وجود دارد: (۱) باقی‌ماندن PII در MailMessage و AuditLog پس از erasure، (۲) literal رمز seed سوزانده‌شده که هنوز در تاریخچهٔ قابل‌دسترس main است (rotated شده؛ ریسک باقیمانده پایین)، (۳) بدهی به‌روزرسانی وابستگی‌ها (۴۳ advisory عمدتاً در زنجیرهٔ build/dev + dead dep `effect`، با gate audit در CI مرده — ارجاع QA-401).

| شدت | تعداد | شناسه‌ها |
|---|---|---|
| Critical | ۰ | — |
| High | ۰ | — |
| Medium | ۳ | SEC-401، SEC-402، SEC-403 |
| Low | ۷ | SEC-404..410، SEC-412 |
| Informational | ۵ | SEC-411، SEC-413، SEC-414، SEC-415، SEC-416 |

**UNVERIFIED:** رفتار production واقعی (nonce CSP در NODE_ENV=production، Secure cookieها، HSTS لبهٔ Caddy) چون فقط dev اجراست — مسیر prod با تست شبیه‌سازی‌شدهٔ worklog (SEC-003 قبلی) و خوانش کد پوشش داده شد؛ payload واقعی PSP webhook (پروایدر نصب نیست) و `bun update` (اقدام اصلاحی، خارج از محدودهٔ audit-only) اجرا نشد.

---

## ۱) پیدا کردن‌ها (Findings)

> قالب هر یافته: شناسه، عنوان، شدت، وضعیت، اطمینان، مکان، توضیح، ماشه، سناریوی سوءاستفاده، اثر، شواهد، روش رفع، زمان تقریبی رفع، ریسک رگرسیون، تست پذیرش.

---

### SEC-401 — باقی‌ماندن PII پس از حق فراموشی (GDPR erasure): MailMessage و AuditLog پاک نمی‌شوند
- **Severity:** Medium · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/app/api/account/deletion-request/route.ts:48-95` (فهرست کامل تراکنش پاک‌سازی) · `src/lib/server/order-mail.ts:52-100` (ساخت MailMessage با ایمیل و اقلام سفارش) · `src/app/api/auth/forgot-password/route.ts:47-49` (MailMessage حاوی توکن) · `src/lib/server/utils.ts:128-140` (audit → AuditLog) · نمونه‌های summary دارای ایمیل مشتری: `src/app/api/admin/customers/[id]/route.ts:147` و `:155` و `:174`
- **توضیح:** تراکنش erasure کاربر، Order/Address/Ticket/Review/Newsletter/Consent/BackInStock را پاک یا ناشناس می‌کند، اما دو مخزن PII جا می‌ماند: (۱) ردیف‌های **MailMessage** (outbox) که `to` برابر ایمیل واقعی است و `bodyText` حاوی ایمیل، شماره سفارش، اقلام، مبالغ و حتی توکن‌های one-time (reset/verify/change) است — نامه‌های ارسال‌نشده هرگز حذف نمی‌شوند و ارسال‌شده‌ها تا ۳۰ روز نگه‌داری می‌شوند (`src/lib/server/housekeeping.ts:50` فقط sentAt قدیمی‌تر از ۳۰ روز). (۲) ردیف‌های **AuditLog** که ایمیل مشتری داخل `summary` (مثل «Blocked user@…») و `actorEmail` ثبت شده و هیچ مسیر پاک‌سازی یا retentionای برای آن‌ها نیست.
- **ماشه:** POST /api/account/deletion-request با password درست.
- **سناریوی سوءاستفاده:** کاربر حسابش را پاک می‌کند؛ اپراتور/هرکس که بعداً به دامپ دیتابیس یا پنل ادمین (Outbox/AuditLog) دسترسی پیدا کند، همچنان ایمیل واقعی و جزئیات خرید/گفتگوهای پشتیبانی او را از MailMessage و AuditLog استخراج می‌کند → نقض ادعای «complete erasure» در پاسخ API (route.ts:101) و ریسک قانونی GDPR (Art. 17).
- **اثر فنی/کسب‌وکار:** انطباق GDPR ناقص؛ افشای PII در بکاپ‌ها؛ اعتماد کاربر.
- **شواهد:** خوانش کامل تراکنش (۸ گام، بدون هیچ گام MailMessage/AuditLog) + housekeeping 30-day-only برای MailMessage.
- **رفع:** در همان تراکنش: `db.mailMessage.updateMany({where:{to:email}, data:{to:'deleted-…@mails.invalid', bodyText:'[erased]'}})` یا حذف ردیف‌های erasureشده؛ برای AuditLog، summaryها را scrub یا policy retention (مثلاً ۱۸۰ روز) + حذف ایمیل از summaryهای جدید (به‌جای ایمیل، entityId کافی است).
- **زمان رفع:** ۲–۴ ساعت.
- **ریسک رگرسیون:** کم — فقط ردیف‌های همان email هدف؛ خطر شکستن پنل Outbox/AuditLog view اگر شکل ردیف‌ها تغییر کند → تست نمایش بعد از رفع.
- **تست پذیرش:** ثبت کاربر تستی → سفارش تستی → erasure → سپس `SELECT count(*) FROM MailMessage WHERE to=<email>` = 0 و `SELECT count(*) FROM AuditLog WHERE summary LIKE '%<email>%'` = 0.

---

### SEC-402 — literal رمز seed سوزانده‌شده هنوز در تاریخچهٔ git قابل‌دسترس (main) است
- **Severity:** Medium · **Status:** Confirmed · **Confidence:** High
- **File+line:** تاریخچهٔ git — commitهای `05f137b`، `0c01002`، `2631446`، `382b14e` (و ۶ commit دیگر) در مسیرهای `prisma/seed.ts`، `docs/production-deploy.md`، `scripts/rewrite-git-history.sh`؛ همه **ancestor of HEAD/main** (تأیید با `git merge-base --is-ancestor`).
- **توضیح:** پیام commit 382b14e مدعی «SEC-001: .env purged from history + rotation» است؛ .env هرگز tracked نبوده (تأیید شد — تنها `.env.example` در کل تاریخچه) اما literal رمز seed قدیمی (که در گزارش‌های قبلی لو رفته بود) در بلاب‌های تاریخی seed.ts/docs باقی است. Worklog به‌درستی آن را به‌عنوان «نیازمند force-push مالک ریپو» علامت خورده و **همچنان انجام نشده**. رمز مذکور rotated شده و در runtime مرده است (P0-r1: 401 برای رمز قدیمی — lead تأیید).
- **ماشه:** هرکس با clone ریپو: `git log -p -- prisma/seed.ts` یا `git rev-list --all | xargs git grep <literal>`.
- **سناریوی سوءاستفاده:** اگر همان رشته در محیط دیگری (staging، سرویس دیگر، ایمیل قدیمی) بازاستفاده شده باشد → ورود ادمین. حملهٔ credential-stuffing کراس-سرویس با رمز لو‌رفته.
- **اثر فنی/کسب‌وکار:** ریسک باقیمانده پایین (rotated) اما حیگین تاریخچهٔ ریپو تا rewrite برقرار است؛ هر fork/branch stale یک کپی دائمی است.
- **شواهد:** `evidence/3a-git-history-burned.txt` (فهرست commit+path، مقدار چاپ نشد) و `evidence/3a-git-reachability.txt` (YES reachable from HEAD).
- **رفع:** اجرای `scripts/rewrite-git-history.sh` (فیلتر repo) + force-push + ابطال force-pushهای قدیمی؛ مطمئن شوید هیچ سرویس دیگری آن رشته را استفاده نمی‌کند.
- **زمان رفع:** ۱–۲ ساعت (+ هماهنگی مالک).
- **ریسک رگرسیون:** متوسط — rewrite تاریخچه SHA همه را عوض می‌کند؛ cloneهای فعال باید re-clone شوند.
- **تست پذیرش:** بعد از rewrite: `git rev-list --all | xargs git grep -l <literal-prefix>` = خالی.

---

### SEC-403 — بدهی وابستگی‌ها: ۴۳ advisory (۳۰ high) عمدتاً در زنجیرهٔ build/dev؛ dead dep `effect` با advisory high؛ gate `bun audit` در CI مرده است
- **Severity:** Medium · **Status:** Confirmed (دادهٔ registry) · **Confidence:** High
- **File+line:** `package.json:52` (`effect` در dependencies — dead code طبق QA-407)، `:59` (postcss direct)، `:66` (recharts→lodash)؛ `.github/workflows/ci.yml:34,36` (triggers خراب — QA-402/401 در 2-a)؛ خروجی کامل: `evidence/3a-bun-audit.txt`.
- **توضیح:** `bun audit` (اجرا شد، exit=1): **43 vulnerabilities (30 high, 12 moderate, 1 low)**. تفکیک اثر عملیاتی:
  - **Runtime server:** هیچ advisory مستقیم روی `next@16.3.5`، `@prisma/client`، `nodemailer`، `sharp` ثبت نشد. پرچم‌های زنجیرهٔ prisma CLI (`deepmerge-ts`, `defu`, `effect`) فقط ابزار migrate/CLI را لمس می‌کنند نه server runtime.
  - **Runtime client:** `lodash` از طریق recharts (high: code injection در `_.template` — recharts از template استفاده نمی‌کند؛ moderate: prototype pollution در `_.unset/_.omit`) — قابل‌دسترس در باندل مرورگر ولی مسیر اکسپلویت با ورودی مهاجمان در این اپ برقرار نیست.
  - **Build/dev only:** postcss (high: path traversal sourceMappingURL — build-time)، nanoid، minimatch/picomatch (ReDoS)، brace-expansion، js-yaml، browserslist، flatted، ajv، @humanfs/node، @babel/core — همه از eslint/eslint-config-next/@tailwindcss/postcss.
  - **dead dep:** `effect` (direct، صفر import) خودش advisory high دارد (AsyncLocalStorage contamination) → یکی از معدود actionهای فوری: حذف.
- **ماشه:** `bun audit` / نصب CI.
- **سناریوی سوءاستفاده:** اکسپلویت مستقیم production امروز مسیر آماده ندارد؛ ریسک واقعی: (الف) انجماد روی نسخه‌های آسیب‌پذیر تا زمانی که آینده مسیر اکسپلویت باز شود، (ب) غفلت چون gate CI (که `bun audit` را blocking اجرا می‌کند) به‌خاطر trigger خراب هرگز اجرا نمی‌شود.
- **اثر فنی/کسب‌وکار:** supply-chain hygiene؛ شروع ممیزی‌های بعدی از یک baseline قرمز.
- **شواهد:** `evidence/3a-bun-audit.txt` (توزیع کامل package↔advisory).
- **رفع:** (۱) حذف `effect` از dependencies؛ (۲) `bun update` (semver-compatible) برای پاک‌سازی بخش عمدهٔ dev chain؛ (۳) رفع trigger ci.yml (QA-401) تا `bun audit --frozen-lockfile` دوباره blocking شود؛ (۴) دوره‌ای: `bun update --latest` با تست دستی برای majorها.
- **زمان رفع:** ۲–۵ ساعت (شامل رفع CI).
- **ریسک رگرسیون:** متوسط برای `bun update` (tailwind/postcss اکوسیستم پرنوسان) → build+smoke بعد از آپدیت.
- **تست پذیرش:** `bun audit` با ۰ خطای high در زنجیرهٔ runtime، و triggerهای ci.yml روی push واقعی فایر می‌شوند.

---

### SEC-404 — کانال جانبی زمانی در login: تأخیر ~۵۰ms ایمیل موجود را لو می‌دهد
- **Severity:** Low · **Status:** Confirmed (اندازه‌گیری runtime) · **Confidence:** High
- **File+line:** `src/app/api/auth/login/route.ts:44-48` — verifyPassword (scryptSync ~50ms) فقط وقتی user/passwordHash وجود دارد اجرا می‌شود؛ مسیر «کاربر نیست» مستقیم 401 برمی‌گردد.
- **توضیح:** پاسخ‌ها (status+بدنه) برای ایمیل موجود/ناموجود یکسان‌اند (تأیید runtime: هر دو `401 {"error":"INVALID_CREDENTIALS",…}`)، اما زمان پاسخ به‌طور پایا متمایز است: موجود=0.065s، ناموجود=0.014s (نمونه‌ی تک‌درخواستی؛ دلتا ≈ هزینهٔ scrypt). دقت کندی شبکه در production پایین می‌آید ولی با چند نمونه در هر آدرس، آماری قابل استخراج است.
- **ماشه:** POST /api/auth/login با password اشتباه روی آدرس‌های candidate و مقایسهٔ p50/p90 زمان.
- **سناریوی سوءاستفاده:** حمله‌گر فهرست ایمیل‌ها را فیلتر می‌کند و فقط عضوهای موجود را برای فیشینگ هدف‌گیری می‌کند (بازار فروش لیست confirmed).
- **اثر:** نقض تضمین S9 در لایهٔ زمانی (نه محتوایی).
- **شواهد:** `evidence/3a-enumeration-probe.txt` (۲ درخواست؛ دلتا ۴.۵×).
- **رفع:** برای ایمیل ناموجود، یک scrypt دامی روی رشتهٔ ثابت اجرا شود (dummy verify) تا هر دو مسیر ~هم‌هزینه شوند.
- **زمان رفع:** ۱ ساعت.
- **ریسک رگرسیون:** خیلی کم (فقط مسیر ناموجود کمی کندتر می‌شود).
- **تست پذیرش:** p95 زمان پاسخ موجود/ناموجود در حد <20٪ اختلاف.

---

### SEC-405 — لبهٔ open-redirect در `next` جریان OAuth: کاراکتر `\` رد نمی‌شود
- **Severity:** Low · **Status:** Likely (code-verified؛ اجرای runtime ممکن نشد چون OAuth unconfigured) · **Confidence:** Medium
- **File+line:** `src/app/api/auth/google/start/route.ts:34` — فقط `startsWith('/') && !startsWith('//')`؛ `src/lib/server/google.ts:115` — در verify فقط `startsWith('/')`؛ `src/app/api/auth/google/callback/route.ts:34-41` — `Location: ${target}?welcome=google`.
- **توضیح:** مسیرهای protocol-relative (`//evil.com`) رد می‌شوند، اما `/\evil.com` هر دو گارد را رد می‌کند در حالی‌که WHATWG URL parser در special schemes `\` را معادل `/` می‌گیرد → `Location: /\evil.com?welcome=google` مرورگر را به `//evil.com` می‌برد.
- **ماشه:** قربانی روی `/api/auth/google/start?next=/\evil.com` کلیک کند؛ state سالم تولید و در callback همان next بازگردانده می‌شود.
- **سناریوی سوءاستفاده:** فیشینگ پس‌از-لاگین: کاربر پس از OAuth به دامنهٔ مهاجم redirect می‌شود با `?welcome=google` (نشانهٔ اعتبار). فقط پس از موفقیت OAuth فعال است (نیاز به حساب Google واقعی برای قربانی)، پس اثر محدود به phishing و ابقا نسبت به گارد فعلی ≈ صفر برای `//` ولی این کلاس دور زدن است.
- **شواهد:** خوانش کد؛ اجرای full-dance نیاز به GOOGLE_CLIENT_ID دارد که در .env نیست (503 تأیید شد).
- **رفع:** شرط را به regex سفت کنید: `/^\/(?!\/)/` و هم‌چنین حذف یا encode همهٔ `\` (مثل `!next.includes('\\')`) در هر دو نقطه (start + google.ts verify).
- **زمان رفع:** ۳۰ دقیقه.
- **ریسک رگرسیون:** صفر تقریباً.
- **تست پذیرش:** `start?next=/\evil.com` → 302 به Google ولی state حاوی next تعریف‌نشده (undefined) و در نهایت redirect به /account.

---

### SEC-406 — ناسازگارجهٔ precedence origin در redirect_uri OAuth: `APP_URL` فقط، بدون `NEXT_PUBLIC_SITE_URL`
- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** Medium
- **File+line:** `src/lib/server/google.ts:52-58` در برابر `src/lib/site.ts:10` — site.ts هر دو env را می‌خواند و در production بدون هیچ‌کدام fail-fast می‌کند؛ google.ts فقط `APP_URL` را می‌خواند و در نبودش به `x-forwarded-host/proto` اتکا می‌کند.
- **توضیح:** سناریوی prod مجاز: اپراتور فقط `NEXT_PUBLIC_SITE_URL` را ست کرده و `APP_URL` را خالی گذاشته (هر دو در .env.example توضیح داده شده‌اند که «either is enough») → site.ts راضی است ولی googleRedirectUri به هدرهای client-controlled می‌افتد. اثر عملی محدود است چون Google فقط redirect_uriهای ثبت‌شده در Console را می‌پذیرد (پویش هدر توسط مهاجم → 400 از Google)، اما الگوی «اعتماد به هدر در prod» همان چیزی است که SEC-002 در site.ts حذف کرد.
- **سناریوی سوءاستفاده:** در سناریوهایی که دامنهٔ حقیقی روی Console wildcard/پذیرا ثبت شده باشد، Host poisoning می‌تواند جریان را به origin مهاجم بکشاند؛ همچنین در callback ناسازگاری redirect_uri با start → خطای exchange.
- **رفع:** `googleRedirectUri` هم `NEXT_PUBLIC_SITE_URL` را بخواند و در production بدون env فاقد هدر fallback بیفتد (fail-fast مثل site.ts).
- **زمان رفع:** ۳۰ دقیقه. · **ریسک رگرسیون:** کم (sandbox بدون envها همچنان با هدر کار می‌کند اگر فقط dev باشد).
- **تست پذیرش:** production-sim: بدون APP_URL، هدر X-Forwarded-Host جعلی → start باید 503/خطای origin بدهد نه ساخت redirect_uri از هدر.

---

### SEC-407 — کوکی state جریان OAuth (`sp_g_state`) فلگ `Secure` ندارد (حتی production)
- **Severity:** Low · **Status:** Confirmed (code + runtime) · **Confidence:** High
- **File+line:** `src/app/api/auth/google/start/route.ts:49-52` (Set-Cookie دستی) و `src/app/api/auth/google/callback/route.ts:30` و `:40` — رشتهٔ `sp_g_state=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=…` بدون `Secure`.
- **توضیح:** تمام کوکی‌های دیگر اپ (session/cart/consent/taste) با `secure: NODE_ENV==='production'` ست می‌شوند (auth.ts:44-52، cart.ts:63، consent.ts:41-51) ولی این کوکی که مقدار حساس (state با HMAC) را حمل می‌کند، string literal است و هرگز Secure نمی‌گیرد. runtime تأیید: Set-Cookie خروجی فقط HttpOnly+SameSite=Lax.
- **سناریوی سوءاستفاده:** در deploymentی که HTTP کنار HTTPS هنوز پاسخ می‌دهد (misconfig لبه)، state از کانال plaintext قابل شنود/ریپلی در همان ۱۰ دقیقه است؛ اثر کم (state فقط CSRF-guard است و مقایسهٔ cookie⇆query می‌ماند).
- **رفع:** استفاده از `cookies()` API با `sessionCookieOptions`-مانند یا افزودن شرطی `; Secure` وقتی NODE_ENV=production (هر ۳ Set-Cookie).
- **زمان رفع:** ۳۰ دقیقه. · **ریسک رگرسیون:** صفر.
- **تست پذیرش:** در prod-sim، هدر Set-Cookie شامل `Secure`.

---

### SEC-408 — خروجی CSV گزارش‌ها (reports/export) محافظت فرمول-اینجکشن ندارد
- **Severity:** Low · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/app/api/admin/reports/export/route.ts:6-10` (`csvEscape` فقط quoting می‌کند) در مقایسه با `src/app/api/admin/products/export/route.ts:13-20` (`csvCell` که `= + - @ \t \r` را با آپستروف خنثی می‌کند — SEC-011).
- **توضیح:** دو export با دو سیاست متفاوت. فیلدهای reports/export: عنوان محصول (ادمین‌محور)، نام promotion (ادمین‌محور)، و `countryCode` مشتری (۲ حرف از آدرس ارسال — ورودی مشتری‌محور اما capped به ۲ کاراکتر). پس اکسپلویت پایدار نیازمند دسترسی content-admin است؛ همچنان ناسازگاری سیاست برای فایل‌هایی که در Excel/Sheets باز می‌شوند یک نقض دفاع-در-عمق است و اگر در آینده فیلد مشتری‌محور بیشتری اضافه شود آمادهٔ سوءاستفاده است.
- **سناریوی سوءاستفاده:** content-admin بدخواه (یا یک آدرس با `=cmd|…` اگر بیلدهای آینده constraintها را شل کنند) formula در سلول تزریق می‌کند که روی ماشین ادمین گزارش‌گیرنده اجرا می‌شود (DDE/CSV injection کلاسیک).
- **رفع:** همان `csvCell` products/export را به `src/lib/server/utils.ts` منتقل و در reports/export استفاده کنید (+ ایمنی: `Content-Disposition: attachment` موجود است).
- **زمان رفع:** ۴۵ دقیقه. · **ریسک رگرسیون:** خیلی کم (قالب ردیف‌ها عوض نمی‌شود، فقط prefix آپستروف).
- **تست پذیرش:** یک عنوان محصول `=1+1` → خروجی `'=1+1`.

---

### SEC-409 — پارامترهای scrypt زیر توصیهٔ OWASP (N=16384 به‌جای 2^17)
- **Severity:** Low · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/lib/server/auth.ts:23` و `:32` — `scryptSync(password, salt, 64)` با defaultهای Node: N=16384، r=8، p=1، خروجی ۶۴ بایت، salt تصادفی ۱۶ بایت.
- **توضیح:** ساختار درست است (salt تصادفی per-password، timing-safe compare، ذخیرهٔ `salt:hash`) اما OWASP Password Storage Cheat Sheet حداقل امروزی scrypt را N=2^17 (131072)، r=8، p=1 می‌داند. N=16384 هزینهٔ حملهٔ GPU را ~۸× کمتر می‌کند. با قفل حساب (۸ تلاش) + rate limit IP، اکسپلویت آنلاین مسدود است؛ ریسک اصلی سناریوی «دزیده شدن دامپ دیتابیس» است.
- **رفع:** مهاجرت پارامتری با prefix نسخه در رکورد (مثل `s2$N$r$p$salt:hash`) و rehash-on-login برای کاربران قدیمی.
- **زمان رفع:** ۲–۳ ساعت. · **ریسک رگرسیون:** متوسط (باید هر دو فرمت در verify پشتیبانی شود).
- **تست پذیرش:** ورود کاربر قدیمی و جدید هر دو 200؛ رکورد جدید با N بالا ذخیره می‌شود.

---

### SEC-410 — سیاست رمز عبور ضعیف‌تر از ASVS: بدون حداکثر طول در register و بدون چک پیچیدگی/نشت
- **Severity:** Low · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/app/api/auth/register/route.ts:15` — `password: z.string().min(8)` **بدون max** (در تضاد با `reset-password/route.ts:15` و `account/password/route.ts:16` که `.min(8).max(128)` دارند)؛ هیچ چک complexity یا breached-password در هیچ مسیری نیست.
- **توضیح:** دو صورت: (الف) طول نامحدود ورودی به `scryptSync` در register → CPU amplification (بدنهٔ چند-مگابایتی)؛ هرچند register به ۵/۱۵دقیقه/IP محدود است، هزینهٔ سرور per-request بالا می‌رود. (ب) min(8) بدون معیار کیفی → رمزهای `12345678` پذیرفته می‌شوند (ASVS 2.1.1). عجیب اینکه تغییر رمز (signed-in) `SAME_PASSWORD` را چک می‌کند ولی register هیچ.
- **سناریوی سوءاستفاده:** (الف) ربات‌های rate-limit-swap روی register؛ (ب) account takeover آسان پس از نشت رمزهای ضعیف در dumpهای دیگر.
- **رفع:** `.min(8).max(128)` در register؛ افزودن چک حداقلی (حداقل ۲ دستهٔ کاراکتر یا passphrase طولانی)؛ اختیاری: k-anonymity HIBP.
- **زمان رفع:** ۱–۲ ساعت. · **ریسک رگرسیون:** کم (پیام‌های خطای فرم باید اضافه شود).
- **تست پذیرش:** register با رمز ۱۰۰k کاراکتر → 400 فوری (بدون scrypt)؛ `12345678` → 400 سیاست.

---

### SEC-411 — scryptSync روی event loop (بلاک‌کنندهٔ synchronous)
- **Severity:** Informational · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/lib/server/auth.ts:23,32` (`scryptSync` در hashPassword/verifyPassword)؛ مسیرهای in-request: login/register/reset-password/account/password/deletion-request/google-linking.
- **توضیح:** هر verify ~۴۰–۶۰ms CPU کامل node را بلاک می‌کند؛ زیر ترافیک موازی login → تأخیر سراسری و آمپلی‌فیکیشن CPU. rate limitها (10/min/IP login) و single-process بودن ریسک را مهار می‌کنند اما الگوی درست `scrypt` async (worker/dedicated pool) یا `crypto.scrypt` callback-based است. برای scale-out آینده حتماً قبل از Postgres cutover اصلاح شود.
- **رفع:** wrap با `await new Promise(...)` روی `crypto.scrypt` یا async worker. · **زمان رفع:** ۱–۲ ساعت. · **ریسک رگرسیون:** کم. · **تست پذیرش:** ۲۰ login موازی → p95 بدون رشد جهشی.

---

### SEC-412 — `DEV_EXPOSE_RESET_LINK=1` روی sandbox شبکه‌پذیر: نشت URL بازنشانی برای ایمیل‌های موجود
- **Severity:** Low · **Status:** Confirmed (config + guard) · **Confidence:** High
- **File+line:** `.env` (کلید DEV_EXPOSE_RESET_LINK=1 — مقدار و لینک‌ها چاپ نشد)؛ گاردها: `src/app/api/auth/forgot-password/route.ts:50-53`، `register/route.ts:75-78`، `account/email/change/route.ts:75-78`، `account/email/verification-request/route.ts:36-39` — همه `=== '1' && NODE_ENV === 'development'`.
- **توضیح:** گارد دو-شرطی درست است و در production هرگز توکن لو نمی‌رود (تأیید کد). اما در همین sandbox، هرکس که به gateway :81 برسد می‌تواند با POST forgot-password برای هر ایمیلِ موجودِ seed، resetUrl یک‌بارمصرف ۳۰ دقیقه‌ای بگیرد → takeover حساب‌های demo/seed. اثر محدود به محیط dev، ولی عادت خطرناک برای staging شبیه‌سازی‌شده.
- **رفع:** در sandboxها که خارج از localhost قابل دسترس‌اند متغیر را بردارید؛ یا گارد سوم (مثل whitelist IP) اضافه شود. بعلاوه پاسخ forgot-password در حالت dev هم می‌تواند فقط برای درخواست‌های localhost برگردانده شود.
- **زمان رفع:** ۱۵ دقیقه (برداشتن env) · **ریسک رگرسیون:** فلوی sandbox تست بدون SMTP دشوارتر می‌شود (Outbox پنل ادمین جایگزین است).
- **تست پذیرش:** پاسخ forgot-password فاقد کلید `resetUrl`.

---

### SEC-413 — لینک unsubscribe خبرنامه بدون انقضا (HMAC بدون timestamp) است
- **Severity:** Informational · **Status:** Confirmed · **Confidence:** High
- **File+line:** `src/lib/server/newsletter.ts:22-24` — `HMAC(kind:email)` بدون ts؛ `src/app/api/newsletter/unsubscribe/route.ts:16` — فقط صحت امضا چک می‌شود.
- **توضیح:** لینک unsubscribe/confirm تا ابد معتبر است (تا وقتی STATE_SECRET عوض نشود). پیامد امنیتی کم است (unsubscribe خنثی‌کننده است نه مهاجم)؛ در forwarding قدیمی ایمیل‌ها ممکن است years laterunsubscribe بی‌اثر ولی بی‌ضرر بماند. مقایسه: جریان‌های reset/verify با expiry و token-at-rest-hash درست طراحی شده‌اند.
- **رفع:** افزودن `ts` به payload و چک TTL (مثلاً ۶ ماه) در `newsletterSigValid`. · **زمان رفع:** ۱ ساعت. · **ریسک رگرسیون:** کم (لینک‌های قدیمی invalidate می‌شوند — قابلیت قبول).

---

### SEC-414 — نبود rate limit روی verify-email و confirm-email-change
- **Severity:** Informational · **Status:** Confirmed · **Confidence:** Medium
- **File+line:** `src/app/api/auth/verify-email/route.ts:14-25`، `src/app/api/auth/confirm-email-change/route.ts:20-31` — هیچ `rateLimit(...)` مثل همتاهای خود ندارند (forgot-password/reset-password/login همه دارند).
- **توضیح:** با entropy ۲۵۶-بیتی توکن‌ها brute-force بی‌معناست؛ فقط نکتهٔ hygiene (لاگ‌های DB فشرده‌ساز بدون cap و بودجهٔ CPU). سایر اندپوینت‌های token-based محدود شده‌اند؛ این دو استثنا هستند.
- **رفع:** یک خط `rateLimit(${ip}:verify-email, 30, 60_000)` به هر دو. · **زمان رفع:** ۳۰ دقیقه. · **ریسک رگرسیون:** صفر.

---

### SEC-415 — `ProseBlocks` اسکیم/مقصد `src` تصویر مارک‌داون را validate نمی‌کند (ورودی content-admin)
- **Severity:** Informational · **Status:** Confirmed · **Confidence:** Medium
- **File+line:** `src/components/storefront/bits.tsx:315-322` — `<img src={b.src}>` از بلوک `![alt](src)` مارک‌داون (ادمین‌محور، `textToBlocks` در `src/lib/markdown.ts:198-200`)؛ CSP صفحه `img-src 'self' data: blob: https:` (`src/proxy.ts:33`) دامنه‌های https خارجی را مجاز می‌کند.
- **توضیح:** اجرای script از `<img src="javascript:">` در مرورگرهای مدرن inert است → XSS نیست. باقی می‌ماند: (الف) tracking pixel به دامنهٔ دلخواه در صفحات فروشگاه (از ورودی content-admin — ریسک اعتماد پایین)، (ب) اجبار به بارگذاری از origin خارجی. قابل قبول برای CMS داخلی؛ در صورت وسواس: whitelist `/uploads/` و `/images/`.
- **رفع:** refine در zod یا regex در renderer برای مسیرهای داخلی/https. · **زمان رفع:** ۳۰ دقیقه. · **ریسک رگرسیون:** کم (محتوای فعلی همه داخلی است).

---

### SEC-416 — لاگ‌های کلاینت/سرور فاقد PII هستند (نکتهٔ مثبت با رزرو؛ ثبت به‌عنوان baseline)
- **Severity:** Informational · **Status:** Confirmed · **Confidence:** High
- **File+line:** اسکن کامل `console.*`: فقط ۱۹ مورد در src/scripts؛ در runtime مسیرها فقط ۴ مورد است (`ProductView.tsx:262`، `checkout/route.ts:438,465`) و هیچ‌کدام body/PII کاربر را چاپ نمی‌کنند (فقط err object در خطای 500 checkout). فهرست: `evidence/3a-console-scan.txt`.
- **توضیح:** نقطهٔ بهبود آینده: ساخت logger ساختاریافته (2-d ARCH-408) ولی از منظر نشت PII در لاگ، وضعیت پاک است. `PRISMA_QUERY_LOG` در prod همیشه خاموش (`src/lib/db.ts:16-18`) — کوئری‌های حاوی PII لاگ نمی‌شوند.

---

## ۲) نکات قوت تأییدشده (Verified Strengths)

1. **توکن نشست:** `randomBytes(32).toString('hex')` (۲۵۶ بیت) + ذخیرهٔ `sha256(token)` با `@unique` + cookie-only حمل — `src/lib/server/auth.ts:60-66`، `prisma/schema.prisma:50-65`. نشست «قابل‌ساخت» توسط مهاجم نیست: مقدار کوکی هرگز به‌عنوان id پذیرفته نمی‌شود، فقط هش DB-lookup می‌شود (auth.ts:93-121).
2. **چرخش نشست روی ورود:** `createSession` ابتدا session کوکی ورودی را revoke می‌کند سپس token تازه می‌سازد — login/register/google-callback همه از همان helper — `auth.ts:58-74` (ادعای worklog SEC-004 تأیید).
3. **انقضای دوگانه + idle timeout:** مطلق ۳۰ روز + بیکاری ۷ روز (`SESSION_IDLE_MAX_AGE_SEC`) با نوشتن `lastSeenAt` حداکثر ساعتی (write amplification guard) — `auth.ts:8-14,104-116`.
4. **فلگ‌های کوکی:** `httpOnly`+`SameSite=Lax`+`secure` در prod برای session/cart/consent/taste — `auth.ts:44-52`، `cart.ts:63`، `consent.ts:41-51`.
5. **جریان‌های revoke کامل:** logout (`auth.ts:124-138`)، تغییر رمز (بقیهٔ sessionها revoke — `account/password/route.ts:53-66`)، reset (همه revoke — `reset-password/route.ts:35-44`)، تغییر ایمیل (همه revoke در تراکنش swap — `confirm-email-change/route.ts:43-46`)، BLOCK ادمین (deleteMany sessions — `admin/customers/[id]/route.ts:143-146`)، anonymize (revoke + destroy — `deletion-request/route.ts:62-65,97`)، مدیریت per-device (`auth/sessions/route.ts:42-76`).
6. **هش رمز:** scrypt با salt تصادفی ۱۶بایت + `timingSafeEqual` + طول-گارد — `auth.ts:21-39` (پارامترها → SEC-409).
7. **توکن‌های one-time یکسان‌حسن:** reset (۳۰ دقیقه)، verify (۲۴ ساعت)، email-change (۱۲ ساعت) — همه ۳۲ بایت تصادفی، فقط sha256 در DB، single-use، انصراف خودکار توکن قبلی در mint جدید — `password-reset.ts:20-44`، `email-verification.ts:16-40`، `email-change.ts:18-43`.
8. **ضد-enumeration محتوایی:** login بدنهٔ یکسان برای موجود/ناموجود (runtime تأیید؛ timing → SEC-404)؛ Google-linked بودن پیام جدا نمی‌دهد؛ forgot-password حتی خطای اسکیما هم `{ok:true}` می‌دهد؛ throttle کلیدش «ایمیل تلاش‌شده» است نه موجود — `login/route.ts:40-48`، `forgot-password/route.ts:29-33,56-59`، `password-reset.ts:4-6`.
9. **قفل حساب DB-backed:** ۸ خطا → قفل ۱۵ دقیقه، پاک‌سازی روی موفقیت، ردیف‌های ۳۰ روزه prune می‌شوند — `password-reset.ts:11-12,60-91`، `housekeeping.ts:48`؛ به‌علاوه rate limit IP (10/min) — `login/route.ts:21`.
10. **OAuth Google:** state = `nonce(24B).payload.HMAC-SHA256` با مقایسهٔ timing-safe و cookie⇆query و انقضای ۱۰ دقیقه — `google.ts:83-120`؛ فقط `email_verified === true` پذیرفته می‌شود (explicit، نه falsy) — `callback/route.ts:118-120`؛ ادغام با حساب local فقط از مسیر استاندارد ایمیل-تأییدشدهٔ Google (معادل کنترل mailbox → معادل دسترسی به reset) و با حفظ پسورد — `callback/route.ts:128-141`؛ `next` از state HMAC-protected می‌آید نه query خام (`google.ts:115`). بدون `nonce` OIDC هم قابل قبول است چون ID token مصرف نمی‌شود (identity از userinfo با access_token سمت سرور). Missing-config → 503 fail-closed در dev هم (runtime تأیید) — `start/route.ts:22-28`.
11. **Fail-fastهای production:** STATE_SECRET (google.ts:71-78، newsletter.ts:13-20)، origin (site.ts:12-16)، PAYMENT_PROVIDER unset → 503 (checkout:117-124)، CRON_SECRET unset → 403 DISABLED با مقایسهٔ timing-safe (cron/tick:18-33، runtime تأیید)، SEED بدون رمز → random ۱۸ بایت غیرقابل‌استفاده و بی‌لاگ (seed.ts:20,94,98,909).
12. **آپلود:** requireContentAdmin، whitelist MIME + magic-byte (شامل بستن AVIF/ftyp عمومی)، ≤5MB، نام سرور-تولید (`Date.now36`+`uuid8`) بدون هرگونه دخالت نام کاربر → بدون path traversal، + audit row — `admin/upload/route.ts:22-62`؛ سرو از `/uploads` با `Content-Type` مطابق پسوند و `X-Content-Type-Options: nosniff` (runtime)؛ SVG اصلاً پذیرفته نمی‌شود (خارج از whitelist) → سطح stored-XSS از آپلود بسته است. 403 ناشناس runtime تأیید.
13. **CSP دو-لایه:** صفحات در prod: `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` بدون unsafe-inline؛ dev: fallback برای HMR — `proxy.ts:23-61`؛ اسکریپت legacy با nonce از هدر `x-nonce` — `layout.tsx:73-80`؛ matcher صفحه‌ای و CSP ایستای `/api` در next.config (جلوگیری از intersection دو هدر) — `next.config.ts:63-71`. runtime dev: همهٔ هدرهای S4 حاضر (nosniff، XFO SAMEORIGIN، Referrer-Policy، Permissions-Policy) — `evidence/3a-headers-*.txt`.
14. **XSS سطح‌بندی شده:** تنها ۳ `dangerouslySetInnerHTML` در کل src: JSON-LD با escape `<`→`\u003c` (`Shell.tsx:245-251`)، رشتهٔ ثابت legacy-hash (`layout.tsx:59-60,80`)، ChartStyle shadcn با config استاتیک کد (`chart.tsx:72-103`) — هیچ ورودی کاربر/DB در هیچ‌کدام نیست. رندر مارک‌داون ساختاری (ProseBlocks) تمام متن را در text-nodeهای React می‌گذارد (auto-escape) — `bits.tsx:247-269,284-356`؛ بدنه/عنوان/نام نویسنده/پاسخ پرس بررسی شد — `ProductView.tsx:778-804`. SearchOverlay و SearchView `q` را در text-node و `document.title` template می‌گذارند — بدون innerHTML (`Header.tsx:170-209`، `SearchView.tsx:40-49`). hrefهای داینامیک: social URLs با `isHttpUrl` refine (`admin/settings/route.ts:16-28`)، announcement href فقط مسیر داخلی (`admin/announcements/route.ts:31-35`)، tracking URL با `safeTrackingUrl` whitelist https (`utils.ts:23-27`).
15. **Injection:** تنها `queryRaw/executeRaw`ها: `SELECT 1`، `SELECT … FOR UPDATE` با پارامتر، و دو route اعلان‌ها با `$…Unsafe` که همه placeholder `?` دارند و ستون‌ها constant whitelist (`announcements/route.ts:55-108`، `[id]/route.ts:55-98`)؛ sortها از const whitelist (`admin/customers/route.ts:16-17`، `product-list.ts:45`)؛ **هیچ** `queryRawUnsafe` با interpolation کاربر نیست.
16. **Mass-assignment:** همهٔ writeها فیلد-به-فیلد صریح از خروجی zod هستند: profile (فقط name/locale/consent — `account/profile/route.ts:27-34`)، register (role ثابت CUSTOMER — `register:48-56`)، products PATCH (schema بسته + mapping صریح + media url باید با `/` شروع شود — `admin/products/[id]/route.ts:38-91,80`)، people PATCH (`admin/people/[id]/route.ts:7-16,39-47`). هیچ `.passthrough()`/spread خام از body به prisma در src نیست.
17. **Checkout:** totals سمت سرور، بازخوانی قیمت زنده در tx (TOCTOU)، کاهش موجودی اتمی، cap تخفیف در tx، consent با `z.literal(true)` fail-closed، Payment فقط brand+last4 (PCI-safe)، publicRef = ۱۲۰ بیت تصادفی — `checkout/route.ts:45,89-101,151-207,217-368` (idempotency cross-ref API-407).
18. **CSV export محصولات:** خنثی‌سازی formula starters + RFC-4180 quoting + BOM + attachment + no-store — `admin/products/export/route.ts:13-20,148-154` (گزارش‌ها → SEC-408).
19. **Re-auth برای عملیات حساس:** تغییر رمز (رمز فعلی لازم + revoke دیگران — `account/password:43-66`)، تغییر ایمیل (رمز فعلی + توکن میل + revoke همه — `account/email/change:51-56` و `confirm-email-change:43-46`)، erasure (رمز فعلی — `deletion-request:40-44`). تغییر نقش: هرچند sessionها revoke نمی‌شوند، **گاردها در هر درخواست نقش را از DB می‌خوانند** (`auth.ts:141-146`) → دموسیون اثرش فوری است؛ هم‌چنین گاردهای self-target/OWNER-protect — `customers/[id]:129-138`.
20. **حریم خصوصی/consent:** analytics کلاینت فقط با `decided && categories.analytics` (fail-closed) — `analytics.ts:44-47`؛ consent state سمت سرور با policyVersion matching و DENIED پیش‌فرض — `consent.ts:34-79`؛ انصراف personalization → حذف taste signals + کوکی — `consent.ts:143-149`؛ data-export با throttle و فقط دادهٔ خود کاربر — `data-export/route.ts:8-29`؛ inventory کوکی‌ها مستند و مطابق رفتار — `consent.ts:182-271`؛ توکن unsubscribe با HMAC timing-safe و غیرقابل‌حدس (base64url ۴۳ کاراکتر) — `newsletter.ts:22-32` (بدون expiry → SEC-413).
21. **Git/Secrets hygiene:** `.env` در هیچ commitای نیست (فقط `.env.example`)؛ هیچ بلاب تاریخی `STATE_SECRET=<hex>` ندارد؛ `db/` و `public/uploads/*` untracked با .gitignore صریح (`/db/`، `/public/uploads/* !.gitkeep`)؛ رشته‌های credential-like در src: فقط لیبل i18n (`evidence/3a-cred-literal-scan.txt`)؛ NEXT_PUBLIC فقط `NEXT_PUBLIC_SITE_URL` (non-secret، origin عمومی) — لیست: `src/lib/site.ts:10`؛ بدون pre/postinstall در package.json؛ deps همه standard/scoped (ریسک typosquat پایین).
22. **صف حافظه‌نشتی امن:** idempotency cache با cap 1000 و prune — `checkout/route.ts:75-86` (به‌عنوان مکمل API-407، cross-ref).

---

## ۳) پوشش scope و شواهد (Traceability)

| Scope | نتیجه | شواهد/محل |
|---|---|---|
| 1 Secrets | .env tracked نیست؛ fail-fastهای prod تأیید؛ client bundle فقط NEXT_PUBLIC_SITE_URL؛ تاریخچه .env پاک؛ literal رمز قدیمی seed در تاریخچه → SEC-402 | 3a-git-*.txt، grep NEXT_PUBLIC |
| 2 Session | کامل (نکات قوت 1-4)؛ بدون یافتهٔ مستقل (rotation/idle از SEC-004 قبلی بازتأیید) | auth.ts، schema.prisma |
| 3 Auth flows | scrypt+timingSafe ✓، توکن‌ها ✓، قفل ✓، anti-enum ✓ (timing → SEC-404، policy → SEC-410) | 3a-enumeration-probe.txt |
| 4 OAuth | state HMAC+cookie ✓، verified-email ✓، linking استاندارد ✓؛ SEC-405/406/407 | google.ts، callback/start |
| 5 Headers/CSP | runtime هدرها ✓ (بدون ACAO — هیچ CORS endpointای در src نیست)؛ prod nonce مسیر کد تأیید؛ HSTS فقط در Caddyfile.production (لبهٔ prod — درست) | 3a-headers-*.txt، proxy.ts، next.config.ts، Caddyfile* |
| 6 XSS | ۳ site innerHTML همه امن؛ مارک‌داون React-safe؛ JSON-LD escaped؛ search بدون DOM XSS؛ hrefها با whitelist | bits.tsx، Shell.tsx، layout.tsx، chart.tsx |
| 7 Injection | raw SQL parameterized؛ sort whitelist؛ mass-assignment منفی (profile/products/people)؛ CSV products ✓ (reports → SEC-408) | announcements، customers، products/[id] |
| 8 Upload | همهٔ کنترل‌ها در کد ✓؛ nosniff/content-type runtime ✓؛ SVG ممنوع؛ بدون traversal (نام سرور-ساخت) | upload/route.ts، 3a-uploads-headers.txt |
| 9 SSRF/open redirect | fetch سمت سرور فقط به endpointهای ثابت Google؛ پارامتر redirect/next دیگری در کل src نیست؛ OAuth next → SEC-405 | grep fetch/next= |
| 10 Cron/webhook | CRON_SECRET: header Bearer + timingSafeEqual + disable-if-unset (runtime 403 تأیید)؛ webhook PSP وجود ندارد (پروایدر unset → checkout 503 fail-closed) — مسیر کد ناسازگار با آینده: تا زمان PSP، الگوی پروایدر-سندباکس فقط simulation داخلی است؛ replay/idempotency → API-407 (ارجاع) | cron/tick، checkout |
| 11 Dependencies | bun audit OK → SEC-403؛ بدون install script؛ bun.lock in-sync (2-a) | 3a-bun-audit.txt، package.json |
| 12 PII/privacy | لاگ‌ها پاک (SEC-416)؛ consent fail-closed ✓؛ export/delete ✓ اما residue → SEC-401؛ unsubscribe token غیرقابل‌حدس (بدون expiry → SEC-413) | analytics.ts، consent.ts، deletion-request |
| 13 Admin re-auth | همهٔ عملیات حساس re-auth دارند؛ role-change اثر فوری (re-read DB) | account/password، email/change، customers/[id] |

## ۴) ردپای تغییرات (Mutation Footprint) این ممیزی
- ۲ ردیف LoginThrottle با failCount=1 (customer@example.com و یک آدرس ناموجود — از ۸ مجاز دور) از پروب‌های anti-enumeration.
- ۱ ردیف PasswordResetToken (mint شد، هرگز consume نشد؛ ۳۰ دقیقه‌هه منقضی) + ۱ ردیف MailMessage (PASSWORD_RESET در outbox sandbox) برای customer@example.com.
- هیچ write ادمین، هیچ upload، هیچ تغییر دادهٔ seed/محصول/سفارش. هیچ مقدار secret چاپ یا خروجی نشد.

## ۵) اقدامات پیشنهادی به‌ترتیب اولویت
1. SEC-401 رفع residue (تراکنش erasure + retention AuditLog) — انطباقی، مقدم بر launch.
2. SEC-403: حذف `effect` + `bun update` + احیای gate CI (هم‌راستا با QA-401) — نیم‌روز.
3. SEC-402: تاریخچه‌پاک‌سازی با force-push مالک (pending قدیمی).
4. بستهٔ سریع Lowها (SEC-404 dummy-verify، SEC-405 regex next، SEC-407 Secure state cookie، SEC-408 csvCell مشترک، SEC-410 max-length register، SEC-412 برداشتن DEV_EXPOSE_RESET_LINK از sandbox): جمعاً <۱ روز.
5. SEC-409/411 در فرصت cutover (مهاجرت پارامتر KDF + scrypt async).
