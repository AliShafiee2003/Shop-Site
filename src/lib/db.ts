import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * S6: query logging is a DEBUG affordance only. Prisma query logs contain
 * customer PII (emails, addresses passed to WHERE clauses) and were being
 * written to disk unrotated — they must never run in production.
 */
const queryLog = process.env.NODE_ENV === 'production' || process.env.PRISMA_QUERY_LOG === '1'
  ? []
  : (['query'] as const)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...queryLog],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
