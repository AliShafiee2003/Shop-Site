# 12 — Verification Command Log (پیوست بازتولید)

محیط: sandbox محلی · bun 1.3.14 / node v24.19.0 · Next 16 dev :3000 (+ gateway :81) · SQLite `db/custom.db` (کپی تحلیل: `/tmp/audit-v4/db-copy.custom.db`) · HEAD `04cf388b` @ main · بازهٔ UTC: 2026-09-13T04:56 → 07:0x

قاعده: هر فرمان زیر توسط عامل اجرا و خروجی خام آن در `evidence/` ذخیره شد؛ exit code در گزارش هر عامل ثبت است. هیچ فرمانی روی DB زنده جهش‌دهنده نبود (تنها استثنا: فراخوانی‌های مجاز runtime از 2-c/4-a که جداگانه مستند شدند).

## فاز 1 — Baseline (عامل اصلی)
| فرمان | نتیجه | Evidence |
|---|---|---|
| `date -u; git rev-parse HEAD; git branch --show-current; git status --porcelain \| wc -l` | 04cf388b / main / 0 | 00-LEDGER.md |
| `curl -s :3000/api/healthz` و `:81` | `{"ok":true,"db":true,"latencyMs":2}` | — |
| `sha256sum package.json bun.lock prisma/schema.prisma db/custom.db .env` | hash ثبت شد (env فقط hash) | 00-LEDGER.md |
| `sed -n 's/^\([A-Z_0-9]*\)=.*/\1/p' .env` | فقط نام کلیدها | 00-LEDGER.md |
| `cp db/custom.db /tmp/audit-v4/db-copy.custom.db` + hash | 039ae1d6cc6409b4 (یکسان) | — |
| `python3 audit-output/evidence/phase1-inventory.py` | 415 فایل/112 API/55 مدل/6 migration | phase1-inventory-summary.json |

## فاز 2 — Build/Toolchain (2-a)
| فرمان | exit | Evidence |
|---|---|---|
| `bun run lint` / `bun run lint:ci` / `bun run typecheck` (+cold `--incremental=false`) / `bun run check:routes` | 0/0/0/0 | 2a-*.log |
| `bunx prisma migrate status` | **1** (0/5 اعمال؛ نبود _prisma_migrations) | 2a-prisma-migrate-status.log |
| `bun install --frozen-lockfile --dry-run` | 0 (bun.lock سینک) | 2a-bunlock-sync |
| پویش الگو (ts-ignore/eslint-disable/empty-catch/TODO) روی ۲۹۰ فایل | آمار در JSON | 2a-pattern-scan.json |
| `bun run smoke` | اجرا نشد — عمداً (نوشته‌ساز؛ تصمیم مستند) | 2a-smoke-skip-decision |

## فاز 9 — Database (2-b)
| فرمان | نتیجه | Evidence |
|---|---|---|
| `python3 2b-data-quality.py` روی کپی disposable | ۴۸ رابطهٔ FK → ۰ یتیم؛ ۰ تکراری؛ ۰ ناهمخوانی مالی؛ جزئیات کامل | 2b-data-quality.json/.log |
| `PRAGMA integrity_check` (کپی) + `prisma migrate diff` دوجهته | ok؛ «No difference detected» ×2 | 2b-diff-*.log |
| EXPLAIN QUERY PLAN برای ۵ کوئری داغ + ۱۸ مورد | ۹/۹ مسیر داغ سبز؛ ۷ FK بدون ایندکس → SCAN؛ ۲ TEMP B-TREE | 2b-data-quality.log |

## فاز 7 — API/Auth (2-c) — runtime مجاز غیرمخرب
| فرمان/پروب | نتیجه | Evidence |
|---|---|---|
| ماتریس ۱۷ ادمین × (anon/forged/customer/admin) | 403/403/403/200 | 2c-matrix-admin.tsv |
| ماتریس ۱۰ account × (anon/customer) | 401/401/200 | 2c-matrix-account.tsv |
| انفجار rate-limit: ۶۵ POST cart؛ ۱۲ login نادرست | دقیقاً 60×200+5×429؛ 8×401+4×429 | 2c-ratelimit.log |
| Set-Cookie flags | HttpOnly؛ SameSite=lax؛ Secure مشروط prod | 2c-cookies.log |
| ردپا | ۱ کاربر تست، ۱ ریویو PENDING، ردیف‌های probe سبد (حذف)، ۱ CookieConsent، ۲ LoginThrottle — هیچ دادهٔ seed تغییر نکرد | 2c-summary.json |

## فاز 8 — Security (3-a)
| فرمان | نتیجه | Evidence |
|---|---|---|
| `curl -I` صفحه‌ها/مسیرها | CSP/CSP dev/هدرها ثبت | 3a-headers-*.txt |
| `git log` history (env/کد/رمز سوخته) + reachability از main | رمز سوخته در تاریخچه از main قابل‌دسترس (rotated؛ rewrite pending) | 3a-git-*.txt |
| `bun audit` | exit 1 — 43 advisory (30 high، غالب build/dev) | 3a-bun-audit.txt |
| پروب enumeration + فایل آپلود + بدنه‌ها | Δ~50ms؛ 415/413/415 صحیح؛ بدنه‌ها یکسان | 3a-runtime-probes.txt |

## فاز 11/12 — SEO/GEO (3-b)
| فرمان | نتیجه | Evidence |
|---|---|---|
| `curl -s` ۱۴ قالب + پارسر python (title/canonical/hreflang/H1/JSON-LD) | جدول کامل در report | /tmp/audit-v4/3b/*.html |
| `/sitemap.xml` `/robots.txt` `/llms.txt` | 96 URL، lastmod واقعی؛ AI groups؛ موجود | 3b-*.txt |
| ۶ URL بی‌معنا | همه 404 واقعی | report |

## فاز 5/6 — Perf/A11y (3-c)
| فرمان | نتیجه | Evidence |
|---|---|---|
| `curl -w` (۳ بار، میانه) برای ۷ مسیر + `/api/bootstrap` | TTFB 68-253ms (dev)؛ bootstrap ~15ms | 3c-timing-*.log |
| `curl -I /images/* /fonts/* /api/products` | images immutable؛ fonts max-age=0؛ API بدون کش | 3c-cache-headers.log |
| agent-browser: tab/focus/contrast/alt/headings/aria-live | 15/15 focus؛ ink-3=4.07 FAIL؛ بقیه سبز | 3c-tab-home.json |
| responsive 320..1440 + 640 proxy + RTL 390 | صفر overflow در ۲۰ سناریو | 3c-responsive-overflow.log؛ 3c-rtl-fa-390.png |

## فاز 10/13 — Commerce/DevOps (3-d)
| فرمان | نتیجه | Evidence |
|---|---|---|
| پروب‌های runtime (quote/guest-track/status) + ریاضی مالی روی کپی | جمع‌ها دقیق؛ 404 یکسان مهمان | 3d-runtime-probes.log؛ 3d-db-money-math.txt |
| خوانش کامل checkout/route.ts + cron/mail/housekeeping | TOCTOU سالم؛ cron: tick واحد | report |

## فاز 14 — E2E (4-a + عامل اصلی)
| فرمان | نتیجه | Evidence |
|---|---|---|
| smoke curl ۲۰ مسیر | 18×200 / 404×2 صحیح | /tmp/audit-v4/4a/smoke-*.txt |
| ۱۹ سناریوی journey (agent-browser + curl + DB-verify) | 16 PASS / 2 PARTIAL / 1 Unverified | 4a-*.txt |
| `POST /api/discount/validate` کد ساختگی | 422 `DISCOUNT_INVALID` | عامل اصلی |
| ردپا | ۲ کاربر/۲ سفارش sandbox/۲ پرداخت/۳ ایمیل/۱ ریویو/۱ اشتراک/۱ تیکت/stock — مستند؛ seed دست‌نخورده | 4a-audit-footprint.txt؛ 4a-live-db-after-checkout.txt |

## سلامت پایانی
| فرمان | نتیجه |
|---|---|
| `curl -s :3000/api/healthz` پس از پایان ممیزی | `{"ok":true,"db":true}` — سرور سالم |
