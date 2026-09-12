// GET /api/articles?locale=&category= — published articles, newest first.
// Logic lives in lib/server/article-list.ts (shared with the RSC SSR prefetch).
import { getArticleList } from '@/lib/server/article-list'
import { json } from '@/lib/server/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json(await getArticleList(searchParams.get('locale'), searchParams.get('category')?.trim() || null))
}
