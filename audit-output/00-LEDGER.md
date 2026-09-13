# Persepix Audit v4 — Ledger (مستقل طبق دستورالعمل)

## Baseline (Phase 1)
- Timestamp (UTC): 2026-09-13T04:56:56Z
- PROJECT_PATH: /home/z/my-project (working tree = runtime truth; no ZIP provided)
- Commit: 04cf388b7026650fc3d012f76763313681ce2303 @ main, git status clean (0 entries)
- Runtime: bun 1.3.14, node v24.19.0, Next 16 App Router, React 19, Prisma 6 + SQLite (db/custom.db)
- Dev server: :3000 healthy ({"ok":true,"db":true,"latencyMs":2}) + gateway :81 → same
- Key hashes (sha256/16): package.json=432396b8d9c39e73, bun.lock=68785298c16061e1, schema.prisma=022e24d47f991df4, db/custom.db=039ae1d6cc6409b4, .env=4b5c501a7d5ff44a (values never printed)
- .env keys present (names only): DATABASE_URL, STATE_SECRET, CRON_SECRET, SEED_ADMIN_PASSWORD, SEED_CUSTOMER_PASSWORD, NEXT_PUBLIC_SITE_URL, APP_URL, DEV_EXPOSE_RESET_LINK
- Inventory: 415 files; api-route=112, component=105, server-lib=47, app-route/page=7, prisma=9 (55 models, 0 enums, 6 migrations), asset=101, script=8, docs=3, ci=1, config/root=7, other=10, hook=2, app-other=2, public-asset=1
- LOC (counted first-party): ~50,876 (components 26,051 / api-routes 9,930 / server-lib 6,056 / prisma 3,075 / config 2,180 / pages 1,059)
- Disposable DB copy for Phase 9: /tmp/audit-v4/db-copy.custom.db (sha == live at copy time)
- Scripts: dev/build/start/lint/lint:ci/typecheck/check:routes/smoke/db:generate|deploy|status|reset
- Top files: ProductEditor.tsx 2120, AccountView.tsx 1227, i18n.ts 1216, AdminProductsSection 1071, AdminDiscountsSection 957, AdminHomepageSection 920, Header.tsx 873, ProductView.tsx 873, HomeSections.tsx 861, admin/products/[id]/route.ts 837

## Ground rules (all agents)
- AUDIT ONLY: no modification of source/config/live DB. Writes only under audit-output/ and /tmp/audit-v4/
- Worklog claims = unverified leads; verdicts only from current code/runtime (VERIFIED/LIKELY/UNVERIFIED/N-A)
- Evidence saved under audit-output/evidence/; secrets redacted (type+location only)
- Report language Persian; identifiers/commands English

## Task assignments
| Task ID | Scope (protocol phases) | Report file | Status |
|---|---|---|---|
| 2-a | P2 build/lint/typecheck/tests + hidden-failure scan | work/2a-build-tests.md | RUNNING |
| 2-b | P9 DB architecture + data quality (disposable copy) | work/2b-database.md | RUNNING |
| 2-c | P7 API inventory + auth/RBAC matrix (runtime) | work/2c-api-auth.md | RUNNING |
| 2-d | P3+P4 architecture/code-quality + frontend static | work/2d-arch-frontend.md | RUNNING |
| 3-a | P8 security deep-dive | work/3a-security.md | PENDING |
| 3-b | P11+P12 SEO + GEO/AEO | work/3b-seo-geo.md | PENDING |
| 3-c | P5+P6 performance + a11y/responsive | work/3c-perf-a11y.md | PENDING |
| 3-d | P10+P13 commerce domain + DevOps readiness | work/3d-commerce-devops.md | PENDING |
| 4-a | P14 browser/API E2E journeys | work/4a-e2e.md | PENDING |
| MAIN | consolidation, scores, 13 deliverables, ZIP | (various) | PENDING |
