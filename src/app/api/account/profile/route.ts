// PATCH /api/account/profile — name / preferred locale / marketing consent (consent logged).
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUser, publicUser } from '@/lib/server/auth'
import { apiError, json, normalizeLocale, zodMessage } from '@/lib/server/utils'

const patchSchema = z.object({
  name: z.string().min(1).optional().nullable(),
  preferredLocale: z.string().optional(),
  marketingConsent: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError(401, 'UNAUTHORIZED')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))
  const { name, preferredLocale, marketingConsent } = parsed.data

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
      ...(preferredLocale !== undefined ? { preferredLocale: normalizeLocale(preferredLocale) } : {}),
      ...(marketingConsent !== undefined ? { marketingConsent } : {}),
    },
  })

  if (marketingConsent !== undefined) {
    await db.consentRecord.create({
      data: {
        userId: user.id,
        email: user.email,
        policyType: 'MARKETING',
        policyVersion: '1.0-draft',
        locale: updated.preferredLocale,
        accepted: marketingConsent,
        source: 'account',
      },
    })
  }

  return json({ user: publicUser(updated) })
}
