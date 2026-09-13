/**
 * PersePix — seed data
 * Realistic bilingual (EN/FA) publishing-house content per PRD §36.10 (no lorem ipsum).
 * Run: bun prisma/seed.ts
 *
 * C2: seed credentials are NEVER hardcoded — they come from SEED_ADMIN_PASSWORD /
 * SEED_CUSTOMER_PASSWORD (a random value is generated when unset) and are not
 * printed to the log. The old hardcoded `Simorgh#2025` leaked an OWNER login
 * with every copy of the repo and must be rotated wherever it was used.
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'crypto'

const db = new PrismaClient()

function seedPassword(envKey: string): string {
  const v = process.env[envKey]?.trim()
  if (v && v.length >= 12) return v
  return randomBytes(18).toString('base64url') // unusable-but-strong default
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; title?: string; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'divider' }

const blocks = (b: Block[]) => JSON.stringify(b)

async function main() {
  console.log('Seeding PersePix…')
  // wipe (FK-safe order). Each deleteMany is AWAITED — the un-awaited loop
  // raced the creates below (BUG-003: creates could run against rows not yet
  // deleted, and the process could exit before the queue drained).
  const tables = [
    'auditLog', 'consentRecord', 'ticketMessage', 'ticket', 'returnItem', 'returnRequest',
    'orderEvent', 'refund', 'shipment', 'payment', 'orderItem', 'order',
    'cartItem', 'cart', 'review', 'homepageSection', 'homepageVersion', 'articleRelation',
    'articleCategoryLink', 'articleCategoryTranslation', 'articleCategory', 'articleTranslation', 'article',
    'priceHistory', 'relatedProduct', 'productMedia', 'productCategory', 'productContributor',
    'variant', 'productTranslation', 'product', 'categoryTranslation', 'category',
    'personTranslation', 'person', 'legalDocument', 'address', 'session', 'settings', 'user',
  ] as const
  for (const t of tables) await (db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[t].deleteMany()

  // ── Settings ─────────────────────────────────────────────────────────
  await db.settings.createMany({
    data: [
      {
        key: 'store',
        valueJson: JSON.stringify({
          name: 'PersePix',
          nameFa: 'پرس‌پیکس',
          legalName: 'PersePix GmbH (placeholder — pending counsel review)',
          email: 'hello@persepix.example',
          phone: '+43 1 234 56 78',
          address: 'Praterstraße 12, 1020 Vienna, Austria',
          currency: 'EUR',
          vatRatePct: 10, // Austrian reduced rate for books (assumption)
          vatIncluded: true,
          freeShippingThresholdMinor: 6000,
        }),
      },
      {
        key: 'shipping',
        valueJson: JSON.stringify({
          customsNote: 'Customs duties may apply for destinations outside the EU and are payable by the recipient.',
          customsNoteFa: 'برای مقصدهای خارج از اتحادیه اروپا ممکن است عوارض گمرکی اعمال شود که بر عهدهٔ گیرنده است.',
          methods: [
            { id: 'AT_STANDARD', zone: 'AT', labelEn: 'Austria Post — Standard', labelFa: 'پست اتریش — معمولی', descEn: 'Tracked delivery within Austria', descFa: 'ارسال پیگیری‌شده در سراسر اتریش', priceMinor: 490, freeOverMinor: null, minDays: 2, maxDays: 4, countries: ['AT'] },
            { id: 'EU_STANDARD', zone: 'EU', labelEn: 'EU — Tracked Standard', labelFa: 'اتحادیه اروپا — معمولی پیگیری‌شده', descEn: 'Tracked delivery across the EU', descFa: 'ارسال پیگیری‌شده در سراسر اتحادیه اروپا', priceMinor: 790, freeOverMinor: 6000, minDays: 3, maxDays: 7, countries: ['AT','DE','FR','IT','ES','NL','BE','LU','IE','PT','DK','SE','FI','PL','CZ','SK','SI','HU','HR','RO','BG','GR','EE','LV','LT','CY','MT'] },
            { id: 'WW_STANDARD', zone: 'WW', labelEn: 'International — Tracked', labelFa: 'بین‌الملل — پیگیری‌شده', descEn: 'Worldwide tracked delivery', descFa: 'ارسال پیگیری‌شده به سراسر جهان', priceMinor: 1490, freeOverMinor: null, minDays: 5, maxDays: 14, countries: ['*'] },
          ],
        }),
      },
      { key: 'features', valueJson: JSON.stringify({ authorDirectoryEnabled: true, reviewsEnabled: true }) },
    ],
  })

  // ── Users ────────────────────────────────────────────────────────────
  const admin = await db.user.create({ data: {
    email: 'owner@persepix.ir', passwordHash: hashPassword(seedPassword('SEED_ADMIN_PASSWORD')),
    name: 'Parisa Bahrami', role: 'OWNER', preferredLocale: 'en', emailVerifiedAt: new Date(),
  }})
  const customer = await db.user.create({ data: {
    email: 'customer@example.com', passwordHash: hashPassword(seedPassword('SEED_CUSTOMER_PASSWORD')),
    name: 'Daniel Weber', role: 'CUSTOMER', preferredLocale: 'en', emailVerifiedAt: new Date(),
  }})
  await db.address.createMany({ data: [
    { userId: customer.id, label: 'Home', recipient: 'Daniel Weber', line1: 'Kettenbrückengasse 9', city: 'Vienna', postalCode: '1050', countryCode: 'AT', isDefaultShipping: true, isDefaultBilling: true },
    { userId: customer.id, label: 'Office', recipient: 'Daniel Weber', line1: 'Mariahilfer Straße 44', city: 'Vienna', postalCode: '1060', countryCode: 'AT' },
  ]})

  // ── Categories ───────────────────────────────────────────────────────
  const cats = [
    { slug: 'fiction', icon: 'BookOpen', color: '#014B74', en: 'Fiction', fa: 'ادبیات داستانی', dEn: 'Novels and short stories from contemporary Persian voices.', dFa: 'رمان‌ها و داستان‌های کوتاه از صداهای معاصر ایران.' },
    { slug: 'poetry', icon: 'Feather', color: '#E87524', en: 'Poetry', fa: 'شعر', dEn: 'Bilingual editions and translations of modern Persian poetry.', dFa: 'نسخه‌های دوزبانه و ترجمه‌های شعر معاصر ایران.' },
    { slug: 'non-fiction', icon: 'NotebookPen', color: '#47545D', en: 'Non-fiction', fa: 'غیرداستانی', dEn: 'Essays, nature writing and reportage.', dFa: 'جستار، طبیعت‌نگاری و گزارش.' },
    { slug: 'childrens-books', icon: 'Shapes', color: '#B94F0A', en: "Children's Books", fa: 'کتاب کودک', dEn: 'Picture books and stories for younger readers.', dFa: 'کتاب‌های تصویری و قصه برای خوانندگان کوچک‌تر.' },
    { slug: 'art-photography', icon: 'Camera', color: '#71808A', en: 'Art & Photography', fa: 'هنر و عکاسی', dEn: 'Carefully produced books on Iranian visual culture.', dFa: 'کتاب‌هایی دربارهٔ فرهنگ بصری ایران.' },
    { slug: 'biography-memoir', icon: 'UserRound', color: '#247A52', en: 'Biography & Memoir', fa: 'زندگی‌نامه و خاطرات', dEn: 'Lives told in the first person.', dFa: 'زندگی‌ها به روایت خودشان.' },
  ]
  const catIds: Record<string, string> = {}
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i]
    const row = await db.category.create({ data: { slug: c.slug, icon: c.icon, color: c.color, sortOrder: i } })
    catIds[c.slug] = row.id
    await db.categoryTranslation.createMany({ data: [
      { categoryId: row.id, locale: 'en', name: c.en, description: c.dEn, seoTitle: `${c.en} — PersePix` },
      { categoryId: row.id, locale: 'fa', name: c.fa, description: c.dFa, seoTitle: `${c.fa} — پرس‌پیکس` },
    ]})
  }

  // ── People ───────────────────────────────────────────────────────────
  const people = [
    { slug: 'neda-ahmadi', img: 'face-neda', b: 1978, nat: 'Iranian', prof: 'Novelist', quoteEn: 'Silence is not the absence of language; it is the part of language we have not yet learned to read.', quoteFa: 'سکوت نبودِ زبان نیست؛ آن بخش از زبان است که هنوز یاد نگرفته‌ایم بخوانیم.', bioEn: 'Neda Ahmadi was born in Isfahan and worked for a decade as an urban surveyor before turning to fiction. Her novels map the emotional topography of provincial Iran with unusual precision. The Cartographer of Silence, her third novel, was shortlisted for the Mehregan Literary Prize.', bioFa: 'ندا احمدی در اصفهان زاده شد و پیش از روی‌آوردن به داستان‌نویسی، یک دهه نقشه‌بردار شهری بود. رمان‌های او با دقتی کم‌نظیر، جغرافیای احساسی شهرهای کوچک ایران را ترسیم می‌کنند. «نقشه‌کش سکوت» سومین رمان او نامزد نهایی جایزهٔ ادبی مهرگان بود.' },
    { slug: 'kaveh-rostami', img: 'face-kaveh', b: 1969, nat: 'Iranian', prof: 'Essayist', quoteEn: 'A city is a letter that never finishes arriving.', quoteFa: 'شهری نامه‌ای است که همواره در راه است.', bioEn: 'Kaveh Rostami is an essayist and architecture critic based in Tehran. For twenty years his columns on urban memory appeared in leading Iranian newspapers; Letters to My City gathers the best of them in English for the first time.', bioFa: 'کاوه رستمی جستارنویس و ناقد معماری ساکن تهران است. ستون‌های او دربارهٔ حافظهٔ شهری، بیست سال در روزنامه‌های ایرانی چاپ شد؛ «نامه‌هایی به شهرم» گزیدهٔ آن‌ها برای نخستین بار به زبان انگلیسی است.' },
    { slug: 'parvaneh-mostofi', img: 'face-parvaneh', b: 1954, nat: 'Iranian', prof: 'Short story writer', quoteEn: 'Winter taught me that endurance can be a form of hospitality.', quoteFa: 'زمستان به من آموخت که پایداری می‌تواند شکوهی از مهمان‌نوازی باشد.', bioEn: 'Parvaneh Mostofi, born in Arak, published her first story collection at fifty. A retired literature teacher, she writes about tea houses, long winters, and the quiet heroism of ordinary women.', bioFa: 'پروانه مصطفی زادهٔ اراک، نخستین مجموعه‌داستان خود را در پنجاه‌سالگی منتشر کرد. این معلم بازنشستهٔ ادبیات دربارهٔ قهوه‌خانه‌ها، زمستان‌های طولانی و قهرمانی‌های آرام زنان عادی می‌نویسد.' },
    { slug: 'dariush-alavi', img: 'face-dariush', b: 1988, nat: 'Iranian', prof: 'Novelist', quoteEn: 'Every orchard is an argument between patience and weather.', quoteFa: 'هر باغ، جدلی است میان شکیبایی و هوا.', bioEn: 'Dariush Alavi grew up in the orchard country of the Alborz foothills. The Orchard Keeper\u2019s Daughter, his second novel, won the Sadegh Hedayat Prize and has been translated into four languages.', bioFa: 'داریوش علوی در دامنه‌های البرز، سرزمین باغ‌ها، بزرگ شد. «دختر نگهبان باغ» دومین رمان او است که جایزهٔ صادق هدایت را گرفت و به چهار زبان ترجمه شده است.' },
    { slug: 'shirin-golzar', img: 'face-shirin', b: 1991, nat: 'Iranian', prof: 'Poet', quoteEn: 'I write toward the bridge, even while it burns.', quoteFa: 'من به سوی پل می‌نویسم، حتی وقتی می‌سوزد.', bioEn: 'Shirin Golzar is one of the most distinctive poetic voices of her generation. Songs for a Burnt Bridge is her second collection, presented here in a bilingual edition prepared with the author.', bioFa: 'شیرین گلزار از شاخص‌ترین صداهای شعری نسل خود است. «ترانه‌هایی برای پل سوخته» دومین مجموعهٔ او است که در نسخه‌ای دوزبانه با همکاری شاعر عرضه شده است.' },
    { slug: 'farhad-kamali', img: 'face-farhad', b: 1947, nat: 'Iranian', prof: 'Architect & memoirist', quoteEn: 'Exile redraws you, but it never straightens the lines.', quoteFa: 'تبعید تو را از نو می‌کشد، اما خط‌ها را هرگز راست نمی‌کند.', bioEn: 'Farhad Kamali studied architecture in Tehran and Rome and practised across three continents. Blueprints of Exile is his memoir of buildings drawn, built and lost.', bioFa: 'فرهاد کمالی در تهران و رم معماری خواند و در سه قاره کار کرد. «نقشه‌های تبعید» خاطرات او از ساختمان‌هایی است که طراحی، ساخته یا از دست داده است.' },
    { slug: 'leila-taheri', img: 'face-leila', b: 1996, nat: 'Iranian', prof: "Children's author", quoteEn: 'Children already know how to fly; books just give them somewhere to go.', quoteFa: 'کودکان خودشان پرواز را بلدند؛ کتاب‌ها فقط مقصدی به آن‌ها می‌دهند.', bioEn: 'Leila Taheri writes and illustrates stories for young readers. A trained ornithologist, she fills her books with birds that carry maps, secrets and songs.', bioFa: 'لیلا طاهری برای خوانندگان کودک می‌نویسد و تصویرگری می‌کند. او پرنده‌شناس است و کتاب‌هایش پر از پرنده‌هایی است که نقشه، راز و ترانه با خود می‌برند.' },
    { slug: 'mehrnaz-kian', img: 'face-mehrnaz', b: 1965, nat: 'Iranian', prof: 'Textile historian', quoteEn: 'A carpet is a sentence woven by many hands.', quoteFa: 'قالی، جمله‌ای است که دست‌های بسیاری بافته‌اند.', bioEn: 'Mehrnaz Kian has spent thirty years documenting workshop traditions across Iran. Rust and Turquoise is the first survey of her private archive of dyed textiles.', bioFa: 'مهرناز کیان سی سال سنت‌های کارگاهی را در سراسر ایران مستند کرده است. «زنگار و فیروزه» نخستین نگاه به آرشیو خصوصی او از پارچه‌های رنگرزی‌شده است.' },
    { slug: 'omid-sharifi', img: 'face-omid', b: 1981, nat: 'Iranian', prof: 'Novelist', quoteEn: 'An archive is a promise that forgetting can be postponed.', quoteFa: 'آرشیو، وعده‌ای است که فراموشی می‌تواند به تعویق افتد.', bioEn: 'Omid Sharifi worked in the basement stacks of the National Library before writing The Archivist, a slow-burning literary thriller about memory and paper.', bioFa: 'امید شریفی پیش از نوشتن «آرشیویست»، در انبارهای زیرزمینی کتابخانهٔ ملی کار می‌کرد؛ رمانی دربارهٔ حافظه و کاغذ.' },
    { slug: 'golnar-bakhtiari', img: 'face-golnar', b: 1975, nat: 'Iranian', prof: 'Nature writer', quoteEn: 'The mountain does not need us; that is exactly why we need it.', quoteFa: 'کوه به ما نیازی ندارد؛ و همین دلیل نیاز ما به آن است.', bioEn: 'Golnar Bakhtiari is a field ecologist and writer. Field Notes from the Alborz records four seasons of walking, counting and listening in the mountains north of Tehran.', bioFa: 'گلنار بختیاری بوم‌شناس میدانی و نویسنده است. «یادداشت‌های میدانی از البرز» روایت چهار فصل پیاده‌روی، شمارش و شنیدن در کوه‌های شمال تهران است.' },
    { slug: 'martin-ellison', img: 'face-martin', b: 1979, nat: 'British', prof: 'Translator', quoteEn: 'Translation is listening with your whole desk.', quoteFa: 'ترجمه، شنیدن با تمام میز کار است.', bioEn: 'Martin Ellison translates contemporary Persian prose and poetry into English. His translations include works by Neda Ahmadi, Parvaneh Mostofi and Omid Sharifi. He lives in Manchester.', bioFa: 'مارتین الیسون نثر و شعر معاصر فارسی را به انگلیسی ترجمه می‌کند. آثار نداآهمدی، پروانه مصطفی و امید شریفی از ترجمه‌های اوست. او در منچستر زندگی می‌کند.' },
    { slug: 'sarah-berger', img: 'face-sarah', b: 1989, nat: 'Austrian', prof: 'Translator', quoteEn: 'A good translation should smell faintly of its origin.', quoteFa: 'ترجمهٔ خوب باید بوی خفیفی از خاستگاهش داشته باشد.', bioEn: 'Sarah Berger translates from Persian and German. Based in Vienna, she works at the intersection of essays, memoir and urban writing.', bioFa: 'سارا برگِر از فارسی و آلمانی ترجمه می‌کند. او ساکن وین است و در مرز جستار، خاطره و نوشته‌های شهری کار می‌کند.' },
  ]
  const personIds: Record<string, string> = {}
  for (const p of people) {
    const row = await db.person.create({ data: {
      slug: p.slug, status: 'PUBLISHED', portraitUrl: `/images/${p.img}.png`,
      birthYear: p.b, nationality: p.nat, profession: p.prof,
      quoteEn: p.quoteEn, quoteFa: p.quoteFa, quoteSourceEn: 'From an interview with PersePix',
      quoteSourceFa: 'از گفت‌وگو با پرس‌پیکس',
      socialLinks: JSON.stringify([]),
    }})
    personIds[p.slug] = row.id
    await db.personTranslation.createMany({ data: [
      { personId: row.id, locale: 'en', name: p.slug.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '), shortBio: p.bioEn.slice(0, 160), fullBio: p.bioEn, seoTitle: p.slug },
      { personId: row.id, locale: 'fa', name: faName(p.slug), shortBio: p.bioFa.slice(0, 160), fullBio: p.bioFa, seoTitle: faName(p.slug) },
    ]})
  }
  function faName(slug: string): string {
    const map: Record<string, string> = {
      'neda-ahmadi': 'ندا احمدی', 'kaveh-rostami': 'کاوه رستمی', 'parvaneh-mostofi': 'پروانه مصطفی',
      'dariush-alavi': 'داریوش علوی', 'shirin-golzar': 'شیرین گلزار', 'farhad-kamali': 'فرهاد کمالی',
      'leila-taheri': 'لیلا طاهری', 'mehrnaz-kian': 'مهرناز کیان', 'omid-sharifi': 'امید شریفی',
      'golnar-bakhtiari': 'گلنار بختیاری', 'martin-ellison': 'مارتین الیسون', 'sarah-berger': 'سارا برگِر',
    }
    return map[slug] ?? slug
  }

  // ── Products ─────────────────────────────────────────────────────────
  type ProductSeed = {
    slug: string; cat: string; primaryCat: string; img: string; featured?: boolean;
    pubDate: string; series?: string; fixedPrice?: boolean; audience?: string;
    gallery?: string[];
    en: { title: string; subtitle?: string; short: string; long: Block[] };
    fa: { title: string; subtitle?: string; short: string; long: Block[] };
    variants: Array<{ sku: string; isbn: string; format: 'PAPERBACK' | 'HARDCOVER' | 'SPECIAL'; price: number; stock: number; pages: number; lang: string; sold?: number; edition?: string }>;
    contributors: Array<{ person: string; role: 'AUTHOR' | 'TRANSLATOR' | 'EDITOR' }>;
  }
  const products: ProductSeed[] = [
    {
      slug: 'the-cartographer-of-silence', cat: 'fiction', primaryCat: 'fiction', img: 'cover-cartographer', featured: true, pubDate: '2025-03-04', series: 'Contemporary Persian Prose', gallery: ['life-hands', 'life-reading'],
      en: {
        title: 'The Cartographer of Silence', subtitle: 'A Novel',
        short: 'A surveyor travels the small towns of Iran, mapping the places where people have lost their voice — and finds her own.',
        long: [
          { type: 'p', text: 'Mina Karimi measures the world for a living. Commissioned to survey towns that are disappearing from official maps, she begins to collect something no one asked for: the silences of the people who live there.' },
          { type: 'p', text: 'From a kitchen in Khansar to a shuttered cinema in Kerman, Neda Ahmadi traces an intimate geography of things left unsaid — between mothers and daughters, neighbours and strangers — until Mina must chart the one silence she has never dared to measure: her own.' },
          { type: 'quote', text: 'Ahmadi writes silence the way surveyors draw coastlines: patiently, and with terrible tenderness.', attribution: 'Mehregan Literary Prize jury' },
          { type: 'callout', title: 'Bilingual reading guide', text: 'Includes a reader’s note and glossary prepared by the translator.' },
        ],
      },
      fa: {
        title: 'نقشه‌کش سکوت', subtitle: 'رمان',
        short: 'خبرنگار نقشه‌برداری برای ترسیم شهرهایی که از نقشه‌ها محو می‌شوند سفر می‌کند و سکوتِ اهالی‌شان را جمع می‌کند — و صدای خود را پیدا می‌کند.',
        long: [
          { type: 'p', text: 'مینا کریمی حرفه‌اش اندازه‌گرفتن جهان است. برای نقشه‌برداری شهرهایی که از نقشه‌های رسمی محو می‌شوند مأمور می‌شود و کم‌کم چیزی جمع می‌کند که کسی از او نخواسته بود: سکوت اهل آن شهرها.' },
          { type: 'p', text: 'از آشپزخانه‌ای در خوانسار تا سینمایی تعطیل در کرمان، نداآهمدی جغرافیای صمیمی ناگفته‌ها را ترسیم می‌کند؛ تا مینا ناچار شود سکوتی را که هرگز جرأت اندازه‌گرفتنش را نداشته، نقشه‌برداری کند: سکوت خودش.' },
          { type: 'quote', text: 'احمدی سکوت را همان‌طور می‌نویسد که نقشه‌برداران خط ساحل را می‌کشند: شکیبا و با مهربانی‌ای هولناک.', attribution: 'هیئت داوران جایزهٔ ادبی مهرگان' },
          { type: 'callout', title: 'راهنمای دوزبانه', text: 'با یادداشت خواننده و واژه‌نامه آماده‌شده توسط مترجم.' },
        ],
      },
      variants: [
        { sku: 'SP-978-3-011-00001-1', isbn: '978-3-011-00001-1', format: 'PAPERBACK', price: 2200, stock: 24, pages: 312, lang: 'English', sold: 142 },
        { sku: 'SP-978-3-011-00002-8', isbn: '978-3-011-00002-8', format: 'HARDCOVER', price: 3400, stock: 9, pages: 312, lang: 'English', sold: 38, edition: 'Library hardcover' },
      ],
      contributors: [{ person: 'neda-ahmadi', role: 'AUTHOR' }, { person: 'martin-ellison', role: 'TRANSLATOR' }],
    },
    {
      slug: 'letters-to-my-city', cat: 'non-fiction', primaryCat: 'non-fiction', img: 'cover-letters', pubDate: '2024-10-15', gallery: ['life-stack'],
      en: {
        title: 'Letters to My City', subtitle: 'Essays on Tehran, Memory and Stone',
        short: 'Twenty years of columns on urban memory by Iran’s foremost architecture critic — gathered in English for the first time.',
        long: [
          { type: 'p', text: 'Written between 1999 and 2019, these short letters address Tehran itself: its demolition notices and rooftop water tanks, its vanished cafés, the oak that refused to be cut down on Valiasr Street.' },
          { type: 'p', text: 'Kaveh Rostami argues that a city is a letter that never finishes arriving — and that reading it carefully is a civic act.' },
          { type: 'quote', text: 'The finest writing on an Iranian city since Naghmeh’s Tehran Chronicles.', attribution: 'Bokhara Review' },
        ],
      },
      fa: {
        title: 'نامه‌هایی به شهرم', subtitle: 'جستارهایی دربارهٔ تهران، حافظه و سنگ',
        short: 'بیست سال ستون‌نویسی دربارهٔ حافظهٔ شهری به قلم منتقد برجستهٔ معماری ایران — برای نخستین بار به انگلیسی.',
        long: [
          { type: 'p', text: 'این نامه‌های کوتاه بین سال‌های ۱۳۷۸ تا ۱۳۹۸ خطاب به خودِ تهران نوشته شده‌اند: ابلاغیه‌های تخلف و مخزن‌های آب پشت‌بام، کافه‌های ازبین‌رفته و بلوتی که حاضر به بریده‌شدن نبود.' },
          { type: 'p', text: 'کاوه رستمی می‌گوید شهر نامه‌ای است که همواره در راه است — و خواندن دقیق آن، کاری شهروندانه است.' },
          { type: 'quote', text: 'زیباترین نوشته دربارهٔ یک شهر ایرانی از زمان «تهرانِ نغمه».', attribution: 'مجلهٔ بخارا' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00003-5', isbn: '978-3-011-00003-5', format: 'PAPERBACK', price: 1900, stock: 31, pages: 208, lang: 'English', sold: 97 }],
      contributors: [{ person: 'kaveh-rostami', role: 'AUTHOR' }, { person: 'sarah-berger', role: 'TRANSLATOR' }],
    },
    {
      slug: 'tea-at-the-edge-of-winter', cat: 'fiction', primaryCat: 'fiction', img: 'cover-tea', pubDate: '2024-11-20', series: 'Contemporary Persian Prose', gallery: ['life-reading'],
      en: {
        title: 'Tea at the Edge of Winter', subtitle: 'Stories',
        short: 'Twelve stories of tea houses, long snows and the quiet heroism of ordinary women, from a master of the form.',
        long: [
          { type: 'p', text: 'A schoolteacher keeps her classroom open through a blackout. Two sisters split a single pomegranate across a decade. A tea house owner in Arak decides, each winter, whether to open at all.' },
          { type: 'p', text: 'Parvaneh Mostofi writes with the patience of someone who has listened for fifty years. These are stories to be read slowly, by a window, ideally while it snows.' },
          { type: 'callout', title: 'Award', text: 'Winner of the Golshiri Foundation Short Story Prize, 2023.' },
        ],
      },
      fa: {
        title: 'چای در مرز زمستان', subtitle: 'داستان‌های کوتاه',
        short: 'دوازده داستان دربارهٔ قهوه‌خانه‌ها، برف‌های طولانی و قهرمانی آرام زنان عادی، به قلم استادی در این قالب.',
        long: [
          { type: 'p', text: 'معلمی کلاسش را در سراسر قطعی برق باز نگه می‌دارد. دو خواهر یک انار را در طول یک دهه تقسیم می‌کنند. صاحب قهوه‌خانه‌ای در اراک هر زمستان تصمیم می‌گیرد که اصلاً باز کند یا نه.' },
          { type: 'p', text: 'پروانه مصطفی با شکیبایی کسی می‌نویسد که پنجاه سال گوش داده است. این داستان‌ها را باید آهسته، کنار پنجره و ترجیحاً وقتی برف می‌بارد خواند.' },
          { type: 'callout', title: 'جایزه', text: 'برندهٔ جایزهٔ داستان کوتاه بنیاد گلشیری، ۱۴۰۲.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00004-2', isbn: '978-3-011-00004-2', format: 'PAPERBACK', price: 1800, stock: 17, pages: 184, lang: 'English', sold: 76 }],
      contributors: [{ person: 'parvaneh-mostofi', role: 'AUTHOR' }, { person: 'martin-ellison', role: 'TRANSLATOR' }],
    },
    {
      slug: 'the-orchard-keepers-daughter', cat: 'fiction', primaryCat: 'fiction', img: 'cover-orchard', pubDate: '2025-05-12', gallery: ['life-hands'],
      en: {
        title: 'The Orchard Keeper’s Daughter', subtitle: 'A Novel',
        short: 'When drought comes to the Alborz foothills, a family’s orchard becomes the stage for a reckoning three generations in the making.',
        long: [
          { type: 'p', text: 'Rana returns home for her grandfather’s funeral and inherits an orchard she never wanted, a well that is running dry, and a lawsuit with the neighbour she loved when they were both fourteen.' },
          { type: 'p', text: 'Set across one growing season, Dariush Alavi’s prize-winning novel is a luminous study of land, inheritance and forgiveness.' },
          { type: 'quote', text: 'Alavi understands that weather is a character, and grief is a season.', attribution: 'Sadegh Hedayat Prize jury' },
        ],
      },
      fa: {
        title: 'دختر نگهبان باغ', subtitle: 'رمان',
        short: 'وقتی خشکسالی به دامنه‌های البرز می‌رسد، باغ خانواده صحنهٔ حساب‌وکتابی می‌شود که سه نسل در راه است.',
        long: [
          { type: 'p', text: 'رنا برای مراسم خاکسپاری پدربزرگ به خانه برمی‌گردد و باغی را به ارث می‌برد که هرگز نخواسته، چاهی که رو به خشکی است و دادخواهی با همسایه‌ای که در چهارده‌سالگی عاشقش بود.' },
          { type: 'p', text: 'رمان برندهٔ جایزهٔ داریوش علوی در یک فصل رویش می‌گذرد؛ پژوهشی روشن دربارهٔ زمین، میراث و بخشش.' },
          { type: 'quote', text: 'علوی می‌داند که هوا یک شخصیت است و غم، یک فصل.', attribution: 'هیئت داوران جایزهٔ صادق هدایت' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00005-9', isbn: '978-3-011-00005-9', format: 'PAPERBACK', price: 2100, stock: 22, pages: 344, lang: 'English', sold: 64 }],
      contributors: [{ person: 'dariush-alavi', role: 'AUTHOR' }, { person: 'sarah-berger', role: 'TRANSLATOR' }],
    },
    {
      slug: 'songs-for-a-burnt-bridge', cat: 'poetry', primaryCat: 'poetry', img: 'cover-songs', featured: true, pubDate: '2025-01-28', fixedPrice: true,
      en: {
        title: 'Songs for a Burnt Bridge', subtitle: 'Poems',
        short: 'A bilingual edition of Shirin Golzar’s blazing second collection — Persian and English on facing pages.',
        long: [
          { type: 'p', text: 'In fifty-two poems, Shirin Golzar writes about leaving, about the cities that refuse to be left, and about the bridges we burn and then mourn like relatives.' },
          { type: 'p', text: 'This bilingual edition presents the Persian originals facing Martin Ellison’s English translations, prepared over two years with the author in Vienna and Tehran.' },
          { type: 'quote', text: 'Golzar’s line breaks arrive like weather changes — sudden, total, true.', attribution: 'Poetry International (on the first edition)' },
          { type: 'callout', title: 'Bilingual edition', text: 'Poems appear in Persian and English on facing pages, with the author’s notes.' },
        ],
      },
      fa: {
        title: 'ترانه‌هایی برای پل سوخته', subtitle: 'شعر',
        short: 'نسخهٔ دوزبانهٔ مجموعهٔ دوم شیرین گلزار — فارسی و انگلیسی در صفحات روبه‌رو.',
        long: [
          { type: 'p', text: 'شیرین گلزار در پنجاه‌و‌دو شعر دربارهٔ رفتن می‌نویسد، دربارهٔ شهرهایی که حاضر نیستند برَوند، و دربارهٔ پل‌هایی که می‌سوزانیم و بعد مثل خویشاوندان عزادارشان می‌کنیم.' },
          { type: 'p', text: 'در این نسخهٔ دوزبانه، اصل فارسی شعرها روبروی ترجمه‌های انگلیسی مارتین الیسون قرار گرفته است؛ کاری که طی دو سال با حضور شاعر در وین و تهران آماده شد.' },
          { type: 'quote', text: 'شکستن مصرع‌های گلزار مثل تغییر هوا می‌آید: ناگهانی، تمام و راستین.', attribution: 'پوئتری اینترنشنال، دربارهٔ چاپ نخست' },
          { type: 'callout', title: 'نسخهٔ دوزبانه', text: 'شعرها به فارسی و انگلیسی در صفحات روبه‌رو، همراه با یادداشت‌های شاعر.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00006-6', isbn: '978-3-011-00006-6', format: 'PAPERBACK', price: 1600, stock: 0, pages: 128, lang: 'Bilingual', sold: 58 }],
      contributors: [{ person: 'shirin-golzar', role: 'AUTHOR' }, { person: 'martin-ellison', role: 'TRANSLATOR' }],
    },
    {
      slug: 'blueprints-of-exile', cat: 'biography-memoir', primaryCat: 'biography-memoir', img: 'cover-blueprints', pubDate: '2024-09-03', gallery: ['life-stack'],
      en: {
        title: 'Blueprints of Exile', subtitle: 'A Memoir of Buildings',
        short: 'From Tehran to Rome to Lagos, an architect remembers the buildings he drew, built, and lost.',
        long: [
          { type: 'p', text: 'Farhad Kamali left Iran in 1979 with a portfolio and a return ticket he would never use. Over forty years he designed schools in Nigeria, villas in Crete and a library he was never allowed to visit.' },
          { type: 'p', text: 'Blueprints of Exile is a memoir told through structures: what it costs to build a life somewhere else, and what remains standing when you cannot go back.' },
        ],
      },
      fa: {
        title: 'نقشه‌های تبعید', subtitle: 'خاطره‌ای از ساختمان‌ها',
        short: 'از تهران تا رم تا لاگوس، معمارِ پیریزاده‌ای ساختمان‌هایی را به یاد می‌آورد که طراحی، ساخته یا از دست داده است.',
        long: [
          { type: 'p', text: 'فرهاد کمالی سال ۱۳۵۷ با یک پوشهٔ نقشه و بلیتی رفت که هرگز استفاده نشد ایران را ترک کرد. در چهل سال، مدرسه‌هایی در نیجریه، ویلاهایی در کرت و کتابخانه‌ای طراحی کرد که هرگز اجازهٔ دیدنش را نیافت.' },
          { type: 'p', text: '«نقشه‌های تبعید» خاطره‌ای است روایت‌شده با ساختمان‌ها: هزینهٔ ساختن زندگی در جای دیگر، و آنچه پس از نابود شدن راهِ بازگشت، پابرجا می‌ماند.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00007-3', isbn: '978-3-011-00007-3', format: 'HARDCOVER', price: 2600, stock: 12, pages: 296, lang: 'English', sold: 41 }],
      contributors: [{ person: 'farhad-kamali', role: 'AUTHOR' }, { person: 'sarah-berger', role: 'TRANSLATOR' }],
    },
    {
      slug: 'the-nightingales-atlas', cat: 'childrens-books', primaryCat: 'childrens-books', img: 'cover-nightingale', pubDate: '2025-02-18', audience: 'Ages 6–10',
      en: {
        title: 'The Nightingale’s Atlas', subtitle: 'A Picture Book',
        short: 'A nightingale with a stolen map shows a sleepless girl the hidden flyways of her city — a modern fable about attention.',
        long: [
          { type: 'p', text: 'Every night, the nightingale on the water tower folds up her map and hides it under one wing. Every night, Mahtab lies awake. One evening the bird takes pity — and the two set off above rooftops, minarets and parks, correcting the map of a city that forgot its own birds.' },
          { type: 'p', text: 'Written and illustrated by Leila Taheri, printed in five spot colours on heavy cream paper.' },
          { type: 'callout', title: 'Read aloud', text: 'Includes a fold-out atlas poster.' },
        ],
      },
      fa: {
        title: 'اطلس بلبل', subtitle: 'کتاب تصویری',
        short: 'بلبلی با نقشه‌ای دزدیده، دختری بی‌خواب را به پروازگاه‌های پنهان شهر می‌برد — حکایتی امروزی دربارهٔ توجه.',
        long: [
          { type: 'p', text: 'هر شب، بلبل روی آب‌انبار نقشه‌اش را تا می‌کند و زیر یک بال پنهان می‌کند. هر شب، مهتاب بی‌خواب است. یک شب پرنده دلسوز می‌شود — و دوست‌دار نقشه از بالای پشت‌بام‌ها، مناره‌ها و پارک‌ها راه می‌افتند تا نقشهٔ شهری را که پرنده‌هایش را فراموش کرده، درست کنند.' },
          { type: 'p', text: 'نوشته و تصویرگری لیلا طاهری، چاپ پنج‌رنگ روی کاغذ کرم ضخیم.' },
          { type: 'callout', title: 'بلندخوانی', text: 'همراه با پوستۀ تا‌شدنی اطلس.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00008-0', isbn: '978-3-011-00008-0', format: 'HARDCOVER', price: 1500, stock: 28, pages: 48, lang: 'English', sold: 88 }],
      contributors: [{ person: 'leila-taheri', role: 'AUTHOR' }],
    },
    {
      slug: 'rust-and-turquoise', cat: 'art-photography', primaryCat: 'art-photography', img: 'cover-rust', featured: true, pubDate: '2025-04-22',
      en: {
        title: 'Rust and Turquoise', subtitle: 'Iranian Textile Traditions, 1920–1980',
        short: 'A landmark survey of dye workshops, block printing and the private archive of Iran’s quietest textile historian.',
        long: [
          { type: 'p', text: 'Over thirty years, Mehrnaz Kian photographed, dated and catalogued more than four thousand fragments of printed cloth from workshops in Isfahan, Yazd and Kalat. Rust and Turquoise presents two hundred of them, alongside interviews with the last practising dyers.' },
          { type: 'p', text: 'Designed as an object in its own right: cloth-textured cover, thread-sewn binding, and plates reproduced at original scale wherever possible.' },
        ],
      },
      fa: {
        title: 'زنگار و فیروزه', subtitle: 'سنت‌های پارچه در ایران، ۱۲۹۹–۱۳۵۹',
        short: 'نگاهی شاخص به کارگاه‌های رنگرزی، چاپ کَلام‌کاری و آرشیو خصوصی کم‌سروصداترین پژوهشگر پارچهٔ ایران.',
        long: [
          { type: 'p', text: 'مهرناز کیان طی سی سال بیش از چهار هزار تکه پارچهٔ چاپی از کارگاه‌های اصفهان، یزد و کلات را عکاسی، تاریخ‌گذاری و فهرست کرد. «زنگار و فیروزه» دویست تکه از آن‌ها را در کنار گفت‌وگو با آخرین رنگرزهای فعال عرضه می‌کند.' },
          { type: 'p', text: 'طراحی کتاب، خودش یک شیء است: جلد با بافت پارچه، دوخت نخ و بازتولید تصاویر در مقیاس اصلی تا جای ممکن.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00009-7', isbn: '978-3-011-00009-7', format: 'HARDCOVER', price: 3200, stock: 7, pages: 256, lang: 'English', sold: 33, edition: 'Clothbound' }],
      contributors: [{ person: 'mehrnaz-kian', role: 'AUTHOR' }],
    },
    {
      slug: 'the-archivist', cat: 'fiction', primaryCat: 'fiction', img: 'cover-archivist', pubDate: '2025-06-10', series: 'Contemporary Persian Prose', gallery: ['life-hands', 'life-shelf'],
      en: {
        title: 'The Archivist', subtitle: 'A Novel',
        short: 'In the basement of a national library, a cataloguer finds a folder that should not exist — and decides to protect it.',
        long: [
          { type: 'p', text: 'Kourosh has spent nineteen years keeping other people’s papers in order. When a mislabelled folder surfaces — pages from a suppressed novel, filed under the wrong decade — he must choose between the institution that raised him and a book that refuses to stay forgotten.' },
          { type: 'p', text: 'A slow-burning, humane thriller about memory, paper and the price of keeping things.' },
        ],
      },
      fa: {
        title: 'آرشیویست', subtitle: 'رمان',
        short: 'در زیرزمین کتابخانهٔ ملی، فهرست‌نگاری پرونده‌ای پیدا می‌کند که نبود — و تصمیم می‌گیرد از آن محافظت کند.',
        long: [
          { type: 'p', text: 'کوروش نوزده سال است که کاغذهای دیگران را مرتب نگه می‌دارد. وقتی پرونده‌ای با برچسب اشتباه پیدا می‌شود — صفحه‌هایی از رمانی توقیف‌شده، بایگانی‌شده در دهه‌ای اشتباه — او باید میان نهادی که پرورشش داده و کتابی که حاضر نیست فراموش شود، انتخاب کند.' },
          { type: 'p', text: 'دلهره‌آوری انسانی و آهسته دربارهٔ حافظه، کاغذ و بهای نگه‌داشتن چیزها.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00010-3', isbn: '978-3-011-00010-3', format: 'PAPERBACK', price: 2000, stock: 19, pages: 268, lang: 'English', sold: 71 }],
      contributors: [{ person: 'omid-sharifi', role: 'AUTHOR' }, { person: 'martin-ellison', role: 'TRANSLATOR' }],
    },
    {
      slug: 'field-notes-from-the-alborz', cat: 'non-fiction', primaryCat: 'non-fiction', img: 'cover-fieldnotes', pubDate: '2024-12-05',
      en: {
        title: 'Field Notes from the Alborz', subtitle: 'Four Seasons in the Mountains North of Tehran',
        short: 'A field ecologist’s record of one mountain year — counting leopards by their tracks and silence by the hour.',
        long: [
          { type: 'p', text: 'Between two winters, Golnar Bakhtiari walked the same eleven trails above her village, recording snowlines, bellbirds, shepherds and the slow movement of a leopard she never once saw.' },
          { type: 'p', text: 'Part science, part devotion, these notes argue that attention is the rarest form of love.' },
        ],
      },
      fa: {
        title: 'یادداشت‌های میدانی از البرز', subtitle: 'چهار فصل در کوه‌های شمال تهران',
        short: 'گزارش یک بوم‌شناس میدانی از یک سال کوهستانی — شمردن پلنگ‌ها با ردپا و سکوت، ساعتی به ساعت.',
        long: [
          { type: 'p', text: 'میان دو زمستان، گلنار بختیاری یازده مسیر ثابت بالای روستایش را پیاده رفت و خط برف، بلبل‌ها، شبان‌ها و حرکت آرام پلنگی را که هرگز ندید، ثبت کرد.' },
          { type: 'p', text: 'بخشی علم، بخشی ارادت؛ این یادداشت‌ها نشان می‌دهند که توجه، کمیاب‌ترین شکل دوست‌داشتن است.' },
        ],
      },
      variants: [{ sku: 'SP-978-3-011-00011-0', isbn: '978-3-011-00011-0', format: 'PAPERBACK', price: 2300, stock: 3, pages: 232, lang: 'English', sold: 52 }],
      contributors: [{ person: 'golnar-bakhtiari', role: 'AUTHOR' }],
    },
  ]

  const variantIds: Record<string, string> = {}
  const productIds: Record<string, string> = {}
  for (const p of products) {
    const row = await db.product.create({ data: {
      slug: p.slug, status: 'PUBLISHED', publicationDate: new Date(p.pubDate),
      series: p.series ?? null, seriesSlug: p.series ? p.series.toLowerCase().replace(/ /g, '-') : null,
      coverUrl: `/images/${p.img}.png`, isFeatured: p.featured ?? false,
      fixedPrice: p.fixedPrice ?? false, audience: p.audience ?? null,
      safetyNote: 'Paper book. Printed in the EU. Not suitable for children under 3 (small parts for some editions). — placeholder pending GPSR review',
    }})
    productIds[p.slug] = row.id
    await db.productTranslation.createMany({ data: [
      { productId: row.id, locale: 'en', title: p.en.title, subtitle: p.en.subtitle ?? null, shortDescription: p.en.short, longDescription: blocks(p.en.long), seoTitle: `${p.en.title} — PersePix`, seoDesc: p.en.short.slice(0, 155), publishedState: 'READY' },
      { productId: row.id, locale: 'fa', title: p.fa.title, subtitle: p.fa.subtitle ?? null, shortDescription: p.fa.short, longDescription: blocks(p.fa.long), seoTitle: `${p.fa.title} — پرس‌پیکس`, seoDesc: p.fa.short.slice(0, 155), publishedState: 'READY' },
    ]})
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i]
      const vr = await db.variant.create({ data: {
        productId: row.id, sku: v.sku, isbn13: v.isbn, isbn10: v.isbn.replace(/[^0-9X]/g, '').slice(-10),
        barcode: v.isbn, format: v.format, bookLanguage: v.lang, editionLabel: v.edition ?? null,
        pageCount: v.pages, widthMm: 130 + i * 15, heightMm: 200 + i * 10, depthMm: 22 + i * 8, weightG: 320 + i * 160,
        countryOfPrinting: 'Austria', priceMinor: v.price, stock: v.stock, lowStockThreshold: 5, soldCount: v.sold ?? 0, sortOrder: i,
      }})
      variantIds[v.sku] = vr.id
    }
    for (let i = 0; i < p.contributors.length; i++) {
      await db.productContributor.create({ data: { productId: row.id, personId: personIds[p.contributors[i].person], role: p.contributors[i].role, displayOrder: i } })
    }
    await db.productCategory.create({ data: { productId: row.id, categoryId: catIds[p.primaryCat], isPrimary: true } })
    await db.productMedia.createMany({ data: [
      { productId: row.id, url: `/images/${p.img}.png`, sortOrder: 0, altEn: `${p.en.title} — cover`, altFa: `${p.fa.title} — جلد` },
      ...(p.gallery ?? []).map((g, i) => ({ productId: row.id, url: `/images/${g}.png`, sortOrder: i + 1, altEn: `${p.en.title} — interior view`, altFa: `${p.fa.title} — نمایی از کتاب` })),
    ]})
  }
  // related products
  const rel: Array<[string, string]> = [
    ['the-cartographer-of-silence', 'the-archivist'], ['the-cartographer-of-silence', 'tea-at-the-edge-of-winter'],
    ['the-archivist', 'the-cartographer-of-silence'], ['the-archivist', 'the-orchard-keepers-daughter'],
    ['tea-at-the-edge-of-winter', 'the-orchard-keepers-daughter'], ['letters-to-my-city', 'blueprints-of-exile'],
    ['blueprints-of-exile', 'letters-to-my-city'], ['songs-for-a-burnt-bridge', 'tea-at-the-edge-of-winter'],
    ['rust-and-turquoise', 'field-notes-from-the-alborz'], ['the-nightingales-atlas', 'field-notes-from-the-alborz'],
    ['field-notes-from-the-alborz', 'the-orchard-keepers-daughter'], ['the-orchard-keepers-daughter', 'field-notes-from-the-alborz'],
  ]
  for (const [a, b] of rel) await db.relatedProduct.create({ data: { productId: productIds[a], relatedProductId: productIds[b] } })

  // ── Reviews ──────────────────────────────────────────────────────────
  const reviews = [
    { slug: 'the-cartographer-of-silence', name: 'Elena M.', rating: 5, title: 'A quiet masterpiece', body: 'I have not stopped thinking about the cinema chapter. The translation is seamless — you would never guess it was not written in English.', verified: true, days: 21 },
    { slug: 'the-cartographer-of-silence', name: 'Tobias K.', rating: 4, title: 'Beautiful, patient prose', body: 'Takes about 60 pages to find its rhythm, and then it is unputdownable. The hardcover is lovely — cloth binding, generous margins.', verified: true, days: 9 },
    { slug: 'the-cartographer-of-silence', name: 'Maryam R.', rating: 5, title: 'بسیار زیبا', body: 'روایت آرام و در عین حال درگیرکننده. ترجمهٔ انگلیسی هم روان است. جلد کتاب واقعاً شیک است.', verified: true, days: 30, locale: 'fa' },
    { slug: 'letters-to-my-city', name: 'Sofia L.', rating: 5, title: 'Tehran comes alive', body: 'I have never been to Tehran and now I miss it. The essay on the Valiasr oaks alone is worth the price.', verified: true, days: 14 },
    { slug: 'tea-at-the-edge-of-winter', name: 'R. Ostermann', rating: 5, title: 'Read it while it snowed', body: 'Exactly as the introduction suggests. The story about the two sisters splitting a pomegranate wrecked me.', verified: true, days: 25 },
    { slug: 'the-orchard-keepers-daughter', name: 'Anna B.', rating: 4, title: 'Land and grief', body: 'The court subplot resolves a little too neatly, but the orchard itself is rendered with such love that I forgive it.', verified: true, days: 6 },
    { slug: 'songs-for-a-burnt-bridge', name: 'Pedram S.', rating: 5, title: 'شعرها دو زبانه و عالی', body: 'نسخهٔ فارسی در سمت راست و انگلیسی روبرو — عالی چاپ شده. شعر «پل ششم» را چند بار خواندم.', verified: true, days: 11, locale: 'fa' },
    { slug: 'blueprints-of-exile', name: 'H. Tanaka', rating: 5, title: 'Architecture of memory', body: 'The chapter about the library he designed but never visited is one of the finest things I have read this year.', verified: true, days: 18 },
    { slug: 'the-nightingales-atlas', name: 'Julia W.', rating: 5, title: 'My daughter’s new favourite', body: 'We read it three times the first night and now she wants to “correct the map” of our town too. The fold-out poster is beautiful.', verified: true, days: 8 },
    { slug: 'rust-and-turquoise', name: 'Marc D.', rating: 5, title: 'A museum in your hands', body: 'Heavy, beautifully sewn binding. The plates at original scale make a real difference. Worth every cent.', verified: true, days: 13 },
    { slug: 'the-archivist', name: 'Claudia F.', rating: 4, title: 'Slow-burning and humane', body: 'Less a thriller than a meditation, but the last hundred pages earn the tension honestly.', verified: false, days: 4 },
    { slug: 'field-notes-from-the-alborz', name: 'Oskar L.', rating: 5, title: 'Attention as love', body: 'Reads like Thoreau with better science and more humility. The low stock warning is real — get it now.', verified: true, days: 2 },
  ]
  for (const r of reviews) {
    await db.review.create({ data: {
      productId: productIds[r.slug], authorName: r.name, rating: r.rating, title: r.title, body: r.body,
      locale: r.locale ?? 'en', isVerifiedPurchase: r.verified, moderationState: 'APPROVED',
      createdAt: new Date(Date.now() - r.days * 86400000),
    }})
  }
  await db.review.create({ data: { productId: productIds['the-archivist'], authorName: 'Guest Reader', rating: 3, title: 'Disappointed ending', body: 'I wanted the folder to matter more. Still well written.', locale: 'en', moderationState: 'PENDING' } })
  await db.review.create({ data: { productId: productIds['letters-to-my-city'], authorName: 'H. Salehi', rating: 5, title: 'نثری درخشان', body: 'هر جستار مثل یک پیاده‌روی در شهر است.', locale: 'fa', moderationState: 'PENDING' } })

  // ── Articles ─────────────────────────────────────────────────────────
  const artCats = [
    { slug: 'translation', en: 'Translation', fa: 'ترجمه' },
    { slug: 'design', en: 'Design', fa: 'طراحی' },
    { slug: 'craft', en: 'Craft', fa: 'صنعت چاپ' },
    { slug: 'interviews', en: 'Interviews', fa: 'گفت‌وگو' },
  ]
  const artCatIds: Record<string, string> = {}
  for (let i = 0; i < artCats.length; i++) {
    const c = await db.articleCategory.create({ data: { slug: artCats[i].slug, sortOrder: i } })
    artCatIds[c.slug] = c.id
    await db.articleCategoryTranslation.createMany({ data: [
      { articleCategoryId: c.id, locale: 'en', name: artCats[i].en },
      { articleCategoryId: c.id, locale: 'fa', name: artCats[i].fa },
    ]})
  }
  const articles = [
    {
      slug: 'why-translate', hero: 'article-translation', cat: 'translation', featured: true, days: 12,
      byline: 'The PersePix editors',
      en: {
        title: 'Why Translate? On Bringing Persian Stories to European Readers',
        excerpt: 'A short defence of the longest thing we do: carrying a book across a language border without dropping it.',
        body: blocks([
          { type: 'p', text: 'Every book we publish crosses at least one border twice: once when we acquire it, and again — invisibly, word by word — when our translator carries it into English. The second crossing takes a year. The first took a phone call. This imbalance is the first thing you should know about translation.' },
          { type: 'h2', text: 'Translation is a form of hosting' },
          { type: 'p', text: 'When Martin Ellison began translating The Cartographer of Silence, he moved to Isfahan for a month. Not to learn Persian — he had studied it for eleven years — but to learn the silences: how long a pause between mother and daughter can last before it becomes a sentence.' },
          { type: 'quote', text: 'A translation should be a house where the guest can hear the owner’s accent, but never feel unwelcome.', attribution: 'Martin Ellison, from our translator’s note' },
          { type: 'h2', text: 'What we insist on' },
          { type: 'ul', items: [
            'Every translation is prepared with the author, in the room or on the phone.',
            'Bilingual editions keep the original text visible; the original is not luggage, it is the passenger.',
            'Idioms are not smoothed away — they are footnoted only when the sentence cannot carry them.',
          ]},
          { type: 'callout', title: 'For booksellers', text: 'Our translations ship with shelf-talkers in English and German on request.' },
          { type: 'p', text: 'None of this makes translation fast. It makes it responsible. We think a small house can afford responsibility precisely because it is small.' },
        ]),
      },
      fa: {
        title: 'چرا ترجمه؟ دربارهٔ رساندن قصه‌های فارسی به خوانندگان اروپا',
        excerpt: 'دفاعی کوتاه از طولانی‌ترین کاری که می‌کنیم: عبور دادن یک کتاب از مرز زبان، بدون رها کردنش.',
        body: blocks([
          { type: 'p', text: 'هر کتابی که منتشر می‌کنیم دست‌کم دو بار از مرزی عبور می‌کند: یک بار وقتی حق نشرش را می‌خریم، و یک بار — نامرئی، واژه به واژه — وقتی مترجم آن را به انگلیسی می‌برد. عبور دوم یک سال طول می‌کشد. عبور اول یک تماس تلفنی. این ناموزونی، نخستین چیزی است که باید دربارهٔ ترجمه بدانید.' },
          { type: 'h2', text: 'ترجمه شکلی از مهمان‌نوازی است' },
          { type: 'p', text: 'وقتی مارتین الیسون ترجمهٔ «نقشه‌کش سکوت» را آغاز کرد، یک ماه به اصفهان رفت. نه برای یادگیری فارسی — یازده سال آن را خوانده بود — بلکه برای یادگیری سکوت‌ها: اینکه مکث میان مادر و دختر چقدر طول بکشد تا جمله شود.' },
          { type: 'quote', text: 'ترجمه باید خانه‌ای باشد که مهمان لهجهٔ صاحب خانه را بشنود، اما هرگز احساس ناخوشایندی نکند.', attribution: 'مارتین الیسون، از یادداشت مترجم' },
          { type: 'h2', text: 'آنچه بر آن پافشاری می‌کنیم' },
          { type: 'ul', items: [
            'هر ترجمه با حضور نویسنده آماده می‌شود؛ حضوری یا تلفنی.',
            'نسخه‌های دوزبانه متن اصلی را در دید نگه می‌دارند؛ متن اصلی بارِ اضافه نیست، مسافر است.',
            'اصطلاح‌ها نرم نمی‌شوند؛ فقط وقتی جمله نمی‌تواند آن‌ها را حمل کند، پانویس می‌شوند.',
          ]},
          { type: 'callout', title: 'برای کتاب‌فروشان', text: 'ترجمه‌های ما در صورت درخواست با کارت معرفی قفسه به انگلیسی و آلمانی ارسال می‌شوند.' },
          { type: 'p', text: 'هیچ‌کدام از این‌ها ترجمه را سریع نمی‌کند؛ مسئول می‌کند. ما فکر می‌کنیم یک نشر کوچک دقیقاً به همین دلیلِ کوچکی، توانِ مسئول بودن را دارد.' },
        ]),
      },
      relations: [{ type: 'PRODUCT', slug: 'the-cartographer-of-silence' }, { type: 'PERSON', slug: 'martin-ellison' }],
    },
    {
      slug: 'art-of-the-persian-book-cover', hero: 'article-covers', cat: 'design', featured: true, days: 26,
      byline: 'Mahsa Farhoud, Art Director',
      en: {
        title: 'The Art of the Persian Book Cover',
        excerpt: 'Why our covers refuse to shout — a studio note on restraint, calligraphy and the colour of patience.',
        body: blocks([
          { type: 'p', text: 'The Persian book cover has a long memory. Long before blurb economy and sales-rank typography, Iranian designers built covers that behaved like carpets: dense at the centre, calm at the edges, patient in their geometry.' },
          { type: 'h2', text: 'One idea per cover' },
          { type: 'p', text: 'When we design a cover at PersePix, we allow ourselves exactly one idea. The Cartographer of Silence is a contour map. Songs for a Burnt Bridge is a single brushstroke. If a second idea knocks, we note it for the spine.' },
          { type: 'image', src: '/images/article-covers.png', alt: 'Cover proofs on the studio table', caption: 'Proofs for the autumn season, printed in-house on the plotter before sending to press.' },
          { type: 'h3', text: 'The colour of patience' },
          { type: 'p', text: 'Our house palette starts from a deep petrol blue — the colour of Tehran at 6 a.m. in November — and lets burnt orange arrive only when the text earns it. We print on uncoated stock so the paper, like the reader, keeps its dignity.' },
          { type: 'divider' },
          { type: 'p', text: 'A cover is a promise about tempo. Ours promise slowness. So far, readers keep forgiving us.' },
        ]),
      },
      fa: {
        title: 'هنر جلد کتاب ایرانی',
        excerpt: 'چرا جلدهای ما حاضر نیستند داد بزنند — یادداشتی از استودیو دربارهٔ خویشتن‌داری، خوش‌نویسی و رنگ صبر.',
        body: blocks([
          { type: 'p', text: 'جلد کتاب ایرانی حافظه‌ای دراز دارد. سال‌ها پیش از اقتصادِ پشت‌جلد و تایپوگرافیِ رتبهٔ فروش، طراحان ایرانی جلدهایی می‌ساختند که مثل قالی رفتار می‌کردند: در مرکز پر، در حاشیه آرام، و در هندسه‌شان صبور.' },
          { type: 'h2', text: 'برای هر جلد، یک ایده' },
          { type: 'p', text: 'وقتی در پرس‌پیکس جلدی طراحی می‌کنیم، دقیقاً یک ایده به خودمان اجازه می‌دهیم. «نقشه‌کش سکوت» یک نقشهٔ تراز است. «ترانه‌هایی برای پل سوخته» یک قلم‌موی تنها. اگر ایدهٔ دومی در بزند، آن را برای عطف یادداشت می‌کنیم.' },
          { type: 'image', src: '/images/article-covers.png', alt: 'نمونه‌های جلد روی میز استودیو', caption: 'نمونه‌های چاپ فصل پاییز، پیش از ارسال به چاپخانه.' },
          { type: 'h3', text: 'رنگ صبر' },
          { type: 'p', text: 'پالت خانه از آبی نفتی عمیق آغاز می‌شود — رنگ تهران ساعت شش صبح نوامبر — و نارنجی سوخته فقط وقتی می‌آید که متن لایقش باشد. روی کاغذ مات چاپ می‌کنیم تا کاغذ، مثل خواننده، وقارش را نگه دارد.' },
          { type: 'divider' },
          { type: 'p', text: 'جلد، وعده‌ای دربارهٔ tempo است. جلدهای ما وعدهٔ آهستگی می‌دهند. تا اینجا خوانندگان هنوز ما را بخشیده‌اند.' },
        ]),
      },
      relations: [{ type: 'PRODUCT', slug: 'songs-for-a-burnt-bridge' }],
    },
    {
      slug: 'inside-the-print-shop', hero: 'article-printing', cat: 'craft', days: 40,
      byline: 'The PersePix editors',
      en: {
        title: 'Inside the Print Shop: How Our Books Are Made',
        excerpt: 'A photo essay from the presses outside Vienna, where our autumn titles were sewn, glued and trimmed.',
        body: blocks([
          { type: 'p', text: 'Forty minutes by train from our office there is a print shop with a letterpress older than everyone who operates it. This autumn’s clothbound editions came through those machines, and we went along to watch.' },
          { type: 'h2', text: 'Paper first, ink second' },
          { type: 'ol', items: [
            'Uncoated cream stock arrives in 1.2-tonne rolls and rests for two weeks to reach room humidity.',
            'Plates are proofed in five colours; the fifth colour — the teal — is always mixed last and adjusted by eye.',
            'Signatures are sewn, not glued, for every hardcover above 200 pages.',
            'Each copy is trimmed to a tolerance of 0.4 mm and inspected by a person, not a camera.',
          ]},
          { type: 'quote', text: 'The machine knows everything except when to stop. That is still my job.', attribution: 'Johann, press operator, 31 years' },
          { type: 'callout', title: 'Sustainability note (placeholder)', text: 'FSC-certified stock, mineral-oil-free inks. Full statement pending review.' },
        ]),
      },
      fa: {
        title: 'داخل چاپخانه: کتاب‌های ما چگونه ساخته می‌شوند',
        excerpt: 'عکاسی از چاپخانه‌ای در حومهٔ وین، جایی که عناوین پاییزی ما دوخته، چسبانده و بریده شدند.',
        body: blocks([
          { type: 'p', text: 'چهل دقیقه با قطار از دفتر ما، چاپخانه‌ای است با دستگاه حروف‌چینی قدیمی‌تر از همهٔ اپراتورهایش. نسخه‌های پارچه‌ای پاییز امسال از این دستگاه‌ها گذشتند و ما رفته بودیم تماشا.' },
          { type: 'h2', text: 'اول کاغذ، بعد مرکب' },
          { type: 'ol', items: [
            'کاغذ کرم مات در رول‌های ۱.۲ تنی می‌رسد و دو هفته استراحت می‌کند تا به رطوبت اتاق برسد.',
            'صفحات با پنج رنگ نمونه‌گیری می‌شوند؛ رنگ پنجم — فیروزه‌ای — همیشه آخر مخلوط و با چشم تنظیم می‌شود.',
            'دفترها برای هر جلد سخت بالای ۲۰۰ صفحه، دوخته می‌شوند نه چسبانده.',
            'هر نسخه با تلورانس ۰.۴ میلی‌متر بریده می‌شود و بازبینی‌اش کار یک انسان است، نه دوربین.',
          ]},
          { type: 'quote', text: 'ماشین همه‌چیز را می‌داند جز اینکه کجا باید بایستد. آن کار هنوز مال من است.', attribution: 'یوهان، اپراتور چاپ، ۳۱ سال سابقه' },
          { type: 'callout', title: 'یادداشت پایداری (پیش‌نویس)', text: 'کاغذ دارای گواهی FSC، مرکب‌های بدون روغن معدنی. بیانیهٔ کامل در انتظار بازبینی.' },
        ]),
      },
      relations: [{ type: 'PRODUCT', slug: 'rust-and-turquoise' }],
    },
    {
      slug: 'a-conversation-with-neda-ahmadi', hero: 'article-interview', cat: 'interviews', featured: true, days: 5,
      byline: 'Interview by Sarah Berger',
      en: {
        title: 'A Conversation with Neda Ahmadi',
        excerpt: 'On surveying, silence, and why her novels always begin with a map. Translated from the Persian by the interviewer.',
        body: blocks([
          { type: 'p', text: 'We met Neda Ahmadi on the last warm afternoon of September, in a tea house in Vienna she had chosen because, she said, “the chairs are wrong in the right way.”' },
          { type: 'h2', text: 'You spent a decade as an urban surveyor. How does one become a novelist from there?' },
          { type: 'p', text: 'Slowly, and without noticing. A surveyor learns that every place holds two layers: what is built and what is remembered. My first novel drew the first layer. Ever since, I only draw the second.' },
          { type: 'h2', text: 'Silence is your recurring material. Is that melancholy?' },
          { type: 'p', text: 'Not at all. Silence is where people store what they refuse to surrender. I am not writing about the absence of speech — I am writing about its savings account.' },
          { type: 'quote', text: 'When I cannot find the next sentence, I go and measure something. Sooner or later the sentence comes to be measured too.' },
          { type: 'h2', text: 'What do you hope European readers take from the book?' },
          { type: 'p', text: 'The recognition that a small town in Khansar and a small town in Styria lose their voices in the same key. After that, the rest is literature.' },
        ]),
      },
      fa: {
        title: 'گفت‌وگو با نداآهمدی',
        excerpt: 'دربارهٔ نقشه‌برداری، سکوت و اینکه چرا رمان‌هایش همیشه با یک نقشه آغاز می‌شوند. ترجمه از فارسی توسط مصاحبه‌گر.',
        body: blocks([
          { type: 'p', text: 'با نداآهمدی در آخرین عصر گرم سپتامبر دیدار کردیم، در قهوه‌خانه‌ای در وین که خودش انتخاب کرده بود چون، به گفتهٔ خودش، «صندلی‌هایش از نظرِ درست، غلطند».' },
          { type: 'h2', text: 'یک دهه نقشه‌بردار شهری بودید. از آنجا چطور می‌شود رمان‌نویس؟' },
          { type: 'p', text: 'آهسته، و بدون اینکه بفهمیم. نقشه‌بردار یاد می‌گیرد هر جا دو لایه دارد: آنچه ساخته شده و آنچه به یاد مانده. رمان اولم لایهٔ اول را می‌کشید. از آن به بعد فقط لایهٔ دوم را می‌کشم.' },
          { type: 'h2', text: 'سکوت مادۀ همیشگی شماست. آیا این غمگینانه است؟' },
          { type: 'p', text: 'اصلاً. سکوت جایی است که مردم آنچه را حاضر به تسلیم کردنش نیستند پس‌انداز می‌کنند. من دربارهٔ نبودِ حرف نمی‌نویسم؛ دربارهٔ حساب پس‌اندازِ حرف می‌نویسم.' },
          { type: 'quote', text: 'وقتی جملهٔ بعدی را پیدا نمی‌کنم، می‌روم چیزی را اندازه می‌گیرم. دیر یا زود جمله هم به اندازه‌گیری می‌آید.' },
          { type: 'h2', text: 'از خوانندگان اروپایی چه انتظاری دارید؟' },
          { type: 'p', text: 'این تشخیص که شهر کوچکی در خوانسار و شهر کوچکی در اشتایریه صدایشان را با یک کلید از دست می‌دهند. بعدش، بقیه‌اش ادبیات است.' },
        ]),
      },
      relations: [{ type: 'PRODUCT', slug: 'the-cartographer-of-silence' }, { type: 'PERSON', slug: 'neda-ahmadi' }],
    },
  ]
  const articleIds: Record<string, string> = {}
  for (const a of articles) {
    const row = await db.article.create({ data: {
      slug: a.slug, status: 'PUBLISHED', heroUrl: `/images/${a.hero}.png`, byline: a.byline,
      isFeatured: a.featured ?? false, publishedAt: new Date(Date.now() - a.days * 86400000),
    }})
    articleIds[a.slug] = row.id
    await db.articleTranslation.createMany({ data: [
      { articleId: row.id, locale: 'en', title: a.en.title, excerpt: a.en.excerpt, body: a.en.body, seoTitle: a.en.title, seoDesc: a.en.excerpt.slice(0, 155), readingMinutes: 6 },
      { articleId: row.id, locale: 'fa', title: a.fa.title, excerpt: a.fa.excerpt, body: a.fa.body, seoTitle: a.fa.title, seoDesc: a.fa.excerpt.slice(0, 155), readingMinutes: 6 },
    ]})
    await db.articleCategoryLink.create({ data: { articleId: row.id, articleCategoryId: artCatIds[a.cat] } })
    for (let i = 0; i < a.relations.length; i++) {
      const r = a.relations[i]
      await db.articleRelation.create({ data: { articleId: row.id, targetType: r.type, targetId: r.type === 'PRODUCT' ? productIds[r.slug] : personIds[r.slug], sortOrder: i } })
    }
  }

  // ── Homepage versions ────────────────────────────────────────────────
  function heroSection() {
    return {
      type: 'HERO', sortOrder: 0, enabled: true,
      settings: {
        autoplayMs: 6000, motion: 'fade', heightPreset: 'standard',
        slides: [
          {
            image: '/images/hero-season.png',
            eyebrowEn: 'Autumn 2025 Season', eyebrowFa: 'فصل پاییز ۲۰۲۵',
            titleEn: 'Books that cross borders, quietly.', titleFa: 'کتاب‌هایی که آرام از مرزها می‌گذرند.',
            bodyEn: 'Three new translations of contemporary Persian fiction, poetry and memoir — now shipping across Europe.', bodyFa: 'سه ترجمهٔ تازه از ادبیات، شعر و خاطرهٔ معاصر ایران — اکنون در سراسر اروپا.',
            ctaEn: 'Browse the season', ctaFa: 'تماشای فصل', href: '/books', textColor: 'light', position: 'left', bg: '#014B74',
          },
          {
            image: '/images/hero-poetry.png',
            eyebrowEn: 'New Poetry', eyebrowFa: 'شعر تازه',
            titleEn: 'Songs for a Burnt Bridge', titleFa: 'ترانه‌هایی برای پل سوخته',
            bodyEn: 'Shirin Golzar’s second collection, in a bilingual edition with the Persian originals on facing pages.', bodyFa: 'مجموعهٔ دوم شیرین گلزار، در نسخه‌ای دوزبانه با اصل فارسی در صفحات روبه‌رو.',
            ctaEn: 'View the book', ctaFa: 'دیدن کتاب', href: '/books/songs-for-a-burnt-bridge', textColor: 'light', position: 'left', bg: '#172026',
          },
        ],
      },
    }
  }
  /** Restored for audit-v3 (user: «در نسخهٔ اصلی صفحهٔ اصلی یک اسلایدر داستانی
   *  داشت که با اسکرول شدن اسلاید تغییر می‌شد»): the pinned SCROLL_STORY
   *  module. The component (storefront/ScrollStory.tsx) was never removed —
   *  only its DATA was lost with the sandbox db reset, and no seed version
   *  ever carried it (it had been configured through the admin Homepage
   *  editor at runtime). Assets survived in public/images/story/ (4 scenes
   *  + mobile variants + floating cover), so the module is rebuilt from
   *  them, bilingually, as a brand story about a thousand years of
   *  Persian storytelling. */
  function storySection() {
    return {
      type: 'SCROLL_STORY', sortOrder: 1, enabled: true,
      settings: {
        eyebrowEn: 'From the Book of Kings', eyebrowFa: 'از شاهنامه',
        ctaEn: 'Browse the library', ctaFa: 'کتابخانه را ببینید', ctaHref: '/books',
        heightPreset: 'cinematic', layout: 'backdrop',
        coverImage: '/images/story/shahnameh-cover.png',
        slides: [
          {
            image: '/images/story/shahnameh-1.png', imageMobile: '/images/story/shahnameh-1-mobile.png',
            eyebrowEn: 'A thousand years of stories', eyebrowFa: 'هزار سال قصه',
            titleEn: 'Where Persian storytelling begins.', titleFa: 'جایی که قصه‌گویی فارسی آغاز می‌شود.',
            textEn: 'Ferdowsi’s verses have carried kings, heroes and heartbreak across thirty generations of readers.', textFa: 'ابراهیم حکیم ابوالقاسم فردوسی، پایتان و شگفتی‌ها را سی نسل به دوش کشیده است.',
          },
          {
            image: '/images/story/shahnameh-2.png', imageMobile: '/images/story/shahnameh-2-mobile.png',
            eyebrowEn: 'Scene II', eyebrowFa: 'صحنهٔ دوم',
            titleEn: 'Heroes written in ink and gold.', titleFa: 'پهلوانان به مرکب زر و بند.',
            textEn: 'Every manuscript was a small universe — painted, gilded, and read aloud across winter nights.', textFa: 'هر نسخه، گیتی کوچکی بود — نگارگری‌شده و طلاندوز که در شب‌های زمستان بلند خوانده می‌شد.',
          },
          {
            image: '/images/story/shahnameh-3.png', imageMobile: '/images/story/shahnameh-3-mobile.png',
            eyebrowEn: 'Scene III', eyebrowFa: 'صحنهٔ سوم',
            titleEn: 'The bridge we translate across.', titleFa: 'پلی که ما ترجمه می‌کنیم.',
            textEn: 'PersePix carries that same river of stories into new languages — page by page, border by border.', textFa: 'نشر پرسی‌پیکس همین رود قصه را به زبان‌های تازه می‌برد — صفحه به صفحه، مرز به مرز.',
          },
          {
            image: '/images/story/shahnameh-4.png', imageMobile: '/images/story/shahnameh-4-mobile.png',
            eyebrowEn: 'Scene IV', eyebrowFa: 'صحنهٔ چهارم',
            titleEn: 'Your shelf is the next chapter.', titleFa: 'قفسهٔ شما، فصل بعدی است.',
            textEn: 'Bilingual editions, new voices, old epics — all shipping from Vienna across Europe.', textFa: 'نسخه‌های دوزبانه، صداهای تازه، حماسه‌های کهن — همه از وین به سراسر اروپا.',
          },
        ],
      },
    }
  }
  function categorySection() {
    return {
      type: 'CATEGORY_CAROUSEL', sortOrder: 2, enabled: true,
      settings: { headingEn: 'Browse the shelves', headingFa: 'گشت‌وگذار در قفسه‌ها', descriptionEn: 'Six rooms of our small library.', descriptionFa: 'شش اتاق از کتابخانهٔ کوچک ما.', slugs: ['fiction','poetry','non-fiction','childrens-books','art-photography','biography-memoir'] },
    }
  }
  function newShelf(sortOrder: number) {
    return {
      type: 'PRODUCT_SHELF', sortOrder, enabled: true,
      settings: {
        headingEn: 'New releases', headingFa: 'تازه‌های نشر', descriptionEn: 'Fresh from the presses.', descriptionFa: 'تازه از چاپخانه.',
        source: 'latest', layout: 'carousel', limit: 8, hideOutOfStock: false,
        ctaEn: 'All books', ctaFa: 'همهٔ کتاب‌ها', ctaHref: '/books',
      },
    }
  }
  function posterSection() {
    return {
      type: 'POSTER_GRID', sortOrder: 4, enabled: true,
      settings: {
        template: 'one_plus_two',
        posters: [
          { image: '/images/poster-poetry.png', eyebrowEn: 'Poetry', eyebrowFa: 'شعر', titleEn: 'Voices that refuse to be left', titleFa: 'صداهایی که حاضر نیستند بروند', textEn: 'Bilingual editions from the new Persian avant-garde.', textFa: 'نسخه‌های دوزبانه از آوانگارد تازهٔ ایران.', ctaEn: 'Explore poetry', ctaFa: 'شعرها را ببینید', href: '/categories/poetry', bg: '#172026', textColor: 'light', span: 'large' },
          { image: '/images/poster-children.png', eyebrowEn: "Children's", eyebrowFa: 'کودک', titleEn: 'Maps, birds, small adventures', titleFa: 'نقشه‌ها، پرنده‌ها، ماجراهای کوچک', ctaEn: 'For young readers', ctaFa: 'برای خوانندگان کوچک', href: '/categories/childrens-books', bg: '#EAF4F8', textColor: 'dark', span: 'small' },
          { image: '/images/poster-art.png', eyebrowEn: 'Art', eyebrowFa: 'هنر', titleEn: 'Rust and Turquoise is here', titleFa: '«زنگار و فیروزه» رسید', ctaEn: 'See the art shelf', ctaFa: 'قفسهٔ هنر', href: '/books/rust-and-turquoise', bg: '#F4F7F8', textColor: 'dark', span: 'small' },
        ],
      },
    }
  }
  function quoteSection() {
    return {
      type: 'EDITORIAL_FEATURE', sortOrder: 5, enabled: true,
      settings: {
        layout: 'image-right', bg: 'soft', accentOrange: true, image: '/images/face-shirin.png',
        eyebrowEn: 'From the author', eyebrowFa: 'از زبان نویسنده',
        quoteEn: 'I write toward the bridge, even while it burns.', quoteFa: 'من به سوی پل می‌نویسم، حتی وقتی می‌سوزد.',
        attributionEn: 'Shirin Golzar, Songs for a Burnt Bridge', attributionFa: 'شیرین گلزار، «ترانه‌هایی برای پل سوخته»',
        ctaEn: 'Meet the poets', ctaFa: 'با شاعران آشنا شوید', ctaHref: '/authors',
      },
    }
  }
  function bestShelf() {
    return {
      type: 'PRODUCT_SHELF', sortOrder: 6, enabled: true,
      settings: {
        headingEn: 'Readers’ favourites', headingFa: 'محبوب خوانندگان', descriptionEn: 'The books that keep leaving our shelves.', descriptionFa: 'کتاب‌هایی که پیوسته از قفسهٔ ما می‌روند.',
        source: 'bestselling', layout: 'carousel', limit: 8, hideOutOfStock: false,
      },
    }
  }
  function articleFeature() {
    return {
      type: 'EDITORIAL_FEATURE', sortOrder: 7, enabled: true,
      settings: {
        layout: 'image-left', bg: 'white', accentOrange: false, image: '/images/article-translation.png',
        eyebrowEn: 'From the journal', eyebrowFa: 'از دفتر نشر',
        titleEn: 'Why translate?', titleFa: 'چرا ترجمه؟',
        textEn: 'A short defence of the longest thing we do: carrying a book across a language border without dropping it.', textFa: 'دفاعی کوتاه از طولانی‌ترین کاری که می‌کنیم: عبور دادن یک کتاب از مرز زبان، بدون رها کردنش.',
        ctaEn: 'Read the essay', ctaFa: 'خواندن جستار', ctaHref: '/articles/why-translate',
      },
    }
  }
  const sections = [heroSection(), storySection(), categorySection(), newShelf(3), posterSection(), quoteSection(), bestShelf(), articleFeature()]
  for (const locale of ['en', 'fa']) {
    const pub = await db.homepageVersion.create({ data: { locale, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 7 * 86400000), publishedBy: admin.email, changeSummary: 'Seasonal campaign refresh' } })
    for (const s of sections) await db.homepageSection.create({ data: { versionId: pub.id, type: s.type, sortOrder: s.sortOrder, enabled: s.enabled, settingsJson: JSON.stringify(s.settings) } })
    const draft = await db.homepageVersion.create({ data: { locale, status: 'DRAFT', changeSummary: 'Draft — work in progress' } })
    for (const s of sections) await db.homepageSection.create({ data: { versionId: draft.id, type: s.type, sortOrder: s.sortOrder, enabled: s.enabled, settingsJson: JSON.stringify(s.settings) } })
  }

  // ── Legal documents (placeholder copy — counsel review required) ─────
  const legal = [
    { type: 'PRIVACY', en: ['Privacy Notice (Placeholder)', 'This is placeholder text for demonstration purposes. The final privacy notice must be reviewed and approved by qualified legal counsel before launch.\n\n## Data we process\nWe process the data needed to fulfil orders: contact details, addresses, order history, payment references, and technical logs.\n\n## Your rights\nYou can request access, correction, export and deletion of your personal data from your account privacy page.'], fa: ['بیانیهٔ حریم خصوصی (پیش‌نویس)', 'این متن صرفاً برای نمایش است. بیانیهٔ نهایی پیش از انتشار باید توسط مشاور حقوقی تأیید شود.\n\n## داده‌هایی که پردازش می‌کنیم\nبرای انجام سفارش‌ها به داده‌های تماس، نشانی، تاریخچهٔ سفارش و ارجاع پرداخت نیاز داریم.\n\n## حقوق شما\nمی‌توانید از صفحهٔ حریم خصوصی حساب، درخواست دسترسی، اصلاح، دریافت خروجی و حذف داده‌ها بدهید.'] },
    { type: 'TERMS', en: ['Terms of Sale (Placeholder)', 'Placeholder terms. Final wording requires counsel review.\n\n## Orders\nA contract is concluded when we confirm your order by email.\n\n## Prices\nAll prices include Austrian reduced VAT (10%) where applicable. Shipping is additional and shown at checkout.'], fa: ['شرایط فروش (پیش‌نویس)', 'متن نمونه. نسخهٔ نهایی نیازمند تأیید مشاور حقوقی است.\n\n## سفارش‌ها\nقرارداد هنگامی منعقد می‌شود که سفارش شما را با ایمیل تأیید کنیم.\n\n## قیمت‌ها\nهمهٔ قیمت‌ها شامل مالیات بر ارزش افزودهٔ کاهش‌یافتهٔ اتریش (۱۰٪) است. هزینهٔ ارسال جداگانه است و در مرحلهٔ پرداخت نمایش داده می‌شود.'] },
    { type: 'WITHDRAWAL', en: ['Right of Withdrawal (Placeholder)', 'Consumers in the EU may withdraw from a purchase within 14 days without giving a reason. The model withdrawal form will be provided here once reviewed by counsel.'], fa: ['حق انصراف (پیش‌نویس)', 'مصرف‌کنندگان در اتحادیهٔ اروپا می‌توانند تا ۱۴ روز بدون ذکر دلیل از خرید انصراف دهند. فرم نمونهٔ انصراف پس از بازبینی حقوقی اینجا قرار می‌گیرد.'] },
    { type: 'IMPRINT', en: ['Imprint / Legal Notice (Placeholder)', 'PersePix GmbH (placeholder)\nPraterstraße 12, 1020 Vienna, Austria\nContact: hello@persepix.example\nCompany registration and managing director details to be inserted before launch.'], fa: ['اطلاعات ناشر (پیش‌نویس)', 'پرس‌پیکس (نمونه)\nپراتراشتراسه ۱۲، ۱۰۲۰ وین، اتریش\nتماس: hello@persepix.example\nمشخصات ثبت شرکت و مدیر مسئول پیش از انتشار درج می‌شود.'] },
    { type: 'ACCESSIBILITY', en: ['Accessibility Statement (Placeholder)', 'We aim to meet WCAG 2.2 AA across the storefront. If you encounter barriers, contact hello@persepix.example and we will provide the content in an accessible alternative.'], fa: ['بیانیهٔ دسترس‌پذیری (پیش‌نویس)', 'هدف ما رعایت سطح AA از WCAG 2.2 در سراسر فروشگاه است. اگر با موانعی روبه‌رو شدید، به hello@persepix.example اطلاع دهید تا محتوا را به شکلی در دسترس ارائه کنیم.'] },
    { type: 'COOKIES', en: ['Cookie Notice (Placeholder)', 'We use only essential cookies for cart and session. Analytics cookies, if enabled in future, will require prior opt-in consent.'], fa: ['اطلاعیهٔ کوکی (پیش‌نویس)', 'ما فقط از کوکی‌های ضروری برای سبد خرید و نشست استفاده می‌کنیم. کوکی‌های تحلیلی در صورت فعال شدن در آینده، نیازمند رضایت قبلی خواهند بود.'] },
  ]
  for (const l of legal) {
    await db.legalDocument.createMany({ data: [
      { type: l.type, locale: 'en', version: '1.0-draft', title: l.en[0], body: l.en[1], isCurrent: true, updatedBy: admin.email },
      { type: l.type, locale: 'fa', version: '1.0-draft', title: l.fa[0], body: l.fa[1], isCurrent: true, updatedBy: admin.email },
    ]})
  }

  // ── Demo orders ──────────────────────────────────────────────────────
  function shipJson(r: string, l1: string, c: string, z: string, co: string) {
    return JSON.stringify({ recipient: r, line1: l1, city: c, region: null, postalCode: z, countryCode: co, phone: null })
  }
  function taxOf(subtotal: number) { return Math.round(subtotal * 10 / 110) }

  const o1sub = 2200 + 1800
  const order1 = await db.order.create({ data: {
    orderNumber: 'SP-2025-00041', userId: customer.id, email: customer.email,
    status: 'SHIPPED', paymentStatus: 'SUCCEEDED', fulfillmentStatus: 'PARTIAL',
    subtotalMinor: o1sub, shippingMinor: 490, taxMinor: taxOf(o1sub + 490), totalMinor: o1sub + 490,
    shippingMethodName: 'Austria Post — Standard', shippingZone: 'AT',
    shippingAddressJson: shipJson('Daniel Weber', 'Kettenbrückengasse 9', 'Vienna', '1050', 'AT'),
    billingAddressJson: shipJson('Daniel Weber', 'Kettenbrückengasse 9', 'Vienna', '1050', 'AT'),
    locale: 'en', createdAt: new Date(Date.now() - 12 * 86400000),
    consentsJson: JSON.stringify({ terms: '1.0-draft', privacy: '1.0-draft' }),
  }})
  await db.orderItem.createMany({ data: [
    { orderId: order1.id, variantId: variantIds['SP-978-3-011-00001-1'], titleEn: 'The Cartographer of Silence', titleFa: 'نقشه‌کش سکوت', sku: 'SP-978-3-011-00001-1', isbn: '978-3-011-00001-1', coverUrl: '/images/cover-cartographer.png', format: 'PAPERBACK', bookLanguage: 'English', quantity: 1, unitPriceMinor: 2200, taxMinor: taxOf(2200), totalMinor: 2200 },
    { orderId: order1.id, variantId: variantIds['SP-978-3-011-00004-2'], titleEn: 'Tea at the Edge of Winter', titleFa: 'چای در مرز زمستان', sku: 'SP-978-3-011-00004-2', isbn: '978-3-011-00004-2', coverUrl: '/images/cover-tea.png', format: 'PAPERBACK', bookLanguage: 'English', quantity: 1, unitPriceMinor: 1800, taxMinor: taxOf(1800), totalMinor: 1800 },
  ]})
  await db.payment.create({ data: { orderId: order1.id, providerIntentId: 'pi_sbx_1001', amountMinor: o1sub + 490, status: 'SUCCEEDED', cardBrand: 'Visa', cardLast4: '4242' } })
  await db.shipment.create({ data: { orderId: order1.id, carrier: 'Austria Post', trackingNumber: 'AT12X345678901', trackingUrl: 'https://www.post.at/en/tracking/AT12X345678901', status: 'SHIPPED', shippedAt: new Date(Date.now() - 10 * 86400000), estimatedDeliveryAt: new Date(Date.now() + 2 * 86400000) } })
  await db.orderEvent.createMany({ data: [
    { orderId: order1.id, type: 'CREATED', message: 'Order created', actor: 'system' },
    { orderId: order1.id, type: 'PAID', message: 'Payment succeeded (Visa •••• 4242)', actor: 'system' },
    { orderId: order1.id, type: 'EMAIL_QUEUED', message: 'Order confirmation email queued to ' + customer.email, actor: 'system' },
    { orderId: order1.id, type: 'SHIPPED', message: 'Shipment AT12X345678901 handed to Austria Post', actor: admin.email },
  ]})

  const o2sub = 3200
  const order2 = await db.order.create({ data: {
    orderNumber: 'SP-2025-00042', email: 'guest.reader@example.com',
    status: 'PAID', paymentStatus: 'SUCCEEDED', fulfillmentStatus: 'UNFULFILLED',
    subtotalMinor: o2sub, shippingMinor: 790, taxMinor: taxOf(o2sub + 790), totalMinor: o2sub + 790,
    shippingMethodName: 'EU — Tracked Standard', shippingZone: 'EU',
    shippingAddressJson: shipJson('Lena Fischer', 'Torstraße 84', 'Berlin', '10119', 'DE'),
    locale: 'en', createdAt: new Date(Date.now() - 3 * 86400000),
    consentsJson: JSON.stringify({ terms: '1.0-draft', privacy: '1.0-draft' }),
  }})
  await db.orderItem.create({ data: { orderId: order2.id, variantId: variantIds['SP-978-3-011-00009-7'], titleEn: 'Rust and Turquoise', titleFa: 'زنگار و فیروزه', sku: 'SP-978-3-011-00009-7', isbn: '978-3-011-00009-7', coverUrl: '/images/cover-rust.png', format: 'HARDCOVER', bookLanguage: 'English', quantity: 1, unitPriceMinor: 3200, taxMinor: taxOf(3200), totalMinor: 3200 } })
  await db.payment.create({ data: { orderId: order2.id, providerIntentId: 'pi_sbx_1002', amountMinor: o2sub + 790, status: 'SUCCEEDED', cardBrand: 'Mastercard', cardLast4: '5454' } })
  await db.orderEvent.createMany({ data: [
    { orderId: order2.id, type: 'CREATED', message: 'Order created', actor: 'system' },
    { orderId: order2.id, type: 'PAID', message: 'Payment succeeded (Mastercard •••• 5454)', actor: 'system' },
  ]})

  const o3sub = 1500 + 2300
  const order3 = await db.order.create({ data: {
    orderNumber: 'SP-2025-00033', userId: customer.id, email: customer.email,
    status: 'DELIVERED', paymentStatus: 'SUCCEEDED', fulfillmentStatus: 'DELIVERED',
    subtotalMinor: o3sub, shippingMinor: 490, taxMinor: taxOf(o3sub + 490), totalMinor: o3sub + 490,
    shippingMethodName: 'Austria Post — Standard', shippingZone: 'AT',
    shippingAddressJson: shipJson('Daniel Weber', 'Kettenbrückengasse 9', 'Vienna', '1050', 'AT'),
    locale: 'en', createdAt: new Date(Date.now() - 34 * 86400000),
    consentsJson: JSON.stringify({ terms: '1.0-draft', privacy: '1.0-draft' }),
  }})
  await db.orderItem.createMany({ data: [
    { orderId: order3.id, variantId: variantIds['SP-978-3-011-00008-0'], titleEn: "The Nightingale's Atlas", titleFa: 'اطلس بلبل', sku: 'SP-978-3-011-00008-0', isbn: '978-3-011-00008-0', coverUrl: '/images/cover-nightingale.png', format: 'HARDCOVER', bookLanguage: 'English', quantity: 1, unitPriceMinor: 1500, taxMinor: taxOf(1500), totalMinor: 1500 },
    { orderId: order3.id, variantId: variantIds['SP-978-3-011-00011-0'], titleEn: 'Field Notes from the Alborz', titleFa: 'یادداشت‌های میدانی از البرز', sku: 'SP-978-3-011-00011-0', isbn: '978-3-011-00011-0', coverUrl: '/images/cover-fieldnotes.png', format: 'PAPERBACK', bookLanguage: 'English', quantity: 1, unitPriceMinor: 2300, taxMinor: taxOf(2300), totalMinor: 2300 },
  ]})
  await db.payment.create({ data: { orderId: order3.id, providerIntentId: 'pi_sbx_1003', amountMinor: o3sub + 490, status: 'SUCCEEDED', cardBrand: 'Visa', cardLast4: '4242' } })
  await db.shipment.create({ data: { orderId: order3.id, carrier: 'Austria Post', trackingNumber: 'AT98Z765432109', status: 'DELIVERED', shippedAt: new Date(Date.now() - 32 * 86400000), estimatedDeliveryAt: new Date(Date.now() - 29 * 86400000) } })
  await db.orderEvent.createMany({ data: [
    { orderId: order3.id, type: 'CREATED', message: 'Order created', actor: 'system' },
    { orderId: order3.id, type: 'PAID', message: 'Payment succeeded (Visa •••• 4242)', actor: 'system' },
    { orderId: order3.id, type: 'SHIPPED', message: 'Shipment AT98Z765432109 handed to Austria Post', actor: admin.email },
    { orderId: order3.id, type: 'FULFILLED', message: 'Delivered', actor: 'system' },
  ]})

  // ── Tickets ──────────────────────────────────────────────────────────
  const t1 = await db.ticket.create({ data: {
    ticketNumber: 'TK-0007', userId: customer.id, email: customer.email, name: 'Daniel Weber',
    subject: 'Tracking number not updating', category: 'SHIPPING', relatedOrderNumber: 'SP-2025-00041', status: 'AWAITING_SUPPORT',
  }})
  await db.ticketMessage.createMany({ data: [
    { ticketId: t1.id, senderType: 'CUSTOMER', senderName: 'Daniel Weber', body: 'Hello — the Austria Post tracking for order SP-2025-00041 has not updated in two days. Is the parcel lost?' },
    { ticketId: t1.id, senderType: 'SUPPORT', senderName: 'Parisa Bahrami', body: 'Hi Daniel, thanks for reaching out. The label was scanned but the parcel missed the morning pickup. It is now in transit — allow 24h for the next scan. Sorry for the scare!' },
  ]})
  const t2 = await db.ticket.create({ data: {
    ticketNumber: 'TK-0008', email: 'bookclub@example.com', name: 'Reading Circle Graz',
    subject: 'Bulk order for a reading circle (8 copies)', category: 'GENERAL', status: 'OPEN',
  }})
  await db.ticketMessage.create({ data: { ticketId: t2.id, senderType: 'CUSTOMER', senderName: 'Reading Circle Graz', body: 'Hello! We are 8 people reading The Cartographer of Silence this winter. Do you offer a discount for bulk orders, and can you sign the copies?' } })

  // ── Audit log ────────────────────────────────────────────────────────
  await db.auditLog.createMany({ data: [
    { actorEmail: admin.email, action: 'HOMEPAGE_PUBLISH', entityType: 'HomepageVersion', entityId: 'en', summary: 'Published homepage v1 for en: Seasonal campaign refresh' },
    { actorEmail: admin.email, action: 'HOMEPAGE_PUBLISH', entityType: 'HomepageVersion', entityId: 'fa', summary: 'Published homepage v1 for fa: Seasonal campaign refresh' },
    { actorEmail: admin.email, action: 'ORDER_SHIPPED', entityType: 'Order', entityId: 'SP-2025-00041', summary: 'Shipment AT12X345678901 created (Austria Post)' },
    { actorEmail: admin.email, action: 'LEGAL_PUBLISH', entityType: 'LegalDocument', entityId: 'PRIVACY', summary: 'Published placeholder v1.0-draft pending counsel review' },
  ]})

  console.log('Seed complete ✔')
  console.log('Admin/customer accounts seeded. Passwords come from SEED_ADMIN_PASSWORD / SEED_CUSTOMER_PASSWORD (never logged).')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())