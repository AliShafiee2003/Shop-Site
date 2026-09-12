// GET /api/privacy/cookies — active cookie inventory + policy version.
// Rendered on the cookie notice page and in the preference center; generated from
// the same definitions the consent gating uses (spec §7.1 — no doc/behaviour drift).
import { CONSENT_POLICY_VERSION, COOKIE_INVENTORY } from '@/lib/server/consent'
import { json } from '@/lib/server/utils'

export async function GET() {
  return json({
    policyVersion: CONSENT_POLICY_VERSION,
    lastUpdated: '2026-02-01',
    cookies: COOKIE_INVENTORY,
  })
}
