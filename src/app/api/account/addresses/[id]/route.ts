// PATCH/DELETE /api/account/addresses/[id] — update (with exclusive defaults) or delete.
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { apiError, json, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  label: z.string().optional().nullable(),
  recipient: z.string().min(1).optional(),
  line1: z.string().min(1).optional(),
  line2: z.string().optional().nullable(),
  city: z.string().min(1).optional(),
  region: z.string().optional().nullable(),
  postalCode: z.string().min(1).optional(),
  countryCode: z.string().min(2).max(2).optional(),
  phone: z.string().optional().nullable(),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
})

async function findOwned(id: string, userId: string) {
  return db.address.findFirst({ where: { id, userId } })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')
  const { id } = await ctx.params

  const address = await findOwned(id, user.id)
  if (!address) return apiError(404, 'NOT_FOUND', 'Address not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { isDefaultShipping, isDefaultBilling, countryCode, ...rest } = parsed.data

  // Exclusive defaults per user.
  if (isDefaultShipping === true) {
    await db.address.updateMany({ where: { userId: user.id, id: { not: id } }, data: { isDefaultShipping: false } })
  }
  if (isDefaultBilling === true) {
    await db.address.updateMany({ where: { userId: user.id, id: { not: id } }, data: { isDefaultBilling: false } })
  }

  const updated = await db.address.update({
    where: { id },
    data: {
      ...rest,
      ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
      ...(isDefaultShipping !== undefined ? { isDefaultShipping } : {}),
      ...(isDefaultBilling !== undefined ? { isDefaultBilling } : {}),
    },
  })

  return json({ address: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')
  const { id } = await ctx.params

  const address = await findOwned(id, user.id)
  if (!address) return apiError(404, 'NOT_FOUND', 'Address not found')

  await db.address.delete({ where: { id } })
  return json({ ok: true })
}
