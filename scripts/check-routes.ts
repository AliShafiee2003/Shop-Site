/**
 * Route-coverage guard (audit v2 P1 — the class of failure behind REG-001).
 *
 * REG-001: the `dead-code purge` deleted POST /api/admin/upload while 7 admin
 * UI call-sites still POSTed to it — every image upload in the panel 404'd.
 * A smoke test would have caught it; THIS script catches it statically, in
 * seconds, on every CI run.
 *
 * What it does:
 *  1. Derives every live API route from src/app/api/**\/route.ts
 *     (dynamic segments [x] become wildcards).
 *  2. Scans all first-party src/ code for `/api/...` string literals
 *     (fetch/io/axios URLs, template literals included).
 *  3. Fails when a referenced route has no matching live route file.
 *
 * Run: bun run check:routes   (exit 1 = broken reference found)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, 'src', 'app', 'api')
const SCAN_DIRS = ['src/app', 'src/components', 'src/lib', 'src/hooks', 'src/store']

// ── 1. Collect live routes ───────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (entry === 'route.ts' || entry === 'route.tsx') out.push(full)
  }
  return out
}

/** route file path → concrete pattern segments ('[id]' → ':id'). */
function routePattern(file: string): string {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep)
  return '/api/' + rel.map((s) => (s.startsWith('[') && s.endsWith(']') ? `:${s.slice(1, -1)}` : s)).join('/')
}

const routeFiles = statSync(API_DIR).isDirectory() ? walk(API_DIR) : []
const patterns = routeFiles.map(routePattern)
/** A route exists in METHOD-agnostic form (we guard paths, not verbs). */
const patternRoots = new Set(patterns.map((p) => p))

function matches(pattern: string, route: string): boolean {
  const a = pattern.split('/').filter(Boolean)
  const b = route.split('/').filter(Boolean)
  if (a.length !== b.length) return false
  // Wildcards may appear on EITHER side: live routes use ':id' (from [id] dirs)
  // and extracted references use ':wild' (from `${expr}` template segments).
  return a.every((seg, i) => seg.startsWith(':') || b[i].startsWith(':') || seg === b[i])
}

// ── 2. Scan source for /api/... references ──────────────────────────────────
function walkSrc(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walkSrc(full, out)
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

/** Extract /api/… paths from normal and template string literals. */
const API_RE = /['"`](\/api\/[A-Za-z0-9\-._${}/[\]]*)['"`]/g
const WS_RE = /\$\{[^}]*\}/g

/** Files that legitimately hold /api path prefixes WITHOUT calling them
 *  (robots.txt Disallow directives, sitemap metadata) — never fetch URLs. */
const SKIP_FILES = /[\\/](robots|sitemap(?:\.[\w-]+)?)\.ts$/

const broken: { file: string; ref: string }[] = []
const checked = new Set<string>()

for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  let files: string[] = []
  try {
    files = walkSrc(abs)
  } catch {
    continue // optional dir
  }
  for (const file of files) {
    if (SKIP_FILES.test(file)) continue
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(API_RE)) {
      let ref = m[1].split('?')[0] // strip query (XTransformPort etc.)
      // Template expressions → wildcard segment: /api/x/${id} → /api/x/:x
      ref = ref.replace(WS_RE, ':wild')
      // Skip non-request literals (docs/anchors inside strings are rare; a
      // trailing-slash or empty tail normalizes away).
      ref = ref.replace(/\/+$/, '')
      if (ref === '/api' || ref === '') continue
      const key = `${file}::${ref}`
      if (checked.has(key)) continue
      checked.add(key)
      const segments = ref.split('/').filter(Boolean)
      const hasWildcard = segments.some((s) => s.startsWith(':'))
      const hit = patterns.some((p) => matches(p, ref))
      if (!hit) broken.push({ file: path.relative(ROOT, file), ref })
      void hasWildcard
      void patternRoots
    }
  }
}

// ── 3. Report ────────────────────────────────────────────────────────────────
if (broken.length > 0) {
  console.error(`✗ route-coverage: ${broken.length} broken /api reference(s):\n`)
  for (const b of broken) console.error(`  ${b.ref}   ← ${b.file}`)
  console.error('\nAdd the missing route (see REG-001) or fix the reference.')
  process.exit(1)
}
console.log(`✓ route-coverage: ${checked.size} distinct /api references all resolve to live routes (${patterns.length} routes)`)
