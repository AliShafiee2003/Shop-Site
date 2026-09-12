import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.shipment.findMany({ where: { trackingUrl: { contains: '{{' } }, select: { id: true, carrier: true, trackingNumber: true, trackingUrl: true } })
console.log('broken rows:', rows.length, JSON.stringify(rows, null, 2))
const all = await db.shipment.findMany({ select: { id: true, carrier: true, trackingUrl: true } })
console.log('all shipments:', all.length, JSON.stringify(all))
await db.$disconnect()
