'use client'

import { useCallback, useEffect, useState } from 'react'
import { Package, Truck, RotateCcw, LifeBuoy, Download, Trash2, LogOut, Plus, Loader2, UserRound, Gift, Ban, Monitor, MonitorSmartphone, Smartphone, Tablet, X, BadgeCheck, MailWarning, AtSign, MailCheck, ShieldCheck, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDate, formatDateTime, faDigits, compactOrderNumber } from '@/lib/format'
import { Spinner, EmptyState, Breadcrumbs, Badge } from '@/components/storefront/bits'
import { OrderStepper } from '@/components/storefront/OrderStepper'
import { formatLabel } from '@/lib/bookLabels'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { AddressDTO, Locale, OrderFullDTO, TicketDTO, UserDTO } from '@/lib/types'

interface OrderSummary {
  orderNumber: string; status: string; paymentStatus: string; totalMinor: number; currency: string; createdAt: string
  itemCount: number; firstCoverUrl?: string | null
  covers?: string[]
  titles?: { titleEn: string; titleFa: string; quantity: number }[]
}

const STATUS_LABELS: Record<string, { en: string; fa: string; tone: 'success' | 'brand' | 'warning' | 'error' | 'default' }> = {
  PENDING_PAYMENT: { en: 'Pending payment', fa: 'در انتظار پرداخت', tone: 'warning' },
  PAID: { en: 'Paid', fa: 'پرداخت‌شده', tone: 'success' },
  PROCESSING: { en: 'Processing', fa: 'در حال آماده‌سازی', tone: 'brand' },
  SHIPPED: { en: 'Shipped', fa: 'ارسال شده', tone: 'brand' },
  DELIVERED: { en: 'Delivered', fa: 'تحویل شده', tone: 'success' },
  CANCELLED: { en: 'Cancelled', fa: 'لغو شده', tone: 'error' },
  REFUNDED: { en: 'Refunded', fa: 'بازپرداخت شده', tone: 'default' },
  PARTIALLY_REFUNDED: { en: 'Partially refunded', fa: 'بازپرداخت جزئی', tone: 'default' },
}

function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const s = STATUS_LABELS[status]
  if (!s) return <Badge>{status}</Badge>
  return <Badge tone={s.tone}>{locale === 'fa' ? s.fa : s.en}</Badge>
}

/** Fan-of-playing-cards cover stack (user: covers fanned like held cards —
 *  1 book = full cover; 2+ = the next ones peek out from behind, rotated). */
function CoverFan({ covers, alt }: { covers: (string | null | undefined)[]; alt: string }) {
  const list = (covers ?? []).filter(Boolean) as string[]
  const placeholder = (
    <span className="absolute inset-0 flex items-center justify-center rounded-sm border border-line bg-soft text-ink-3" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5V5a2 2 0 0 1 2-2h9l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" /><path d="M15 3v5h5" /></svg>
    </span>
  )
  if (list.length <= 1) {
    return (
      <span className="relative block h-[4.25rem] w-12 shrink-0">
        {list[0] ? <img src={list[0]} alt="" width={88} height={128} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full rounded-sm border border-line object-cover shadow-sm" /> : placeholder}
      </span>
    )
  }
  return (
    <span className="relative block h-[4.5rem] w-14 shrink-0" aria-hidden>
      {/* deepest card peeks the most */}
      {list[2] && <img src={list[2]} alt="" width={88} height={128} loading="lazy" decoding="async" className="absolute start-0 top-0 h-16 w-11 rotate-[11deg] translate-x-3 rounded-sm border border-line bg-white object-cover" />}
      {list[1] && <img src={list[1]} alt="" width={88} height={128} loading="lazy" decoding="async" className="absolute start-0 top-0 h-16 w-11 rotate-[6deg] translate-x-1.5 rounded-sm border border-line bg-white object-cover" />}
      <img src={list[0]} alt={alt} width={88} height={128} loading="lazy" decoding="async" className="absolute start-0 top-0 h-16 w-11 -rotate-[4deg] rounded-sm border border-line bg-white object-cover shadow-sm transition-transform duration-300 group-hover:-rotate-[7deg]" />
    </span>
  )
}

export function AccountView({ section, sub }: { section: string; sub?: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const userLoaded = useApp((s) => s.userLoaded)
  const setUser = useApp((s) => s.setUser)

  // Coming back from the Google OAuth round-trip (?welcome=google on the
  // redirect target): celebrate once, then strip the param from the URL.
  useEffect(() => {
    if (route.query.welcome !== 'google') return
    toast({ title: getDict(route.locale).auth.googleWelcome, duration: 4000 })
    navigate('/account', { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fires once per ?welcome=google arrival; navigate(replace) strips the param before locale/toast can change
  }, [route.query.welcome])

  const NAV = [
    { key: '', label: t.account.dashboard, icon: UserRound },
    { key: 'orders', label: t.account.orders, icon: Package },
    { key: 'addresses', label: t.account.addresses, icon: Truck },
    { key: 'returns', label: t.account.returns, icon: RotateCcw },
    { key: 'tickets', label: t.account.tickets, icon: LifeBuoy },
    { key: 'privacy', label: t.account.privacy, icon: Shield },
  ]

  if (!userLoaded) return <Spinner label={t.common.loading} />
  if (!user) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState title={t.account.signInToView} action={<Button onClick={() => navigate('/login')}>{t.auth.login}</Button>} />
      </main>
    )
  }

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.account.title }]} />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside>
          <div className="rounded-lg border border-line p-4">
            <p className="text-sm font-semibold text-ink">{tf(t.account.welcome, { name: user.name ?? user.email })}</p>
            <p className="mt-0.5 truncate text-xs text-ink-3 bdi" dir="ltr">{user.email}</p>
            {user.emailVerified !== false && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                <BadgeCheck className="h-3 w-3" aria-hidden />{t.account.emailVerified}
              </p>
            )}
            {user.emailVerified === false && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                <MailWarning className="h-3 w-3" aria-hidden />{t.account.emailUnverified}
              </p>
            )}
            {user.googleLinked && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-ink-2">
                <svg viewBox="0 0 48 48" width="10" height="10" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Google
              </p>
            )}
          </div>
          <nav aria-label={t.account.title} className="mt-3 space-y-1">
            {NAV.map((n) => (
              <button
                key={n.key} type="button"
                onClick={() => navigate(`/account${n.key ? `/${n.key}` : ''}`)}
                aria-current={section === n.key ? 'page' : undefined}
                className={cn('flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium transition',
                  section === n.key ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-soft hover:text-ink')}
              >
                <n.icon className="h-4 w-4" aria-hidden />{n.label}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => { await apiPost('/api/auth/logout'); setUser(null); useApp.setState({ favsSynced: false, favorites: useApp.getState().favorites }); navigate(`/${locale}`) }}
              className="flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium text-ink-3 hover:bg-soft hover:text-error"
            >
              <LogOut className="h-4 w-4 mirror-rtl" aria-hidden />{t.auth.logout}
            </button>
          </nav>
        </aside>
        <div className="min-w-0">
          {section === '' && (
            <div className="space-y-6">
              <EmailVerifyBanner locale={locale} user={user} />
              <Dashboard locale={locale} user={user} />
            </div>
          )}
          {section === 'orders' && (sub ? <OrderDetail locale={locale} orderNumber={sub} /> : <Orders locale={locale} />)}
          {section === 'addresses' && <Addresses locale={locale} />}
          {section === 'returns' && <Returns locale={locale} />}
          {section === 'tickets' && (sub ? <TicketDetail locale={locale} id={sub} /> : <Tickets locale={locale} />)}
          {section === 'privacy' && <Privacy locale={locale} user={user} onUser={(u) => setUser(u)} />}
        </div>
      </div>
    </main>
  )
}

function Shield(props: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
}

/** S13 residual — soft nudge for accounts whose email is not verified yet:
 *  amber banner + one-click (re)send. Hidden entirely once verified. */
function EmailVerifyBanner({ locale, user }: { locale: Locale; user: UserDTO }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (user.emailVerified !== false) return null // undefined = pre-update payload → treat as verified

  const send = async () => {
    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; verifyUrl?: string }>('/api/account/email/verification-request', {})
      setSent(true)
      // Sandbox convenience only (DEV_EXPOSE_RESET_LINK=1) — mirrors the reset flow.
      if (res.verifyUrl) {
        toast({ title: t.account.verifySent, description: undefined, duration: 4000 })
        navigate(res.verifyUrl)
        return
      }
      toast({ title: t.account.verifySent, duration: 4000 })
    } catch (err) {
      const code = (err as { code?: string }).code
      toast({
        title: code === 'ALREADY_VERIFIED' ? t.account.verifyAlreadyDone : code === 'RATE_LIMITED' ? t.account.verifySendFailed : t.account.verifySendFailed,
        variant: 'destructive',
      })
    } finally { setBusy(false) }
  }

  return (
    <section
      aria-label={t.account.verifyBannerTitle}
      className="relative overflow-hidden rounded-xl border border-warning/30 bg-gradient-to-br from-warning/10 via-white to-white p-5"
    >
      <div className="pointer-events-none absolute -end-8 -top-10 h-28 w-28 rounded-full bg-warning/10 blur-2xl" aria-hidden />
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-warning/40 bg-white text-warning" aria-hidden>
          <MailWarning className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t.account.verifyBannerTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{t.account.verifyBannerBody}</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy || sent} onClick={send} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {sent ? t.account.verifySent : user.emailVerified === false ? t.account.verifyResend : t.account.verifySend}
        </Button>
      </div>
    </section>
  )
}

function Dashboard({ locale }: { locale: Locale; user: UserDTO }) {
  const t = getDict(locale)
  const [data, setData] = useState<{ recentOrders: OrderSummary[]; activeShipment: { orderNumber: string; trackingNumber?: string; trackingUrl?: string; carrier: string; status: string } | null; openReturns: number; openTickets: number } | null>(null)

  useEffect(() => {
    apiGet<typeof data>('/api/account/summary').then(setData).catch(() => setData(null))
  }, [locale])

  if (!data) return <Spinner label={t.common.loading} />
  return (
    <div className="space-y-8">
      <section aria-label={t.account.recentOrders}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t.account.recentOrders}</h2>
          <button onClick={() => navigate('/account/orders')} className="text-sm font-medium text-brand hover:underline">{t.account.viewAllOrders}</button>
        </div>
        {data.recentOrders.length === 0 ? (
          // Current-orders-only tile: when nothing is in flight, say exactly
          // that (user request) — the full history lives under Orders.
          <EmptyState title={t.account.noCurrentOrders} body={t.account.noOrders} action={<Button onClick={() => navigate('/books')}>{t.nav.books}</Button>} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.recentOrders.map((o, i) => (
              <li key={o.orderNumber}>
                <button
                  type="button"
                  onClick={() => navigate(`/account/orders/${o.orderNumber}`)}
                  aria-label={`${o.orderNumber} — ${formatMoney(o.totalMinor, locale)}`}
                  className={cn(
                    'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-white text-start shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-brand',
                    i % 2 === 0 ? 'hover:-rotate-[0.6deg]' : 'hover:rotate-[0.6deg]'
                  )}
                >
                  {/* card face — cover art */}
                  <span className="relative block aspect-[4/3] w-full overflow-hidden bg-soft">
                    {o.firstCoverUrl ? (
                      <img src={o.firstCoverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-3" aria-hidden>
                        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5V5a2 2 0 0 1 2-2h9l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" /><path d="M15 3v5h5" /></svg>
                      </span>
                    )}
                    {/* corner index — the playing-card "rank" */}
                    <span className="absolute start-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/92 px-1.5 text-[10px] font-bold text-ink shadow-sm bdi" dir="ltr">
                      {locale === 'fa' ? faDigits(String(i + 1)) : i + 1}
                    </span>
                    <span className="absolute bottom-2 end-2">
                      <StatusBadge status={o.status} locale={locale} />
                    </span>
                  </span>
                  {/* card footer */}
                  <span className="flex flex-1 flex-col gap-0.5 p-3">
                    <span className="truncate text-[13px] font-bold text-ink bdi" dir="ltr">{compactOrderNumber(o.orderNumber)}</span>
                    <span className="text-[11px] text-ink-3">{formatDate(o.createdAt, locale)} · {locale === 'fa' ? faDigits(String(o.itemCount)) : o.itemCount} {t.account.items.toLowerCase()}</span>
                    <span className="mt-auto pt-1.5 text-sm font-bold text-brand bdi">{formatMoney(o.totalMinor, locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Status">
        <div className="rounded-lg border border-line p-4">
          <Truck className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-3">{t.account.activeShipment}</p>
          {data.activeShipment ? (
            <>
              <p className="mt-1 text-sm font-semibold text-ink bdi" dir="ltr">{data.activeShipment.trackingNumber}</p>
              {data.activeShipment.trackingUrl && (
                <a href={data.activeShipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">{t.account.track}</a>
              )}
            </>
          ) : <p className="mt-1 text-sm text-ink-3">—</p>}
        </div>
        <div className="rounded-lg border border-line p-4">
          <RotateCcw className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-3">{t.account.openReturns}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{data.openReturns}</p>
        </div>
        <div className="rounded-lg border border-line p-4">
          <LifeBuoy className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-3">{t.account.openTickets}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{data.openTickets}</p>
        </div>
      </section>
    </div>
  )
}

function Orders({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    apiGet<{ items: OrderSummary[]; total: number }>(`/api/account/orders?page=${page}`).then((r) => { setOrders(r.items); setTotal(r.total) }).catch(() => setOrders([]))
  }, [page])

  if (!orders) return <Spinner label={t.common.loading} />
  if (orders.length === 0) return <EmptyState title={t.account.noOrders} action={<Button onClick={() => navigate('/books')}>{t.nav.books}</Button>} />
  const pages = Math.max(1, Math.ceil(total / 10))
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">{t.account.orders}</h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {orders.map((o) => {
          const firstTitle = o.titles?.[0] ? (isFa ? o.titles[0].titleFa || o.titles[0].titleEn : o.titles[0].titleEn) : null
          const moreCount = Math.max(0, o.itemCount - 1)
          return (
            <li key={o.orderNumber}>
              <button type="button" onClick={() => navigate(`/account/orders/${o.orderNumber}`)} className="group flex w-full items-center gap-4 px-4 py-4 text-start transition-colors hover:bg-soft">
                {/* fanned cover stack — 1 book full, extras peek from behind */}
                <CoverFan covers={o.covers?.length ? o.covers : [o.firstCoverUrl]} alt={firstTitle ?? o.orderNumber} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink bdi" dir="ltr">{compactOrderNumber(o.orderNumber)}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {firstTitle}
                    {moreCount > 0 && <span className="text-ink-3"> · {tf(t.account.andMore, { n: isFa ? faDigits(String(moreCount)) : String(moreCount) })}</span>}
                  </span>
                  <span className="block text-xs text-ink-3">{formatDate(o.createdAt, locale)}</span>
                </span>
                <StatusBadge status={o.status} locale={locale} />
                <span className="w-20 text-end text-sm font-semibold text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-3/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand rtl:rotate-180" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t.common.previous}</Button>
          <span className="flex items-center text-sm text-ink-3">{isFa ? faDigits(`${page} / ${pages}`) : `${page} / ${pages}`}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t.common.next}</Button>
        </div>
      )}
    </div>
  )
}

function OrderDetail({ locale, orderNumber }: { locale: Locale; orderNumber: string }) {
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  // null = still loading; 'missing' = the API said NOT_FOUND (foreign order,
  // typo'd number, or the caller's own cancelled-then-purged row) — an eternal
  // spinner was the old behavior and read as a hang.
  const [order, setOrder] = useState<OrderFullDTO | null>(null)
  const [missing, setMissing] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returnDetails, setReturnDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ order: OrderFullDTO }>(`/api/account/orders/${orderNumber}`)
      .then((r) => { setOrder(r.order); setMissing(false) })
      .catch(() => { setOrder(null); setMissing(true) })
  }, [orderNumber])

  useEffect(() => { load() }, [load])

  if (!order) {
    return missing ? (
      <EmptyState
        title={isFa ? 'سفارش پیدا نشد' : 'Order not found'}
        action={<Button variant="outline" onClick={() => navigate('/account/orders')}>{t.account.orders}</Button>}
      />
    ) : (
      <Spinner label={t.common.loading} />
    )
  }
  const addr = order.shippingAddress

  const requestReturn = async () => {
    setBusy(true)
    try {
      await apiPost('/api/account/returns', { orderNumber, reason: returnReason, details: returnDetails || undefined, items: [] })
      toast({ title: t.account.returnRequested })
      setReturnOpen(false)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  // New: customer self-service cancellation for not-yet-shipped orders.
  const cancelOrder = async () => {
    if (!window.confirm(t.account.cancelConfirm)) return
    setBusy(true)
    try {
      await apiPost(`/api/account/orders/${encodeURIComponent(orderNumber)}/cancel`, {})
      toast({ title: t.account.cancelDone })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div>
      <button type="button" onClick={() => navigate('/account/orders')} className="mb-4 text-sm font-medium text-brand hover:underline">← {t.account.orders}</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink bdi" dir="ltr">{compactOrderNumber(order.orderNumber)}</h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} locale={locale} />
          {(order.status === 'PAID' || order.status === 'PROCESSING') && (
            <Button variant="outline" size="sm" className="h-9 border-error/40 text-error hover:bg-error/10 hover:text-error" onClick={cancelOrder} disabled={busy}>
              <Ban className="h-4 w-4" aria-hidden />{t.account.cancelOrder}
            </Button>
          )}
          {(order.status === 'PAID' || order.status === 'SHIPPED' || order.status === 'DELIVERED' || order.status === 'PROCESSING') && (
            <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="h-9">{t.account.requestReturn}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t.account.requestReturn}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1.5">{t.account.reason}</Label>
                    <Select value={returnReason} onValueChange={setReturnReason}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {(isFa
                          ? [{ v: 'DAMAGED', l: 'کالا آسیب‌دیده بود' }, { v: 'WRONG_ITEM', l: 'کالای اشتباه ارسال شده بود' }, { v: 'NOT_AS_EXPECTED', l: 'با انتظارم متفاوت بود' }, { v: 'WITHDRAWAL', l: 'انصراف از خرید' }]
                          : [{ v: 'DAMAGED', l: 'Item arrived damaged' }, { v: 'WRONG_ITEM', l: 'Wrong item received' }, { v: 'NOT_AS_EXPECTED', l: 'Not as expected' }, { v: 'WITHDRAWAL', l: 'Withdrawal (changed my mind)' }]
                        ).map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5">{t.account.details}</Label>
                    <Textarea rows={3} value={returnDetails} onChange={(e) => setReturnDetails(e.target.value)} />
                  </div>
                  <Button className="w-full" disabled={!returnReason || busy} onClick={requestReturn}>{busy ? t.common.submitting : t.account.requestReturn}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {order.shipment && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand-soft px-4 py-3">
          <div className="text-sm">
            <p className="font-semibold text-brand">{t.account.shipped} — {order.shipment.carrier}</p>
            <p className="text-xs text-ink-2 bdi" dir="ltr">{order.shipment.trackingNumber}</p>
          </div>
          {order.shipment.trackingUrl && (
            <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover">{t.account.track}</a>
          )}
        </div>
      )}

      <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
        {order.items.map((item, i) => {
          // Title + AUTHOR — a customer doesn't know what a SKU/book ID means
          // (user: «id کتاب به درد مشتری نمیخوره»). The SKU stays in the data,
          // it just doesn't lead the row anymore.
          const title = isFa ? item.titleFa || item.titleEn : item.titleEn
          const authors = (isFa ? item.authorsFa ?? item.authorsEn : item.authorsEn) ?? []
          return (
            <li key={i} className="flex items-center gap-4 px-4 py-3.5">
              { }
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" width={88} height={128} loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded-sm border border-line object-cover" />
              ) : (
                // Empty src would make the browser re-fetch the page — placeholder box instead.
                <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded-sm border border-line bg-soft text-ink-3" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5V5a2 2 0 0 1 2-2h9l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" /><path d="M15 3v5h5" /></svg>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{title}</p>
                {authors.length > 0 && <p className="text-xs text-ink-2">{authors.join(' · ')}</p>}
                <p className="text-xs text-ink-3">
                  × {isFa ? faDigits(String(item.quantity)) : item.quantity}
                  {item.format ? ` · ${formatLabel(item.format, locale)}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-ink bdi">{formatMoney(item.totalMinor, locale)}</p>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4 text-sm">
          <h3 className="mb-2 font-semibold text-ink">{t.checkout.step2}</h3>
          <p className="text-ink-2">{addr?.recipient}</p>
          <p className="text-ink-3 bdi">{addr?.line1}{addr?.line2 ? `, ${addr.line2}` : ''}</p>
          <p className="text-ink-3 bdi">{addr?.postalCode} {addr?.city}, {addr?.countryCode}</p>
          {order.shippingMethodName && <p className="mt-2 text-xs text-ink-3">{order.shippingMethodName}</p>}
        </div>
        <dl className="rounded-lg border border-line p-4 text-sm">
          <h3 className="mb-2 font-semibold text-ink">{t.checkout.orderSummary}</h3>
          <div className="flex justify-between py-0.5"><dt className="text-ink-3">{t.common.subtotal}</dt><dd className="bdi">{formatMoney(order.subtotalMinor, locale)}</dd></div>
          {(order.discountMinor ?? 0) > 0 && (
            <div className="flex justify-between py-0.5 text-success">
              <dt className="flex items-center gap-1">{t.promo.discount}{order.discountCode && <span className="font-mono text-[11px] bdi" dir="ltr">({order.discountCode})</span>}</dt>
              <dd className="bdi">−{formatMoney(order.discountMinor ?? 0, locale)}</dd>
            </div>
          )}
          {order.giftWrap && (
            <div className="flex justify-between py-0.5 text-orange-dark">
              <dt className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" aria-hidden />{t.checkout.giftWrapRow}</dt>
              <dd className="bdi">{formatMoney(order.giftWrapMinor ?? 0, locale)}</dd>
            </div>
          )}
          <div className="flex justify-between py-0.5"><dt className="text-ink-3">{t.common.shipping}</dt><dd className="bdi">{formatMoney(order.shippingMinor, locale)}</dd></div>
          <div className="flex justify-between py-0.5"><dt className="text-ink-3">{t.common.tax}</dt><dd className="bdi">{formatMoney(order.taxMinor, locale)}</dd></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-bold"><dt>{t.common.total}</dt><dd className="bdi">{formatMoney(order.totalMinor, locale)}</dd></div>
          {order.payment && <p className="mt-2 text-xs text-ink-3">{t.account.paymentMethod}: {order.payment.brand} •••• {order.payment.last4} · {STATUS_LABELS[order.paymentStatus]?.[isFa ? 'fa' : 'en'] ?? order.paymentStatus}</p>}
        </dl>
      </div>

      {order.giftWrap && (
        <div className="mt-4 rounded-lg border border-orange-accent/30 bg-gradient-to-r from-orange-accent/[0.07] to-transparent p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-dark">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15"><Gift className="h-3.5 w-3.5" aria-hidden /></span>
            {t.checkout.giftWrapRow}
          </p>
          {order.giftMessage ? (
            <div className="mt-2">
              <p className="text-xs text-ink-3">{t.checkout.giftMessage}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">“{order.giftMessage}”</p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink-2">{t.checkout.giftWrapDesc}</p>
          )}
        </div>
      )}

      {/* Lifecycle stepper — the SAME shared component /track uses, fed by the
          SAME derived timeline (real OrderEvent rows parsed server-side).
          Terminal states (CANCELLED/REFUNDED) render a muted banner instead. */}
      <div className="mt-6 rounded-lg border border-line p-4">
        <OrderStepper
          status={order.status}
          timeline={order.timeline}
          createdAt={order.createdAt}
          eta={order.shipment?.estimatedDeliveryAt ?? null}
          locale={locale}
        />
        {(order.events ?? []).filter((ev) => ev.type !== 'CREATED' && !ev.type.startsWith('STATUS_') && !['PAID', 'SHIPPED'].includes(ev.type) && !/Status changed/.test(ev.message)).length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{isFa ? 'یادداشت‌ها' : 'Updates'}</p>
            <ul className="space-y-1.5">
              {(order.events ?? [])
                .filter((ev) => ev.type !== 'CREATED' && !ev.type.startsWith('STATUS_') && !['PAID', 'SHIPPED'].includes(ev.type) && !/Status changed/.test(ev.message))
                .map((ev, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3/50" aria-hidden />
                    <span>
                      {ev.message}
                      <span className="ms-1.5 text-ink-3">· {formatDateTime(ev.createdAt, locale)}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Addresses({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [addresses, setAddresses] = useState<AddressDTO[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ label: '', recipient: '', line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: 'AT', phone: '' })

  const load = useCallback(() => {
    apiGet<{ addresses: AddressDTO[] }>('/api/account/addresses').then((r) => setAddresses(r.addresses)).catch(() => setAddresses([]))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setBusy(true)
    try {
      await apiPost('/api/account/addresses', {
        label: form.label || undefined, recipient: form.recipient, line1: form.line1, line2: form.line2 || undefined,
        city: form.city, region: form.region || undefined, postalCode: form.postalCode, countryCode: form.countryCode, phone: form.phone || undefined,
      })
      setOpen(false)
      setForm({ label: '', recipient: '', line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: 'AT', phone: '' })
      load()
      toast({ title: t.common.saved })
    } catch { toast({ title: t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }

  const setDefault = async (id: string, key: 'isDefaultShipping' | 'isDefaultBilling') => {
    await apiPatch(`/api/account/addresses/${id}`, { [key]: true })
    load()
  }
  const remove = async (id: string) => {
    await apiDelete(`/api/account/addresses/${id}`)
    toast({ description: t.account.addressRemoved })
    load()
  }

  if (!addresses) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{t.account.addresses}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="h-9 gap-1.5"><Plus className="h-4 w-4" aria-hidden />{t.account.addAddress}</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t.account.addAddress}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {([['label', t.account.title], ['recipient', t.checkout.recipient], ['line1', t.checkout.address1], ['line2', t.checkout.address2], ['city', t.checkout.city], ['region', t.checkout.region], ['postalCode', t.checkout.postalCode], ['phone', t.checkout.phone]] as const).map(([k, label]) => (
                <div key={k} className={k === 'recipient' || k === 'line1' ? 'sm:col-span-2' : ''}>
                  <Label htmlFor={`addr-${k}`} className="mb-1.5">{label}</Label>
                  <Input id={`addr-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <Label htmlFor="addr-country" className="mb-1.5">{t.checkout.country}</Label>
                <Input id="addr-country" dir="ltr" maxLength={2} value={form.countryCode} onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <Button className="mt-2 w-full" disabled={!form.recipient || !form.line1 || !form.city || !form.postalCode || busy} onClick={save}>
              {busy ? t.common.saving : t.common.save}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      {addresses.length === 0 ? (
        <EmptyState title={t.account.addresses} body={t.account.addAddress} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-4 text-sm">
              <div className="flex items-start justify-between">
                <p className="font-semibold text-ink">{a.label || a.recipient}</p>
                <button type="button" aria-label={t.common.delete} onClick={() => remove(a.id)} className="text-ink-3 hover:text-error"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
              <p className="mt-1 text-ink-2 bdi">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
              <p className="text-ink-3 bdi">{a.postalCode} {a.city}, {a.countryCode}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setDefault(a.id, 'isDefaultShipping')} className={cn('rounded-full border px-2.5 py-1 text-xs', a.isDefaultShipping ? 'border-success/40 bg-success/10 text-success' : 'border-line text-ink-3 hover:border-ink-3')}>
                  {a.isDefaultShipping ? `✓ ${t.account.defaultShipping}` : t.account.defaultShipping}
                </button>
                <button type="button" onClick={() => setDefault(a.id, 'isDefaultBilling')} className={cn('rounded-full border px-2.5 py-1 text-xs', a.isDefaultBilling ? 'border-success/40 bg-success/10 text-success' : 'border-line text-ink-3 hover:border-ink-3')}>
                  {a.isDefaultBilling ? `✓ ${t.account.defaultBilling}` : t.account.defaultBilling}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Returns({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const [returns, setReturns] = useState<{ id: string; orderNumber: string; status: string; reason: string; createdAt: string }[] | null>(null)
  useEffect(() => {
    apiGet<{ returns: typeof returns }>('/api/account/returns').then((r) => setReturns(r.returns)).catch(() => setReturns([]))
  }, [])
  if (!returns) return <Spinner label={t.common.loading} />
  if (returns.length === 0) return <EmptyState title={t.account.returns} body={t.account.requestReturn} />
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">{t.account.returns}</h2>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {returns.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-ink bdi" dir="ltr">{compactOrderNumber(r.orderNumber)}</p>
              <p className="text-xs text-ink-3">{r.reason} · {formatDate(r.createdAt, locale)}</p>
            </div>
            <Badge tone={r.status === 'REJECTED' ? 'default' : r.status === 'REFUNDED' ? 'success' : 'brand'}>{r.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Tickets({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketDTO[] | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ subject: '', category: 'GENERAL', relatedOrderNumber: '', message: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ tickets: TicketDTO[] }>('/api/account/tickets').then((r) => setTickets(r.tickets)).catch(() => setTickets([]))
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await apiPost('/api/account/tickets', { subject: form.subject, category: form.category, relatedOrderNumber: form.relatedOrderNumber || undefined, message: form.message })
      setOpen(false)
      setForm({ subject: '', category: 'GENERAL', relatedOrderNumber: '', message: '' })
      toast({ title: t.account.ticketCreated })
      load()
    } catch { toast({ title: t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }

  if (!tickets) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{t.account.tickets}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="h-9 gap-1.5"><Plus className="h-4 w-4" aria-hidden />{t.account.newTicket}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t.account.newTicket}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5">{t.account.ticketSubject}</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">{t.account.ticketCategory}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">{isFa ? 'عمومی' : 'General'}</SelectItem>
                    <SelectItem value="ORDER">{isFa ? 'سفارش' : 'Order'}</SelectItem>
                    <SelectItem value="SHIPPING">{isFa ? 'ارسال' : 'Shipping'}</SelectItem>
                    <SelectItem value="RETURNS">{isFa ? 'مرجوعی' : 'Returns'}</SelectItem>
                    <SelectItem value="PRESS">{isFa ? 'رسانه' : 'Press'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">{t.static.orderNumberOptional}</Label>
                <Input dir="ltr" value={form.relatedOrderNumber} onChange={(e) => setForm((f) => ({ ...f, relatedOrderNumber: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">{t.account.message}</Label>
                <Textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
              </div>
              <Button className="w-full" disabled={!form.subject || form.message.trim().length < 5 || busy} onClick={submit}>
                {busy ? t.common.submitting : t.static.sendMessage}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {tickets.length === 0 ? (
        <EmptyState title={t.account.tickets} body={t.account.newTicket} />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <button type="button" onClick={() => navigate(`/account/tickets/${tk.id}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-soft">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{tk.subject}</p>
                  <p className="text-xs text-ink-3 bdi" dir="ltr">{tk.ticketNumber} · {formatDate(tk.createdAt, locale)}</p>
                </div>
                <Badge tone={tk.status === 'CLOSED' ? 'default' : tk.status === 'AWAITING_CUSTOMER' ? 'warning' : 'brand'}>{tk.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TicketDetail({ locale, id }: { locale: Locale; id: string }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [ticket, setTicket] = useState<TicketDTO | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ ticket: TicketDTO }>(`/api/account/tickets/${id}`).then((r) => setTicket(r.ticket)).catch(() => setTicket(null))
  }, [id])
  useEffect(() => { load() }, [load])

  if (!ticket) return <Spinner label={t.common.loading} />
  const send = async () => {
    setBusy(true)
    try {
      await apiPost(`/api/account/tickets/${id}/messages`, { body })
      setBody('')
      load()
    } catch { toast({ title: t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }
  return (
    <div>
      <button type="button" onClick={() => navigate('/account/tickets')} className="mb-4 text-sm font-medium text-brand hover:underline">← {t.account.tickets}</button>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{ticket.subject}</h2>
        <Badge tone={ticket.status === 'CLOSED' ? 'default' : 'brand'}>{ticket.status}</Badge>
      </div>
      <p className="mt-0.5 text-xs text-ink-3 bdi" dir="ltr">{ticket.ticketNumber}</p>
      <ul className="mt-5 space-y-3">
        {ticket.messages.map((m) => (
          <li key={m.id} className={cn('max-w-[85%] rounded-lg border p-3.5 text-sm', m.senderType === 'SUPPORT' ? 'ms-auto border-brand/25 bg-brand-soft' : 'border-line bg-white')}>
            <p className="mb-1 text-xs font-semibold text-ink-3">{m.senderName} · {formatDateTime(m.createdAt, locale)}</p>
            <p className="whitespace-pre-wrap leading-relaxed text-ink-2">{m.body}</p>
          </li>
        ))}
      </ul>
      {ticket.status !== 'CLOSED' && (
        <div className="mt-5 flex gap-2">
          <Textarea rows={3} placeholder={t.account.message} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button disabled={!body.trim() || busy} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t.admin.reply}</Button>
        </div>
      )}
    </div>
  )
}

/** S11 — describe a session's device from its UA string (best effort, no deps). */
function describeUa(ua: string | null): { kind: 'phone' | 'tablet' | 'desktop'; browser: string } {
  const s = ua ?? ''
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\//.test(s) ? 'Opera'
    : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : 'Browser'
  const kind: 'phone' | 'tablet' | 'desktop' =
    /iPad|Tablet/i.test(s) ? 'tablet'
    : /Mobi|iPhone|Android.*Mobile/i.test(s) ? 'phone'
    : 'desktop'
  return { kind, browser }
}

function Privacy({ locale, user, onUser }: { locale: Locale; user: UserDTO; onUser: (u: UserDTO) => void }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [marketing, setMarketing] = useState(false)
  const [busy, setBusy] = useState(false)

  const exportData = async () => {
    setBusy(true)
    try {
      const data = await apiPost<Record<string, unknown>>('/api/account/data-export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'persepix-press-my-data.json'
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: t.common.sent })
    } finally { setBusy(false) }
  }
  const deleteAccount = async () => {
    if (!window.confirm(t.account.deleteWarning)) return
    // S11: password re-auth — a stolen session cookie must not be able to
    // erase the account. (Google-only accounts leave it empty; the server
    // skips the check when no local password exists.)
    const answer = window.prompt(t.account.deletePasswordPrompt)
    if (answer === null) return
    const password = answer.trim() || undefined
    setBusy(true)
    try {
      await apiPost('/api/account/deletion-request', { password })
      onUser(null as unknown as UserDTO)
      navigate(`/${locale}`)
    } catch (e) {
      const err = e as { code?: string }
      if (err.code === 'AUTH_REQUIRED') toast({ title: t.account.deletePasswordWrong, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const signOutAllDevices = async () => {
    setBusy(true)
    try {
      await apiDelete('/api/auth/sessions')
      toast({ title: t.account.signOutAllDone })
    } finally { setBusy(false) }
  }
  const saveConsent = async (v: boolean) => {
    setMarketing(v)
    await apiPatch('/api/account/profile', { marketingConsent: v })
    toast({ title: t.account.consentSaved })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">{t.account.privacy}</h2>
      <div className="rounded-lg border border-line p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox checked={marketing} onCheckedChange={(v) => saveConsent(v === true)} className="mt-0.5" />
          <span className="text-ink-2">{t.account.marketingConsent}</span>
        </label>
      </div>
      <EmailCard locale={locale} user={user} />
      <SecurityCard locale={locale} user={user} />
      <SessionsCard locale={locale} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" onClick={exportData} disabled={busy} className="h-11 gap-2">
          <Download className="h-4 w-4" aria-hidden />{t.account.exportData}
        </Button>
        <Button variant="outline" onClick={signOutAllDevices} disabled={busy} className="h-11 gap-2">
          <LogOut className="h-4 w-4" aria-hidden />{t.account.signOutAllDevices}
        </Button>
        <Button variant="outline" onClick={deleteAccount} disabled={busy} className="h-11 gap-2 border-error/40 text-error hover:bg-error/10 hover:text-error sm:col-span-2">
          <Trash2 className="h-4 w-4" aria-hidden />{t.account.deleteAccount}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-ink-3">{t.account.deleteWarning}</p>
      <p className="text-xs text-ink-3 bdi" dir="ltr">{user.email}</p>
    </div>
  )
}

/** S11 — change the account email: password re-auth here, then the mailed
 *  link to the NEW address performs the actual swap (proof of ownership).
 *  The swap signs every device out — communicated in the hint + confirm page. */
function EmailCard({ locale, user }: { locale: Locale; user: UserDTO }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/.+@.+\..+/.test(newEmail.trim())) {
      setError(locale === 'fa' ? 'نشانی ایمیل معتبر نیست.' : 'Please enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      const r = await apiPost<{ ok: boolean; pendingEmail?: string; confirmUrl?: string }>('/api/account/email/change', {
        newEmail: newEmail.trim(),
        password: password || undefined,
      })
      setSentTo(r.pendingEmail ?? newEmail.trim())
      setNewEmail('')
      setPassword('')
      toast({ title: locale === 'fa' ? 'پیوند تأیید ارسال شد' : 'Confirmation link sent' })
      // Sandbox convenience (DEV-only field mirrors the reset flow): follow
      // the link automatically so the whole flow is testable end-to-end.
      if (r.confirmUrl) {
        setTimeout(() => navigate(r.confirmUrl as string), 900)
      }
    } catch (err) {
      const e2 = err as { code?: string }
      if (e2.code === 'AUTH_REQUIRED') setError(t.account.wrongPassword)
      else if (e2.code === 'EMAIL_IN_USE') setError(t.account.emailInUse)
      else if (e2.code === 'SAME_EMAIL') setError(t.account.sameEmail)
      else if (e2.code === 'NO_LOCAL_PASSWORD') setError(t.account.noLocalPassword)
      else setError(t.account.changeEmailFailed)
    } finally { setBusy(false) }
  }

  return (
    <section aria-label={t.account.emailCardTitle} className="overflow-hidden rounded-lg border border-line">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-soft/60 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AtSign className="h-4 w-4 text-brand" aria-hidden />
          {t.account.emailCardTitle}
        </h3>
        {user.emailVerified !== false ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <BadgeCheck className="h-3 w-3" aria-hidden />{t.account.emailVerified}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            <MailWarning className="h-3 w-3" aria-hidden />{t.account.emailUnverified}
          </span>
        )}
      </header>
      <div className="p-4">
        {sentTo ? (
          <div className="flex items-start gap-3 rounded-md bg-success/5 px-3.5 py-3" role="status">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <p className="text-sm leading-relaxed text-ink-2">
              {tf(t.account.changeEmailSent, { email: sentTo })}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="em-current" className="mb-1.5 text-xs">{t.account.currentEmail}</Label>
              <Input id="em-current" dir="ltr" value={user.email} disabled aria-readonly className="bg-soft/60 text-ink-3" />
            </div>
            <div>
              <Label htmlFor="em-new" className="mb-1.5 text-xs">{t.account.newEmail}</Label>
              <Input id="em-new" type="email" dir="ltr" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="em-pw" className="mb-1.5 text-xs">{t.account.currentPassword}</Label>
              <Input id="em-pw" type="password" required autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-error sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy} className="h-10 gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <AtSign className="h-4 w-4" aria-hidden />}
                {t.account.changeEmail}
              </Button>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-ink-3">{t.account.changeEmailHint}</p>
              <p className="mt-1 flex max-w-xl items-start gap-1.5 text-xs leading-relaxed text-ink-3">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                {t.account.changeEmailNote}
              </p>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

/** S13/S11 — change password with re-auth; every OTHER device signs out. */
function SecurityCard({ locale, user }: { locale: Locale; user: UserDTO }) {
  const t = getDict(locale)
  const { toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noLocalPw, setNoLocalPw] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next !== confirm) { setError(t.account.passwordMismatch); return }
    setBusy(true)
    try {
      await apiPut('/api/account/password', { currentPassword: current, newPassword: next })
      setCurrent(''); setNext(''); setConfirm('')
      toast({ title: t.account.passwordChanged })
    } catch (err) {
      const e2 = err as { code?: string }
      if (e2.code === 'WRONG_PASSWORD') setError(t.account.wrongPassword)
      else if (e2.code === 'NO_LOCAL_PASSWORD') setNoLocalPw(true)
      else if (e2.code === 'SAME_PASSWORD') setError(locale === 'fa' ? 'گذرواژهٔ تازه باید با گذرواژهٔ کنونی متفاوت باشد.' : 'The new password must be different from the current one.')
      else setError(locale === 'fa' ? 'تغییر گذرواژه ناموفق بود — دوباره تلاش کنید.' : 'Could not change the password — please try again.')
    } finally { setBusy(false) }
  }

  return (
    <section aria-label={t.account.security} className="overflow-hidden rounded-lg border border-line">
      <header className="flex items-center gap-2 border-b border-line bg-soft/60 px-4 py-3">
        <Shield className="h-4 w-4 text-brand" aria-hidden />
        <h3 className="text-sm font-semibold text-ink">{t.account.security}</h3>
      </header>
      <div className="p-4">
        {noLocalPw ? (
          <p className="text-sm text-ink-3">{t.account.noLocalPassword}</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="pw-current" className="mb-1.5 text-xs">{t.account.currentPassword}</Label>
              <Input id="pw-current" type="password" required autoComplete="current-password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw-next" className="mb-1.5 text-xs">{t.auth.newPassword}</Label>
              <Input id="pw-next" type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw-confirm" className="mb-1.5 text-xs">{t.auth.confirmNewPassword}</Label>
              <Input id="pw-confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-error sm:col-span-3">{error}</p>}
            <div className="sm:col-span-3">
              <Button type="submit" size="sm" disabled={busy} className="h-10 gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t.account.changePassword}
              </Button>
              <p className="mt-2 text-xs text-ink-3">
                {locale === 'fa'
                  ? 'با تغییر گذرواژه، از همه دستگاه‌های دیگر خارج می‌شوید.'
                  : 'Changing your password signs out every other device.'}
              </p>
            </div>
          </form>
        )}
        {!noLocalPw && user.googleLinked && (
          <p className="mt-3 rounded-md bg-soft px-3 py-2 text-xs text-ink-3">
            {locale === 'fa' ? 'این حساب به گوگل نیز متصل است.' : 'This account is also linked to Google.'}
          </p>
        )}
      </div>
    </section>
  )
}

/** S11 — active sessions list with per-device sign-out. */
function SessionsCard({ locale }: { locale: Locale }) {
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const setUser = useApp((s) => s.setUser)
  const [sessions, setSessions] = useState<{ id: string; userAgent: string | null; createdAt: string; current: boolean }[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ sessions: { id: string; userAgent: string | null; createdAt: string; current: boolean }[] }>('/api/auth/sessions')
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]))
  }, [])
  useEffect(() => { load() }, [load])

  const revoke = async (id: string) => {
    setBusyId(id)
    try {
      await apiDelete(`/api/auth/sessions?id=${encodeURIComponent(id)}`)
      toast({ title: t.account.sessionRevoked })
      const wasCurrent = sessions?.find((s) => s.id === id)?.current
      if (wasCurrent) {
        // Revoked THIS device: the cookie is gone server-side — reset the UI.
        setUser(null)
        navigate(`/${locale}`)
      } else {
        load()
      }
    } catch {
      toast({ title: t.account.sessionRevokeFailed, variant: 'destructive' })
    } finally { setBusyId(null) }
  }

  return (
    <section aria-label={t.account.activeSessions} className="overflow-hidden rounded-lg border border-line">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-soft/60 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <MonitorSmartphone className="h-4 w-4 text-brand" aria-hidden />
          {t.account.activeSessions}
        </h3>
        {sessions && sessions.length > 0 && (
          <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-ink-2">
            {isFa ? faDigits(String(sessions.length)) : sessions.length}
          </span>
        )}
      </header>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {sessions === null && (
          <li className="flex items-center justify-center px-4 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-ink-3" aria-hidden />
          </li>
        )}
        {sessions?.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-3">{t.account.signOutAllDone}</li>
        )}
        {sessions?.map((s) => {
          const { kind, browser } = describeUa(s.userAgent)
          const Icon = kind === 'phone' ? Smartphone : kind === 'tablet' ? Tablet : Monitor
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft text-ink-2" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                  {browser}
                  {s.current && (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                      {t.account.currentDevice}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-3">
                  {t.account.sessionSignedIn} · {formatDateTime(s.createdAt, locale)}
                </p>
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => revoke(s.id)}
                disabled={busyId === s.id}
                aria-label={`${t.account.sessionRevoke} — ${browser}`}
                className="h-8 shrink-0 gap-1.5 px-2 text-xs text-ink-3 hover:bg-error/10 hover:text-error"
              >
                {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                {t.account.sessionRevoke}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
