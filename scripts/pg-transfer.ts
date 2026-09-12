/**
 * PersePix — SQLite → PostgreSQL ETL (docs/postgres-migration.md §2).
 *
 * Copies every table from the SQLite sandbox DB into a Postgres database,
 * preserving primary keys so Order.orderNumber, Order.publicRef,
 * AuditLog.entityId and all cross-references stay valid.
 *
 * USAGE
 *   1. Point DATABASE_URL at SQLite (source) and PG_URL at Postgres (target).
 *   2. Target schema must exist first:  DATABASE_URL=$PG_URL bunx prisma migrate deploy
 *   3. Run:  bun scripts/pg-transfer.ts            # full copy, idempotent (deleteMany → createMany)
 *            bun scripts/pg-transfer.ts --verify   # row-count parity report only, no writes
 *
 * NOTES
 * - Table order = FK-safe: parents before children on write, reverse on wipe.
 * - Batched createMany (500 rows) keeps memory flat and stays under Postgres
 *   parameter limits.
 * - DateTime values round-trip as JS Dates through Prisma — no manual casting.
 * - Money fields are integers (minor units) — copy verbatim, never re-derive.
 */
import { PrismaClient } from '@prisma/client'

const src = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
const dst = new PrismaClient({ datasources: { db: { url: process.env.PG_URL ?? process.env.DATABASE_URL } } })

// FK-safe order (parents → children). Derived from prisma/schema.prisma
// relations + the reverse of prisma/seed.ts's wipe order. Keep in sync when
// models are added.
const TABLES = [
  // standalone
  'user', 'settings', 'announcement', 'analyticsEvent', 'newsletterSubscriber',
  'loginThrottle', 'cookieConsent', 'legalDocument',
  // user children
  'session', 'address', 'passwordResetToken', 'emailVerificationToken', 'emailChangeToken',
  // catalog
  'person', 'personTranslation', 'category', 'categoryTranslation',
  'product', 'productTranslation', 'variant',
  'productContributor', 'productCategory', 'productMedia', 'relatedProduct', 'priceHistory',
  'article', 'articleTranslation', 'articleCategory', 'articleCategoryTranslation',
  'articleCategoryLink', 'articleRelation',
  'homepageVersion', 'homepageSection',
  // commerce
  'cart', 'cartItem', 'order', 'orderItem', 'payment', 'shipment', 'refund', 'orderEvent',
  'returnRequest', 'returnItem',
  // community
  'review', 'reviewVote', 'ticket', 'ticketMessage', 'wishlistItem', 'tasteSignal',
  // marketing + ops
  'discountCode', 'promotion', 'backInStockSubscriber', 'mailMessage', 'auditLog', 'consentRecord',
] as const

const BATCH = 500

async function tableRows(model: string): Promise<Record<string, unknown>[]> {
  const client = (src as unknown as Record<string, { findMany: (a?: object) => Promise<Record<string, unknown>[]> }>)[model]
  const out: Record<string, unknown>[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await client.findMany(cursor ? { take: BATCH, skip: 1, cursor: { id: cursor } } : { take: BATCH })
    if (page.length === 0) break
    out.push(...page)
    cursor = String(page[page.length - 1].id)
    if (page.length < BATCH) break
  }
  return out
}

async function verify() {
  console.log('Parity check (source → target):')
  let ok = true
  for (const t of TABLES) {
    const s = await ((src as unknown as Record<string, { count: () => Promise<number> }>)[t]).count()
    const d = await ((dst as unknown as Record<string, { count: () => Promise<number> }>)[t]).count().catch(() => -1)
    const mark = s === d ? '✓' : '✗'
    if (s !== d) ok = false
    console.log(`  ${mark} ${t.padEnd(28)} ${String(s).padStart(6)} → ${String(d).padStart(6)}`)
  }
  if (!ok) {
    console.error('✗ Parity FAILED — do not cutover.')
    process.exit(1)
  }
  console.log('✓ All tables match.')
}

async function transfer() {
  for (const t of [...TABLES].reverse()) {
    // Wipe children first so re-runs are idempotent.
    await ((dst as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[t]).deleteMany()
  }
  for (const t of TABLES) {
    const rows = await tableRows(t)
    const client = (dst as unknown as Record<string, { createMany: (a: object) => Promise<unknown> }>)[t]
    for (let i = 0; i < rows.length; i += BATCH) {
      await client.createMany({ data: rows.slice(i, i + BATCH) })
    }
    console.log(`  ✓ ${t.padEnd(28)} ${String(rows.length).padStart(6)} rows copied`)
  }
}

async function main() {
  if (process.argv.includes('--verify')) {
    await verify()
  } else {
    await transfer()
    await verify()
  }
}

main()
  .catch((e) => { console.error('ETL failed:', e); process.exit(1) })
  .finally(() => Promise.all([src.$disconnect(), dst.$disconnect()]))
