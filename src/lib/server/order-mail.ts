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

/** COM-402: build the BACK_IN_STOCK mail row. The old notify route only
 *  stamped `notifiedAt` — subscribers were told "sent" while the dispatcher
 *  (which only drains MailMessage rows) had nothing to send. Copy mirrors the
 *  admin outbox BACK_IN_STOCK preview (admin/emails route). */
export function backInStockMail(
  subscriber: { email: string; locale: string | null },
  product: { slug: string; titleEn: string; titleFa: string; sku: string },
  origin?: string | { headers: Headers } | null,
): { to: string; subject: string; kind: string; bodyText: string; locale: string } {
  const fa = subscriber.locale === 'fa'
  const site = resolveOrigin(origin)
  const title = fa ? product.titleFa || product.titleEn : product.titleEn
  const link = `${site}/books/${product.slug}`
  const subject = fa ? `«${title}» دوباره موجود شد` : `“${title}” is back in stock`
  const body = fa
    ? [
        'سلام،',
        '',
        `خبر خوب — «${title}» دوباره به قفسه‌ها برگشت. موجودی محدود است، پس زودتر سر بزنید:`,
        link,
        '',
        `کد کالا: ${product.sku}`,
        'پرس‌پیکس — وین',
      ].join('\n')
    : [
        'Hello,',
        '',
        `Good news — “${title}” is back on our shelves. Stock is limited, so don't wait too long:`,
        link,
        '',
        `SKU: ${product.sku}`,
        'PersePix — Vienna',
      ].join('\n')
  return {
    to: subscriber.email,
    subject,
    kind: 'BACK_IN_STOCK',
    bodyText: body,
    locale: fa ? 'fa' : 'en',
  }
}

/** COM-402: queue one BACK_IN_STOCK mail (single-subscriber notify path).
 *  Best-effort, same contract as the order mails. */
export async function queueBackInStockEmail(
  subscriber: { email: string; locale: string | null },
  product: { slug: string; titleEn: string; titleFa: string; sku: string },
  origin?: string | { headers: Headers } | null,
): Promise<void> {
  await db.mailMessage.create({ data: backInStockMail(subscriber, product, origin) })
}

/** COM-401: build the RETURN_DECISION mail row — the customer copy that tells
 *  them what happened to their return request (approved / rejected / received /
 *  refunded). Pairs with queueReturnDecisionEmail; the admin PATCH route calls
 *  that after every decision. */
export function returnDecisionMail(
  order: { orderNumber: string; email: string; locale: string },
  decision: { action: 'approve' | 'reject' | 'mark-received' | 'refund'; itemsTotalMinor: number; refundedMinor: number },
): { to: string; subject: string; kind: string; bodyText: string; locale: string } {
  const fa = order.locale === 'fa'
  const amount = formatMinor(decision.itemsTotalMinor)
  const refunded = formatMinor(decision.refundedMinor)
  const subject = fa
    ? {
        approve: `درخواست مرجوعی سفارش ${order.orderNumber} تأیید شد`,
        reject: `درخواست مرجوعی سفارش ${order.orderNumber} رد شد`,
        'mark-received': `کالای مرجوعی سفارش ${order.orderNumber} دریافت شد`,
        refund: `بازپرداخت سفارش ${order.orderNumber} انجام شد`,
      }[decision.action]
    : {
        approve: `Return request for ${order.orderNumber} approved`,
        reject: `Return request for ${order.orderNumber} rejected`,
        'mark-received': `Your return for ${order.orderNumber} was received`,
        refund: `Refund processed for ${order.orderNumber}`,
      }[decision.action]
  const body = fa
    ? {
        approve: [
          'سلام،',
          '',
          `درخواست مرجوعی شما برای سفارش ${order.orderNumber} تأیید شد. لطفاً کالا را به نشانی فروشگاه ارسال کنید؛ پس از دریافت، بازپرداخت انجام می‌شود.`,
          `ارزش اقلام مرجوعی: ${amount}`,
        ],
        reject: [
          'سلام،',
          '',
          `متأسفانه درخواست مرجوعی شما برای سفارش ${order.orderNumber} رد شد. اگر سؤالی دارید با پشتیبانی تماس بگیرید.`,
        ],
        'mark-received': [
          'سلام،',
          '',
          `کالای مرجوعی سفارش ${order.orderNumber} دریافت و به قفسه‌ها بازگردانده شد. مرحلهٔ بعدی، پردازش بازپرداخت است.`,
        ],
        refund: [
          'سلام،',
          '',
          `بازپرداخت مربوط به مرجوعی سفارش ${order.orderNumber} انجام شد. مبلغ معمولاً ظرف چند روز کاری به کارت شما برمی‌گردد.`,
          `مبلغ بازپرداخت: ${refunded}`,
        ],
      }[decision.action]
    : {
        approve: [
          'Hello,',
          '',
          `Your return request for order ${order.orderNumber} has been approved. Please send the items back to the store address; the refund will be processed once they arrive.`,
          `Value of the returned items: ${amount}`,
        ],
        reject: [
          'Hello,',
          '',
          `Unfortunately your return request for order ${order.orderNumber} was rejected. If anything is unclear, please contact support.`,
        ],
        'mark-received': [
          'Hello,',
          '',
          `We have received the returned items for order ${order.orderNumber} and put them back on the shelf. The next step is processing your refund.`,
        ],
        refund: [
          'Hello,',
          '',
          `The refund for the returned items of order ${order.orderNumber} has been processed. It usually takes a few business days to appear on your card.`,
          `Refund amount: ${refunded}`,
        ],
      }[decision.action]
  return {
    to: order.email,
    subject,
    kind: 'RETURN_DECISION',
    bodyText: [...body, '', fa ? 'پرس‌پیکس — وین' : 'PersePix — Vienna'].join('\n'),
    locale: fa ? 'fa' : 'en',
  }
}

/** COM-401: queue one RETURN_DECISION mail. Best-effort, same contract as the
 *  order mails — callers wrap it in .catch(() => undefined). */
export async function queueReturnDecisionEmail(
  order: { orderId: string; orderNumber: string; email: string; locale: string },
  decision: { action: 'approve' | 'reject' | 'mark-received' | 'refund'; itemsTotalMinor: number; refundedMinor: number },
): Promise<void> {
  const mail = returnDecisionMail(order, decision)
  await db.mailMessage.create({
    data: {
      to: mail.to,
      subject: mail.subject,
      kind: mail.kind,
      bodyText: mail.bodyText,
      locale: mail.locale,
      orderId: order.orderId,
    },
  })
}
