// R10 — weekly sales digest ("scheduled report" mail, round-9 backlog item b).
//
// The store owner gets a 7-day sales summary through the SAME MailMessage
// outbox every transactional mail uses (kind SALES_DIGEST). Scheduling needs
// no external cron: healthz housekeeping calls queueSalesDigestEmailIfDue()
// on its 6-hourly sweep and the 7-day freshness guard below makes it fire
// exactly once per week. A manual OWNER/admin trigger exists at
// POST /api/admin/reports/digest (?force=1 bypasses the guard).
//
// The digest is PLAIN TEXT (same no-HTML-injection surface as order mails);
// money uses the shared formatMinor; deltas compare the last 7 days against
// the 7 days before that.
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { siteUrlFrom } from '@/lib/site'
import { formatMinor } from '@/lib/server/money'
import { pickLocale } from '@/lib/server/utils'

export interface DigestResult {
  queued: boolean
  skipped?: 'recent' | 'no-recipient'
  to?: string
  subject?: string
}

const DIGEST_WINDOW_DAYS = 7
/** A digest this fresh suppresses the automatic one (manual force bypasses). */
const DIGEST_FRESH_MS = DIGEST_WINDOW_DAYS * 24 * 3600 * 1000

/** Persian digits for the FA body (server-side — lib/format is client-only). */
function toFa(s: string | number): string {
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

function fmtRange(from: Date, to: Date, locale: string): string {
  try {
    const loc = locale === 'fa' ? 'fa-IR' : 'en-GB'
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    const f = new Intl.DateTimeFormat(loc, opts)
    return `${f.format(from)} – ${f.format(to)}`
  } catch {
    return `${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}`
  }
}

/** "+12%" | "−5%" | "— change" (previous window was empty). */
function delta(cur: number, prev: number, fa: boolean): string {
  if (prev <= 0) return fa ? 'هفتهٔ اول' : 'first week'
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return fa ? 'بدون تغییر' : 'no change'
  const sign = pct > 0 ? '+' : '−'
  return fa ? `${sign}${toFa(Math.abs(pct))}٪` : `${sign}${Math.abs(pct)}%`
}

/** Recipient: the store support email from settings, else the OWNER's login. */
async function resolveRecipient(): Promise<{ email: string; locale: string } | null> {
  const store = await db.settings.findUnique({ where: { key: 'store' } }).catch(() => null)
  const parsed = store?.valueJson ? (JSON.parse(store.valueJson) as { email?: string }).email : undefined
  if (parsed?.trim()) return { email: parsed.trim(), locale: 'en' }
  const owner = await db.user.findFirst({
    where: { role: 'OWNER' },
    orderBy: { createdAt: 'asc' },
    select: { email: true, preferredLocale: true },
  })
  return owner ? { email: owner.email, locale: owner.preferredLocale === 'fa' ? 'fa' : 'en' } : null
}

export interface DigestData {
  paidOrders: { cur: number; prev: number }
  revenueMinor: { cur: number; prev: number }
  refundsMinor: number
  aovMinor: number
  topProducts: { title: string; units: number }[]
  topCountries: { code: string; orders: number; revenueMinor: number }[]
  lowStock: { title: string; sku: string; stock: number }[]
  pendingReviews: number
  openTickets: number
}

/** Collect the digest numbers. Exported for tests/manual preview. */
export async function collectDigestData(now = new Date()): Promise<DigestData> {
  const curStart = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400000)
  const prevStart = new Date(now.getTime() - 2 * DIGEST_WINDOW_DAYS * 86400000)
  const paid: Prisma.OrderWhereInput = { paymentStatus: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }

  const [curOrders, prevOrders, curAgg, prevAgg, refunds, curItems, lowStockVariants, pendingReviews, openTickets] =
    await Promise.all([
      db.order.count({ where: { ...paid, createdAt: { gte: curStart } } }),
      db.order.count({ where: { ...paid, createdAt: { gte: prevStart, lt: curStart } } }),
      db.order.aggregate({ where: { ...paid, createdAt: { gte: curStart } }, _sum: { totalMinor: true } }),
      db.order.aggregate({ where: { ...paid, createdAt: { gte: prevStart, lt: curStart } }, _sum: { totalMinor: true } }),
      db.refund.aggregate({
        where: { status: 'SUCCEEDED', createdAt: { gte: curStart } },
        _sum: { amountMinor: true },
      }),
      db.orderItem.findMany({
        where: { order: { ...paid, createdAt: { gte: curStart } } },
        include: { variant: { include: { product: { include: { translations: true } } } } },
      }),
      db.variant
        .findMany({
          where: { isActive: true, stock: { lte: 5 } },
          include: { product: { include: { translations: true } } },
          orderBy: { stock: 'asc' },
          take: 24,
        })
        .then((rows) => rows.filter((v) => v.stock <= v.lowStockThreshold).slice(0, 6)),
      db.review.count({ where: { moderationState: 'PENDING' } }),
      db.ticket.count({ where: { status: { in: ['OPEN', 'AWAITING_SUPPORT'] } } }),
    ])

  // Per-product units (grouped in JS — SQLite has no relational groupBy here).
  const byProduct = new Map<string, { title: string; units: number }>()
  for (const it of curItems) {
    const title =
      it.variant?.product
        ? (pickLocale(it.variant.product.translations, 'en')?.title ?? it.variant.product.slug)
        : it.titleEn
    const e = byProduct.get(title) ?? { title, units: 0 }
    e.units += it.quantity
    byProduct.set(title, e)
  }

  // Per-country from the shipping snapshot.
  const byCountry = new Map<string, { code: string; orders: number; revenueMinor: number }>()
  const curOrdersRows = await db.order.findMany({
    where: { ...paid, createdAt: { gte: curStart } },
    select: { shippingAddressJson: true, totalMinor: true },
  })
  for (const o of curOrdersRows) {
    let code = '??'
    try {
      const addr = o.shippingAddressJson ? (JSON.parse(o.shippingAddressJson) as { countryCode?: string }) : null
      code = addr?.countryCode ?? '??'
    } catch {
      // keep placeholder
    }
    const e = byCountry.get(code) ?? { code, orders: 0, revenueMinor: 0 }
    e.orders += 1
    e.revenueMinor += o.totalMinor
    byCountry.set(code, e)
  }

  const revenueCur = curAgg._sum.totalMinor ?? 0
  return {
    paidOrders: { cur: curOrders, prev: prevOrders },
    revenueMinor: { cur: revenueCur, prev: prevAgg._sum.totalMinor ?? 0 },
    refundsMinor: refunds._sum.amountMinor ?? 0,
    aovMinor: curOrders > 0 ? Math.round(revenueCur / curOrders) : 0,
    topProducts: [...byProduct.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    topCountries: [...byCountry.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 4),
    lowStock: lowStockVariants.map((v) => ({
      title: pickLocale(v.product.translations, 'en')?.title ?? v.product.slug,
      sku: v.sku,
      stock: v.stock,
    })),
    pendingReviews,
    openTickets,
  }
}

/** Build the localized plain-text digest body. Exported for preview tests. */
export function buildDigestBody(data: DigestData, locale: string, origin: string, now = new Date()): { fa: boolean; text: string } {
  const fa = locale === 'fa'
  const to = new Date(now)
  const from = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400000)
  const range = fmtRange(from, to, locale)
  const dOrders = delta(data.paidOrders.cur, data.paidOrders.prev, fa)
  const dRevenue = delta(data.revenueMinor.cur, data.revenueMinor.prev, fa)
  const n = (x: number | string) => (fa ? toFa(x) : String(x))
  const money = (m: number) => (fa ? toFa(formatMinor(m)) : formatMinor(m))

  const lines: string[] = fa
    ? [
        'سلام،',
        `گزارش فروش ۷ روز گذشته (${range}) — با مقایسهٔ ۷ روز قبل از آن:`,
        '',
        `• سفارش‌های پرداخت‌شده: ${n(data.paidOrders.cur)} (${dOrders})`,
        `• درآمد: ${money(data.revenueMinor.cur)} (${dRevenue})`,
        `• مرجوعی‌ها: ${money(data.refundsMinor)}`,
        `• میانگین سفارش: ${money(data.aovMinor)}`,
      ]
    : [
        'Hello,',
        `Here is how the store did over the last 7 days (${range}), with the previous 7 days in brackets:`,
        '',
        `• Paid orders: ${n(data.paidOrders.cur)} (${dOrders})`,
        `• Revenue: ${money(data.revenueMinor.cur)} (${dRevenue})`,
        `• Refunds: ${money(data.refundsMinor)}`,
        `• Average order: ${money(data.aovMinor)}`,
      ]

  if (data.topProducts.length > 0) {
    lines.push('', fa ? 'پرفروش‌ترین‌های این هفته:' : 'Best sellers this week:')
    data.topProducts.forEach((p, i) => lines.push(`${n(i + 1)}. ${p.title} — ${n(p.units)} ${fa ? 'نسخه' : 'sold'}`))
  }
  if (data.topCountries.length > 0) {
    lines.push('', fa ? 'بازارها:' : 'Where orders came from:')
    for (const c of data.topCountries) lines.push(`• ${c.code} — ${n(c.orders)} ${fa ? 'سفارش' : 'orders'} · ${money(c.revenueMinor)}`)
  }
  if (data.lowStock.length > 0) {
    lines.push('', fa ? 'موجودی کم (بهتر است شارژ کنید):' : 'Low stock right now (worth reordering):')
    for (const v of data.lowStock) lines.push(`• ${v.title} (${v.sku}) — ${n(v.stock)} ${fa ? 'عدد' : 'left'}`)
  }
  if (data.pendingReviews > 0 || data.openTickets > 0) {
    lines.push('', fa ? 'در انتظار شما:' : 'Also waiting for you:')
    if (data.pendingReviews > 0) lines.push(`• ${n(data.pendingReviews)} ${fa ? 'نظر در انتظار بررسی' : 'review(s) pending moderation'}`)
    if (data.openTickets > 0) lines.push(`• ${n(data.openTickets)} ${fa ? 'تیکت بی‌پاسخ' : 'open ticket(s) without a reply'}`)
  }

  lines.push(
    '',
    fa ? 'مدیریت فروشگاه:' : 'Manage the store:',
    `${origin}/admin`,
    '',
    fa ? 'پرس‌پیکس — گزارش خودکار هفتگی' : 'Persepix — automatic weekly report',
  )
  return { fa, text: lines.join('\n') }
}

/** Queue one SALES_DIGEST mail. Idempotent per week: a digest younger than
 *  7 days suppresses the automatic queueing (force=1 bypasses — manual sends
 *  are always allowed and do NOT reset the weekly guard themselves… they do,
 *  since they create a row — which is the desired "restart the week" effect). */
export async function queueSalesDigestEmail(
  origin?: string | { headers: Headers } | null,
  opts?: { force?: boolean },
): Promise<DigestResult> {
  if (!opts?.force) {
    const recent = await db.mailMessage.findFirst({
      where: { kind: 'SALES_DIGEST', createdAt: { gte: new Date(Date.now() - DIGEST_FRESH_MS) } },
      select: { id: true },
    })
    if (recent) return { queued: false, skipped: 'recent' }
  }

  const recipient = await resolveRecipient()
  if (!recipient) return { queued: false, skipped: 'no-recipient' }

  const data = await collectDigestData()
  const site = typeof origin === 'string' ? origin : siteUrlFrom(origin ?? null)
  const { fa, text } = buildDigestBody(data, recipient.locale, site)
  const range = fmtRange(new Date(Date.now() - DIGEST_WINDOW_DAYS * 86400000), new Date(), recipient.locale)

  const subject = fa
    ? `پرس‌پیکس — گزارش هفتگی فروش (${range})`
    : `Persepix weekly digest — ${range}`
  await db.mailMessage.create({
    data: { to: recipient.email, subject, kind: 'SALES_DIGEST', bodyText: text, locale: fa ? 'fa' : 'en' },
  })
  return { queued: true, to: recipient.email, subject }
}

/** healthz housekeeping hook: swallows every error (must never fail the probe). */
export async function queueSalesDigestIfDue(): Promise<void> {
  await queueSalesDigestEmail().catch(() => undefined)
}
