# Production Deploy Runbook — PersePix

Task 1-c artifacts. Audit traceability: **OPS-002** (no container/CI/TLS), **OPS-003**
(ephemeral uploads), **DB-001** (SQLite ceiling), **OPS-004** (healthz side effects),
**SEC-003** (trust proxy), **DEP-001** (dep audit).

> ⚠ **Status of the image**: `Dockerfile` is **verified by review only** — docker is
> not available in the sandbox. Perform the first `docker build` + smoke test on a
> machine with Docker before pushing to a registry.

---

## 1. Environment matrix

| Variable | Required? | Value / guidance |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **REQUIRED** | Canonical origin, e.g. `https://books.example.com`. Single source of truth for canonicals, OG, JSON-LD, sitemap (`src/lib/site.ts`). Never leave empty in prod (audit SEC-002). |
| `STATE_SECRET` | **REQUIRED** | Long random string (`openssl rand -hex 32`). Keys session + unsubscribe HMACs (SEC-006). Rotating it invalidates sessions/unsubscribe links. |
| `DATABASE_URL` | **REQUIRED** | `file:/app/db/persepix.db` in the container (backed by the `persepix-db` volume). |
| `TRUST_PROXY` | Recommended | `1` behind the `deploy/Caddyfile.production` template (trust only Caddy on 127.0.0.1); `0` behind unknown/untrusted proxies so client-supplied `X-Forwarded-*` can't spoof IPs (SEC-003). |
| `HEALTHZ_OPS` | Recommended | `0` in production once the OPS-004 fix lands: makes `/api/healthz` a pure read-only probe; background work moves to the scheduler below. |
| `CRON_SECRET` | Recommended | Long random string. Required by the external scheduler that hits `/api/cron/tick` **every 10 minutes** (digest/housekeeping/outbox drain) once OPS-004 ships. |
| `PAYMENT_PROVIDER` | **REQUIRED for checkout** | Must be set to a real gateway. If unset, checkout intentionally returns **503** (COM-001 gate) — that is the designed safe state until a real provider exists; do not "fix" it by faking a provider. |
| `SMTP_HOST` / `SMTP_PORT` | Recommended | Without them, outgoing mail stays queued in the outbox (visible in admin). |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Recommended | Credentials for the account above. |
| `NODE_ENV` | Set by image | `production` (baked into the Dockerfile runtime stage). |
| `DEV_EXPOSE_RESET_LINK` | **MUST NOT be set** | Password-reset tokens must never appear in API responses in prod (SEC-008). |

Store env in a root-only file (e.g. `/etc/persepix/persepix.env`, `chmod 600`) and run
with `--env-file`. Never commit env files (audit SEC-001: purge `.env` from git history
and rotate every secret that ever touched the repo before go-live).

---

## 2. First deploy

### 2.1 Build & push (CI/docker host)

```bash
docker build -t registry.example/persepix-web:1.0.0 .          # review-verified Dockerfile
docker push registry.example/persepix-web:1.0.0
```

Tag every release (`1.0.0`, `1.0.1`, …) — rollback depends on keeping the previous tag
(§5). CI (`.github/workflows/ci.yml`) must be green before a tag is promoted.

### 2.2 Run (single host, Caddy in front)

```bash
docker volume create persepix-db        # SQLite file + WAL
docker volume create persepix-uploads   # uploaded media (OPS-003)

docker run -d --name persepix-web \
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/persepix/persepix.env \
  -v persepix-db:/app/db \
  -v persepix-uploads:/app/.next/standalone/public/uploads \
  --restart unless-stopped \
  registry.example/persepix-web:1.0.0
```

Volume notes (OPS-003 mitigation until object storage exists):

- `/app/db` holds the SQLite file → survives redeploys.
- `/app/.next/standalone/public/uploads` holds admin-uploaded media → survives
  redeploys. **Named volumes** populate from the image on first use; if you use
  **bind mounts** instead, `chown -R 1000:1000` them (the container runs as the
  non-root `node` user, uid 1000).
- Real fix is S3-compatible object storage + CDN (audit 07-C §8); this volume is the
  bridge, not the destination.

### 2.3 Migrations on release

Migrations are applied **on every release, before/with the new container**, from a
checkout of the same commit (the runtime image intentionally has no prisma CLI —
standalone output prunes it):

```bash
git checkout <release-tag>
DATABASE_URL=file:/var/lib/docker/volumes/persepix-db/_data/persepix.db \
  bunx prisma migrate deploy
docker restart persepix-web   # only if the release also ships a new image
```

**Take a backup first** — always run `scripts/backup-db.sh` immediately before
`migrate deploy` (migrations are forward-only; the backup is your only undo, §5).

### 2.4 Reverse proxy (TLS)

```bash
SITE_DOMAIN=books.example.com caddy run --config deploy/Caddyfile.production
```

Caddy obtains/renews the certificate automatically and redirects :80 → :443. The
`?XTransformPort=` dev mechanism from the sandbox Caddyfile must never appear in this
file. If a load balancer sits in front of Caddy, enable `trusted_proxies` in the
template's global block and set `TRUST_PROXY=1` (SEC-003).

### 2.5 Smoke check

```bash
curl -f http://127.0.0.1:3000/api/healthz     # → {"ok":true,"db":true,...}
curl -f https://books.example.com/api/healthz # through TLS
curl -sI https://books.example.com | grep -i strict-transport-security
```

Then manually: homepage renders (en + fa), a product page, add-to-cart, admin login.
Note `docker inspect --format='{{.State.Health.Status}}' persepix-web` should show
`healthy` (HEALTHCHECK probes `/api/healthz` every 30s).

---

## 3. Scheduler (digest / housekeeping)

Until the dedicated scheduler exists (audit 07-C §6), background work is driven by an
**external** scheduler, not by probe polling:

```cron
*/10 * * * * curl -fsS -H "x-cron-secret: $CRON_SECRET" https://books.example.com/api/cron/tick >/dev/null
```

(every 10 min; exact header name per the OPS-004/1-b implementation). This decouples
mail dispatch + housekeeping from `/api/healthz` being polled.

---

## 4. Backup & restore (DB-001)

**Targets (audit DB-001 / report 07-B): RPO 24 h · RTO 1 h.**

### 4.1 Daily backup (RPO 24h)

`scripts/backup-db.sh` uses the SQLite online-backup API (safe while the app runs),
verifies the snapshot, gzips to `backups/persepix-YYYYmmdd-HHMMSS.db.gz`, and prunes
anything older than `BACKUP_RETENTION_DAYS` (default 90):

```cron
# /etc/cron.d/persepix-backup  — daily 03:10 host time
10 3 * * * deploy  DATABASE_URL='file:/var/lib/docker/volumes/persepix-db/_data/persepix.db' \
                   BACKUP_DIR=/srv/backups /opt/persepix/scripts/backup-db.sh \
                   >> /var/log/persepix-backup.log 2>&1
```

Also ship `/srv/backups` off-host (rsync/restic to another machine or object storage) —
a backup on the same disk as the DB is not a backup.

### 4.2 Restore (RTO 1h) + monthly drill

```bash
systemctl stop caddy && docker stop persepix-web        # maintenance window
FORCE=1 DATABASE_URL='file:/var/lib/docker/volumes/persepix-db/_data/persepix.db' \
  /opt/persepix/scripts/restore-db.sh /srv/backups/persepix-20250101-031000.db.gz
# script verifies PRAGMA integrity_check, prints next steps:
DATABASE_URL='file:/var/lib/docker/volumes/persepix-db/_data/persepix.db' bunx prisma migrate deploy
docker start persepix-web && systemctl start caddy
curl -f http://127.0.0.1:3000/api/healthz
```

**Drill**: monthly, restore the latest backup into a scratch path and run
`integrity_check` + app smoke — an untested restore is not a restore (audit 07-B
"Rollback/DR documented with drill: FAIL").

---

## 5. Rollback

- **App-only change** (no migration in the release): stop, start the previous image tag.
  Keep at least the last two tags on the host:

  ```bash
  docker stop persepix-web && docker rm persepix-web
  docker run -d --name persepix-web ... registry.example/persepix-web:0.9.9   # previous tag
  ```

- **Release included a migration**: migrations are **forward-only** (`migrate deploy`
  never rewrites history and down-migrations are not maintained). The only safe path
  for an incompatible schema change is the backup taken **before** the release (§2.3):

  1. stop the app,
  2. `restore-db.sh` with the pre-release backup (`FORCE=1`),
  3. start the **previous** image tag,
  4. verify `/api/healthz` + smoke.

  If the pre-release backup is missing, do NOT attempt surgical SQLite edits — restore
  from off-host backups and accept the data loss window.

---

## 6. Known ceiling: SQLite (DB-001)

SQLite is the current storage engine: a single writer, whole-DB write locks —
checkout/refund transactions serialize and multi-instance deployments are unsafe
(ARCH-003/004 rate-limit/idempotency state is also per-process). This is the documented
production ceiling; the planned path is PostgreSQL with PITR in
**`docs/postgres-migration.md`** (step 0 — migration baseline — is already done).
Until that cutover: keep one app instance, keep backups per §4, and expect write
throughput bounded by SQLite, not the app.

## 7. Explicitly out of scope here (remaining go-live gaps)

- Monitoring/error tracking (Sentry, uptime checks, 5xx alerts) — audit 07-C §7.
- Object storage for uploads (S3 + CDN) replacing the volume bridge (OPS-003).
- Real payment gateway behind the `PAYMENT_PROVIDER` gate (COM-001).
- Smoke/e2e tests in CI (QA-001 — slot reserved in `.github/workflows/ci.yml`).
- Image build smoke test (§2.1) — first run happens outside this sandbox.

## 8. Git history hygiene + secret rotation (C2 follow-up, audit v2 P0)

The public repo's early commits still contain the leaked seed password
(the original hardcoded value — BURNED and rotated; never re-print it in
docs, issues or commits) even though HEAD is clean. **Purging history does NOT
invalidate values that were cloned before the purge — every secret that ever
appeared in history must be treated as BURNED and rotated:**

1. Run `scripts/rewrite-git-history.sh <remote-url>` — it purges the secret and
   any tracked `db/*.db` blobs from ALL commits, then (with `--push`) force-pushes.
2. Every collaborator re-clones afterwards; old clones keep the poisoned history.
3. **Rotate (audit v2 P0 — history purge alone is not enough):**
   - `STATE_SECRET` — generating a new value instantly invalidates every signed
     newsletter confirm/unsubscribe link and OAuth state minted with the old
     one (they fail HMAC verification → the old links are rejected).
   - `SEED_ADMIN_PASSWORD` / `SEED_CUSTOMER_PASSWORD` — reseed or UPDATE the
     password hashes; the burned password must return 401 (verified in the
     sandbox on 2026-09-13).
   - Any OAuth client secrets, SMTP credentials or PSP keys that ever lived in
     the old `.env`: rotate at the provider (Google Cloud Console, mail host,
     gateway dashboard) — code-side values are never stored for these.
4. Going forward: secrets only ever enter via the environment (`.env` is
   gitignored; `.env.example` documents every variable).
