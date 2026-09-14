// GET /api/homepage?locale= — sections of the active PUBLISHED HomepageVersion.
// Logic lives in lib/server/home-sections.ts (shared with the RSC SSR prefetch).
import { getHomeSections } from '@/lib/server/home-sections'
import { json } from '@/lib/server/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json(await getHomeSections(searchParams.get('locale')))
}
