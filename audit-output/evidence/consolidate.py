#!/usr/bin/env python3
"""Audit v4 consolidation: 10-findings.csv, coverage fill, evidence index, deliverable assembly."""
import csv, os, json, hashlib, datetime

ROOT = "/home/z/my-project"
OUT = f"{ROOT}/audit-output"

# (id, title, severity, status, confidence, work_ref)
F = [
# 2-a build/toolchain/tests
("QA-401","CI triggers corrupted: ci.yml:34,36 literal 'branches: ain]' — push/PR filters match nothing; entire gate chain (typecheck/lint:ci/check-routes/migrate-deploy/build/smoke/bun audit) never runs","Critical","Confirmed","High","work/2a-build-tests.md"),
("QA-402","prisma migrate status exit 1 — 0/5 migrations applied, _prisma_migrations absent (DB built via db push); migrate deploy would fail","High","Confirmed","High","work/2a-build-tests.md"),
("QA-403","No test framework at all (no vitest/jest/playwright, 0 *.test.*) — zero unit/integration/E2E for business logic","Medium","Confirmed","High","work/2a-build-tests.md"),
("QA-404","ESLint narrowed: any/unused/exhaustive-deps=warn; ban-ts-comment, no-non-null-assertion, react-hooks/purity, react-compiler, no-img-element, no-console OFF","Medium","Confirmed","High","work/2a-build-tests.md"),
("QA-405","Typecheck include depends on .next/dev/types + gitignored next-env.d.ts; skipLibCheck=true — cold CI weaker","Low","Confirmed","High","work/2a-build-tests.md"),
("QA-406","No engines/packageManager pin; CI installs bun@latest","Low","Confirmed","High","work/2a-build-tests.md"),
("QA-407","Dead prod dependency 'effect' (0 references; contradicts worklog claim)","Low","Confirmed","High","work/2a-build-tests.md"),
("QA-408","bun run smoke without SMOKE_ADMIN_PASSWORD structurally exits 1; smoke performs real DB writes","Low","Confirmed","High","work/2a-build-tests.md"),
("QA-409","tailwind.config.ts dead under Tailwind v4 (no @config; content globs point to nonexistent dirs)","Informational","Confirmed","High","work/2a-build-tests.md"),
("QA-410","check-routes limits: method-agnostic, two-sided wildcards, literal-only","Informational","Confirmed","High","work/2a-build-tests.md"),
("QA-411","Stray 0-byte untracked xaa/xab in repo root","Informational","Confirmed","High","work/2a-build-tests.md"),
("QA-412","Plaintext throwaway fixture creds in ci.yml (accepted, documented)","Informational","Confirmed","High","work/2a-build-tests.md"),
# 2-b database
("DB-401","DB built via db push — _prisma_migrations missing; migrate deploy on this file fails (chain == schema, diff clean)","High","Confirmed","High","work/2b-database.md"),
("DB-402","journal_mode=delete (no WAL), no busy_timeout/tuning in db.ts — SQLITE_BUSY under concurrent writes (observed live)","Medium","Confirmed","High","work/2b-database.md"),
("DB-403","35 enum-emulating String fields with no DB enforcement (observed values 100% valid today)","Medium","Confirmed","High","work/2b-database.md"),
("DB-404","Zero CHECK constraints (SQLite)","Medium","Confirmed","High","work/2b-database.md"),
("DB-405","JSON-in-String storage in 10 columns (0 invalid of 82 sampled)","Low","Confirmed","High","work/2b-database.md"),
("DB-406","7 FK child sides unindexed → EXPLAIN QUERY PLAN SCAN (Payment/Refund/Shipment/ReturnRequest/ReturnItem by orderId; OrderItem.variantId; PriceHistory.variantId)","Medium","Confirmed","High","work/2b-database.md"),
("DB-407","PriceHistory table empty (feature unused)","Low","Confirmed","High","work/2b-database.md"),
("DB-408","ConsentRecord 0 rows (seed path bypasses; orders carry consentsJson)","Low","Confirmed","High","work/2b-database.md"),
("DB-409","Series modeled as free text, not normalized entity","Low","Confirmed","Medium","work/2b-database.md"),
("DB-410","Slug-based soft references between entities","Low","Confirmed","Medium","work/2b-database.md"),
("DB-411","isbn10/barcode non-unique (no unique constraint)","Low","Confirmed","High","work/2b-database.md"),
("DB-412","AuditLog has no FKs (0 dangling rows found)","Low","Confirmed","High","work/2b-database.md"),
("DB-413","Ticket→orderNumber FK-by-string","Low","Confirmed","Medium","work/2b-database.md"),
("DB-414","Seed soldCount inflated vs real orders (11/11 mismatch, display-only)","Low","Confirmed","High","work/2b-database.md"),
("DB-415","3/3 orders without publicRef populated","Low","Confirmed","High","work/2b-database.md"),
("DB-416","Catalog pagination/sort/price-filter in memory (fetchCards no take/skip + 5-deep includes) — breaks ~1-3k products","High","Confirmed","High","work/2b-database.md"),
("DB-417","contains() search = LIKE %…% full scan (SCAN Variant; locale-scan translations)","Medium","Confirmed","High","work/2b-database.md"),
("DB-418","TEMP B-TREE sort on review createdAt","Low","Confirmed","High","work/2b-database.md"),
("DB-419","TEMP B-TREE sort on cartItem addedAt","Low","Confirmed","High","work/2b-database.md"),
("DB-420","Cart.expiresAt dead column (8/8 NULL)","Low","Confirmed","High","work/2b-database.md"),
("DB-428","Demo/QA rows ship for prod (1 example.com user, 3 example.com orders)","Low","Confirmed","High","work/2b-database.md"),
("DB-429","Order delete cascades Payments/Refunds — financial-record destruction path","Low","Confirmed","High","work/2b-database.md"),
# 2-c api/auth
("API-401","Anon→admin returns uniform 403 (no 401 split; enumeration-neutral by design)","Informational","Confirmed","High","work/2c-api-auth.md"),
("API-402","429 responses lack Retry-After header (burst-verified)","Low","Confirmed","High","work/2c-api-auth.md"),
("API-403","No CSRF/Origin validation anywhere (mitigated by SameSite=Lax)","Low","Confirmed","High","work/2c-api-auth.md"),
("API-404","Rate-limit + idempotency in-memory (single-process only; documented deferral)","Low","Confirmed","High","work/2c-api-auth.md"),
("API-405","10 admin list endpoints unbounded (reviews/tickets/articles/people/categories/discounts/announcements/export/reports/customers)","Medium","Confirmed","High","work/2c-api-auth.md"),
("API-406","Leftover GET /api → {\"message\":\"Hello, world!\"}","Informational","Confirmed","High","work/2c-api-auth.md"),
("API-407","Idempotency key not visitor-scoped — replay leaks orderNumber/publicRef; caches 402 responses","Low","Confirmed","High","work/2c-api-auth.md"),
("API-408","Admin newsletter DELETE not audit-logged","Low","Confirmed","High","work/2c-api-auth.md"),
("API-409","XFF trusted when TRUST_PROXY misconfigured","Low","Confirmed","Medium","work/2c-api-auth.md"),
("API-410","/api/me → 200 {user:null} contract (not 401)","Informational","Confirmed","High","work/2c-api-auth.md"),
("API-411","Content-Type not enforced on JSON routes","Informational","Confirmed","High","work/2c-api-auth.md"),
("API-412","Dev-only token exposure double-gated (correct behavior)","Informational","Confirmed","High","work/2c-api-auth.md"),
# 2-d arch/frontend
("ARCH-401","No error.tsx/global-error.tsx — client render throw = unbranded white screen","High","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-402","All pages force-dynamic; zero ISR/output cache (6 sites)","Medium","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-403","In-memory singletons (rate-limit/idempotency/housekeeping) bounded but multi-instance unsafe","Medium","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-404","Route defined in 3+1 places (KNOWN_ROOTS/Shell/prefetch/hasOwnMain)","Medium","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-405","lib/router→SsrProviders — only dependency-direction violation","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-406","RBAC logic duplicated across AdminView","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-407","DEV_EXPOSE_RESET_LINK guard duplicated ×4","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-408","No structured logging (3 console sites)","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-409","ProductEditor = 1960-line component, 40 useState, inline fa dictionary","High","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-410","Calendar inconsistency: HomeSections:644 renders fa date as Gregorian vs formatDate jalali","Medium","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-411","faDigits pattern ×25+ duplication (two identical local dig() copies)","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-412","MAX_QTY=10 literal ×3 client vs server MAX_QTY_PER_ITEM","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-413","admin load=useCallback(apiGet) ×15 + window.confirm ×9 (radix AlertDialog unused)","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-414","quickAdd uses raw fetch instead of api() wrapper","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-415","Verified dead code: view-cache.ts (117 lines), sp-path.ts, homeHref/latinDigits/stripInline/readStoredConsent (0 importers)","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-416","Zero any/as-any; 10 justified as-unknown-as; zero TODO/FIXME","Informational","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-417","Magic numbers/strings clusters","Informational","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-418","SearchOverlay spinner stuck when query<2","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-419","onBlur setTimeout without cleanup","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-420","Zero AbortController vs 17 alive-flag patterns","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-421","~10 fetch-effects without alive flag","Low","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-422","setEmail double-set in CheckoutView","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-423","use-settings sticky failure without retry","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-424","Quote effect object-shaped deps","Low","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-425","Stale qty cap read from state","Low","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-426","Index-as-key on static lists (currently safe)","Low","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-427","Large component state without reducer","Low","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-428","Locale handling isomorphic and safe","Informational","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-429","Cache list duplication","Informational","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-430","navigate() bypasses prefetch","Informational","Confirmed","Medium","work/2d-arch-frontend.md"),
("ARCH-431","Contact form without maxLength / track input without inputMode","Low","Confirmed","High","work/2d-arch-frontend.md"),
("ARCH-432","toLatinDigits only in catalog","Low","Confirmed","High","work/2d-arch-frontend.md"),
# 3-a security
("SEC-401","PII residue after GDPR erasure — deletion transaction misses MailMessage (email+body incl. order/token) and AuditLog.summary (customer email)","Medium","Confirmed","High","work/3a-security.md"),
("SEC-402","Burned seed password literal still reachable in main-branch history (rotated; filter-repo rewrite not force-pushed)","Medium","Confirmed","High","work/3a-security.md"),
("SEC-403","bun audit exit 1: 43 advisories (30 high) — mostly build/dev chain; runtime server stack no direct advisory; dead dep 'effect' itself high; CI gate dead (QA-401)","Medium","Confirmed","High","work/3a-security.md"),
("SEC-404","Login timing enumeration ~50ms scrypt delta (bodies identical)","Low","Confirmed","High","work/3a-security.md"),
("SEC-405","Open-redirect edge next=/\\evil.com bypasses // guard in OAuth","Low","Confirmed","High","work/3a-security.md"),
("SEC-406","googleRedirectUri reads APP_URL not NEXT_PUBLIC_SITE_URL — header fallback in prod (bounded by registered redirect_uri)","Low","Confirmed","High","work/3a-security.md"),
("SEC-407","sp_g_state cookie without Secure even in prod (manual Set-Cookie; runtime-verified)","Low","Confirmed","High","work/3a-security.md"),
("SEC-408","reports/export lacks CSV formula neutralization (unlike products/export)","Low","Confirmed","High","work/3a-security.md"),
("SEC-409","scrypt N=16384 below OWASP 2^17 recommendation","Low","Confirmed","High","work/3a-security.md"),
("SEC-410","Register password without max-length/quality policy","Low","Confirmed","High","work/3a-security.md"),
("SEC-411","scryptSync blocks event loop","Informational","Confirmed","High","work/3a-security.md"),
("SEC-412","DEV_EXPOSE_RESET_LINK=1 on networked sandbox (two-condition prod guard verified)","Low","Confirmed","High","work/3a-security.md"),
("SEC-413","Unsubscribe link non-expiring","Informational","Confirmed","High","work/3a-security.md"),
("SEC-414","verify-email/confirm-email-change without rate limit","Informational","Confirmed","High","work/3a-security.md"),
("SEC-415","Markdown img-src without host whitelist (script-inert)","Informational","Confirmed","High","work/3a-security.md"),
("SEC-416","Logs free of PII (verified strength)","Informational","Confirmed","High","work/3a-security.md"),
# 3-b seo/geo
("SEO-401","/fa served with lang=en dir=ltr (layout.tsx:75)","High","Confirmed","High","work/3b-seo-geo.md"),
("SEO-402","Legal pages: no SSR body text/H1/title (client-only content)","High","Confirmed","High","work/3b-seo-geo.md"),
("SEO-403","Category title/desc duplicate catalog (page.tsx:148)","Medium","Confirmed","High","work/3b-seo-geo.md"),
("SEO-404","noindex pages carry home title/OG","Low","Confirmed","High","work/3b-seo-geo.md"),
("SEO-405","Checkout without <main>/H1","Low","Confirmed","High","work/3b-seo-geo.md"),
("SEO-406","Sitemap without xhtml:link alternates","Informational","Confirmed","High","work/3b-seo-geo.md"),
("SEO-407","JSON-LD emitted from 'use client' Shell component","Low","Confirmed","High","work/3b-seo-geo.md"),
("GEO-401","No sameAs in Organization","Medium","Confirmed","High","work/3b-seo-geo.md"),
("GEO-402","No FAQPage schema","Medium","Confirmed","High","work/3b-seo-geo.md"),
("GEO-403","Weak answer-first blocks in articles","Low","Confirmed","Medium","work/3b-seo-geo.md"),
# 3-c perf/a11y
("PERF-401","next/image almost unused (storefront raw <img>); PNG monopoly 90/2/0; covers up to 225KB; logo.png 301KB preloaded","High","Confirmed","High","work/3c-perf-a11y.md"),
("PERF-402","Dead UI wrappers + heavy deps with 0 importers (recharts/embla/calendar/day-picker/vaul/rhf/cmdk/input-otp/resizable/effect)","Low","Confirmed","High","work/3c-perf-a11y.md"),
("PERF-403","Fonts served max-age=0 (missed by immutable rule)","Low","Confirmed","High","work/3c-perf-a11y.md"),
("PERF-404","HTML/API zero cache headers (ref ARCH-402/PERF-002)","Low","Confirmed","High","work/3c-perf-a11y.md"),
("PERF-405","CWV/bundle prod metrics unmeasured (no build/lighthouse in sandbox)","Informational","Unverified","High","work/3c-perf-a11y.md"),
("A11Y-401","ink-3 token contrast 4.07:1 < 4.5 AA site-wide (EN+FA)","Medium","Confirmed","High","work/3c-perf-a11y.md"),
("A11Y-402","Login error without aria-invalid/describedby","Low","Confirmed","High","work/3c-perf-a11y.md"),
("A11Y-403","Catalog heading skip h1→h3","Low","Confirmed","High","work/3c-perf-a11y.md"),
("A11Y-404","Search results use <button> instead of link","Low","Confirmed","High","work/3c-perf-a11y.md"),
("A11Y-405","Focus not moved into mobile menu","Low","Confirmed","High","work/3c-perf-a11y.md"),
("A11Y-406","\"1 items\" pluralization in live region","Informational","Confirmed","High","work/3c-perf-a11y.md"),
# 3-d commerce/devops
("COM-401","ReturnRequest dead-end — no admin approve/restock/refund path exists","High","Confirmed","High","work/3d-commerce-devops.md"),
("COM-402","Back-in-stock notify only stamps notifiedAt — email never queued even with SMTP","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("COM-403","Customer-cancel refund ignores ceiling (currently shielded by status gate)","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-404","customerNote unbounded in checkout zod schema","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("COM-405","Idempotency key not visitor-scoped + caches 402 (ref API-407)","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-406","Order numbers count-based guessable (publicRef mitigates)","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-407","VAT 10% applied to total incl. shipping; EUR hardcoded","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-408","Zero-total (100% discount) path; negatives impossible (verified)","Informational","Confirmed","High","work/3d-commerce-devops.md"),
("COM-409","Admin cancel lacks race guard → double-restock possible (refund safe)","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("COM-410","Checkout email not tied to session user","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-411","Address fields unbounded/unvalidated","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-412","Stacking = sitewide promo + 1 code; PATCH can invert schedule","Informational","Confirmed","Medium","work/3d-commerce-devops.md"),
("COM-413","Order state machine map verified","Informational","Confirmed","High","work/3d-commerce-devops.md"),
("COM-414","PENDING_PAYMENT orders never cleaned","Low","Confirmed","High","work/3d-commerce-devops.md"),
("COM-415","Guest orders can't self-cancel","Low","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-401","CI dead + no image/deploy job","High","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-402","Live DB unmigrated vs docs claiming baseline done","High","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-403","Runbook cron uses wrong header x-cron-secret vs actual Authorization Bearer → silent 403-forever in prod","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-404","Observability zero (no metrics/error tracking/alerting)","High","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-405","Docker image never built","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-406","Backups DB-only: no uploads backup, no offsite, no restore drill","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-407","No SIGTERM graceful shutdown handler","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-408","Scale-out blocker inventory: per-process idempotency → duplicate orders","Medium","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-409","No WAL (ref DB-402)","Low","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-410","No resource limits / log rotation","Low","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-411","bun unpinned, no dependabot","Low","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-412","Caddy template good but undeployed","Informational","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-413","Secrets management solid (fail-fast, untracked)","Informational","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-414","RPO/RTO unverified","Low","Unverified","High","work/3d-commerce-devops.md"),
("OPS-415","Fail-closed env defaults (strength)","Informational","Confirmed","High","work/3d-commerce-devops.md"),
("OPS-416","Dockerfile comment drift","Informational","Confirmed","High","work/3d-commerce-devops.md"),
# 4-a e2e
("E2E-401","Stale cart badge: header showed '0 items' right after direct /cart navigation while /api/cart had 2 items","Low","Confirmed","High","work/4a-e2e.md"),
("E2E-402","Language menu not openable via synthetic click (likely automation artifact — Radix pointerdown + eval blur)","Informational","Unverified","Medium","work/4a-e2e.md"),
]

DOMAINS = {"QA":"Build/Toolchain/Tests","DB":"Database","API":"Backend/API","ARCH":"Architecture/Frontend","SEC":"Security","SEO":"SEO","GEO":"GEO/AEO","PERF":"Performance","A11Y":"Accessibility","COM":"Commerce","OPS":"DevOps/SRE","E2E":"E2E Verification"}

def domain_of(fid):
    for p in sorted(DOMAINS, key=len, reverse=True):
        if fid.startswith(p+"-"): return DOMAINS[p]
    return "General"

with open(f"{OUT}/10-findings.csv","w",newline="") as f:
    w = csv.writer(f)
    w.writerow(["ID","Title","Domain","Severity","Status","Confidence","DetailsFile","ReproducibleEvidence"])
    for fid,title,sev,st,conf,ref in F:
        w.writerow([fid,title,domain_of(fid),sev,st,conf,f"{OUT}/{ref}","see DetailsFile + evidence/"])

from collections import Counter
sev = Counter(r[2] for r in F)
print("FINDINGS:", len(F), dict(sev))

# ---- coverage fill ----
cov_path = f"{OUT}/09-audit-coverage.csv"
rows = list(csv.DictReader(open(cov_path)))
depth = {
 "api-route": ("YES","FULL","2-c read all 112 route files (inventory+guards); auth-sensitive read fully","API-401..412"),
 "app-route/page": ("YES","FULL","SEO runtime raw-HTML + code read (3-b) + 2-d Shell/layout","SEO-401..407"),
 "component": ("YES","TARGETED","Top-15 deepest (2-d) + pattern sweeps (hooks/forms/fetch) + runtime a11y (3-c)","ARCH-401..432; A11Y-401..406"),
 "server-lib": ("YES","TARGETED","Core libs full read (auth/cart/checkout/google/session/rate-limit/housekeeping/mail/seo helpers) across 2-c/2-d/3-a/3-d","SEC-401..416; API-402..409"),
 "prisma": ("YES","FULL","schema.prisma full read + migrations + data-quality on disposable copy (2-b)","DB-401..429"),
 "script": ("YES","TARGETED","smoke.ts + check-routes.ts FULL; others targeted","QA-408; QA-410"),
 "docs": ("COUNTED","SUMMARY","counted; production-deploy.md claims cross-checked in 3-d","OPS-402; OPS-403"),
 "asset": ("COUNTED","-","binary/static; sizes+formats counted (3-c image audit)","PERF-401"),
 "public-asset": ("COUNTED","-","-","-"),
 "config/root": ("YES","FULL","package.json/tsconfig/eslint/next.config/proxy/Caddyfile/gitignore full read","QA-404..409; PERF-403"),
 "ci": ("YES","FULL",".github/workflows full read incl. byte-level check","QA-401; OPS-401"),
 "other": ("COUNTED","-","misc root files counted","QA-411"),
 "hook": ("YES","TARGETED","2-d React hooks sweep","ARCH-418..426"),
 "app-other": ("YES","TARGETED","layout/not-found etc. via 2-d/3-b","ARCH-401; SEO-401"),
}
for r in rows:
    d = depth.get(r["Type"], ("NO","","unclassified",""))
    r["Reviewed"], r["ReviewDepth"], r["Notes"], r["RelatedFindings"] = d[0], d[1], d[2], d[3]
with open(cov_path,"w",newline="") as f:
    w = csv.DictWriter(f, fieldnames=["Path","Type","Size","Lines","Reviewed","ReviewDepth","RelatedFindings","ExclusionReason","Notes"])
    w.writeheader(); w.writerows(rows)
yes_full = sum(1 for r in rows if r["Reviewed"]=="YES" and r["ReviewDepth"]=="FULL")
yes_t = sum(1 for r in rows if r["Reviewed"]=="YES")
cnt = sum(1 for r in rows if r["Reviewed"]=="COUNTED")
print(f"COVERAGE: full={yes_full} targeted={yes_t-yes_full} counted={cnt} total={len(rows)}")

# ---- evidence index ----
ev = sorted(os.listdir(f"{OUT}/evidence"))
with open(f"{OUT}/11-evidence-index.md","w") as f:
    f.write("# 11 — Evidence Index\n\nهر فایل: raw خروجی فرمان/پروب با timestamp در نام محتوا. تولید: فازهای ۱–۱۴ (۹ عامل + عامل اصلی).\n\n")
    f.write("| File | Kind | Notes |\n|---|---|---|\n")
    notes = {
      "phase1-inventory":"Baseline inventory script + summary JSON (415 files)",
      "2a-":"lint/typecheck/check-routes/migrate-status/pattern-scan outputs",
      "2b-":"data-quality script+json, EQP plans, db-vs-schema diffs",
      "2c-":"auth matrix TSVs, rate-limit log, cookie flags, summary JSON",
      "2d-":"import cycles, fan-in, dep violations, dead exports JSON",
      "3a-":"headers, git history/tracking, enumeration probe, bun audit, uploads headers",
      "3b-":"robots/sitemap/llms raw",
      "3c-":"timing ×9, cache headers, html weight, bundle signals, tab audit, responsive overflow, RTL screenshot",
      "3d-":"runtime probes, money math",
      "4a-":"smoke, network log, console log, DB-after-checkout, audit footprint",
    }
    for e in ev:
        n = next((v for k,v in notes.items() if e.startswith(k)), "")
        f.write(f"| evidence/{e} | log/json | {n} |\n")
    f.write(f"\nTotal evidence files: {len(ev)}\n")

# ---- numbered deliverables assembly (headers + work bodies) ----
def body(p): return open(f"{OUT}/{p}").read()

hdr02 = """# 02 — Security Report (OWASP Top 10 / ASVS / API Top 10)

دامنه: فاز ۸ دستورالعمل + مکمل‌های runtime. روش: خوانش کامل مسیرهای حساس + پروب‌های غیرمخرب curl + بررسی git history + bun audit.
**نتیجه کلان:** صفر Critical/High در حوزهٔ امنیت. ۳ Medium، ۷ Low، ۶ Info. پوسچر قوی (۲۲ نقطهٔ قوت مستند با file:line).
سطح اطمینان محدودیت: رفتار production واقعی (nonce CSP/Secure/HSTS لبه) فقط از کد+شبیه‌سازی — dev اجراست؛ webhook PSP نصب نیست (fail-closed).

"""
open(f"{OUT}/02-security-report.md","w").write(hdr02 + body("work/3a-security.md") + "\n\n---\n\n## پیوست — ماتریس دسترسی (از 2-c)\n\n" + body("work/2c-api-auth.md"))

hdr03 = """# 03 — Frontend, Performance & Accessibility Report

دامنه: فازهای ۴/۵/۶ (React/state/forms استاتیک + timing/bundle-signals + WCAG 2.2 AA + Responsive 320→1440 + RTL).
روش: خوانش ایستا + curl timing + agent-browser (keyboard/contrast/overflow) — بدون production build (ممنوعیت محیط؛ CWV عددی UNVERIFIED).

"""
open(f"{OUT}/03-frontend-performance-accessibility.md","w").write(hdr03 + body("work/3c-perf-a11y.md") + "\n\n---\n\n## پیوست — معماری و کیفیت کد فرانت‌اند (2-d)\n\n" + body("work/2d-arch-frontend.md"))

hdr04 = """# 04 — Backend, API & Commerce Report

دامنه: فازهای ۷ و ۱۰ — ۱۱۲ مسیر API (inventory کامل)، ماتریس AuthN/AuthZ با ~۱۳۵ فراخوانی ۴-هویتی، rate-limit runtime، idempotency، و منطق فروشگاهی (pricing/TOCTOU/stock/refund/returns/notifications).
نتیجه کلان: گاردها سبز؛ TOCTOU checkout سالم؛ یافته‌های اصلی API-405 (لیست‌های بی‌سقف ادمین)، COM-401 (بن‌بست مرجوعی)، COM-404/409.

"""
open(f"{OUT}/04-backend-api-commerce.md","w").write(hdr04 + body("work/2c-api-auth.md") + "\n\n---\n\n## پیوست — دامنهٔ فروشگاهی (3-d Part 1)\n\n" + body("work/3d-commerce-devops.md"))

hdr05 = """# 05 — Database & Data Quality Report

دامنه: فاز ۹ — schema.prisma کامل (۵۵ مدل)، ایندکس‌ها با EXPLAIN QUERY PLAN واقعی، زنجیرهٔ migration، و Data Quality روی **کپی disposable** (صفر جهش روی DB زنده؛ جهش‌های مشاهده‌شده در DB زنده متعلق به تست‌های runtime مجاز 2-c/4-a است و مستند شد).
نتیجه کلان: کیفیت داده بی‌نقص (۰ یتیم/۰ تکراری/۰ ناهمخوانی مالی)؛ ریسک‌ها: DB-401 (خارج از مدیریت migration)، DB-416 (کاتالوگ in-memory)، DB-402 (بدون WAL)، DB-406/417 (ایندکس/اسکن).

"""
open(f"{OUT}/05-database-data-quality.md","w").write(hdr05 + body("work/2b-database.md"))

hdr06 = """# 06 — SEO, GEO & AEO Report

دامنه: فازهای ۱۱ و ۱۲ — متادیتای ۱۴ قالب زنده (HTML خام curl)، JSON-LD، sitemap/robots/llms.txt، soft-404، canonicalization پارامترها، و آمادگی AI Search (نمره ۷۸/۱۰۰).

"""
open(f"{OUT}/06-seo-geo-aeo.md","w").write(hdr06 + body("work/3b-seo-geo.md"))

hdr07 = """# 07 — DevOps, SRE & Production Readiness Report

دامنه: فاز ۱۳ — CI/CD، تصویر Docker، بکاپ/restore، observability، hardening، مقیاس‌پذیری، cron؛ + چک‌لیست آمادگی (PASS=2/PARTIAL=7/FAIL=11) و Go/No-Go.
یادآوری: جزئیات زنجیرهٔ build/ابزار در work/2a-build-tests.md (فایل 01 شامل آن است).

"""
open(f"{OUT}/07-devops-production-readiness.md","w").write(hdr07 + body("work/3d-commerce-devops.md"))

hdr01 = """# 01 — Full Technical Audit (Master Synthesis)

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

"""
open(f"{OUT}/01-full-technical-audit.md","w").write(hdr01 + "\n---\n\n## پیوست — Build/Toolchain/Tests کامل (2-a)\n\n" + body("work/2a-build-tests.md"))

print("deliverables assembled OK")
