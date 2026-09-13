# 01 — Full Technical Audit (Master Synthesis)

## 1. Executive snapshot
- وضعیت کلی: **NEEDS WORK — 72/100** (۱ Critical / 12 High / 27 Medium / 77 Low / 31 Informational = 148 یافته)
- **NO-GO برای تولید واقعی**؛ Conditional GO برای staging (بلاکرها در 07/08)
- محدودهٔ ممیزی: 415 فایل (112 API / 105 component / 47 lib / 7 page / 55 مدل / 6 migration)، ~۵۰.۹k خط اول-طرف؛ ۱۴۸ یافته از ۹ عامل مستقل + عامل اصلی، همه بر اساس کد/runtime جاری (ادعای worklog صرفاً سرنخ بود)
- محیط: bun 1.3.14 / node 24 / Next 16 / React 19 / Prisma 6 / SQLite / HEAD=04cf388b / درخت کاری تمیز

## 2. امتیاز حوزه‌ها
| حوزه | نمره | حوزه | نمره |
|---|---|---|---|
| Security | 82 | Database | 70 |
| Backend/API | 80 | Commerce | 72 |
| Accessibility | 80 | SEO | 76 |
| Frontend/UX | 78 | GEO/AEO | 78 |
| Architecture | 74 | Performance | 65 |
| DevOps/Production | 45 (سقف ۴۹ با Critical باز) | Testing/QA gate | 40 |

نمرهٔ کل: میانگین وزنی ۷۷ منفی ۵ جریمهٔ Critical باز → **72**. Production Readiness طبق قاعدهٔ سقف = ۴۵.

## 3. ده ریسک اصلی
1. QA-401 (Critical): زنجیرهٔ CI مرده — هیچ گیت quality/audit اجرا نمی‌شود
2. QA-402/DB-401/OPS-402: DB زنده خارج از مدیریت migration (migrate deploy می‌شکند)
3. OPS-404: صفر observability (Sentry/metrics/alerting)
4. COM-401: جریان مرجوعی بن‌بست (بدون مسیر approve/restock/refund)
5. B1: PSP واقعی وصل نیست (prod fail-closed 503 — رفتار درست ولی فروش ممکن نیست)
6. DB-416+ARCH-402+PERF-404: fetch-all + بدون کش — سقف مقیاس ~۱-۳k محصول
7. SEC-401: بقایای PII پس از erasure (MailMessage/AuditLog)
8. SEO-401: /fa با lang=en/dir=ltr — مغایرت مستقیم با فروشگاه دوزبانه
9. PERF-401: پایپ‌لاین تصویر (PNG 61MB، بدون next/image)
10. OPS-406/OPS-414: بکاپ فقط-DB، بدون restore drill / RPO-RTO نامشخص

## 4. ده نقطهٔ قوت واقعی (تأییدشده مستقل)
1. Auth/session: scrypt + hash-at-rest + rotation-on-login + idle 7d/abs 30d + revoke کامل
2. RBAC کامل با ماتریس runtime سبز (403 یکنواخت، قفل حساب DB-backed، anti-enum)
3. Checkout TOCTOU: بازبینی قیمت زنده در $transaction + کاهش موجودی اتمیک + snapshot غیموتغیر
4. Payment: fail-closed در production (بدون PSP واقعی ۵۰۳)
5. Upload امن: magic-byte + نام تصادفی + سقف حجم + بدون SVG
6. Privacy: consent fail-closed + erasure کامل کاربر (جز SEC-401)
7. کیفیت داده: ۰ یتیم/۰ تکراری/۰ ناهمخوانی مالی (روی کپی disposable)
8. SEO بنیادی: 404 واقعی همه‌جا، sitemap با lastmod واقعی، Book LD کامل، hreflang سه‌گانه
9. بهداشت کد: صفر وابستگی حلقوی، صفر any، صفر TODO، lint:ci صفر هشدار، bun.lock سینک
10. A11y/RTL: skip link، focus trap، aria-live، صفر overflow در ۲۰ سناریو

## 5. بخش‌های تخصصی
- امنیت → 02؛ فرانت/پرف/a11y → 03؛ API/کامرس → 04؛ دیتابیس → 05؛ SEO/GEO → 06؛ DevOps → 07؛ نقشهٔ راه → 08؛ شواهد → 11؛ لاگ فرمان‌ها → 12
- گزارش‌های کامل هر عامل: audit-output/work/2a..4a (۱۴۸ یافته با قالب کامل پروتکل: فایل/خط، شرح، سناریو، اصلاح، زمان، ریسک رگرسیون، تست پذیرش)

## 6. موارد Unverified و دلیل
| موضوع | چرا | ریسک باقی‌مانده |
|---|---|---|
| CWV/حجم باندل prod (PERF-405) | ممنوعیت build در محیط + نبود Lighthouse | Medium |
| رفتار prod واقعی CSP/Secure/HSTS | فقط dev اجراست؛ prod از کد شبیه‌سازی شد | Low |
| Webhook PSP (COM/SEC) | پروایدر نصب نیست (fail-closed) | Low |
| bun audit (SEC-403) | اجرا شد exit 1 — ولی شبیه‌سازی اثر runtime محدود | Medium |
| E2E-402 منوی زبان | artifact اتوماسیون محتمل | Low |
| RPO/RTO (OPS-414) | drill انجام نشده | High (برای DR) |


---

## پیوست — Build/Toolchain/Tests کامل (2-a)

# گزارش ممیزی Phase 2 — بیلد / ابزارها / تست‌ها (Task 2-a)

- پروژه: `persepix-web` (Next.js 16.3.5 App Router، React 19، Prisma 6 + SQLite، Bun 1.3.14)
- تاریخ ممیزی: 2026-09-13 — ممیز: Build/Toolchain/Tests auditor (audit protocol v4, Phase 2)
- محدوده: lint / typecheck / route-guard / smoke / تست‌هارنس / الگوهای پنهان‌سازی خطا / CI / مایگریشن / lockfile / بهداشت وابستگی‌ها
- قوانین رعایت‌شده: هیچ فایل سورس/کانفیگ/DB تغییر نکرد؛ `bun run build` اجرا نشد؛ سرور dev دست‌نخورده ماند؛ هیچ دستور مخرب (db:reset و…) اجرا نشد؛ دسترسی شبکه خارجی نداشتیم؛ مقادیر .env چاپ نشد.
- همهٔ verdictها فقط از اجرای مستقیم من روی کدِ فعلی (working tree) هستند؛ ادعاهای worklog به‌عنوان سرنخِ تأییدنشده تلقی و جداگانه راستی‌آزمایی شدند.

## ۰) فهرست دستورات اجرا‌شده + کد خروج

| # | دستور | Exit | زمان (UTC) | مدرک |
|---|---|---|---|---|
| 1 | `bun run lint` (eslint .) | **0** | 05:04:41 | evidence/2a-lint.log |
| 2 | `bun run lint:ci` (eslint . --max-warnings=0) | **0** | 05:05:04 | evidence/2a-lint-ci.log |
| 3 | `bun run typecheck` (tsc --noEmit) | **0** | 05:05:31 | evidence/2a-typecheck.log |
| 4 | `bunx tsc --noEmit --incremental false` (بدون کش) | **0** | 05:06:16 | evidence/2a-typecheck-cold.log |
| 5 | `bun run check:routes` | **0** | 05:05:23 | evidence/2a-check-routes.log |
| 6 | `bun run smoke` | **اجرا نشد — UNVERIFIED** | — | evidence/2a-smoke-skip-decision.log |
| 7 | `bunx prisma migrate status` (فقط‌خواندنی) | **1** | 05:09:24 | evidence/2a-prisma-migrate-status.log |
| 8 | `bun install --frozen-lockfile --dry-run` | **0** | 05:10:52 | evidence/2a-bunlock-sync.log |
| 9 | اسکن پترن‌ها (python، ۲۹۰ فایل) | 0 | 05:08 | evidence/2a-pattern-scan.json |
| 10 | sqlite فقط‌خواندنی (`mode=ro`) روی db/custom.db | 0 | 05:09 | evidence/2a-sqlite-ro-inspect.log |
| 11 | `curl GET /api/healthz` (فقط GET) | HTTP 200 | 05:16:38 | /tmp/audit-v4/2a/healthz.json |

**دلیل Skip شدن smoke (بر اساس مطالعهٔ کامل `scripts/smoke.ts`)**: این اسکریپت عملیات **نوشتن** روی سرور/DB زنده انجام می‌دهد: ثبت‌نام کاربر واقعی (L85–91)، لاگین/سشن (L92–93)، افزودن به سبد (L117)، **ثبت سفارش واقعی پرداخت‌شده در دیتابیس زنده** از طریق `/api/checkout` با کارت سندباکس (L127–143)، و آپلود فایل به `public/uploads` + ردیف audit-log با پرمیژن ادمین (L196–204). طبق پروتکل، smoke اجرا نشد و با عنوان UNVERIFIED ثبت می‌شود. (در مقابل، `scripts/check-routes.ts` کاملاً استاتیک و فقط‌خواندنی است — اجرا شد.)

---

## ۱) Lint — پیکربندی و نتیجه

فایل‌های مطالعه‌شده کامل: `eslint.config.mjs` (۵۵ خط)، `package.json` (scripts).

**نتایج اجرا:**
- `bun run lint` → exit 0 (هیچ خطا و هیچ هشداری چاپ نشد؛ ۲۹۰ فایل first-party پوشش داده شد).
- `bun run lint:ci` → exit 0 → **صفر هشدار** حتی با `--max-warnings=0`.

**قواعد تعدیل/غیرفعال‌شده در `eslint.config.mjs`:**

| قانون | وضعیت | ارزیابی |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | `warn` | چون lint:ci صفر-هشدار است، فعلاً هیچ `any` صریحی در کد نیست؛ ولی تنها سدِ این قانون، lint:ci است نه lint ساده |
| `@typescript-eslint/no-unused-vars` | `warn` (+argsIgnorePattern `^_`) | مشابه بالا |
| `react-hooks/exhaustive-deps` | `warn` | ۱۵ بار با کامنت `-- intentional: …` سایت‌به‌سایت غیرفعال شده (لیست در §۴) |
| `@typescript-eslint/ban-ts-comment` | **off** | اجازهٔ @ts-ignore بدون اعتراض لینتر — اما اسکن نشان داد ۰ مورد وجود دارد |
| `@typescript-eslint/no-non-null-assertion` | **off** | نقطه‌کور: `!` نامحدود مجاز |
| `@typescript-eslint/no-unused-disable-directive` | off | بی‌خطر |
| `react-hooks/purity` و `react-compiler/react-compiler` | **off** | نقطه‌کور برای قواعد نسل جدید React |
| `@next/next/no-img-element` | **off** | ~۶۰ سایت `<img>`؛ دلیل مستند در کامنت (迁移 next/image بعداً) |
| `@next/next/no-html-link-for-pages` | off | نقطه‌کور کوچک |
| `no-empty` | `["error", {allowEmptyCatch: true}]` | catch خالی خطا نمی‌دهد (۱ مورد + ~۱۷ مورد catchِ فقط-کامنت؛ همه ارزیابی: بی‌خطر — §۴) |
| `no-console` / `no-debugger` / `no-undef` | off | no-undef زیر سایهٔ TS؛ no-console آزاد |
| `eqeqeq` | error با `null: ignore` | عرفی پروژه؛ خوب |
| `no-fallthrough`, `no-redeclare`, `no-unreachable`, `no-throw-literal`, `no-prototype-builtins` | error | خوب |

**حکم (پاسخ به سؤال پروتکل):** «lint clean» با `bun run lint` به‌تنهایی **معنادار نیست** (هشدارها را نادیده می‌گیرد و چند قاعده کاملاً خاموش است). اما `bun run lint:ci` **در وضع فعلی معنادار و قوی است**: صفر هشدار روی مجموعهٔ قواعد فعلی + تمام ۱۵ موضع خاموش‌سازیِ دستی، مستند و دلیل‌دار هستند. نقاط کور باقی‌مانده همان قوانین off-شدهٔ جدول بالا هستند (QA-404).

## ۲) TypeScript — پیکربندی و نتیجه

فایل کامل: `tsconfig.json`.

- `typescript.ignoreBuildErrors` در `next.config.ts`: **تعریف نشده** (پیش‌فرض false ⇒ چک تایپ در `next build` فعال است) — اسکن regex روی کانفیگ: ۰ مورد `ignoreBuildErrors|ignoreDuringBuilds` → **نقطهٔ قوت تأییدشده (S5)**.
- `eslint.ignoreDuringBuilds`: تعریف نشده (فعال).
- `strict: true` و `noImplicitAny: true` (صریح) ✅
- `skipLibCheck: true` ⚠️ — چکِ فایل‌های .d.ts وابستگی‌ها را حذف می‌کند (رایج، ولی یک لایهٔ اطمینان را کم می‌کند؛ اگر CVE/تعارض type در dts وابستگی باشد دیده نمی‌شود).
- `noUnusedLocals/noUnusedParameters` تنظیم نشده‌اند — جبران‌شده توسط ESLint (warn).
- `paths`: فقط `@/* → ./src/*` ✅؛ `moduleResolution: bundler`، `isolatedModules`، `jsx: react-jsx` — استاندارد Next.
- `include` شامل `.next/types/**/*.ts` و `.next/dev/types/**/*.ts` — تایپ‌های تولیدی Next. نکته: `next-env.d.ts` در `.gitignore` است (L43) ⇒ در CI سرد، این فایل و تایپ‌های `.next` وجود ندارند و typecheck **ضعیف‌تر از محیط dev** اجرا می‌شود (QA-405). چک build خودش typecheck دارد، ولی CI بر اساس QA-401 اصلاً اجرا نمی‌شود.
- **نتیجه:** `tsc --noEmit` → exit 0 (هم با tsbuildinfo گرم، هم با `--incremental false` سرد/بدون نوشتن). ⏱ 4s گرم / 17s سرد.
- اسکن: **۰ مورد** `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` در کل src/scripts/configs → «tsc 0 errors» در این پروژه **معنادار** است (هیچ دریچهٔ فریب TS وجود ندارد).
- محدوده‌های مستثنی tsconfig: `skills`, `upload`, `mini-services` (دومی وجود ندارد — آرتیفکت تمیزکاری‌نشدهٔ کانفیگ؛ بی‌اثر).

## ۳) تست‌هارنس — موجودی و پوشش واقعی

**فریم‌ورک تست: هیچ.** در `package.json` هیچ‌کدام از vitest/jest/playwright/cypress/@testing-library/mocha وجود ندارد (تنها اشارهٔ `@playwright/test` در bun.lock، peerDependency اختیاریِ خود next است). جستجوی `*.test.*` / `*.spec.*` → **۰ فایل**. (QA-403)

### ۳-۱) `scripts/smoke.ts` (۲۲۶ خط — مطالعهٔ کامل)
- تست جعبه‌سیاه HTTP روی سرور در حال اجرا؛ ۱۶ assertion در ~۱۲ گام:
  1. healthz: 200 + ok + db ✅ (توسط من جداگانه هم تأیید شد: HTTP 200 `{"ok":true,"db":true}`)
  2. ثبت‌نام مشتری، 3. لاگین مشتری
  4. کاتالوگ لیست می‌کند، 5. واریانت موجود پیدا می‌شود
  6. افزودن به سبد، 7. روش ارسال موجود، 8. چک‌اوت سندباکس → سفارش PAID
  9. پیگیری مهمان → PAID، 10. trackingUrl قالب خراب `{{…}}` نیست (BUG-002)
  11–12. ماتریس 403 مشتری روی `/api/admin/products` و `/api/admin/upload`
  13–16. لاگین ادمین، آپلود PNG واقعی → 200+url، فایل آپلودی سرو می‌شود، PNG جعلی (magic byte) → 415
- **نقاط قوت:** assertion واقعی دارد؛ روی رفتار واقعی اپ (HTTP + RBAC + magic-byte) دوک می‌زند؛ `process.exit(failures===0?0:1)` صحیح؛ برای REG-001 طراحی شده و گویا.
- **نقاط ضعف:** نوشتاری است (برای محیط‌های طولانی‌عمر ایمن نیست — اینجا skip شد)؛ خوشحال‌رو (happy-path) است؛ بدون SMOKE_ADMIN_PASSWORD گام ۱۳–۱۶ **عمداً fail** و کل اسکریپت exit 1 می‌دهد (QA-408)؛ وابسته به سرور زنده؛ هیچ پوشش منفی/مرزی ندارد (پرداخت ناموفق، نرخ‌محدود، رقابت، …).

### ۳-۲) `scripts/check-routes.ts` (۱۱۸ خط — مطالعهٔ کامل)
- استاتیک و فقط‌خواندنی: از `src/app/api/**/route.ts` الگوی مسیر می‌سازد (**۱۱۲ route** — شمارش مستقل من هم ۱۱۲) و ۹۶ ارجاع متمایز `/api/...` در src را چک می‌کند که همه resolve شوند → exit 0.
- **محدودیت‌ها (QA-410):** METHOD-agnostic است (حذف POST با باقی‌ماندن GET را نمی‌گیرد)؛ wildcard دوطرفه (`:wild` ↔ `:id`) می‌تواند برخی تطابق‌های غلط را بپوشاند؛ فقط رشته‌های literal را می‌بیند.
- پوشش واقعی: «وجود فایل مسیر» نه «رفتار».

### ۳-۳) جدول پوشش صادقانه (چه چیزی تست شده / نشده)

| تست‌شده (خودکار) | تست‌نشده |
|---|---|
| زنده‌بودن healthz (smoke + curl) | منطق تجاری lib/server: تخفیف‌ها، حمل‌ونقل، بازپرداخت ($transaction)، امتیازدهی |
| ثبت‌نام/لاگین/چک‌اوت/پیگیری (فقط مسیر خوشحال، فقط در CI) | چرخهٔ کامل احراز هویت: چرخش سشن، idle-timeout، ریست رمز |
| RBAC 403 فقط روی ۲ endpoint ادمین | بقیهٔ ~۳۰ endpoint ادمین، نرخ‌محدودها، idempotency |
| رزولوشن استاتیک ۹۶ ارجاع ↔ ۱۲۲ مسیر | ایمیل‌ها، خبرنامه، تیکت‌ها، گزارش‌ها |
| تایپ کل کد (tsc strict) + لینت | هیچ unit test برای هیچ تابعی؛ هیچ E2E مرورگری؛ هیچ پوشش منفی/مرزی؛ هیچ metric پوشش |

### ۳-۴) CI (`.github/workflows/ci.yml` — تنها workflow)
زنجیرهٔ gates طراحی‌شده: install (frozen) → prisma generate → typecheck → lint:ci → check:routes → migrate deploy روی DB پاک → build → seed → سرور بیلدشده → smoke → `bun audit --production` (blocking). طراحی درست است **اما** تریگرهای workflow خراب‌اند (QA-401) ⇒ در عمل هیچ‌کدام اجرا نمی‌شود. (پسوردهای fixture داخل ci.yml، throwaway و برای DB فاسد CI است — قابل قبول، QA-412.)

## ۴) اسکن الگوهای پنهان‌سازی خطا (۲۹۰ فایل: src، scripts، *.config.*، .github)

مدرک خام: `evidence/2a-pattern-scan.json`. جمع پرچم‌ها: **۲۶**

| الگو | تعداد | ارزیابی |
|---|---|---|
| `@ts-ignore` / `@ts-nocheck` | **0** | ✅ |
| `@ts-expect-error` | **0** | ✅ |
| `eslint-disable` | **16** (15 کد + 1 در کامنت ci.yml) | هر ۱۵ موضع `react-hooks/exhaustive-deps` با پسوند `-- intentional: <دلیل>` مستندند → **benign** (AccountView:89, CartView:32, SearchView:36, PeopleView:83, AuthView:59, ProductView:111+209, TrackView:77, StaticView:271+282, ArticlesView:135, ProductEditor:656, CustomersTable:237+286, ProductRow:65) |
| catch خالی (inline `{}`) | **1** | `src/app/layout.tsx:60` — داخل رشتهٔ اسکریپت inline `LEGACY_HASH_MIGRATION` (`catch(e){}` برای مهاجرت hash قدیمی؛ best-effort قبل از هیدریشن) → **benign** |
| catch فقط-کامنت (چندخطی) | **17** | همگی best-effort مستند: localStorage در حالت private (CookieBanner:57,79, CookiePreferencesDialog:64)، pointer capture (HomeSections:261,290; ProductRow:132,161; HeroSlider:242,313)، clipboard (ArticlesView:152; ProductView:220)، non-JSON parse (smoke.ts:67)، JSON-LD best-effort (`[...slug]/page.tsx:463`)، toast (Header:254)، dismiss (Header:370) → **benign** |
| `|| true` | **1** | `scripts/restore-db.sh:75` — `chmod 600 … 2>/dev/null || true` روی restore → **benign** |
| `continue-on-error` | **0** | ✅ (CI گام‌های fail-fast دارد) |
| `ignoreBuildErrors` / `ignoreDuringBuilds` | **0** | ✅ |
| `process.exit(0)` پنهان‌کننده | **0** | exit-های موجود صحیح‌اند (smoke: بر اساس تعداد خطا؛ check-routes/pg-transfer: exit 1 در خطا) |
| `console.error` | **8** | همه «لاگ‌کردن» اند نه «بلعیدن»: checkout:438 (خطای میل سفارش — سفارش می‌ماند، outbox دوباره می‌فرستد)، checkout:465، ProductView:262 (کلاینت)، pg-transfer:78/109، check-routes:112–114 → **benign** |
| TODO/FIXME/HACK/XXX | **0** | ✅ بسیار تمیز |

**جمع‌بندی:** هیچ نمونهٔ failure-masking واقعی یافت نشد؛ بلعیدن‌های موجود همگی best-effort و دلیل‌دارند.

## ۵) وضعیت مایگریشن — یافتهٔ مهم

```
$ bunx prisma migrate status   → exit 1
5 migrations found in prisma/migrations
Following migrations have not yet been applied:
0_init … 20260913040000_session_idle_timeout   (هر ۵ تا!)
```

- بازرسی فقط‌خواندنی sqlite (`mode=ro`): جدول `_prisma_migrations` **وجود ندارد** در `db/custom.db` (۵۵ جدول اپلیکیشنی موجود). یعنی DB زنده با `prisma db push` ساخته/به‌روز شده (worklog P0-r1 همین را گفته بود — اکنون پیامدش را مستقیم تأیید کردم) و **خارج از مدیریت مایگریشن** است (QA-402).
- اسکیمای DB زنده هم‌اکنون هم‌ترازِ head است (ستون `Session.lastSeenAt` موجود است) ⇒ drift عملکردی فعلی نداریم؛ مشکل «مدیریت‌پذیری» است، نه «اکنون خراب بودن».
- یکپارچگی زنجیره: ۵ دایرکتوری + `migration_lock.toml (provider=sqlite)`؛ ترتیب زمانی سالم (0_init → 133904 → 141836 → 200000 → 040000)؛ SQLها ظاهر Prisma-generated دارند (PRAGMA defer_foreign_keys/RedefineTables استاندارد)؛ `drop_dead_tables` کامنت دستی دارد ولی SQL معتبر است — نشانهٔ دست‌کاری مخرب دیده نشد. زنجیره در CI روی DB پاک اعمال می‌شود (طراحی)، اما علیه همین DB زنده قابل اعمال نیست (deploy روی DB پُر، روی `CREATE TABLE`های 0_init می‌شکند).

## ۶) ابزار، lockfile و نسخه‌ها

- اجرا شده با: bun **1.3.14**، node **v24.19.0**. در `package.json` **نه `engines` هست نه `packageManager`** (QA-406). CI هم `bun-version: latest` (پین‌نشده) می‌گذارد و برای `next start` به node سیستمی runner تکیه می‌کند.
- **همگامی bun.lock ↔ package.json: کامل.** `bun install --frozen-lockfile --dry-run` → exit 0 (بدون «lockfile had changes») + چک دستی: ۶۳ ورودی اعلامی (۵۳ dep + ۱۰ devDep) — ۰ گم‌شده، ۰ اضافه در workspace declaration. اختلاف نسخه‌های resolved با `^` رنج‌ها طبیعی semver است (مثلاً prisma 6.19.2 برای `^6.11.1`) → drift نیست.
- `.gitignore`: `/db/` (PII) و `next-env.d.ts` و `/.next/` مستثنی‌اند ✅.

## ۷) بهداشت وابستگی‌ها (فقط شمارش/ارجاع — CVE کار ممیز دیگر است)

- کل: **۵۳ dependency + ۱۰ devDependency = ۶۳**. bun.lock: ۸۵۷ ورودی resolved.
- هر ۲۷ پکیج `@radix-ui/*` دقیقاً توسط کامپوننت‌های shadcn استفاده می‌شوند (هر کدام ۱+ import) ✅.
- پرکاربردترین‌ها: react (102)، lucide-react (68)، zod (55)، next (58)، @prisma/client (16).
- **ارجاع صفر (بدون احتساب نقش ابزاری):**
  - `effect@^3.22.2` (production dep) → **۰ ارجاع در src/scripts/prisma/configs** → وابستهٔ مرده (QA-407). ⚠️ این با ادعای worklog («nodemailer/effect را نگه دار») در تضاد است — nodemailer واقعاً در `src/lib/server/mail-dispatch.ts` استفاده می‌شود، effect نه.
  - موارد «صفر ارجاع اما موجه»: `prisma` (CLI در scripts/Dockerfile)، `postcss` (پایپ‌لاین بیلد)، `sharp` (بهینه‌سازی تصویر standalone، implicit next)، `react-dom` (نیازمندی runtime next)، `eslint`/`typescript`/`bun-types`/`@types/*` (ابزار) و `tw-animate-css` (import در `src/app/globals.css:2` — اسکن اول من CSS را نمی‌دید؛ اصلاح شد).
  - جابه‌جایی پیشنهادی (جزئی): `postcss`/`prisma` بهتر است devDependency باشند (در Docker مرحلهٔ بیلد جدا است).

## ۸) نقاط قوت تأییدشده (verified strengths)

1. `lint:ci` با صفر هشدار پاس می‌شود (گیت واقعی، فعلاً بدون استثنای بی‌دلیل).
2. `tsc --noEmit` (strict + noImplicitAny) صفر خطا — گرم و سرد؛ و ۰ tsgate-comment در کد ⇒ نتیجه معنادار.
3. `check:routes` پاس: ۹۶ ارجاع ↔ ۱۱۲ route زنده — گارد استاتیک REG-001 سالم و سریع.
4. `next.config.ts` فاقد `ignoreBuildErrors`/`ignoreDuringBuilds`؛ `reactStrictMode: true`؛ `poweredByHeader: false`؛ هدرهای امنیتی پایه + CSP دو-لایه (صفحه در proxy.ts، API در next.config) مستند و منسجم.
5. bun.lock کاملاً همگام با package.json.
6. بهداشت کد: ۰ ts-ignore، ۰ TODO/FIXME/HACK/XXX، ۰ continue-on-error، ۰ process.exit(0) فریبکار؛ تمام disableها و catchهای خالی مستند و benign.
7. طراحی زنجیرهٔ CI (روی کاغذ) کامل و نقشه گته↔یافتهٔ ممیزی دارد؛ smoke.ts و check-routes.ts هر دو assertionهای واقعی و هدفمند دارند.
8. `.gitignore` مسیر PII (`/db/`) را می‌بندد.

---

## جدول یافته‌ها (QA-401 … QA-412)

> قالب هر یافته: شناسه | عنوان | دامنه | شدت | وضعیت | اطمینان | مسیر:خط | توضیح فنی | شرایط فعال‌سازی | سناریوی خرابی | اثر فنی/کسب‌وکار | مدرک | روش رفع | زمان برآوردی | احتمال بازگشت | تست پذیرش

---

### QA-401 — تریگر CI خراب است: `branches: ain]` به‌جای `[main]` ⇒ کل زنجیرهٔ گیت‌ها هرگز اجرا نمی‌شود
- **دامنه:** CI/Toolchain — **شدت: Critical** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `.github/workflows/ci.yml:34` و `:36` (هر دو بلوک `push` و `pull_request`)
- **توضیح فنی:** مقدار واقعی بایت‌به‌بایت فایل (با python راستی‌آزمایی شد، نه نمایش ترمینال) `    branches: ain]` است؛ یعنی فیلتر شاخه یک اسکالر رشته‌ای `"ain]"` است که با هیچ شاخه‌ای match نمی‌شود. الگوی خرابی دقیقاً همان بلعیده‌شدن `[m` است که worklog (UI-w1) دربارهٔ ANSI هشدار داده بود — این‌بار **در خود فایل** رخ داده، نه در نمایش.
- **شرایط فعال‌سازی:** هر push به main یا هر PR.
- **سناریوی خرابی:** workflow ثبت می‌شود ولی هیچ‌گاه run نمی‌گیرد ⇒ typecheck / lint:ci / check:routes / migrate-deploy / build / smoke / `bun audit` blocking — هیچ‌کدام در هیچ push/PR اجرا نمی‌شوند و هیچ زنگ‌خطری وجود ندارد.
- **اثر:** کل اطمینان «CI سبز است» بی‌پشتوانه است؛ رگرسیون‌هایی که smoke طراحی شده جلویشان را بگیرد (مثل REG-001) بی‌سد به main می‌رسند. اثر مستقیم روی مشتری فعلاً صفر (dev دستی چک می‌شود) ولی ریسک رگرسیون بالا.
- **مدرک:** `python3` روی فایل: `34: '    branches: ain]'` و `36: '    branches: ain]'`؛ `contains "[main]": False`.
- **رفع:** اصلاح دو خط به `branches: [main]` + بررسی کل repo برای بلعیده‌شدن مشابه `[m` در فایل‌های دیگر؛ یک push آزمایشی.
- **زمان:** ۱۵ دقیقه. **احتمال بازگشت:** متوسط (منشأ ابزار/ترمینال عامل بوده؛ بدون گارد، تکرارشدنی).
- **تست پذیرش:** push آزمایشی → «CI» run می‌گیرد و هر ۸ گام سبز؛ `git grep -n 'ain]'` → ۰ مورد.

### QA-402 — DB زنده خارج از مدیریت مایگریشن است (0 از ۵ مایگریشن اعمال‌شده، `_prisma_migrations` وجود ندارد)
- **دامنه:** Build/DB Toolchain — **شدت: High** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `db/custom.db` + `prisma/migrations/*` (۵ دایرکتوری) — خروجی `bunx prisma migrate status`
- **توضیح فنی:** `migrate status` exit 1 و می‌گوید هر ۵ مایگریشن اعمال نشده‌اند؛ بازرسی فقط‌خواندنی sqlite نشان داد جدول `_prisma_migrations` اصلاً وجود ندارد ⇒ اسکیما با `prisma db push` ساخته شده. محتوای اسکیما هم‌تراز head است (lastSeenAt موجود) ولی پایگاه «باسلاین مایگریشن» ندارد.
- **شرایط فعال‌سازی:** هر تلاش برای `prisma migrate deploy` علیه این DB (ارتقای محیط، drill بازیابی، cutover).
- **سناریوی خرابی:** deploy روی DB پُر، روی `CREATE TABLE "User"` (0_init) شکست می‌خورد؛ یا اگر کسی دستی push کند، زنجیره و DB مسیرهای جدا می‌روند و drift خاموش انباشته می‌شود.
- **اثر:** ارتقا/بازیابی/مهاجرت به Postgres از مسیر استاندارد غیرممکن؛ عدم تطابق بین «CI که chain را اثبات می‌کند» و «محیط واقعی که chain را هرگز ندیده».
- **مدرک:** evidence/2a-prisma-migrate-status.log (exit 1، «5 migrations … not yet been applied»)؛ evidence/2a-sqlite-ro-inspect.log (`has__prisma_migrations: False`, `Session_has_lastSeenAt: True`).
- **رفع:** baseline کردن با `prisma migrate resolve --applied 0_init` (و بقیه) روی یک DB تازه‌بازسازی‌شده از مسیر migrate، یا `migrate dev` از صفر + درج در runbook استقرار؛ ممنوعیت `db push` در محیط‌های واقعی.
- **زمان:** ۱–۲ ساعت + drill. **احتمال بازگشت:** بالا (عادت `db push` در سندباکس؛ بدون گارد تکرار می‌شود).
- **تست پذیرش:** `bunx prisma migrate status` → exit 0 و «Database schema is up to date!».

### QA-403 — هیچ فریم‌ورک تست وجود ندارد (نه unit، نه integration، نه E2E)
- **دامنه:** Tests — **شدت: Medium** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `package.json` (deps/devDeps)؛ کل repo (۰ فایل `*.test.*`/`*.spec.*`)
- **توضیح فنی:** تنها دو اسکریپت دست‌ساز وجود دارد: smoke.ts (۱۶ assertion، happy-path، وابسته به سرور زنده + راز ادمین) و check-routes.ts (استاتیک، فقط وجود مسیر). هیچ vitest/jest/playwright، هیچ measuring پوشش، هیچ تستی برای منطق `src/lib/server/*` (تخفیف، حمل‌ونقل، بازپرداخت، سشن، نرخ‌محدود)، هیچ تست منفی/مرزی، هیچ E2E مرورگری.
- **شرایط فعال‌سازی:** هر تغییر منطق تجاری؛ بازنگری اطمینان پیش از لانچ.
- **سناریوی خرابی:** رگرسیون منطقی (مثلاً محاسبهٔ سقف بازپرداخت یا ریاضیِ تخفیف) فقط در پروداکشن کشف می‌شود؛ «سبز بودن» فقط به لینت/تایپ معنا دارد.
- **اثر:** ریسک رگرسیون بالا و هزینهٔ بازبینی دستی؛ موانع لانچ (B1…) بدون تست قابل بستن نیستند.
- **مدرک:** مطالعهٔ کامل دو اسکریپت؛ `rg vitest|jest|playwright|cypress` روی package.json → فقط peer اختیاری next در bun.lock؛ `rg --files -g '*.test.*' -g '*.spec.*'` → خالی.
- **رفع:** افزودن Vitest (unit برای lib/server + zod schemas) و Playwright (E2E؛ next از قبل peer آن را می‌شناسد) + گیت `test` در CI بعد از رفع QA-401؛ smoke به‌عنوان لایهٔ آخر بماند.
- **زمان:** ۲–۴ روز برای هستهٔ اولیه (۲۰–۳۰ تست واحد حیاتی + ۳ مسیر E2E). **احتمال بازگشت:** کم (یک‌بار ساخت).
- **تست پذیرش:** `bun run test` محلی و گیت CI موجود؛ گزارش پوشش تولید می‌شود.

### QA-404 — مجموعهٔ قواعد ESLint تعدیل‌شده است و `bun run lint` به‌تنهایی گیت نیست
- **دامنه:** Lint — **شدت: Medium** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `eslint.config.mjs:5–48`
- **توضیح فنی:** قواعد کلیدی warn هستند (no-explicit-any، no-unused-vars، exhaustive-deps) و چند قاعده کاملاً خاموش‌اند: `ban-ts-comment` (اجازهٔ @ts-ignore)، `no-non-null-assertion`، `react-hooks/purity`، `react-compiler`، `no-img-element` (~۶۰ سایت)، `no-html-link-for-pages`، `no-empty` با `allowEmptyCatch`، `no-console`، `no-debugger`. `bun run lint` بدون max-warnings ⇒ هشدارها را می‌بلعد.
- **شرایط فعال‌سازی:** هرکه فقط `bun run lint` را گیت بگیرد، یا کسی @ts-ignore/`!` جدید اضافه کند.
- **سناریوی خرابی:** کد با `any`، `!` نامطمئن، یا وابستگی‌های خطرناک useEffect بدون هیچ اعتراضی کامیت می‌شود.
- **اثر:** کاهش قدرت پیش‌بینی «lint clean»؛ در وضع فعلی خسارت فعالی نیست (lint:ci صفر هشدار، ۰ ts-ignore، ۱۵ disable مستند) ولی نقاط کور بازند.
- **مدرک:** خواندن کامل config + evidence/2a-lint.log، 2a-lint-ci.log + اسکن §۴.
- **رفع:** گیت رسمی را `lint:ci` اعلام کن (README/CI — الان در CI هست ولی CI مرده: QA-401)؛ پس از مهاجرت next/image، `no-img-element` روشن شود؛ ارتقای no-explicit-any/no-unused-vars به error؛ فعال‌سازی تدریجی ban-ts-comment.
- **زمان:** ۲–۴ ساعت (تغییر سطح‌ها + صاف‌کردن موارد جدید). **احتمال بازگشت:** کم.
- **تست پذیرش:** seed یک `any`/`@ts-ignore` آزمایشی → `lint:ci` قرمز.

### QA-405 — عدم تقارن عمق typecheck بین محیط dev و CI سرد (+ skipLibCheck)
- **دامنه:** Typecheck — **شدت: Low** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `tsconfig.json:10,32–38`؛ `.gitignore:43`
- **توضیح فنی:** `include` به `.next/types/**` و `.next/dev/types/**` وابسته است؛ `next-env.d.ts` gitignored است. در dev (که سرور روشن است) این تایپ‌ها موجودند و تایپ‌چکِ من با آن‌ها اجرا شد؛ در CI سرد، typecheck **قبل از build** اجرا می‌شود و این فایل‌ها را ندارد ⇒ چکِ سبک‌تر (Next خودش در build دوباره چک می‌کند — که آن هم منوط به زنده بودن CI است: QA-401). `skipLibCheck: true` هم لایهٔ dts وابستگی‌ها را از چک خارج می‌کند.
- **سناریوی خرابی:** خطای route-type فقط در build لوکال/پس از رفع CI دیده می‌شود، نه در گیت typecheck محیط سرد.
- **اثر:** تفاوت اطمینان بین محیط‌ها؛ غافلگیری دیرهنگام.
- **مدرک:** `git ls-files next-env.d.ts` → خالی (untracked)؛ `ls .next/dev/types/routes.d.ts` → موجود (فقط در dev)؛ typecheck سرد exit 0 (2a-typecheck-cold.log).
- **رفع:** در CI پیش از typecheck یک `next build --dry-run`-مانند یا حداقل اجرای typecheck **بعد از** build/یا `bunx next typegen` (در نسخه‌های مرتبط) برای تولید تایپ‌ها؛ ارزیابی حذف skipLibCheck.
- **زمان:** ۱ ساعت. **احتمال بازگشت:** کم. **تست پذیرش:** typecheck در محیط بدون `.next` نیز معادل dev باشد.

### QA-406 — نبود `engines`/`packageManager` و bun پین‌نشده در CI
- **دامنه:** Toolchain — **شدت: Low** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `package.json` (کل فایل — فیلدها موجود نیستند)؛ `.github/workflows/ci.yml` (`bun-version: latest`)
- **توضیح فنی:** محیط من bun 1.3.14 / node 24.19.0؛ هیچ قراردادی نسخه را قفل نکرده؛ CI هر بار «latest» bun را می‌گیرد.
- **سناریوی خرابی:** رفتار متفاوت install/lockfile یا لینت بین محیط‌ها؛ شکست غریب CI پس از انتشار bun جدید.
- **اثر:** عدم تکرارپذیری بیلد. **مدرک:** مطالعهٔ دو فایل + `bun --version`، `node --version`.
- **رفع:** `"packageManager": "bun@1.3.14"`، `engines.node`، پین `bun-version` در CI (setup-bun از packageManager هم می‌خواند). **زمان:** ۳۰ دقیقه. **بازگشت:** کم. **تست پذیرش:** نصب با bun ناسازگار → خطای صریح.

### QA-407 — وابستهٔ مردهٔ production: `effect`
- **دامنه:** Deps Hygiene — **شدت: Low** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `package.json:52` (`"effect": "^3.22.2"`)
- **توضیح فنی:** ۰ ارجاع import/require/رشته‌ای در src، scripts، prisma و کانفیگ‌ها (اسکن دو-مرحله‌ای: import-spec + string-ref؛ + rg دستی). ادعای worklog («effect را نگه دار») با کد فعلی هم‌خوان نیست. در مقابل `nodemailer` واقعاً در `mail-dispatch.ts` استفاده می‌شود. همچنین `postcss`/`prisma` در `dependencies`‌اند ولی نقش‌شان ابزار بیلد/CLI است (جابه‌جایی به devDeps توصیه‌شده، اثر کم).
- **سناریوی خرابی:** سطح حملهٔ CVE و وزن نصب بدون فایده؛ گمراهی خواننده.
- **اثر:** بهینه‌سازی، نه خرابی. **مدرک:** evidence/2a-dep-sync.log (جدول ارجاع‌ها).
- **رفع:** `bun remove effect` (و بازبینی sharp/postcss/prisma در چینش devDeps) — خارج از دستور کار من انجام نشد.
- **زمان:** ۱۵ دقیقه + یک cycle تست. **بازگشت:** کم. **تست پذیرش:** build/typecheck سبز پس از حذف.

### QA-408 — `bun run smoke` بدون SMOKE_ADMIN_PASSWORD ساختاراً قرمز است و روی محیط‌های واقعی عملیات نوشتن انجام می‌دهد
- **دامنه:** Tests — **شدت: Low** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `scripts/smoke.ts:20–21,186–189,223–224`
- **توضیح فنی:** پیش‌فرض `SMOKE_ADMIN_PASSWORD=''` ⇒ گام ادمین عمداً fail (step false) ⇒ `failures>0` ⇒ exit 1؛ یعنی اجرای محلی ساده همیشه FAIL چاپ می‌کند. ضمناً اسکریپت رکورد واقعی (کاربر/سفارش/فایل) می‌سازد — برای sandbox CI مناسب است، برای استیجینگ پر_Data خطرناک.
- **سناریوی خرابی:** توسعه‌دهنده smoke را رها می‌کند چون «همیشه قرمز است»؛ یا روی محیط واقعی اجرا و دادهٔ آشغال/سفارش واقعی می‌سازد.
- **اثر:** فرسایش اعتماد به گیت؛ آلودگی داده در صورت اجرای اشتباه.
- **مدرک:** مطالعهٔ کامل smoke.ts + skip-decision log (اجرای آن در این ممیزی ممنوع بود).
- **رفع:** حالت صریح برای نبودِ اعتبارنامه (WARN + skip-شمار به‌جای fail یا exit کد متمایز 2) و برچسب «CI-only / ضد-داده‌واقعی» در README؛ در CI هم مشکل نیست چون SMOKE_* ست می‌شود.
- **زمان:** ۳۰ دقیقه. **بازگشت:** کم. **تست پذیرش:** بدون env → خروجی «SKIP admin (no creds)» و exit 0 با شمار skipها.

### QA-409 — `tailwind.config.ts` زیر Tailwind v4 مرده است
- **دامنه:** Toolchain — **شدت: Informational** — **وضعیت: Confirmed** — **اطمینان: Medium**
- **مسیر:** `tailwind.config.ts` (کل)؛ `src/app/globals.css:1–5`
- **توضیح فنی:** globals.css فقط `@import "tailwindcss"` دارد و **هیچ `@config`** ارجاع نمی‌دهد ⇒ در v4 کانفیگ JS فقط با `@config` بار می‌شود؛ علاوه بر این content globs به `./pages`، `./components`، `./app` اشاره دارند که وجود ندارند (پروژه src/ محور است). darkMode از مسیر `@custom-variant dark` در CSS تأمین می‌شود؛ plugin `tailwindcss-animate` فقط همین‌جا import شده (بی‌اثر).
- **اثر:** فایل گمراه‌کننده (تصور تنظیم تم از JS)؛ اثر عملی فعلی صفر.
- **مدرک:** `rg "@config" src/app/globals.css` → 0؛ محتوای دو فایل.
- **رفع:** حذف/بایگانی فایل یا اتصال رسمی با `@config`. **زمان:** ۲۰ دقیقه. **بازگشت:** کم. **تست پذیرش:** پس از حذف، استایل‌ها بیت‌به‌بیت بدون تغییر.

### QA-410 — محدودیت‌های ذاتی گارد `check:routes`
- **دامنه:** Tests/Static — **شدت: Informational** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `scripts/check-routes.ts:44–54,68`
- **توضیح فنی:** METHOD-agnostic («مسیرها را گارد می‌کنیم نه فعل‌ها» — مستند در خود فایل)؛ wildcard دوطرفه (`:wild` ↔ `:id`) می‌تواند تطابق کاذب بدهد؛ فقط literalها را می‌بیند (URLهای ساخته‌شدهٔ کاملاً داینامیک نامرئی‌اند).
- **اثر:** برخی کلاس‌های حذف-route را نمی‌گیرد (خصوصاً حذف POST با زنده‌ماندن GET).
- **مدرک:** مطالعهٔ کامل فایل. **رفع:** نگاشت method-aware (parse `export async function POST` از route files) — بهبود اختیاری. **زمان:** ۲–۳ ساعت. **بازگشت:** کم. **تست پذیرش:** seed حذف POST روی route موجود با GET باقی → قرمز.

### QA-411 — آرتیفکت‌های سرگردان در ریشهٔ repo: `xaa`, `xab` (۰ بایت) و `tool-results/`
- **دامنه:** Hygiene — **شدت: Informational** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `/home/z/my-project/xaa`, `xab` (untracked، صفر بایت — باقی‌ماندهٔ عملیات split/بایگانی خراب)؛ `tool-results/` (خروجی ابزار)
- **اثر:** نویز؛ خطر کامیت تصادفی. **مدرک:** `git status --porcelain` → `?? xaa`, `?? xab`؛ `ls -la` → size 0.
- **رفع:** حذف فایل‌ها + افزودن به .gitignore اگر ابزارها آنها را می‌سازند. **زمان:** ۵ دقیقه. **بازگشت:** کم. **تست پذیرش:** `git status` فقط audit-output را نشان دهد.

### QA-412 — اعتبارنامهٔ fixture در ci.yml به‌صورت plaintext
- **دامنه:** CI/Secrets — **شدت: Informational** — **وضعیت: Confirmed** — **اطمینان: High**
- **مسیر:** `.github/workflows/ci.yml:47–53`
- **توضیح فنی:** `SEED_ADMIN_PASSWORD`/`SMOKE_ADMIN_PASSWORD` با مقدار ثابت داخل فایل — برای DB فاسد SQLite یک‌بارمصرف CI و کاملاً «throwaway» مستند شده؛ راز واقعی نیست و به هیچ محیط واقعی وصل نیست. قابل قبول، ولی باید کامنت «هرگز مقدار واقعی نگذارید» حفظ شود.
- **اثر:** صفر عملیاتی؛ صرفاً نظارتی. **مدرک:** مطالعهٔ فایل. **رفع:** بی‌نیاز؛ در صورت سیاست سخت‌گیرانه، secrets repo. **زمان:** ۰. **بازگشت:** —. **تست پذیرش:** —

---

## جمع‌بندی Verdictها

| یافته | شدت | وضعیت | اطمینان |
|---|---|---|---|
| QA-401 CI هرگز اجرا نمی‌شود (`branches: ain]`) | **Critical** | Confirmed | High |
| QA-402 DB زنده بدون باسلاین مایگریشن | **High** | Confirmed | High |
| QA-403 نبود فریم‌ورک تست | Medium | Confirmed | High |
| QA-404 ESLint تعدیل‌شده؛ lint ساده گیت نیست | Medium | Confirmed | High |
| QA-405 عدم تقارن typecheck dev/CI + skipLibCheck | Low | Confirmed | High |
| QA-406 نبود engines/packageManager؛ bun latest در CI | Low | Confirmed | High |
| QA-407 وابستهٔ مردهٔ `effect` | Low | Confirmed | High |
| QA-408 smoke بدون اعتبارنامه ادمین ساختاراً fail؛ نوشتاری بودن | Low | Confirmed | High |
| QA-409 tailwind.config.ts مرده (TW4) | Informational | Confirmed | Medium |
| QA-410 محدودیت گارد check:routes | Informational | Confirmed | High |
| QA-411 آرتیفکت‌های xaa/xab/tool-results | Informational | Confirmed | High |
| QA-412 plaintext fixture creds در ci.yml | Informational | Confirmed | High |

- **توزیع:** Critical ۱ / High ۱ / Medium ۲ / Low ۴ / Informational ۴ (مجموع ۱۲)
- **UNVERIFIEDهای صریح:** `bun run smoke` (عملیات نوشتن روی DB/سرور زنده — طبق پروتکل skip شد؛ مدرک تحلیلی: مطالعهٔ کامل ۲۲۶ خط) و ادعای worklog دربارهٔ «نگه‌داشتن effect» (توسط اسکن من رد شد → QA-407).
- **پوشش این فاز:** lint/lint:ci/typecheck سرد و گرم/check:routes/migrate status/lockfile sync/pattern-scan ۲۹۰ فایلی/سلامت سرور (GET healthz) — همه با exit code ثبت شده در `audit-output/evidence/2a-*.log`.

**اقدامات پیشنهادی بعدی (به ترتیب):** ۱) رفع دو خط تریگر CI (QA-401) و یک push آزمایشی؛ ۲) baseline مایگریشن روی DB (QA-402)؛ ۳) پس از زنده‌شدن CI، افزودن Vitest/Playwright (QA-403) و ارتقای سطح قواعد lint (QA-404).
