#!/usr/bin/env bash
# =============================================================================
# PersePix — Git history rewrite: purge the leaked seed password + old DB blob
# =============================================================================
# WHY: early commits still contained the hardcoded seed password (burned
# and rotated; the literal is deliberately NOT kept in this repo — see audit
# SEC-006). git history keeps every old blob reachable. Anyone who cloned the public repo can
# recover it. Two actions close the hole:
#
#   1. ROTATE the credential (moot at runtime — seeds now read
#      SEED_ADMIN_PASSWORD from the environment — but rotate anyway if that
#      password was reused anywhere else; it leaked, so treat it as burned).
#   2. REWRITE history so the secret is unrecoverable from the repo, then
#      force-push.
#
# PREREQUISITES
#   - pip install git-filter-repo        (https://github.com/newren/git-filter-repo)
#   - A FRESH CLONE of the repo (filter-repo refuses to run on repos without
#     a fresh clone guard; it also removes remotes — re-add yours at the end).
#   - Coordinate with all collaborators: after the force-push everyone must
#     re-clone (old clones still hold the poisoned history).
#
# USAGE
#   chmod +x scripts/rewrite-git-history.sh
#   ./scripts/rewrite-git-history.sh git@github.com:AliShafiee2003/Shop-Site.git
#
# The script is IDEMPOTENT-ish: on a second run the replacements simply match
# nothing. It never pushes automatically without the explicit --push flag.
# =============================================================================
set -euo pipefail

REMOTE="${1:?usage: $0 <remote-url> [--push]}"
PUSH_FLAG="${2:-}"

WORKDIR="$(mktemp -d)/shop-site-rewrite"
REPLACEMENTS="$(mktemp)"

trap 'rm -f "$REPLACEMENTS"' EXIT

# ── 1. Secrets to purge (add more lines here if more leaks are found) ────────
cat > "$REPLACEMENTS" <<'EOF'
# Put the BURNED literal(s) here yourself — they must not be committed:
#   OLD_SEED_PASSWORD===>***REMOVED***
EOF

echo "▶ Fresh clone: $REMOTE → $WORKDIR"
git clone "$REMOTE" "$WORKDIR"
cd "$WORKDIR"

echo "▶ Rewriting history (this can take a while on big repos)…"
git filter-repo --replace-text "$REPLACEMENTS"

# The old seeded SQLite binary (db/custom.db) also shipped credential hashes +
# customer PII from local testing. If any commit ever tracked it, drop the file
# from ALL history (paths are safe to keep in .gitignore going forward).
if git log --all --oneline -- 'db/custom.db' 'db/*.db' | head -1 | grep -q .; then
  echo "▶ Removing tracked database blobs from history…"
  git filter-repo --invert-paths --path db/custom.db --path-glob 'db/*.db'
fi

git remote add origin "$REMOTE"
echo "✓ History rewritten. Branch summary:"
git log --all --oneline | head -5

if [ "$PUSH_FLAG" = "--push" ]; then
  echo "▶ Force-pushing rewritten history…"
  git push --force --all origin
  git push --force --tags origin
  echo "✓ Pushed. EVERY collaborator must now re-clone:"
  echo "    git clone $REMOTE && cd Shop-Site"
else
  echo "ℹ Dry-run complete. Inspect $WORKDIR, then push manually:"
  echo "    cd $WORKDIR && git push --force --all origin && git push --force --tags origin"
fi

echo
echo "POST-FLIGHT CHECKLIST"
echo "  [1] Rotate SEED_ADMIN_PASSWORD / SEED_CUSTOMER_PASSWORD values everywhere."
echo "  [2] Verify GitHub shows no old commits:  git log -S 'Simorgh' --all"
echo "  [3] Ask GitHub support to cache-purge dangling commits (optional, paranoid)."
echo "  [4] All collaborators re-clone; old clones are permanently stale/poisoned."
