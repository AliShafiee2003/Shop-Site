// One-off: seed demo discount codes (idempotent upsert).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const YEAR = 365 * 24 * 3600 * 1000

async function main() {
  const end = new Date(Date.now() + YEAR)
  const rows = [
    { code: 'SIMORGH10', type: 'PERCENT', value: 10, minSubtotalMinor: 0, maxRedemptions: null, noteEn: '10% off any order', noteFa: '۱۰٪ تخفیف برای هر سفارش' },
    { code: 'WELCOME5', type: 'FIXED', value: 500, minSubtotalMinor: 2500, maxRedemptions: null, noteEn: '€5 off orders over €25', noteFa: '۵ یورو تخفیف برای سفارش‌های بالای ۲۵ یورو' },
    { code: 'AUTUMN15', type: 'PERCENT', value: 15, minSubtotalMinor: 4000, maxRedemptions: 50, noteEn: '15% off orders over €40 — first 50 readers', noteFa: '۱۵٪ تخفیف برای سفارش‌های بالای ۴۰ یورو — ۵۰ خوانندهٔ اول' },
  ] as const
  for (const r of rows) {
    await db.discountCode.upsert({
      where: { code: r.code },
      update: { endsAt: end, isActive: true },
      create: { ...r, startsAt: new Date(), endsAt: end },
    })
  }

  // Sitewide auto promotion (season sale) — exactly one active at a time.
  await db.promotion.updateMany({ where: { isActive: true }, data: { isActive: false } })
  await db.promotion.updateMany(
    { where: { name: 'Autumn Sale' }, data: { isActive: true, startsAt: new Date(), endsAt: end } },
  )
  const promoCount = await db.promotion.count({ where: { name: 'Autumn Sale' } })
  if (promoCount === 0) {
    await db.promotion.create({
      data: {
        name: 'Autumn Sale', type: 'PERCENT', value: 10, isActive: true,
        startsAt: new Date(), endsAt: end,
        noteEn: 'Autumn sale — 10% off everything', noteFa: 'فروش پاییزه — ۱۰٪ تخفیف روی همهٔ کتاب‌ها',
      },
    })
  }

  console.log('discount codes seeded:', rows.map((r) => r.code).join(', '), '+ sitewide promotion "Autumn Sale"')
}

main().finally(() => db.$disconnect())
