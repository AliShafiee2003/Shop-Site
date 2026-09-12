// R5 — order lifecycle transactional mails through the REAL outbox.
// Until now "order emails" only existed as derived previews the admin outbox
// reconstructed from EMAIL_QUEUED OrderEvent rows. They are now real
// MailMessage rows (kind ORDER_CONFIRMATION / SHIPPING_NOTICE) linked to the
// order — the exact seam a production SMTP provider (SES/Postmark) will consume
// and stamp `sentAt` on. Builders are pure text (no HTML injection surface);
// money is plain EUR formatting; tracking links are site-origin absolute.
import { db } from '@/lib/db'
import { siteUrlFrom } from '@/lib/site'
import { formatMinor } from '@/lib/server/money'

export interface OrderMailItem {
  titleEn: string | null
  titleFa: string | null
  quantity: number
  totalMinor: number
}

export interface OrderMailOrder {
  id: string
  orderNumber: string
  publicRef: string | null
  email: string
  locale: string
  subtotalMinor: number
  discountCode: string | null
  discountMinor: number
  shippingMinor: number
  giftWrap: boolean
  giftWrapMinor: number
  totalMinor: number
}

/** Absolute public tracking link for the order (guest tracking needs no email
 *  since C6 — the publicRef is the credential). Falls back to /track.
 *  NOTE: localePath() lives in the 'use client' router module and cannot be
 *  called server-side — the /fa prefix logic is inlined here instead. */
function trackLink(order: Pick<OrderMailOrder, 'publicRef'>, locale: string, origin: string): string {
  const path = locale === 'fa' ? '/fa/track' : '/track'
  const base = origin + path
  return order.publicRef ? `${base}?ref=${encodeURIComponent(order.publicRef)}` : base
}

/** Site origin resolver: accept a prepared origin string, a Next request
 *  ({ headers }), or null (env → localhost fallback). */
function resolveOrigin(o?: string | { headers: Headers } | null): string {
  return typeof o === 'string' ? o : siteUrlFrom(o ?? null)
}

/** Queue the ORDER_CONFIRMATION mail. Best-effort by design: callers wrap it
 *  in try/catch — a mail outage must never fail a paid order. */
export async function queueOrderConfirmationEmail(
  order: OrderMailOrder,
  items: OrderMailItem[],
  origin?: string | { headers: Headers } | null,
): Promise<void> {
  const fa = order.locale === 'fa'
  const site = resolveOrigin(origin)
  const track = trackLink(order, order.locale, site)

  const lines: string[] = fa
    ? [
        'سلام،',
        `از خرید شما سپاسگزاریم. سفارش ${order.orderNumber} ثبت و پرداخت آن با موفقیت انجام شد.`,
        '',
        'اقلام سفارش:',
        ...items.map((it) => `• ${it.titleFa || it.titleEn || '—'} × ${it.quantity} — ${formatMinor(it.totalMinor)}`),
        '',
        `جمع اقلام: ${formatMinor(order.subtotalMinor)}`,
        ...(order.discountCode && order.discountMinor
          ? [`تخفیف (${order.discountCode}): −${formatMinor(order.discountMinor)}`]
          : []),
        ...(order.giftWrap && order.giftWrapMinor
          ? [`بسته‌بندی کادویی: ${formatMinor(order.giftWrapMinor)}`]
          : []),
        `ارسال: ${formatMinor(order.shippingMinor)}`,
        `مبلغ نهایی: ${formatMinor(order.totalMinor)}`,
        '',
        'پیگیری سفارش (بدون نیاز به ورود):',
        track,
      ]
    : [
        'Hello,',
        `Thank you for your order. ${order.orderNumber} is confirmed and your payment went through.`,
        '',
        'Your items:',
        ...items.map((it) => `• ${it.titleEn || it.titleFa || '—'} × ${it.quantity} — ${formatMinor(it.totalMinor)}`),
        '',
        `Subtotal: ${formatMinor(order.subtotalMinor)}`,
        ...(order.discountCode && order.discountMinor
          ? [`Discount (${order.discountCode}): −${formatMinor(order.discountMinor)}`]
          : []),
        ...(order.giftWrap && order.giftWrapMinor
          ? [`Gift wrap: ${formatMinor(order.giftWrapMinor)}`]
          : []),
        `Shipping: ${formatMinor(order.shippingMinor)}`,
        `Total: ${formatMinor(order.totalMinor)}`,
        '',
        'Track your order any time (no sign-in needed):',
        track,
      ]

  await db.mailMessage.create({
    data: {
      to: order.email,
      subject: fa ? `تأیید سفارش ${order.orderNumber}` : `Order confirmation — ${order.orderNumber}`,
      kind: 'ORDER_CONFIRMATION',
      bodyText: lines.join('\n'),
      locale: fa ? 'fa' : 'en',
      orderId: order.id,
    },
  })
}

/** Queue the SHIPPING_NOTICE mail. Best-effort — same contract as above. */
export async function queueShippingNoticeEmail(
  order: OrderMailOrder,
  shipment: { carrier: string; trackingNumber: string | null; trackingUrl: string | null },
  items: OrderMailItem[],
  origin?: string | { headers: Headers } | null,
): Promise<void> {
  const fa = order.locale === 'fa'
  const site = resolveOrigin(origin)
  const track = trackLink(order, order.locale, site)

  const lines: string[] = fa
    ? [
        'سلام،',
        `خبر خوب — سفارش ${order.orderNumber} تحویل باربری شد و در راه است.`,
        '',
        `باربری: ${shipment.carrier}`,
        ...(shipment.trackingNumber ? [`کد رهگیری: ${shipment.trackingNumber}`] : []),
        ...(shipment.trackingUrl ? [`پیگیری نزد باربری: ${shipment.trackingUrl}`] : []),
        '',
        'پیگیری سفارش در پرس‌پیکس:',
        track,
        '',
        'اقلام این مرسوله:',
        ...items.map((it) => `• ${it.titleFa || it.titleEn || '—'} × ${it.quantity}`),
      ]
    : [
        'Hello,',
        `Good news — your order ${order.orderNumber} has shipped and is on its way.`,
        '',
        `Carrier: ${shipment.carrier}`,
        ...(shipment.trackingNumber ? [`Tracking number: ${shipment.trackingNumber}`] : []),
        ...(shipment.trackingUrl ? [`Carrier tracking: ${shipment.trackingUrl}`] : []),
        '',
        'Track it on PersePix:',
        track,
        '',
        'In this parcel:',
        ...items.map((it) => `• ${it.titleEn || it.titleFa || '—'} × ${it.quantity}`),
      ]

  await db.mailMessage.create({
    data: {
      to: order.email,
      subject: fa ? `سفارش ${order.orderNumber} ارسال شد` : `Your order ${order.orderNumber} has shipped`,
      kind: 'SHIPPING_NOTICE',
      bodyText: lines.join('\n'),
      locale: fa ? 'fa' : 'en',
      orderId: order.id,
    },
  })
}
