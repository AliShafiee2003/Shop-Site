#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# scripts/restore-db.sh — PersePix SQLite restore (task 1-c, audit DB-001)
#
# Purpose : restore a gzipped backup produced by scripts/backup-db.sh
#           (backups/persepix-YYYYmmdd-HHMMSS.db.gz) into the database path
#           taken from DATABASE_URL — but only after the snapshot passes
#           `PRAGMA integrity_check`.
#
# Safety  :
#   • Refuses to overwrite an existing database unless FORCE=1 is set.
#   • Run during a maintenance window: stop the app first so nothing writes
#     while the file is swapped (the swap itself is a same-directory rename,
#     i.e. atomic).
#   • On Docker hosts, chown the restored file to uid:gid 1000:1000 (the
#     non-root "node" user) if the volume is a bind mount.
#
# Usage   : scripts/restore-db.sh backups/persepix-20250101-031000.db.gz
#           FORCE=1 scripts/restore-db.sh backups/persepix-....db.gz
# Next    : printed at the end — prisma migrate deploy, restart app, smoke test.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FORCE="${FORCE:-0}"

log() { printf '[restore-db] %s\n' "$*"; }
die() { printf '[restore-db] ERROR: %s\n' "$*" >&2; exit 1; }

[ $# -eq 1 ] || die "usage: $0 <backup.db.gz>  (FORCE=1 to overwrite an existing DB)"
src_gz="$1"
[ -f "$src_gz" ] || die "backup file not found: $src_gz"

command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI is required (apt install sqlite3 / apk add sqlite)"
command -v gzip    >/dev/null 2>&1 || die "gzip is required"

# ── Resolve the target path from DATABASE_URL (same rules as backup-db.sh) ───
raw_url="${DATABASE_URL:-}"
[ -n "$raw_url" ] || die "DATABASE_URL is not set"
case "$raw_url" in
  file:*) db_path="${raw_url#file:}" ;;
  *) die "DATABASE_URL must be a SQLite 'file:' URL (got: $raw_url)" ;;
esac
db_path="${db_path%%\?*}"          # strip URL params
case "$db_path" in
  /*) : ;;
  *)  db_path="$PROJECT_DIR/$db_path" ;;
esac

target_dir="$(dirname "$db_path")"
mkdir -p "$target_dir"

if [ -e "$db_path" ] && [ "$FORCE" != "1" ]; then
  die "refusing to overwrite existing database at: $db_path (re-run with FORCE=1 to proceed)"
fi

# ── Decompress + verify in the target directory (same FS → atomic rename) ────
tmp_restore="$(mktemp "$target_dir/.restore-XXXXXX")"
trap 'rm -f "$tmp_restore"' EXIT

log "Decompressing $src_gz"
gzip -dc "$src_gz" > "$tmp_restore"

log "Running PRAGMA integrity_check on the snapshot"
result="$(sqlite3 "$tmp_restore" "PRAGMA integrity_check;")"
if [ "$result" != "ok" ]; then
  die "integrity_check FAILED ($result) — the backup is corrupt, target untouched"
fi
log "integrity_check: ok"

# ── Swap into place ──────────────────────────────────────────────────────────
mv -f "$tmp_restore" "$db_path"
trap - EXIT
chmod 600 "$db_path" 2>/dev/null || true

log "Restored $src_gz → $db_path"
log ""
log "Next steps:"
log "  1. Confirm/bring the schema up to date:"
log "       DATABASE_URL='$raw_url' bunx prisma migrate deploy"
log "  2. Restart the app:"
log "       docker restart persepix-web        # (or your supervisor unit)"
log "  3. Smoke test:"
log "       curl -f http://127.0.0.1:3000/api/healthz   → {\"ok\":true,...}"
log ""
log "Note (Docker bind mounts): chown 1000:1000 '$db_path' so the non-root"
log "'node' user in the container can write to it."
