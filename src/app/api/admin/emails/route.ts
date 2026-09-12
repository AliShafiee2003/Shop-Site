// GET /api/admin/emails — sandbox outbox: renders queued transactional emails (PRD 22).
// Emails are derived from OrderEvent EMAIL_QUEUED rows + order/shipment data, plus
// back-in-stock restock notices derived from notified BackInStockSubscriber rows, and
// returned as structured payloads; the admin UI renders them as previews (never raw HTML).
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server/auth'
import { apiError, json, pickLocale } from '@/lib/server/utils'

interface EmailLine { title: string; qty: number; lineTotalMinor: number }
interface RenderedEmail {
  id: string
  orderId: string | null
  orderNumber: string
  to: string
  kind: 'ORDER_CONFIRMATION' | 'SHIPPING_NOTICE' | 'BACK_IN_STOCK' | 'PASSWORD_RESET' | 'EMAIL_VERIFY' | 'NEWSLETTER_CONFIRM'
  locale: string
  createdAt: string
  subject: string
  greeting: string
  intro: string
  items: EmailLine[]
  subtotalMinor: number
  discountCode?: string | null
  discountMinor?: number
  giftWrap?: boolean
  giftWrapMinor?: number
  giftMessage?: string | null
  shippingMinor: number
  totalMinor: number
  carrier?: string
  trackingUrl?: string
  /** BACK_IN_STOCK only */
  product?: { title: string; titleFa: string; slug: string; sku: string } | null
  footerNote: string
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return apiError(403, 'FORBIDDEN')

  const [events, notices] = await Promise.all([
    db.orderEvent.findMany({
      where: { type: 'EMAIL_QUEUED' },
      orderBy: { createdAt: 'desc' },
      take: 24,
      include: {
        order: {
          select: {
            id: true, orderNumber: true, email: true, locale: true,
            subtotalMinor: true, discountCode: true, discountMinor: true, shippingMinor: true, totalMinor: true,
            giftWrap: true, giftWrapMinor: true, giftMessage: true,
            items: { select: { titleEn: true, quantity: true, totalMinor: true } },
            shipments: { orderBy: { createdAt: 'desc' }, take: 1, select: { carrier: true, trackingUrl: true } },
          },
        },
      },
    }),
    db.backInStockSubscriber.findMany({
      where: { notifiedAt: { not: null } },
      orderBy: { notifiedAt: 'desc' },
      take: 8,
      include: { variant: { include: { product: { include: { translations: true } } } } },
    }),
  ])

  const orderEmails: RenderedEmail[] = events.map((ev) => {
    const o = ev.order
    const isShipping = ev.message.toLowerCase().includes('shipping')
    const fa = o.locale === 'fa'
    const items: EmailLine[] = o.items.map((it) => ({ title: it.titleEn, qty: it.quantity, lineTotalMinor: it.totalMinor }))
    if (isShipping) {
      const ship = o.shipments[0]
      return {
        id: ev.id, orderId: o.id, orderNumber: o.orderNumber, to: o.email, kind: 'SHIPPING_NOTICE',
        locale: o.locale, createdAt: ev.createdAt.toISOString(),
        subject: fa
          ? `سفارش ${o.orderNumber} ارسال شد`
          : `Your order ${o.orderNumber} has shipped`,
        greeting: fa ? 'سلام،' : 'Hello,',
        intro: fa
          ? 'سفارش شما تحویل باربری شد. با پیوند زیر می‌توانید مرسوله را پیگیری کنید.'
          : 'Good news — your parcel is on its way. Track it any time with the link below.',
        items,
        subtotalMinor: o.subtotalMinor, discountCode: o.discountCode, discountMinor: o.discountMinor, shippingMinor: o.shippingMinor, totalMinor: o.totalMinor,
        giftWrap: o.giftWrap, giftWrapMinor: o.giftWrapMinor, giftMessage: o.giftMessage,
        carrier: ship?.carrier ?? undefined,
        trackingUrl: ship?.trackingUrl ?? undefined,
        footerNote: fa ? 'پرس‌پیکس — وین' : 'Persepix — Vienna',
      }
    }
    return {
      id: ev.id, orderId: o.id, orderNumber: o.orderNumber, to: o.email, kind: 'ORDER_CONFIRMATION',
      locale: o.locale, createdAt: ev.createdAt.toISOString(),
      subject: fa
        ? `تأیید سفارش ${o.orderNumber}`
        : `Order confirmation — ${o.orderNumber}`,
      greeting: fa ? 'سلام،' : 'Hello,',
      intro: fa
        ? 'از خرید شما سپاسگزاریم. خلاصهٔ سفارش شما در زیر آمده است.'
        : 'Thank you for your order. Here is a summary of what you’ll be reading soon.',
      items,
      subtotalMinor: o.subtotalMinor, discountCode: o.discountCode, discountMinor: o.discountMinor, shippingMinor: o.shippingMinor, totalMinor: o.totalMinor,
      giftWrap: o.giftWrap, giftWrapMinor: o.giftWrapMinor, giftMessage: o.giftMessage,
      footerNote: fa ? 'پرس‌پیکس — وین' : 'Persepix — Vienna',
    }
  })

  // Back-in-stock restock notices (sandbox): one preview per notified subscriber.
  const bisEmails: RenderedEmail[] = notices.map((n) => {
    const fa = n.locale === 'fa'
    const titleEn = pickLocale(n.variant.product.translations, 'en')?.title ?? n.variant.product.slug
    const titleFa = pickLocale(n.variant.product.translations, 'fa')?.title ?? ''
    return {
      id: `bis-${n.id}`,
      orderId: null,
      orderNumber: '',
      to: n.email,
      kind: 'BACK_IN_STOCK',
      locale: n.locale,
      createdAt: (n.notifiedAt ?? n.createdAt).toISOString(),
      subject: fa
        ? `«${titleFa || titleEn}» دوباره موجود شد`
        : `“${titleEn}” is back in stock`,
      greeting: fa ? 'سلام،' : 'Hello,',
      intro: fa
        ? 'خبر خوب — نسخه‌ای که منتظرش بودید دوباره به قفسه‌ها برگشت. موجودی محدود است، پس زودتر سر بزنید.'
        : 'Good news — the edition you were waiting for is back on our shelves. Stock is limited, so don’t wait too long.',
      items: [],
      subtotalMinor: 0,
      shippingMinor: 0,
      totalMinor: 0,
      product: { title: titleEn, titleFa, slug: n.variant.product.slug, sku: n.variant.sku },
      footerNote: fa ? 'پرس‌پیکس — وین' : 'Persepix — Vienna',
    }
  })

  // Generic queued mails (MailMessage outbox, S13): password-reset mails etc.
  // Subjects/links are NOT expanded here — the body contains the single-use
  // token and only the recipient's own copy would (in production).
  const mails = await db.mailMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
  })
  // Kind-specific one-line previews (the full body — with its single-use
  // token — stays only in the recipient's copy).
  const mailIntro = (kind: string, fa: boolean): string => {
    switch (kind) {
      case 'PASSWORD_RESET':
        return fa ? 'پیوند یک‌بارمصرف بازنشانی گذرواژه صادر شد (پیش‌نمایش — متن کامل نزد گیرنده است).' : 'A single-use password-reset link was issued (preview — the full body belongs to the recipient).'
      case 'EMAIL_VERIFY':
        return fa ? 'پیوند یک‌بارمصرف تأیید ایمیل صادر شد (پیش‌نمایش — متن کامل نزد گیرنده است).' : 'A single-use email-verification link was issued (preview — the full body belongs to the recipient).'
      case 'NEWSLETTER_CONFIRM':
        return fa ? 'پیوند تأیید عضویت در خبرنامه صادر شد (پیش‌نمایش — متن کامل نزد گیرنده است).' : 'A newsletter double opt-in confirmation link was issued (preview — the full body belongs to the recipient).'
      default:
        return fa ? 'یک ایمیل تراکنشی در صف قرار گرفت (پیش‌نمایش).' : 'A transactional email was queued (preview).'
    }
  }
  const mailEmails: RenderedEmail[] = mails.map((m) => ({
    id: `mail-${m.id}`,
    orderId: null,
    orderNumber: '',
    to: m.to,
    kind: m.kind as RenderedEmail['kind'],
    locale: m.locale,
    createdAt: m.createdAt.toISOString(),
    subject: m.subject,
    greeting: '',
    intro: mailIntro(m.kind, m.locale === 'fa'),
    items: [],
    subtotalMinor: 0,
    shippingMinor: 0,
    totalMinor: 0,
    footerNote: m.locale === 'fa' ? 'پرس‌پیکس — وین' : 'Persepix — Vienna',
  }))

  const items = [...orderEmails, ...bisEmails, ...mailEmails].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return json({ items })
}
