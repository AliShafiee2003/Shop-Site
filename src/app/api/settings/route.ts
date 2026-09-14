// GET /api/settings — public-safe store + shipping + feature settings,
// plus the active sitewide promotion and the enabled admin announcements
// (both drive the announcement bar rotation).
// Composition lives in @/lib/server/store-settings — shared with /api/bootstrap.
import { json } from '@/lib/server/utils'
import { buildSettingsPayload } from '@/lib/server/store-settings'

export async function GET() {
  return json(await buildSettingsPayload())
}
