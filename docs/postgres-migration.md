# PostgreSQL Migration Plan (Persepix)

> Status: **plan** — the sandbox still runs SQLite (`db/custom.db`) with
> `prisma db push`. This is the runbook for the production cutover the audit
> recommends (finding: "no migrations dir; SQLite + db push").

## Why

- SQLite locks the whole DB on writes → checkout/refund transactions serialize
  and scale-out (2+ app instances) is impossible.
- `db push` has no history: no reviewable diffs, no safe rollback, no CI gate.
- Postgres gives real `JSONB`, partial indexes, `timestamptz` and row-level
  locks the order/refund flows already assume conceptually.

## 0. Adopt `prisma migrate` BEFORE switching providers (on SQLite)

Do this first, while data still fits in a single file:

```bash
# baseline: freeze the current schema as migration 0001
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0001_init/migration.sql
bunx prisma migrate resolve --applied 0001_init

# from here on: every schema change = `bunx prisma migrate dev --name <what>`
# CI: `prisma migrate diff --from-schema-datamodel --to-migrations` must be empty
```

**Rule:** `db push` is banned once migrations exist (add a pre-commit/CI check:
`prisma migrate status` must be clean).

## 1. Provider switch

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"          // was "sqlite"
  url      = env("DATABASE_URL")   // postgres://…?sslmode=require
}
```

Type-mapping caveats (current schema → Postgres):

| SQLite (now)             | Postgres target                     | Note |
|--------------------------|-------------------------------------|------|
| `String` enums-as-text (`role`, `status`, `kind`…) | keep text + `CHECK` via Prisma comment, or real enums | Prisma `enum {}` blocks migrate cleanly; prefer them |
| JSON stored as strings (`settingsJson`, `shippingAddressJson`) | `Json` / `JsonB` columns OR keep `String` + parse | low-risk: keep `String` first pass, migrate columns later |
| `DateTime` (ms, UTC)     | `timestamptz`                       | Prisma maps automatically |
| `Boolean` (0/1)          | `boolean`                           | automatic |
| `@default(cuid())`       | unchanged (client-generated)        | none are `dbgenerated` |

Audit the schema for SQLite-only pragmas: no `AUTOINCREMENT`, no raw SQL in
`lib/server/*` beyond trivial `SELECT 1` (healthz) — verified compatible.

## 2. Data transfer (ETL)

Order matters (FKs): `User → Product/Category/Person/Article → Variant,
Translation, Review → Order(+items, events) → Cart, Session, Token tables →
Newsletter/Consent/Mail`.

```bash
# per-table copy with Prisma (single script, batched by cursor, idempotent):
bun scripts/pg-transfer.ts            # reads SQLite, upserts into Postgres by id
```

Rules:
- copy in `readReplicas`-free batches of 500 (cursor pagination by `id`);
- re-derive nothing — keep ids so `/api/orders/[orderNumber]`,
  `Order.publicRef`, `AuditLog.entityId` stay valid;
- after copy: `SELECT count(*)` parity per table + spot-check one order's
  totals in both DBs (money check: `totalMinor` identical).

## 3. Cutover checklist

1. [ ] `migrate deploy` on the production Postgres (CI job, not manual).
2. [ ] Freeze writes (maintenance flag) → final delta ETL → parity checks.
3. [ ] Flip `DATABASE_URL`, deploy, smoke: checkout (sandbox pay), refund,
       login, `healthz` (DB probe), admin RBAC 403 matrix.
4. [ ] Keep the SQLite file archived (read-only) for 90 days, then discard.
5. [ ] Rollback plan = re-point `DATABASE_URL` at a Postgres snapshot taken
       immediately before cutover (never back to SQLite).

## 4. Post-cutover upgrades unlocked (follow-ups)

- `Json` for `HomepageSection.settingsJson` → typed JSONB + GIN index.
- Partial index: `Variant(stock, isActive) WHERE stock > 0` for stock queries.
- `pg_advisory_xact_lock` replaces the serialized wishlist promise-chain hack.
- Scale-out rate limiting: move `rateLimit()` from in-memory to a `pg` table
  or Redis (audit S5 residual).
- Backups: PITR (WAL) — replaces file copies entirely.
