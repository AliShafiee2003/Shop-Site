import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const products = await db.product.findMany({ take: 5, select: { slug: true, status: true, variants: { select: { stock: true, isActive: true } } } })
console.log(JSON.stringify(products, null, 1))
const total = await db.variant.aggregate({ _sum: { stock: true }, _count: true })
console.log('variants:', total._count, 'total stock:', total._sum.stock)
await db.$disconnect()
