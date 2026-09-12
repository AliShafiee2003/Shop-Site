#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# scripts/backup-db.sh — Persepix SQLite backup (task 1-c, audit DB-001)
#
# Purpose : consistent online backup of the SQLite database via the `sqlite3`
#           .backup command, gzipped into backups/ with timestamped names.
# RPO     : 24h target → run daily via cron (see docs/production-deploy.md).
# Requires: sqlite3 CLI on the host that runs this script (and read access to
#           the DB file — on Docker deployments, run it on the host with
#           DATABASE_URL pointing at the mounted volume path).
# Safety  : uses the SQLite online-backup API → safe while the app is running.
# Retention: deletes backups older than BACKUP_RETENTION_DAYS (default 90).
#
# Usage   : DATABASE_URL=file:/path/to/db.sqlite scripts/backup-db.sh
# Cron    : 10 3 * * *  (example in docs/production-deploy.md)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
TMP_BACKUP="${TMPDIR:-/tmp}/backup.tmp"

log() { printf '[backup-db] %s\n' "$*"; }
die() { printf '[backup-db] ERROR: %s\n' "$*" >&2; exit 1; }

# ── Parse the SQLite path out of DATABASE_URL ────────────────────────────────
raw_url="${DATABASE_URL:-}"
[ -n "$raw_url" ] || die "DATABASE_URL is not set"
case "$raw_url" in
  file:*) db_path="${raw_url#file:}" ;;
  *) die "DATABASE_URL must be a SQLite 'file:' URL (got: $raw_url)" ;;
esac
db_path="${db_path%%\?*}"          # strip URL params (?mode=ro&...)
case "$db_path" in
  /*) : ;;                          # absolute → use as-is
  *)  db_path="$PROJECT_DIR/$db_path" ;;  # relative → resolve against project root
esac
[ -f "$db_path" ] || die "SQLite database not found at: $db_path"

command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI is required (apt install sqlite3 / apk add sqlite)"
command -v gzip   >/dev/null 2>&1 || die "gzip is required"

mkdir -p "$BACKUP_DIR"
rm -f "$TMP_BACKUP"
trap 'rm -f "$TMP_BACKUP"' EXIT

# ── Consistent backup + verify + compress ────────────────────────────────────
log "Backing up $db_path"
sqlite3 "$db_path" ".backup '$TMP_BACKUP'"

# Sanity-check the snapshot before we keep it (cheap page-level check).
check_result="$(sqlite3 "$TMP_BACKUP" "PRAGMA quick_check;")"
[ "$check_result" = "ok" ] || die "quick_check failed on the backup snapshot: $check_result"

stamp="$(date +%Y%m%d-%H%M%S)"
outfile="$BACKUP_DIR/persepix-$stamp.db.gz"
gzip -c "$TMP_BACKUP" > "$outfile"

# ── Retention ────────────────────────────────────────────────────────────────
deleted=0
while IFS= read -r old; do
  rm -f -- "$old"
  deleted=$((deleted + 1))
done < <(find "$BACKUP_DIR" -name 'persepix-*.db.gz' -type f -mtime +"$RETENTION_DAYS" -print)

size="$(du -h "$outfile" | cut -f1)"
log "Created $outfile ($size)"
[ "$deleted" -gt 0 ] && log "Retention: removed $deleted backup(s) older than $RETENTION_DAYS days"
log "Done."
