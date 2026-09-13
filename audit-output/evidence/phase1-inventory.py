#!/usr/bin/env python3
"""Audit v4 — Phase 1 inventory builder. Writes 09-audit-coverage.csv skeleton + summaries."""
import os, subprocess, json, csv, hashlib

ROOT = "/home/z/my-project"
OUT = "/home/z/my-project/audit-output"

tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
untracked_important = []
for rel in ["db/custom.db"]:
    if os.path.exists(os.path.join(ROOT, rel)):
        untracked_important.append(rel)

def classify(p):
    if p.startswith("src/app/api/"): return "api-route"
    if p.startswith("src/app/") and (p.endswith("page.tsx") or p.endswith("route.ts") or p.endswith("layout.tsx") or "not-found" in p or p.endswith("robots.ts") or p.endswith("sitemap.ts") or p.endswith("error.tsx") or p.endswith("loading.tsx")): return "app-route/page"
    if p.startswith("src/app/"): return "app-other"
    if p.startswith("src/components/"): return "component"
    if p.startswith("src/lib/"): return "server-lib"
    if p.startswith("src/hooks/"): return "hook"
    if p.startswith("prisma/"): return "prisma"
    if p.startswith("scripts/"): return "script"
    if p.startswith("docs/"): return "docs"
    if ".github/" in p: return "ci"
    if p.endswith((".png",".jpg",".jpeg",".webp",".avif",".svg",".ico",".woff",".woff2",".ttf")): return "asset"
    if p in ("package.json","bun.lock","tsconfig.json","next.config.ts","Caddyfile",".gitignore",".env","eslint.config.mjs","proxy.ts"): return "config/root"
    if p.startswith("public/"): return "public-asset"
    if p.endswith((".md",)): return "docs"
    if p.endswith(".sql"): return "migration-sql"
    return "other"

def is_binary(p):
    try:
        with open(p, "rb") as f:
            return b"\0" in f.read(1024)
    except Exception:
        return True

rows = []
for rel in sorted(set(tracked) | set(untracked_important)):
    full = os.path.join(ROOT, rel)
    if not os.path.isfile(full): continue
    size = os.path.getsize(full)
    t = classify(rel)
    lines = ""
    if t not in ("asset","public-asset") and not is_binary(full) and size < 3_000_000:
        try:
            with open(full, "rb") as f:
                lines = sum(1 for _ in f)
        except Exception:
            lines = ""
    rows.append({"Path": rel, "Type": t, "Size": size, "Lines": lines})

with open(f"{OUT}/09-audit-coverage.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["Path","Type","Size","Lines","Reviewed","ReviewDepth","RelatedFindings","ExclusionReason","Notes"])
    w.writeheader()
    for r in rows:
        r.update({"Reviewed":"PENDING","ReviewDepth":"","RelatedFindings":"","ExclusionReason":"","Notes":""})
        w.writerow(r)

# summaries
from collections import Counter, defaultdict
c = Counter(r["Type"] for r in rows)
tot_lines = defaultdict(int)
for r in rows:
    if isinstance(r["Lines"], int): tot_lines[r["Type"]] += r["Lines"]
summary = {"total_files": len(rows), "by_type": dict(c), "lines_by_type": {k: v for k, v in sorted(tot_lines.items(), key=lambda x:-x[1])}}
with open(f"{OUT}/evidence/phase1-inventory-summary.json","w") as f:
    json.dump(summary, f, indent=2)
print(json.dumps(summary, indent=2))

# api routes
api = [r["Path"] for r in rows if r["Type"]=="api-route"]
pages = [r["Path"] for r in rows if r["Type"]=="app-route/page"]
print(f"API_ROUTES={len(api)} PAGES_LAYOUTS={len(pages)}")
with open(f"{OUT}/evidence/api-routes.txt","w") as f: f.write("\n".join(sorted(api)))
with open(f"{OUT}/evidence/app-pages.txt","w") as f: f.write("\n".join(sorted(pages)))

# prisma models
schema = open(f"{ROOT}/prisma/schema.prisma").read()
import re
models = re.findall(r"^model\s+(\w+)", schema, re.M)
enums = re.findall(r"^enum\s+(\w+)", schema, re.M)
migrations = sorted(os.listdir(f"{ROOT}/prisma/migrations")) if os.path.isdir(f"{ROOT}/prisma/migrations") else []
print(f"MODELS={len(models)} ENUMS={len(enums)} MIGRATIONS={len(migrations)}")
with open(f"{OUT}/evidence/prisma-models.txt","w") as f: f.write("\n".join(models))
with open(f"{OUT}/evidence/prisma-enums.txt","w") as f: f.write("\n".join(enums))

# biggest source files
src_rows = [r for r in rows if r["Type"] in ("api-route","app-route/page","app-other","component","server-lib","hook") and isinstance(r["Lines"], int)]
top = sorted(src_rows, key=lambda r: -r["Lines"])[:25]
with open(f"{OUT}/evidence/top25-source-files.json","w") as f:
    json.dump(top, f, indent=2)
print("TOP10:")
for r in top[:10]: print(f"  {r['Lines']:>6}  {r['Path']}")
