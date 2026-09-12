/**
 * PersePix operational smoke test (audit v2 P1 — QA-001).
 *
 * Pure black-box HTTP against a RUNNING server — no test framework, no DB
 * access. This is the gate that would have caught REG-001 (the deleted
 * /api/admin/upload route that broke every admin image upload): the admin
 * upload step below hits the real endpoint with a real PNG.
 *
 * Flow: healthz → register → login → product → add-to-cart → checkout
 * (sandbox card) → guest track → customer-403 matrix → admin login →
 * admin upload → uploaded file served.
 *
 * Run:  bun run smoke                       (against http://localhost:3000)
 *       SMOKE_BASE_URL=https://staging… bun run smoke
 *
 * Admin credentials come from the environment (SMOKE_ADMIN_EMAIL /
 * SMOKE_ADMIN_PASSWORD) — defaults match the sandbox seed for local runs only.
 */
const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'owner@persepix.ir'
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? ''
const UNIQUE = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const CUSTOMER_EMAIL = `${UNIQUE}@smoke.test`
const CUSTOMER_PASSWORD = `Smoke-${Math.random().toString(36).slice(2)}!42`

// ── minimal cookie jar (set-cookie → Cookie) ────────────────────────────────
type Jar = Map<string, string>
const jar = (): Jar => new Map()
function absorb(res: Response, j: Jar) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) j.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}
function cookieHeader(j: Jar): string {
  return [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

let failures = 0
function step(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function call(
  j: Jar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {}
  const ch = cookieHeader(j)
  if (ch) headers.Cookie = ch
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body // fetch sets the multipart boundary header itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: 'manual' })
  absorb(res, j)
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON (e.g. static file) */
  }
  return { status: res.status, json }
}

const expect = (cond: boolean, what: string, got: unknown) =>
  step(what, cond, `HTTP ${String(got)}`)

// ── 1. liveness ──────────────────────────────────────────────────────────────
async function healthz() {
  const res = await fetch(`${BASE}/api/healthz`)
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; db?: boolean }
  expect(res.status === 200 && body.ok === true && body.db === true, 'healthz: 200 + db ok', res.status)
}

// ── 2-3. customer register + login ──────────────────────────────────────────
async function customerAuth(j: Jar) {
  const reg = await call(j, 'POST', '/api/auth/register', {
    email: CUSTOMER_EMAIL,
    password: CUSTOMER_PASSWORD,
    name: 'Smoke Tester',
    locale: 'en',
  })
  expect(reg.status === 200 || reg.status === 201, 'register customer', reg.status)
  const login = await call(j, 'POST', '/api/auth/login', { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD })
  expect(login.status === 200, 'login customer', login.status)
}

// ── 4-6. pick product → add to cart → checkout ──────────────────────────────
async function purchase(j: Jar) {
  const list = await call(j, 'GET', '/api/products?take=8')
  const products = ((list.json as { items?: { slug: string }[] }) ?? {}).items ?? []
  expect(products.length > 0, 'catalog lists products', `${products.length} items`)
  if (products.length === 0) return null

  let picked: { slug: string; variantId: string } | null = null
  for (const p of products) {
    const det = await call(j, 'GET', `/api/products/${p.slug}`)
    // The detail endpoint returns the product object at top level (no wrapper).
    const detail = det.json as { variants?: { id: string; stock?: number; isActive?: boolean }[] } | null
    const v = detail?.variants?.find((x) => x.isActive !== false && (x.stock ?? 0) > 0)
    if (v) {
      picked = { slug: p.slug, variantId: v.id }
      break
    }
  }
  expect(picked !== null, 'in-stock variant found', picked?.slug ?? 'none')
  if (!picked) return null

  const add = await call(j, 'POST', '/api/cart/items', { variantId: picked.variantId, quantity: 1 })
  const cart = add.json as { items?: unknown[] }
  expect(add.status === 200 && (cart.items?.length ?? 0) > 0, 'add to cart', add.status)

  const settings = await call(j, 'GET', '/api/settings')
  const methods = ((settings.json as { shipping?: { methods?: { id: string; countries?: string[] }[] } }).shipping?.methods) ?? []
  const method = methods.find((m) => m.countries?.includes('AT')) ?? methods[0]
  expect(!!method, 'shipping method available', method?.id ?? 'none')
  if (!method) return null

  const checkout = await call(j, 'POST', '/api/checkout', {
    email: CUSTOMER_EMAIL,
    shippingAddress: {
      recipient: 'Smoke Tester',
      line1: 'Testgasse 1',
      city: 'Vienna',
      postalCode: '1010',
      countryCode: 'AT',
      phone: '+43 1 000000',
    },
    billingSame: true,
    shippingMethodId: method.id,
    locale: 'en',
    consents: { terms: true },
    idempotencyKey: UNIQUE,
    card: { number: '4242424242424242', holder: 'SMOKE TESTER', expiry: '12/30', cvc: '123' },
  })
  const order = checkout.json as { orderNumber?: string; status?: string; paymentStatus?: string }
  expect(
    checkout.status === 200 && !!order.orderNumber && order.paymentStatus === 'SUCCEEDED',
    'checkout (sandbox) → paid order',
    `${checkout.status} ${order.status ?? ''} ${order.paymentStatus ?? ''}`,
  )
  return order.orderNumber ?? null
}

// ── 7. guest tracking (BUG-002 surface) ──────────────────────────────────────
async function track(orderNumber: string | null) {
  if (!orderNumber) return
  const res = await fetch(`${BASE}/api/orders/${encodeURIComponent(orderNumber)}?email=${encodeURIComponent(CUSTOMER_EMAIL)}`)
  const body = (await res.json().catch(() => ({}))) as { order?: { status?: string; shipment?: { trackingUrl?: string | null } } }
  const url = body.order?.shipment?.trackingUrl
  expect(
    res.status === 200 && body.order?.status === 'PAID',
    'guest track: PAID + timeline',
    `${res.status} ${body.order?.status ?? ''}`,
  )
  step('trackingUrl is not a broken template (BUG-002)', url === null || url === undefined || (!url.includes('{{') && /^https?:\/\//.test(url)), url ?? 'null')
}

// ── 8. customer must NOT reach admin routes (RBAC 403 matrix) ────────────────
async function customerForbiddenMatrix(j: Jar) {
  const prods = await call(j, 'GET', '/api/admin/products')
  expect(prods.status === 403, 'customer → GET /api/admin/products = 403', prods.status)
  const upload = await call(j, 'POST', '/api/admin/upload', new FormData())
  expect(upload.status === 403, 'customer → POST /api/admin/upload = 403', upload.status)
}

// ── 9-10. admin login + THE upload (REG-001) ─────────────────────────────────
/** 1×1 transparent PNG — real image bytes, passes magic-byte sniffing. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

async function adminFlow(j: Jar) {
  if (!ADMIN_PASSWORD) {
    step('admin upload (REG-001 guard)', false, 'SMOKE_ADMIN_PASSWORD not set — cannot verify admin flows')
    return
  }
  const login = await call(j, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  expect(login.status === 200, 'admin login', login.status)
  if (login.status !== 200) return

  const fd = new FormData()
  fd.append('file', new File([PNG_BYTES], 'smoke.png', { type: 'image/png' }))
  const up = await call(j, 'POST', '/api/admin/upload', fd)
  const url = (up.json as { url?: string }).url
  expect(up.status === 200 && !!url, 'admin upload PNG → 200 + url', `${up.status} ${url ?? ''}`)

  // Uploaded bytes must actually be served (the whole point of REG-001).
  if (url) {
    const res = await fetch(`${BASE}${url}`)
    expect(res.status === 200, 'uploaded file served', res.status)
  }

  // Malicious content disguised as PNG must be rejected by magic-byte sniffing.
  const evil = new FormData()
  evil.append('file', new File([new TextEncoder().encode('<?php evil(); ?>')], 'evil.png', { type: 'image/png' }))
  const bad = await call(j, 'POST', '/api/admin/upload', evil)
  expect(bad.status === 415, 'fake PNG rejected (magic bytes)', bad.status)
}

// ── run ──────────────────────────────────────────────────────────────────────
const boot = Date.now()
console.log(`PersePix smoke → ${BASE}\n`)
await healthz()
const customerJar = jar()
await customerAuth(customerJar)
const orderNumber = await purchase(customerJar)
await track(orderNumber)
await customerForbiddenMatrix(customerJar)
await adminFlow(jar())
console.log(`\n${failures === 0 ? '✓ SMOKE PASS' : `✗ SMOKE FAIL (${failures} failed)`} in ${Date.now() - boot}ms`)
process.exit(failures === 0 ? 0 : 1)
export {}; // make this file a module (top-level await)
