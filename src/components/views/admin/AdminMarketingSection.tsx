'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, BarChart3, Loader2, Mail, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Inbox, UserMinus, TicketPercent, Trash2, BellRing, Check, Gift, Truck, KeyRound, MailCheck, MailPlus, ReceiptText, AtSign, Bell, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner, EmptyState } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate, localePath } from '@/lib/router'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, formatDateTime, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

// ───────────────────────── Marketing (newsletter + email outbox) ─────────────────────────

interface Subscriber { id: string; email: string; locale: string; source: string; status: string; createdAt: string }
interface BisGroup {
  variantId: string; sku: string; stock: number
  productTitle: string; productTitleFa: string; productSlug: string
  requests: { id: string; email: string; locale: string; notifiedAt: string | null; createdAt: string }[]
}
interface OutboxEmail {
  id: string; orderId: string | null; orderNumber: string; to: string; kind: 'ORDER_CONFIRMATION' | 'SHIPPING_NOTICE' | 'BACK_IN_STOCK' | 'PASSWORD_RESET' | 'EMAIL_VERIFY' | 'NEWSLETTER_CONFIRM' | 'EMAIL_CHANGE' | 'EMAIL_CHANGE_NOTICE' | 'SALES_DIGEST'
  locale: string; createdAt: string; subject: string; greeting: string; intro: string
  items: { title: string; qty: number; lineTotalMinor: number }[]
  subtotalMinor: number; discountCode?: string | null; discountMinor?: number
  giftWrap?: boolean; giftWrapMinor?: number; giftMessage?: string | null
  shippingMinor: number; totalMinor: number
  carrier?: string; trackingUrl?: string
  product?: { title: string; titleFa: string; slug: string; sku: string } | null
  digestText?: string
  footerNote: string
}
/** R9 — outbox kind-group filter (mirrors FILTER_KINDS in the API route). */
type OutboxFilter = 'all' | 'orders' | 'security' | 'newsletter' | 'reports'

export function AdminMarketing() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const isOwner = useApp((s) => s.user?.role) === 'OWNER'
  const [subs, setSubs] = useState<{ items: Subscriber[]; total: number; subscribedCount: number } | null>(null)
  const [emails, setEmails] = useState<OutboxEmail[] | null>(null)
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  const [bisGroups, setBisGroups] = useState<BisGroup[] | null>(null)
  const [mailMeta, setMailMeta] = useState<{ queued: number; providerConfigured: boolean } | null>(null)
  const [dispatching, setDispatching] = useState(false)
  // R9: server-side outbox pagination + kind-group filter (queue can grow).
  const [outboxPage, setOutboxPage] = useState(1)
  const [outboxFilter, setOutboxFilter] = useState<OutboxFilter>('all')
  const [outboxMeta, setOutboxMeta] = useState<{ page: number; total: number; pages: number } | null>(null)
  const OUTBOX_PAGE_SIZE = 10

  const loadEmails = useCallback((page: number, filter: OutboxFilter) => {
    apiGet<{ items: OutboxEmail[]; mail?: { queued: number; providerConfigured: boolean }; page: number; total: number; pages: number }>(
      `/api/admin/emails?page=${page}&pageSize=${OUTBOX_PAGE_SIZE}&filter=${filter}`,
    )
      .then((r) => {
        setEmails(r.items)
        setMailMeta(r.mail ?? null)
        setOutboxMeta({ page: r.page ?? page, total: r.total ?? r.items.length, pages: r.pages ?? 1 })
      })
      .catch(() => { if (page === 1 && filter === 'all') setEmails([]) })
  }, [])

  useEffect(() => {
    apiGet<{ items: Subscriber[]; total: number; subscribedCount: number }>('/api/admin/newsletter')
      .then(setSubs).catch(() => setSubs({ items: [], total: 0, subscribedCount: 0 }))
    loadEmails(1, 'all')
    apiGet<{ variants: BisGroup[] }>('/api/admin/back-in-stock')
      .then((r) => setBisGroups(r.variants)).catch(() => setBisGroups([]))
  }, [loadEmails])

  const unsubscribe = async (email: string) => {
    await apiDelete(`/api/admin/newsletter?email=${encodeURIComponent(email)}`)
    toast({ title: t.admin.unsubscribed })
    const r = await apiGet<{ items: Subscriber[]; total: number; subscribedCount: number }>('/api/admin/newsletter')
    setSubs(r)
  }

  const reloadBis = () => {
    apiGet<{ variants: BisGroup[] }>('/api/admin/back-in-stock')
      .then((r) => setBisGroups(r.variants)).catch(() => setBisGroups([]))
  }

  const markNotified = async (id: string) => {
    try {
      await apiPatch(`/api/admin/back-in-stock/${id}`, { notified: true })
      toast({ title: t.admin.bisNotified })
      reloadBis()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const removeBis = async (id: string) => {
    await apiDelete(`/api/admin/back-in-stock/${id}`)
    reloadBis()
  }

  const notifyAll = async (g: BisGroup) => {
    try {
      const r = await apiPost<{ notified: number }>('/api/admin/back-in-stock/notify', { variantId: g.variantId })
      toast({ title: tf(t.admin.notifiedAll, { n: r.notified }) })
      reloadBis()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const reloadEmails = () => {
    loadEmails(outboxPage, outboxFilter)
  }

  const dispatchMails = async () => {
    setDispatching(true)
    try {
      const r = await apiPost<{ configured: boolean; sent: number; failed: number; remaining: number }>('/api/admin/emails/dispatch')
      if (!r.configured) {
        toast({ title: t.admin.outboxNoProvider, variant: 'destructive' })
      } else if (r.sent === 0 && r.remaining === 0) {
        toast({ title: t.admin.outboxDispatchedNone })
      } else {
        toast({ title: tf(t.admin.outboxDispatched, { n: r.sent, f: r.failed, r: r.remaining }), variant: r.failed > 0 ? 'destructive' : 'default' })
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally {
      setDispatching(false)
      reloadEmails()
    }
  }

  if (!subs || !emails || !bisGroups) return <Spinner label={t.common.loading} />

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-ink">{t.admin.marketing}</h2>

      {/* Back-in-stock requests */}
      <section aria-label={t.admin.bisPanel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <BellRing className="h-4 w-4 text-brand" aria-hidden />{t.admin.bisPanel}
            </h3>
            <p className="text-[11px] text-ink-3">{t.admin.bisHint}</p>
          </div>
          {bisGroups.length > 0 && <Badge tone="warning">{tf(t.admin.bisRequests, { n: bisGroups.reduce((s, g) => s + g.requests.length, 0) })}</Badge>}
        </div>
        {bisGroups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">{t.admin.bisEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {bisGroups.map((g) => (
              <li key={g.variantId} className={cn('rounded-lg border bg-white', g.stock > 0 ? 'border-success/40' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', g.stock > 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                    <BellRing className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{g.productTitle} <span className="font-normal text-ink-3" lang="fa" dir="rtl">{g.productTitleFa}</span></p>
                    <p className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{g.sku}</p>
                  </div>
                  <Badge tone={g.stock > 0 ? 'success' : 'warning'}>{g.stock > 0 ? `${t.admin.stock}: ${g.stock}` : t.common.outOfStock}</Badge>
                  <span className="text-xs text-ink-3">{tf(t.admin.bisRequests, { n: g.requests.length })}</span>
                  {g.stock > 0 && g.requests.some((r) => !r.notifiedAt) && (
                    <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => notifyAll(g)}>
                      <BellRing className="h-3.5 w-3.5" aria-hidden />{t.admin.bisNotifyAll}
                    </Button>
                  )}
                  {g.stock > 0 && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => navigate(`/books/${g.productSlug}`)}>
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />{t.admin.view}
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-line">
                  {g.requests.map((r) => (
                    <li key={r.id} className={cn('flex flex-wrap items-center gap-2.5 px-4 py-2', r.notifiedAt && 'opacity-60')}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{r.email[0]?.toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-2 bdi" dir="ltr">{r.email}</span>
                      <span className="text-[11px] text-ink-3 bdi" dir="ltr">{r.locale.toUpperCase()}</span>
                      {r.notifiedAt ? (
                        <Badge tone="success"><Check className="me-1 h-3 w-3" aria-hidden />{formatDate(r.notifiedAt, locale)}</Badge>
                      ) : (
                        <Badge tone="warning">{t.admin.bisWaiting}</Badge>
                      )}
                      {!r.notifiedAt && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markNotified(r.id)}>
                          <Mail className="me-1 h-3 w-3" aria-hidden />{t.admin.bisNotify}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-ink-3 hover:bg-error/10 hover:text-error" onClick={() => removeBis(r.id)} aria-label={`${t.admin.bisDelete} ${r.email}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Newsletter subscribers */}
      <section aria-label={t.admin.subscribers}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t.admin.subscribers}</h3>
          <div className="flex gap-2">
            <Badge tone="success">{t.admin.activeSubs}: {subs.subscribedCount}</Badge>
            <Badge>{t.admin.totalSubs}: {subs.total}</Badge>
          </div>
        </div>
        {subs.items.length === 0 ? (
          <EmptyState title={t.admin.subscribers} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
            {subs.items.slice(0, 12).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{s.email[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink bdi" dir="ltr">{s.email}</span>
                <Badge tone={s.status === 'SUBSCRIBED' ? 'success' : 'default'}>{s.status}</Badge>
                <span className="text-xs text-ink-3 bdi" dir="ltr">{s.locale.toUpperCase()} · {s.source}</span>
                <span className="hidden text-xs text-ink-3 sm:inline">{formatDate(s.createdAt, locale)}</span>
                {s.status === 'SUBSCRIBED' && (
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-ink-3 hover:text-error" onClick={() => unsubscribe(s.email)}>
                    <UserMinus className="h-3.5 w-3.5" aria-hidden />{t.admin.unsubscribe}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Email outbox */}
      <section aria-label={t.admin.outbox}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Inbox className="h-4 w-4 text-brand" aria-hidden />{t.admin.outbox}
          </h3>
          <p className="text-[11px] text-ink-3">{t.admin.demoMailNote}</p>
        </div>
        {/* Dispatch bar: provider status + queued count + OWNER-only drain action */}
        {mailMeta && (
          <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-soft/50 px-3.5 py-2.5">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', mailMeta.providerConfigured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              <Send className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{t.admin.outboxDispatchTitle}</p>
              <p className="text-[11px] leading-snug text-ink-3">
                {mailMeta.providerConfigured ? t.admin.outboxProviderOn : t.admin.outboxProviderOff}
                {mailMeta.queued > 0 && <> · <span className="font-medium text-brand">{tf(t.admin.outboxQueued, { n: mailMeta.queued })}</span></>}
              </p>
            </div>
            {isOwner && (
              <Button size="sm" className="h-8 shrink-0 gap-1.5 text-xs" disabled={dispatching || mailMeta.queued === 0} onClick={dispatchMails}
                title={mailMeta.providerConfigured ? undefined : t.admin.outboxNoProvider}>
                {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                {t.admin.outboxDispatch}
              </Button>
            )}
          </div>
        )}
        {/* R9: kind-group filter chips — ALWAYS visible (even on an empty
            filter result) so the admin can never get stuck on an empty view. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t.admin.outbox}>
          {([
            ['all', t.admin.outboxFilterAll],
            ['orders', t.admin.outboxFilterOrders],
            ['security', t.admin.outboxFilterSecurity],
            ['newsletter', t.admin.outboxFilterNewsletter],
            ['reports', t.admin.outboxFilterReports],
          ] as const).map(([key, label]) => (
            <button
              key={key} type="button" aria-pressed={outboxFilter === key}
              onClick={() => { if (key === outboxFilter) return; setOutboxFilter(key); setOutboxPage(1); setOpenEmail(null); loadEmails(1, key) }}
              className={cn('inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors',
                outboxFilter === key ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-white text-ink-3 hover:border-brand/40 hover:text-brand')}
            >
              {label}
            </button>
          ))}
        </div>
        {emails.length === 0 ? (
          <EmptyState title={t.admin.outbox} body={t.admin.noEmails} />
        ) : (
          <>
          <ul className="space-y-2">
            {emails.map((em) => {
              const open = openEmail === em.id
              const isBis = em.kind === 'BACK_IN_STOCK'
              const isReset = em.kind === 'PASSWORD_RESET'
              const isVerify = em.kind === 'EMAIL_VERIFY'
              const isNlConfirm = em.kind === 'NEWSLETTER_CONFIRM'
              const isShipNotice = em.kind === 'SHIPPING_NOTICE'
              const isOrderConfirm = em.kind === 'ORDER_CONFIRMATION'
              const isEmailChange = em.kind === 'EMAIL_CHANGE'
              const isEmailChangeNotice = em.kind === 'EMAIL_CHANGE_NOTICE'
              const isDigest = em.kind === 'SALES_DIGEST'
              // R11: window-aware badge — same markers the report module uses.
              const isMonthlyDigest = isDigest && (/monthly digest/i.test(em.subject) || em.subject.includes('ماهانه'))
              return (
                <li key={em.id} className={cn('overflow-hidden rounded-lg border', isBis && openEmail !== em.id ? 'border-warning/30' : isReset && openEmail !== em.id ? 'border-brand/25' : isVerify && openEmail !== em.id ? 'border-success/30' : isShipNotice && openEmail !== em.id ? 'border-brand/20' : isOrderConfirm && openEmail !== em.id ? 'border-success/20' : (isEmailChange || isEmailChangeNotice) && openEmail !== em.id ? 'border-warning/25' : isDigest && openEmail !== em.id ? 'border-brand/25' : 'border-line')}>
                  <button
                    type="button" onClick={() => setOpenEmail(open ? null : em.id)} aria-expanded={open}
                    className={cn('flex w-full flex-wrap items-center gap-2 px-4 py-3 text-start transition hover:bg-soft/60', open && 'bg-brand-soft/40')}
                  >
                    {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
                    {isBis ? (
                      <Badge tone="warning"><BellRing className="me-1 h-3 w-3" aria-hidden />{t.admin.outboxBis}</Badge>
                    ) : isReset ? (
                      <Badge tone="default"><KeyRound className="me-1 h-3 w-3" aria-hidden />{t.admin.outboxReset}</Badge>
                    ) : isVerify ? (
                      <Badge tone="success"><MailCheck className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'تأیید ایمیل' : 'Verify email'}</Badge>
                    ) : isNlConfirm ? (
                      <Badge tone="brand"><MailPlus className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'تأیید خبرنامه' : 'Newsletter opt-in'}</Badge>
                    ) : isShipNotice ? (
                      <Badge tone="brand"><Truck className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'ارسال سفارش' : 'Shipping notice'}</Badge>
                    ) : isOrderConfirm ? (
                      <Badge tone="success"><ReceiptText className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'تأیید سفارش' : 'Order confirmation'}</Badge>
                    ) : isEmailChange ? (
                      <Badge tone="warning"><AtSign className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'تغییر ایمیل' : 'Email change'}</Badge>
                    ) : isEmailChangeNotice ? (
                      <Badge tone="warning"><Bell className="me-1 h-3 w-3" aria-hidden />{locale === 'fa' ? 'اطلاع‌رسانی تغییر ایمیل' : 'Email-changed notice'}</Badge>
                    ) : isDigest ? (
                      <Badge tone="brand"><BarChart3 className="me-1 h-3 w-3" aria-hidden />{isMonthlyDigest ? t.admin.outboxDigestMonthly : t.admin.outboxDigest}</Badge>
                    ) : (
                      <Badge tone="success">✓</Badge>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{em.subject}</span>
                    <span className="text-xs text-ink-3 bdi" dir="ltr">{em.to}</span>
                    <span className="hidden text-xs text-ink-3 sm:inline">{formatDateTime(em.createdAt, locale)}</span>
                  </button>
                  {open && (
                    <div className="border-t border-line bg-white px-5 py-5" dir={em.locale === 'fa' ? 'rtl' : 'ltr'}>
                      {/* Email chrome */}
                      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-soft px-4 py-2.5 text-xs text-ink-3">
                        <span><span className="font-medium text-ink-2">{t.admin.toCol}:</span> <span className="bdi" dir="ltr">{em.to}</span></span>
                        <span><span className="font-medium text-ink-2">{t.admin.subjectCol}:</span> {em.subject}</span>
                      </div>
                      <p className="text-sm font-medium text-ink">{em.greeting}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{em.intro}</p>
                      {isBis && em.product ? (
                        <a
                          href={localePath(em.locale === 'fa' ? 'fa' : 'en', `/books/${em.product.slug}`)}
                          onClick={(e) => e.preventDefault()}
                          className="mt-4 flex items-center gap-3 rounded-md border border-brand/20 bg-brand-soft/40 px-4 py-3 transition hover:bg-brand-soft/70"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white" aria-hidden><BellRing className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{em.product.title} <span lang="fa" dir="rtl" className="font-normal text-ink-3">{em.product.titleFa}</span></span>
                            <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{em.product.sku}</span>
                          </span>
                          <span className="text-xs font-medium text-brand">{t.admin.view} →</span>
                        </a>
                      ) : isReset ? (
                        <p className="mt-4 rounded-md bg-soft px-4 py-3 text-xs leading-relaxed text-ink-3">
                          {em.locale === 'fa' ? 'متن کامل این نامه فقط در نسخهٔ گیرنده قرار دارد — پیوند بازنشانی یک‌بارمصرف است و ۳۰ دقیقه اعتبار دارد.' : 'The full body exists only in the recipient’s copy — the reset link is single-use and expires after 30 minutes.'}
                        </p>
                      ) : em.digestText ? (
                        <div className="mt-4 rounded-md border border-brand/15 bg-soft/60 px-4 py-3">
                          <pre dir={em.locale === 'fa' ? 'rtl' : 'ltr'} lang={em.locale} className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-2">{em.digestText}</pre>
                        </div>
                      ) : (
                        <>
                          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.emailItems}</p>
                          <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
                            {em.items.map((it, i) => (
                              <li key={i} className="flex items-center justify-between px-3.5 py-2 text-sm">
                                <span className="min-w-0 truncate text-ink-2">{it.title} × {it.qty}</span>
                                <span className="shrink-0 ps-3 font-medium bdi">{formatMoney(it.lineTotalMinor, locale)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 space-y-1 text-sm">
                            <p className="flex justify-between text-ink-3"><span>{t.common.subtotal}</span><span className="bdi">{formatMoney(em.subtotalMinor, locale)}</span></p>
                            {em.discountCode && em.discountMinor ? (
                              <p className="flex justify-between font-medium text-success"><span className="flex items-center gap-1"><TicketPercent className="h-3.5 w-3.5" aria-hidden /><span className="font-mono text-xs bdi" dir="ltr">{em.discountCode}</span></span><span className="bdi">−{formatMoney(em.discountMinor, locale)}</span></p>
                            ) : null}
                            {em.giftWrap && em.giftWrapMinor ? (
                              <p className="flex justify-between text-ink-2"><span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-orange-accent" aria-hidden />{t.admin.giftWrapCol}</span><span className="bdi">{formatMoney(em.giftWrapMinor, locale)}</span></p>
                            ) : null}
                            <p className="flex justify-between text-ink-3"><span>{t.common.shipping}</span><span className="bdi">{formatMoney(em.shippingMinor, locale)}</span></p>
                            <p className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink"><span>{t.admin.emailTotal}</span><span className="bdi">{formatMoney(em.totalMinor, locale)}</span></p>
                          </div>
                          {em.giftWrap && em.giftMessage && (
                            <p className="mt-3 rounded-md border border-dashed border-orange-accent/40 bg-orange-accent/5 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
                              <span className="mb-0.5 flex items-center gap-1 font-semibold text-orange-accent"><Gift className="h-3 w-3" aria-hidden />{t.admin.giftMessageCol}</span>
                              “{em.giftMessage}”
                            </p>
                          )}
                          {em.kind === 'SHIPPING_NOTICE' && (
                            <p className="mt-3 rounded-md bg-brand-soft px-3.5 py-2.5 text-xs text-brand">
                              {t.admin.emailCarrier}: <span className="font-medium">{em.carrier ?? '—'}</span>
                              {em.trackingUrl && <> · <a href={em.trackingUrl} className="font-medium underline" onClick={(e) => e.preventDefault()}>{t.admin.trackOrder}</a></>}
                            </p>
                          )}
                          {(isOrderConfirm || isShipNotice) && (
                            <p className="mt-3 rounded-md bg-soft px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-3">
                              {em.locale === 'fa'
                                ? 'متن کامل این نامه در صف ارسال (Outbox) ذخیره شده است و به‌محض اتصال سرویس ایمیل ارسال می‌شود.'
                                : 'This mail lives in the transactional outbox and is dispatched as soon as a mail provider is connected.'}
                            </p>
                          )}
                        </>
                      )}
                      <p className="mt-5 border-t border-line pt-3 text-[11px] text-ink-3">{em.footerNote}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {/* R9: pager — total within the source window + prev/next. */}
          {outboxMeta && outboxMeta.pages > 1 && (
            <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-soft/50 px-3.5 py-2.5" aria-label={t.admin.outbox}>
              <p className="text-xs text-ink-3">
                {tf(t.admin.outboxTotal, { n: locale === 'fa' ? faDigits(String(outboxMeta.total)) : outboxMeta.total })}
                <span className="mx-1.5 text-line">·</span>
                {tf(t.admin.outboxPageOf, { p: locale === 'fa' ? faDigits(String(outboxMeta.page)) : outboxMeta.page, n: locale === 'fa' ? faDigits(String(outboxMeta.pages)) : outboxMeta.pages })}
              </p>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={outboxMeta.page <= 1}
                  onClick={() => { const p = outboxPage - 1; setOutboxPage(p); setOpenEmail(null); loadEmails(p, outboxFilter) }}>
                  <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />{locale === 'fa' ? 'قبلی' : 'Prev'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={outboxMeta.page >= outboxMeta.pages}
                  onClick={() => { const p = outboxPage + 1; setOutboxPage(p); setOpenEmail(null); loadEmails(p, outboxFilter) }}>
                  {locale === 'fa' ? 'بعدی' : 'Next'}<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
                </Button>
              </div>
            </nav>
          )}
          </>
        )}
      </section>
    </div>
  )
}
