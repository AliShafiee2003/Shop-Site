// GET /api/for-you?locale=&take=&sk= — personalized product suggestions.
// Subject: the signed-in user, else the anonymous analytics session key (?sk=).
// Signals: TasteSignal rows (view 1 / cart 5 / purchase 8) → top categories and
// contributors → score published products. Never errors; empty items on doubt.
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/server/auth'
import { json, normalizeLocale } from '@/lib/server/utils'
import { getActivePromotion } from '@/lib/server/promotions'
import { productCardInclude, toProductCard } from '@/lib/server/catalog'

const WEIGHT: Record<string, number> = { view: 1, cart: 5, purchase: 8 }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))
  const take = Math.min(12, Math.max(3, Number(searchParams.get('take') ?? 6) || 6))
  const sk = (searchParams.get('sk') ?? '').slice(0, 64)

  try {
    const user = await getSessionUser()
    if (!user && !sk) return json({ items: [] })

    const where = user ? { userId: user.id } : { sessionKey: sk }
    const signals = await db.tasteSignal.findMany({
      where,
      select: { productSlug: true, kind: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    })
    if (signals.length === 0) return json({ items: [] })

    // Signal weights per product slug.
    const weightBySlug = new Map<string, number>()
    for (const sgn of signals) {
      weightBySlug.set(sgn.productSlug, (weightBySlug.get(sgn.productSlug) ?? 0) + (WEIGHT[sgn.kind] ?? 1))
    }
    const engagedSlugs = [...weightBySlug.keys()]

    // Resolve engaged products → their categories and contributors.
    const engaged = await db.product.findMany({
      where: { slug: { in: engagedSlugs } },
      select: { id: true, categories: { select: { categoryId: true } }, contributors: { select: { personId: true } } },
      take: 100,
    })
    const catCount = new Map<string, number>()
    const personCount = new Map<string, number>()
    for (const p of engaged) {
      for (const pc of p.categories) catCount.set(pc.categoryId, (catCount.get(pc.categoryId) ?? 0) + 1)
      for (const pc of p.contributors) personCount.set(pc.personId, (personCount.get(pc.personId) ?? 0) + 1)
    }
    const topCats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)
    const topPersons = [...personCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)

    // Candidates: published products in those categories / by those contributors.
    const candidates = await db.product.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          ...(topCats.length ? [{ categories: { some: { categoryId: { in: topCats } } } }] : []),
          ...(topPersons.length ? [{ contributors: { some: { personId: { in: topPersons } } } }] : []),
        ],
      },
      include: productCardInclude,
      take: 60,
    })
    if (candidates.length === 0) return json({ items: [] })

    // Engaged products themselves may also fill the shelf.
    const engagedFull = engagedSlugs.length
      ? await db.product.findMany({
          where: { status: 'PUBLISHED', slug: { in: engagedSlugs } },
          include: productCardInclude,
          take: 20,
        })
      : []
    const byId = new Map<string, (typeof candidates)[number]>()
    for (const p of [...candidates, ...engagedFull]) byId.set(p.id, p)

    const promo = await getActivePromotion()
    const scored: { card: ReturnType<typeof toProductCard>; score: number }[] = []
    for (const p of byId.values()) {
      let score = weightBySlug.get(p.slug) ?? 0
      for (const pc of p.categories) score += (catCount.get(pc.categoryId) ?? 0) * 2
      for (const pc of p.contributors) score += (personCount.get(pc.personId) ?? 0) * 2
      const inStock = p.variants.some((v) => v.isActive && v.stock > 0)
      if (inStock) score += 1
      if (score <= 0) continue
      scored.push({ card: toProductCard(p, locale, promo), score })
    }
    scored.sort((a, b) => b.score - a.score)

    return json({ items: scored.slice(0, take).map((x) => x.card) })
  } catch {
    return json({ items: [] })
  }
}
