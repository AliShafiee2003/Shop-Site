# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Persepix production image — multi-stage build.
#
# Audit traceability (report 07 — DevOps / Production Readiness):
#   OPS-002 "no Dockerfile / no CI / no TLS"        → this file + .github/workflows/ci.yml
#                                                      + deploy/Caddyfile.production
#   OPS-003 "uploads on container FS are ephemeral" → runtime volume mount at
#                                                      /app/.next/standalone/public/uploads
#                                                      (see docs/production-deploy.md)
#   07-B "non-root user, standalone output"          → USER node + .next/standalone only
#
# ⚠ VERIFIED BY REVIEW ONLY: docker is not available in the sandbox, so this
# image has NOT been built. Run `docker build -t persepix-web:smoke .` and a
# smoke test (`curl -f localhost:3000/api/healthz`) on a machine with Docker
# BEFORE the first production push.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ────────────────────────────────────────────────────────────
# Install dependencies strictly from bun.lock (reproducible build — audit 07-B
# "Build verifiable with lockfile").
# prisma/ is copied BEFORE `bun install` because @prisma/client's postinstall
# hook runs `prisma generate` when it can find prisma/schema.prisma; without
# the schema the postinstall step fails.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ── Stage 2: build ───────────────────────────────────────────────────────────
# oven/bun:1 is the Debian-based variant (bash + GNU cp available). The repo's
# build script is `next build && cp -r .next/static ... && cp -r public ...`
# (package.json:7); `bun run` executes it via /bin/sh, and cp -r works in both
# dash and bash, so the Debian base keeps the script untouched and identical
# to local dev. (An alpine/busybox variant would also provide cp -r, but the
# Debian base matches the engine platform of the generated Prisma client.)
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build must not touch a real database: all pages are force-dynamic
# (audit ARCH-001), so nothing queries the DB during static generation — but
# Prisma still wants DATABASE_URL to be present/parseable, hence the throwaway
# file DB in /tmp.
ENV DATABASE_URL=file:/tmp/build.db
RUN bunx prisma generate
# Produces .next/standalone; the script itself copies .next/static and public/
# into .next/standalone (package.json:7), so the runtime stage needs nothing
# else from the build stage.
RUN bun run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
# node:22-alpine keeps the image small. NOTE (Prisma engine platform): the
# client was generated on Debian, so prisma/schema.prisma declares
# binaryTargets = ["native", "linux-musl-openssl-3.0.x"] to also ship the musl
# engine this runtime needs — do not remove that line (task 1-c).
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next standalone server.js binds to these (default would be localhost only
# inside the container, unreachable from the Caddy reverse proxy).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Standalone output already contains: server.js, the pruned node_modules
# (incl. generated Prisma client + engines), .next/static and public/.
COPY --from=build --chown=node:node /app/.next/standalone ./.next/standalone
# Non-root (audit 07-C §2). Uploads volume below must therefore be writable by
# uid 1000 ("node") — see docs/production-deploy.md for named-volume vs bind
# mount notes.
USER node
# Persisted state (OPS-003 mitigation until object storage):
#   docker run -v persepix-uploads:/app/.next/standalone/public/uploads ...
EXPOSE 3000
# OPS-004: /api/healthz currently also drives lazy housekeeping/mail dispatch
# (throttled to once per 6h in-process). The 30s probe interval is what feeds
# that tick today; the read-only probe split + external scheduler hitting
# /api/cron/tick lands with the OPS-004 fix (docs/production-deploy.md).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".next/standalone/server.js"]
