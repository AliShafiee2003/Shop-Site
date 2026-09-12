// GET /api/products — storefront product listing (server-filtered, server-sorted, server-paginated).
// Logic lives in lib/server/product-list.ts so the RSC entry can prefetch the
// exact same page for SSR (C3) without drift.
import { queryStorefrontProducts } from '@/lib/server/product-list'
import { json } from '@/lib/server/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json(await queryStorefrontProducts(searchParams))
}
