import { PrismaClient } from '@prisma/client'

// R5: regenerated client required after the MailMessage.orderId push —
// a stale cached client would reject the new column (Unknown argument).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * S6: query logging is a DEBUG affordance only. Prisma query logs contain
 * customer PII (emails, addresses passed to WHERE clauses) and were being
 * written to disk unrotated — they must never run in production.
 * Audit QUALITY-002: the flag is an OPT-IN — `PRISMA_QUERY_LOG=1` enables
 * query logs in dev (the old expression inverted this: it DISABLED logging).
 */
const queryLog = process.env.NODE_ENV === 'production'
  ? []
  : process.env.PRISMA_QUERY_LOG === '1'
    ? (['query'] as const)
    : []

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...queryLog],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// DB-402 (audit v4): SQLite tuning. `journal_mode=WAL` is persistent on the DB
// file itself, so it only needs to be applied once per database — after it
// sticks, readers no longer block writers (the pre-WAL "delete" mode made every
// concurrent checkout/analytics write stall all readers and risked SQLITE_BUSY).
// `busy_timeout` and `foreign_keys` are per-connection settings; applying them
// on the init connection covers the bootstrap queries and WAL is inherited by
// every later connection from the file header. The whole block is
// log-and-continue: a pragma failure (locked file during a migration, read-only
// volume, …) must NEVER break the app at import time.
void (async () => {
  try {
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
    await db.$queryRawUnsafe('PRAGMA busy_timeout=5000;')
    await db.$queryRawUnsafe('PRAGMA foreign_keys=ON;')
  } catch (err) {
    console.error('[db] SQLite pragma init failed (continuing):', err)
  }
})()
