// GET   /api/admin/settings — feature + store settings (admin view, owner-only).
// PATCH /api/admin/settings — owner-only merge-patch.
// Supported patches:
//   { giftWrap: { enabled, priceMinor } }          → the 'features' settings row
//   { store: { name, nameFa, legalName, email, phone,
//              address, freeShippingThresholdMinor } } → the 'store' settings row
import { z } from 'zod'
import { requireOwner } from '@/lib/server/auth'
import { apiError, audit, getSetting, json, setSetting, zodMessage } from '@/lib/server/utils'
import { GIFT_WRAP_DEFAULTS } from '@/lib/server/giftwrap'

/** SEC-012: a social profile must be an absolute http(s) URL — the value is
 *  rendered as a raw href in the Footer, so `javascript:`/data: URIs and
 *  protocol-relative garbage must never reach the storefront. '' clears the
 *  field (existing Task-50 behaviour). */
function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
const socialUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isHttpUrl(v), { message: 'Social links must be absolute http(s) URLs' })

export async function GET() {
  const user = await requireOwner()
  if (!user) return apiError(403, 'FORBIDDEN')
  const [features, featuresMeta, store, storeMeta] = await Promise.all([
    getSetting<Record<string, unknown>>('features', {}),
    getSetting<Record<string, unknown>>('featuresMeta', {}),
    getSetting<Record<string, unknown>>('store', {}),
    getSetting<Record<string, unknown>>('storeMeta', {}),
  ])
  return json({ features, featuresMeta, store, storeMeta })
}

const bodySchema = z.object({
  giftWrap: z.object({
    enabled: z.boolean().optional(),
    // EUR amount in minor units, clamped to a sane range (matches giftwrap.ts)
    priceMinor: z.number().int().min(0).max(5000).optional(),
  }).optional(),
  store: z.object({
    name: z.string().trim().min(2).max(60).optional(),
    nameFa: z.string().trim().min(2).max(60).optional(),
    legalName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(120).optional(),
    // contact details rendered in the footer, contact page and invoices
    phone: z.string().trim().min(6).max(40).optional(),
    address: z.string().trim().min(6).max(200).optional(),
    // free-shipping announcement + progress bar threshold, 0–€2,000
    freeShippingThresholdMinor: z.number().int().min(0).max(200_000).optional(),
    // social profiles (Task 50) — rendered in the footer + contact page only
    // when non-empty; '' clears a field. SEC-012: absolute http(s) URLs only.
    instagram: socialUrlSchema.optional(),
    x: socialUrlSchema.optional(),
    youtube: socialUrlSchema.optional(),
  }).optional(),
})

export async function PATCH(req: Request) {
  const user = await requireOwner()
  if (!user) return apiError(403, 'FORBIDDEN')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Request body must be JSON')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', zodMessage(parsed.error))

  let giftWrap: { enabled: boolean; priceMinor: number } | undefined
  let storeNext: Record<string, unknown> | undefined

  // ── Gift wrap (features row) ────────────────────────────────────────────
  if (parsed.data.giftWrap) {
    const before = await getSetting<Record<string, unknown>>('features', {})
    const gwBefore =
      (before.giftWrap as { enabled?: boolean; priceMinor?: number } | undefined) ?? GIFT_WRAP_DEFAULTS

    const patch: Record<string, unknown> = {}
    if (parsed.data.giftWrap) {
      patch.giftWrap = {
        enabled: parsed.data.giftWrap.enabled ?? gwBefore.enabled ?? true,
        priceMinor: parsed.data.giftWrap.priceMinor ?? gwBefore.priceMinor ?? GIFT_WRAP_DEFAULTS.priceMinor,
      }
    }

    const next = await setSetting<Record<string, unknown>>('features', patch)
    // Metadata row records who changed what (surfaced under the admin card).
    await setSetting<Record<string, unknown>>('featuresMeta', {
      giftWrapUpdatedBy: user.email,
      giftWrapUpdatedAt: new Date().toISOString(),
    })

    const gwNext = (next.giftWrap as { enabled: boolean; priceMinor: number } | undefined) ?? GIFT_WRAP_DEFAULTS
    const summary =
      gwNext.enabled !== gwBefore.enabled
        ? `Gift wrap ${gwNext.enabled ? 'enabled' : 'disabled'} (price ${gwNext.priceMinor} minor)`
        : `Gift wrap price updated: ${gwBefore.priceMinor ?? GIFT_WRAP_DEFAULTS.priceMinor} → ${gwNext.priceMinor} minor`
    await audit(user.email, 'SETTINGS_UPDATE', 'Settings', 'features', summary)
    giftWrap = gwNext
  }

  // ── Store identity + commerce (store row) ───────────────────────────────
  if (parsed.data.store) {
    const before = await getSetting<Record<string, unknown>>('store', {})
    const d = parsed.data.store
    const patch: Record<string, unknown> = {}
    if (d.name !== undefined) patch.name = d.name
    if (d.nameFa !== undefined) patch.nameFa = d.nameFa
    if (d.legalName !== undefined) patch.legalName = d.legalName
    if (d.email !== undefined) patch.email = d.email
    if (d.phone !== undefined) patch.phone = d.phone
    if (d.address !== undefined) patch.address = d.address
    if (d.freeShippingThresholdMinor !== undefined) patch.freeShippingThresholdMinor = d.freeShippingThresholdMinor
    if (d.instagram !== undefined) patch.instagram = d.instagram
    if (d.x !== undefined) patch.x = d.x
    if (d.youtube !== undefined) patch.youtube = d.youtube

    storeNext = await setSetting<Record<string, unknown>>('store', patch)
    await setSetting<Record<string, unknown>>('storeMeta', {
      updatedBy: user.email,
      updatedAt: new Date().toISOString(),
    })

    const changed: string[] = []
    if (d.name !== undefined && before.name !== d.name) changed.push(`name "${String(before.name ?? '')}" → "${d.name}"`)
    if (d.nameFa !== undefined && before.nameFa !== d.nameFa) changed.push(`nameFa → "${d.nameFa}"`)
    if (d.legalName !== undefined && before.legalName !== d.legalName) changed.push('legalName')
    if (d.email !== undefined && before.email !== d.email) changed.push(`email → ${d.email}`)
    if (d.phone !== undefined && before.phone !== d.phone) changed.push(`phone → ${d.phone}`)
    if (d.address !== undefined && before.address !== d.address) changed.push('address')
    if (d.freeShippingThresholdMinor !== undefined && before.freeShippingThresholdMinor !== d.freeShippingThresholdMinor) {
      changed.push(`free-shipping threshold ${String(before.freeShippingThresholdMinor ?? '—')} → ${d.freeShippingThresholdMinor} minor`)
    }
    for (const social of ['instagram', 'x', 'youtube'] as const) {
      if (d[social] !== undefined && before[social] !== d[social]) changed.push(`${social} → "${d[social]}"`)
    }
    await audit(
      user.email,
      'SETTINGS_UPDATE',
      'Settings',
      'store',
      changed.length > 0 ? `Store settings updated: ${changed.join('; ')}` : 'Store settings saved (no changes)',
    )
  }

  return json({ ...(giftWrap ? { giftWrap } : {}), ...(storeNext ? { store: storeNext } : {}) })
}
