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
  kind: 'ORDER_CONFIRMATION' | 'SHIPPING_NOTICE' | 'BACK_IN_STOCK' | 'PASSWORD_RESET' | 'EMAIL_VERIFY' | 'NEWSLETTER_CONFIRM' | 'EMAIL_CHANGE' | 'EMAIL_CHANGE_NOTICE'
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

  const [events, notices, mails] = await Promise.all([
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
    // R5: real order-lifecycle mails (ORDER_CONFIRMATION / SHIPPING_NOTICE)
    // joined to their order so the outbox renders the SAME full summary the
    // recipient's copy carries — straight from the row a provider will send.
    db.mailMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
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
  ])

  // R5 dedupe: orders that already have REAL outbox rows must not ALSO render
  // their legacy derived EMAIL_QUEUED previews (which would duplicate them).
  const orderIdsWithRealMail = new Set(
    mails.filter((m) => m.orderId && m.order).map((m) => m.orderId as string),
  )

  const orderEmails: RenderedEmail[] = events
    .filter((ev) => !orderIdsWithRealMail.has(ev.orderId)) // R5: real row exists → skip the derived preview
    .map((ev) => {
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

  // Generic queued mails (MailMessage outbox, S13/R5): password-reset mails
  // etc. render as one-line previews (the full body — with its single-use
  // token — stays only in the recipient's copy); ORDER_CONFIRMATION /
  // SHIPPING_NOTICE rows joined to their order render as FULL order emails.
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
      case 'EMAIL_CHANGE':
        return fa ? 'پیوند یک‌بارمصرف تأیید تغییر نشانی ایمیل به نشانی تازه صادر شد (پیش‌نمایش — متن کامل نزد گیرنده است).' : 'A single-use email-change confirmation link was issued to the NEW address (preview — the full body belongs to the recipient).'
      case 'EMAIL_CHANGE_NOTICE':
        return fa ? 'نامهٔ اطلاع‌رسانی تغییر نشانی ایمیل صادر شد (پیش‌نمایش — متن کامل نزد گیرنده است).' : 'The email-changed notice was issued (preview — the full body belongs to the recipient).'
      case 'ORDER_CONFIRMATION':
        return fa ? 'ایمیل تأیید سفارش در صف ارسال قرار گرفت (پیش‌نمایش — سفارش در دسترس نیست).' : 'The order-confirmation email was queued (preview — the originating order is unavailable).'
      case 'SHIPPING_NOTICE':
        return fa ? 'ایمیل اطلاع‌رسانی ارسال سفارش در صف قرار گرفت (پیش‌نمایش — سفارش در دسترس نیست).' : 'The shipping-notice email was queued (preview — the originating order is unavailable).'
      default:
        return fa ? 'یک ایمیل تراکنشی در صف قرار گرفت (پیش‌نمایش).' : 'A transactional email was queued (preview).'
    }
  }
  const orderMailEmails: RenderedEmail[] = []
  const plainMailEmails: RenderedEmail[] = []
  for (const m of mails) {
    if (m.orderId && m.order && (m.kind === 'ORDER_CONFIRMATION' || m.kind === 'SHIPPING_NOTICE')) {
      const o = m.order
      const fa = o.locale === 'fa'
      const items: EmailLine[] = o.items.map((it) => ({ title: it.titleEn, qty: it.quantity, lineTotalMinor: it.totalMinor }))
      const ship = o.shipments[0]
      orderMailEmails.push({
        id: `mail-${m.id}`, orderId: o.id, orderNumber: o.orderNumber, to: o.email, kind: m.kind as RenderedEmail['kind'],
        locale: o.locale, createdAt: m.createdAt.toISOString(),
        subject: m.subject,
        greeting: fa ? 'سلام،' : 'Hello,',
        intro: fa
          ? m.kind === 'SHIPPING_NOTICE'
            ? 'سفارش شما تحویل باربری شد. با پیوند زیر می‌توانید مرسوله را پیگیری کنید.'
            : 'از خرید شما سپاسگزاریم. خلاصهٔ سفارش شما در زیر آمده است.'
          : m.kind === 'SHIPPING_NOTICE'
            ? 'Good news — your parcel is on its way. Track it any time with the link below.'
            : 'Thank you for your order. Here is a summary of what you’ll be reading soon.',
        items,
        subtotalMinor: o.subtotalMinor, discountCode: o.discountCode, discountMinor: o.discountMinor, shippingMinor: o.shippingMinor, totalMinor: o.totalMinor,
        giftWrap: o.giftWrap, giftWrapMinor: o.giftWrapMinor, giftMessage: o.giftMessage,
        carrier: ship?.carrier ?? undefined,
        trackingUrl: ship?.trackingUrl ?? undefined,
        footerNote: fa ? 'پرس‌پیکس — وین' : 'Persepix — Vienna',
      })
      continue
    }
    plainMailEmails.push({
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
    })
  }
  const mailEmails = [...orderMailEmails, ...plainMailEmails]

  const items = [...orderEmails, ...bisEmails, ...mailEmails].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return json({ items })
}
