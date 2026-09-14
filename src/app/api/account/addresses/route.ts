// GET/POST /api/account/addresses — list + create addresses (first one becomes default).
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const addressSchema = z.object({
  label: z.string().optional().nullable(),
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  region: z.string().optional().nullable(),
  postalCode: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  phone: z.string().optional().nullable(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  const addresses = await db.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefaultShipping: 'desc' }, { createdAt: 'asc' }],
  })
  return json({ addresses })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = addressSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  const count = await db.address.count({ where: { userId: user.id } })
  const isFirst = count === 0

  const address = await db.address.create({
    data: {
      userId: user.id,
      label: parsed.data.label ?? null,
      recipient: parsed.data.recipient,
      line1: parsed.data.line1,
      line2: parsed.data.line2 ?? null,
      city: parsed.data.city,
      region: parsed.data.region ?? null,
      postalCode: parsed.data.postalCode,
      countryCode: parsed.data.countryCode.toUpperCase(),
      phone: parsed.data.phone ?? null,
      isDefaultShipping: isFirst,
      isDefaultBilling: isFirst,
    },
  })

  return json({ address })
}
