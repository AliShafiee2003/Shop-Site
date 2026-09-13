# 08 — Prioritized Roadmap (نقشهٔ راه اولویت‌بندی‌شده)

سطوح: **P0** پیش از هر deploy · **P1** پیش از Go-Live · **P2** اولین sprint پس از پایداری · **P3** میان‌مدت
ستون‌ها: اولویت | یافته | مشکل | اثر | وابستگی | زمان | نقش مسئول | تست پذیرش

## P0 — پیش از هر deploy

| P0 | QA-401 | تریگر CI خراب (`branches: ain]`) | هیچ گیت quality/audit اجرا نمی‌شود | — | 15min | DevOps | یک push واقعی → اجرای سبز هر ۷ job؛ بایت‌های yml شامل `branches: [main]` |
| P0 | QA-402/DB-401/OPS-402 | DB زنده خارج از مدیریت migration | deploy/migrate روی فایل واقعی می‌شکند | B2 | 1-2h | Backend | `migrate status` خروجی سبز؛ `migrate deploy` روی کپی → بدون خطا |
| P0 | OPS-403 | هدر cron در runbook غلط | housekeeping/mail در prod 403 ابدی | — | 15min | SRE | یک اجرای دستی cron با هدر درست → 200 |
| P0 | SEC-401 | بقایای PII پس از erasure | ریسک GDPR | — | 3-4h | Backend | erasure کاربر تست → صفر email/PII در MailMessage/AuditLog |
| P0 | SEO-401 | /fa با lang=en dir=ltr | SEO/UX دوزبانه مغایر | — | 15min | Frontend | curl /fa → `lang="fa" dir="rtl"` |
| P0 | B1 (PSP) | بدون درگاه واقعی فروش ممکن نیست | درآمد | B2 | 3-5d | Backend+زغiran | پرداخت تست واقعی + webhook امضاشده + refund دور کامل |
| P0 | B4 | صفر observability | کشف‌نشدن خطاهای prod | B2 | 0.5-1d | SRE | یک exception تست در Sentry + uptime alert |
| P0 | B5 | تصویر/restore هرگز اجرا نشده | deploy/DR نامطمئن | B2 | 0.5-1d | SRE | build تصویر + restore drill موفق روی sandbox |

## P1 — پیش از Go-Live

| P1 | COM-404 | customerNote بی‌سقف | DoS داده/دیتابیس | — | 30min | Backend | zod max → 400 برای 10KB |
| P1 | COM-401 (حداقل) | مرجوعی بن‌بست | نارضایتی/نفروش | — | 1-2d | Full-stack | approve → restock → refund در UI ادمین دور کامل |
| P1 | A11Y-401 | کنتراست ink-3 = 4.07:1 | WCAG AA fail سراسری | — | 1h | Frontend | token جدید → همهٔ نمونه‌ها ≥4.5:1 (axe) |
| P1 | ARCH-401 | نبود error.tsx/global-error.tsx | صفحهٔ سفید بی‌برند | — | 2-4h | Frontend | throw تست → صفحهٔ برندشدهٔ خطا |
| P1 | SEC-405..410,412 (بسته) | open-redirect edge/cookie Secure/CSV formula/policy رمز | hardening | — | 1d | Backend | تست‌های منفی هر مورد سبز |
| P1 | SEO-402/403/405 | legal بدون SSR، title تکراری دسته، checkout بدون main/H1 | SEO محتوایی | — | 0.5-1d | Frontend | curl هر قالب → متن SSR + H1 یکتا |
| P1 | PERF-403 | فونت max-age=0 | بازدید مجدد کند | — | 15min | DevOps | curl -I /fonts/* → immutable |
| P1 | DB-428 | ردپای demo/example.com برای prod | حرفه‌ای‌بودن/PII | — | 30min | Backend | seed جدا prod بدون ردیف‌های demo |
| P1 | E2E-401 | badge سبد stale | سردرگمی کاربر | — | 1h | Frontend | F5 روی /cart → badge درست |

## P2 — اولین sprint پس از پایداری

| P2 | DB-416+ARCH-402+PERF-404 | fetch-all کاتالوگ + بدون ISR/کش | سقف مقیاس ~۱-۳k محصول | B3 | 3-5d | Backend | صفحهٔ ۲ با SQL skip/take؛ هدرهای کش صحیح |
| P2 | PERF-401 | پایپ‌لاین تصویر (next/image + WebP/AVIF) | LCP/پهنای باند | — | 2-3d | Frontend | صفحات از next/image + WebP؛ حجم <۳۰MB |
| P2 | API-405 | ۱۰ لیست ادمین بی‌سقف | پاسخ سنگین/DoS داده | — | 1d | Backend | pagination پیش‌فرض ≤100 در همه |
| P2 | COM-402/409/414 | back-in-stock بی‌اثر، ریس دوگانهٔ cancel، PENDING_PAYMENT | عملیات ناقص | — | 1-2d | Backend | سناریوهای تست هر سه سبز |
| P2 | DB-402/406/417 | WAL + ۷ ایندکس FK + جستجو | همزمانی/سرعت | — | 0.5-1d | DBA | EQP بدون SCAN؛ busy=0 زیر بار |
| P2 | QA-403 | فریم‌ورک تست (Vitest/Playwright) | رگرسیون بی‌سد | B2 | 2-3d | QA | coverage منطق مالی ≥۶۰٪ + CI سبز |
| P2 | QA-404 | سخت‌گیری lint (warn→error) | کیفیت پایدار | B2 | 0.5d | Tech Lead | lint:ci با قوانین سختگیرانه سبز |
| P2 | COM-403/405..415 | بستهٔ Lowهای کامرس | صحت عملیاتی | — | 1-2d | Backend | تست پذیرش هر مورد |

## P3 — میان‌مدت

| P3 | ARCH-409/401 (تجزیه) | ProductEditor 1960خط/40 useState و ۱۴ فایل بزرگ دیگر | نگه‌داری‌پذیری | — | 5-8d | Frontend | هر فایل <۵۰۰ خط؛ رفتار هم‌ارز |
| P3 | ARCH-404/405/415 | تک‌منبعی‌کردن روت، حذف dead code | کاهش بدهی | — | 1-2d | Backend | grep صفر importer مرده |
| P3 | Postgres cutover | مقیاس/همزمانی واقعی | مقیاس | DB-402/416 | 3-5d | DBA | محیط staging روی PG سبز |
| P3 | GEO-401..403 + SEO-406/407 | sameAs/FAQPage/alternates | AI Search | — | 1-2d | SEO | Rich results test + نمره GEO ≥85 |
| P3 | API-402..411 | بستهٔ Lowهای API | سازگاری | — | 1d | Backend | — |
| P3 | ARCH-406..408/410..432 | بستهٔ Lowهای معماری/فرانت | بدهی فنی | — | 2-3d | Frontend | — |
| P3 | QA-405..412 | پین‌کردن toolchain، حذف deps مرده | supply-chain | B2 | 0.5d | DevOps | bun audit خروجی کاهش‌یافته پایدار |

**مجموع تلاش P0:** ≈ ۵.۵-۹ روز (با PSP) — **P1:** ≈ ۴-۶ روز — **P2:** ≈ ۱۰-۱۶ روز — **P3:** ≈ ۱۴-۲۲ روز
