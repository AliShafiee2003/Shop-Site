// GET /api/people?locale= — published persons directory.
import { db } from '@/lib/db'
import { json, normalizeLocale, pickLocale } from '@/lib/server/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))

  const people = await db.person.findMany({
    where: { status: 'PUBLISHED' },
    include: { translations: true, contributions: true },
  })

  const items = people
    .map((person) => {
      const t = pickLocale(person.translations, locale)
      return {
        slug: person.slug,
        name: t?.name ?? person.slug,
        profession: person.profession,
        portraitUrl: person.portraitUrl,
        birthYear: person.birthYear,
        roles: [...new Set(person.contributions.map((c) => c.role))],
        shortBio: t?.shortBio ?? null,
        quote: locale === 'fa' ? (person.quoteFa ?? person.quoteEn) : (person.quoteEn ?? person.quoteFa),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale === 'fa' ? 'fa' : 'en'))

  return json(items)
}
