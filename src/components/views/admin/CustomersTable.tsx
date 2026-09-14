'use client'

// Admin › Customers — sortable, paginated customer table + detail dialog (Task 27-d, P0-5).
// Self-contained replacement for the legacy AdminCustomers list: the host mounts <AdminCustomersTable />
// in place of it. Labels are bilingual inline (no i18n.ts changes); API: /api/admin/customers[/:id].

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Search, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge, EmptyState, Spinner } from '@/components/storefront/bits'
import { ApiError, apiGet, apiPatch } from '@/lib/api'
import { faDigits, formatDate, formatMoney } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type CustomerRow = {
  id: string; email: string; name: string | null; status: string; preferredLocale: string
  marketingConsent: boolean; orderCount: number; totalSpentMinor: number; lastOrderAt: string | null; createdAt: string
}

type CustomerAddress = {
  id: string; label: string | null; recipient: string; line1: string; line2: string | null; city: string
  region: string | null; postalCode: string; countryCode: string; phone: string | null
  isDefaultShipping: boolean; isDefaultBilling: boolean; createdAt: string
}

type CustomerDetail = {
  id: string; email: string; name: string | null; role: string; status: string; preferredLocale: string
  marketingConsent: boolean; adminNote: string | null; createdAt: string
  addresses: CustomerAddress[]
  orders: { id: string; orderNumber: string; status: string; paymentStatus: string; totalMinor: number; createdAt: string }[]
  stats: { orderCount: number; totalSpentMinor: number; lastOrderAt: string | null; reviewsCount: number; openTicketsCount: number; wishlistCount: number }
}

type SortKey = 'createdAt' | 'orderCount' | 'totalSpent' | 'lastOrderAt' | 'email'
type SortDir = 'asc' | 'desc'

/** Direction picked when switching to a NEW sort column (clicking the active column toggles instead). */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  createdAt: 'desc', orderCount: 'desc', totalSpent: 'desc', lastOrderAt: 'desc', email: 'asc',
}

const PAGE_SIZES = [25, 50, 100, 200] as const

type Tone = 'default' | 'brand' | 'orange' | 'success' | 'warning' | 'error'

const statusTone = (s: string): Tone => (s === 'ACTIVE' ? 'success' : s === 'BLOCKED' ? 'error' : 'default')
const roleTone = (r: string): Tone => (r === 'OWNER' ? 'orange' : r === 'CUSTOMER' ? 'default' : 'brand')
const orderTone = (s: string): Tone =>
  (s === 'DELIVERED' || s === 'SHIPPED' ? 'success'
    : s === 'CANCELLED' || s === 'REFUNDED' ? 'error'
    : s === 'PARTIALLY_REFUNDED' ? 'warning' : 'default')

function serverMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message || e.code
  return 'Network error'
}

export function AdminCustomersTable() {
  const locale = useApp((s) => s.locale)
  const viewer = useApp((s) => s.user)
  const { toast } = useToast()
  const fa = locale === 'fa'

  // Bilingual inline labels (kept out of i18n.ts by design — this slice is self-contained).
  const L = fa ? ({
    title: 'مشتریان',
    search: 'جست‌وجوی نام یا ایمیل…',
    perPage: 'در هر صفحه',
    colCustomer: 'مشتری',
    colOrders: 'سفارش‌ها',
    colSpent: 'مجموع خرید',
    colLastOrder: 'آخرین خرید',
    colJoined: 'تاریخ عضویت',
    colStatus: 'وضعیت',
    view: 'مشاهده',
    resultsOf: (a: string, b: string, z: string) => `${a}–${b} از ${z} مشتری`,
    page: 'صفحه',
    of: 'از',
    prev: 'پیش‌تر',
    next: 'بعدی',
    empty: 'مشتری‌ای یافت نشد.',
    emptyBody: 'جست‌وجو را تغییر دهید یا فیلتر دیگری امتحان کنید.',
    loadError: 'خطا در بارگذاری فهرست',
    detailError: 'خطا در بارگذاری جزئیات',
    retry: 'تلاش دوباره',
    loading: 'در حال بارگذاری…',
    // detail dialog
    profile: 'جزئیات مشتری',
    locale: 'زبان ترجیحی',
    consent: 'رضایت بازاریابی',
    yes: 'بله',
    no: 'خیر',
    stOrders: 'سفارش‌ها',
    stSpent: 'مجموع خرید',
    stReviews: 'دیدگاه‌ها',
    stTickets: 'تیکت‌های باز',
    stWishlist: 'علاقه‌مندی‌ها',
    addresses: 'نشانی‌ها',
    noAddresses: 'نشانی‌ای برای این مشتری ثبت نشده است.',
    defaultShip: 'ارسال پیش‌فرض',
    defaultBill: 'صورتحساب پیش‌فرض',
    recentOrders: 'سفارش‌های اخیر',
    noOrders: 'هنوز سفارشی ثبت نشده است.',
    noteTitle: 'یادداشت داخلی',
    notePlaceholder: 'یادداشتی برای تیم پشتیبانی…',
    save: 'ذخیره',
    saving: 'در حال ذخیره…',
    saved: 'یادداشت ذخیره شد.',
    saveError: 'خطا در ذخیره یادداشت',
    cancel: 'انصراف',
    memberSince: 'تاریخ عضویت',
    sortHint: (c: string) => `مرتب‌سازی بر اساس ${c}`,
    // account actions (SEC-013)
    account: 'حساب',
    role: 'نقش',
    block: 'مسدودسازی',
    unblock: 'رفع مسدودی',
    actionSaved: 'حساب به‌روزرسانی شد.',
    actionError: 'عملیات ناموفق بود',
  }) : ({
    title: 'Customers',
    search: 'Search name or email…',
    perPage: 'Per page',
    colCustomer: 'Customer',
    colOrders: 'Orders',
    colSpent: 'Total spent',
    colLastOrder: 'Last order',
    colJoined: 'Joined',
    colStatus: 'Status',
    view: 'View',
    resultsOf: (a: string, b: string, z: string) => `${a}–${b} of ${z} customers`,
    page: 'Page',
    of: 'of',
    prev: 'Previous',
    next: 'Next',
    empty: 'No customers found.',
    emptyBody: 'Try a different search term.',
    loadError: 'Failed to load customers',
    detailError: 'Failed to load customer details',
    retry: 'Retry',
    loading: 'Loading…',
    profile: 'Customer details',
    locale: 'Preferred locale',
    consent: 'Marketing consent',
    yes: 'Yes',
    no: 'No',
    stOrders: 'Orders',
    stSpent: 'Total spent',
    stReviews: 'Reviews',
    stTickets: 'Open tickets',
    stWishlist: 'Wishlist',
    addresses: 'Addresses',
    noAddresses: 'No addresses on file for this customer.',
    defaultShip: 'Default shipping',
    defaultBill: 'Default billing',
    recentOrders: 'Recent orders',
    noOrders: 'No orders yet.',
    noteTitle: 'Internal note',
    notePlaceholder: 'A note for the support team…',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Note saved.',
    saveError: 'Failed to save note',
    cancel: 'Cancel',
    memberSince: 'Member since',
    sortHint: (c: string) => `Sort by ${c}`,
    // account actions (SEC-013)
    account: 'Account',
    role: 'Role',
    block: 'Block',
    unblock: 'Unblock',
    actionSaved: 'Account updated.',
    actionError: 'Action failed',
  })

  const fmtNum = (n: number) => (fa ? faDigits(n) : String(n))

  // ── List state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<CustomerRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('createdAt')
  const [dir, setDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Debounce the search input (300ms) into the actual query.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  // Any query-shape change resets to the first page.
  useEffect(() => {
    setPage(1)
  }, [q, sort, dir, pageSize])

  // Stale-response guard: rapid query/sort/page changes fire overlapping fetches — only the
  // request matching the LATEST params may commit its result (last-response-wins race otherwise).
  const reqRef = useRef('')

  const load = async () => {
    const params = new URLSearchParams({ sort, dir, page: String(page), pageSize: String(pageSize) })
    if (q) params.set('q', q)
    const key = params.toString()
    reqRef.current = key
    setLoading(true)
    try {
      const r = await apiGet<{ items: CustomerRow[]; total: number; page: number; pageSize: number }>(`/api/admin/customers?${key}`)
      if (reqRef.current !== key) return
      setRows(r.items)
      setTotal(r.total)
      setErr(null)
    } catch (e) {
      if (reqRef.current !== key) return
      setRows([])
      setTotal(0)
      setErr(serverMessage(e))
      toast({ title: L.loadError, description: serverMessage(e), variant: 'destructive' })
    } finally {
      if (reqRef.current === key) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load() is recreated each render (adding it loops); [q,sort,dir,page,pageSize] are the triggers
  }, [q, sort, dir, page, pageSize])

  const toggleSort = (key: SortKey) => {
    if (key === sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setDir(DEFAULT_DIR[key])
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // ── Detail dialog state ──────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const openDetail = (id: string) => {
    setDetail(null)
    setDetailId(id)
  }

  useEffect(() => {
    if (!detailId) return
    let alive = true
    setDetailLoading(true)
    apiGet<{ customer: CustomerDetail }>(`/api/admin/customers/${detailId}`)
      .then((r) => {
        if (!alive) return
        setDetail(r.customer)
        setNote(r.customer.adminNote ?? '')
      })
      .catch((e) => {
        if (!alive) return
        toast({ title: L.detailError, description: serverMessage(e), variant: 'destructive' })
        setDetailId(null)
      })
      .finally(() => {
        if (alive) setDetailLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: detail modal loads once per detailId; toast/L.detailError are stable and add no value
  }, [detailId])

  const noteDirty = detail !== null && note !== (detail.adminNote ?? '')

  // ── Account actions (SEC-013): block/unblock (+ role change for OWNERs) ──
  const [savingAction, setSavingAction] = useState(false)
  const isOwner = viewer?.role === 'OWNER'
  const ACCOUNT_ROLES = ['CUSTOMER', 'EDITOR', 'ORDER_SUPPORT'] as const

  const runAccountAction = async (action?: 'BLOCK' | 'UNBLOCK', role?: string) => {
    if (!detail || (!action && !role)) return
    setSavingAction(true)
    try {
      await apiPatch<{ ok: boolean }>(`/api/admin/customers/${detail.id}`, {
        ...(action ? { action } : {}),
        ...(role ? { role } : {}),
      })
      if (action) {
        const nextStatus = action === 'BLOCK' ? 'BLOCKED' : 'ACTIVE'
        setDetail({ ...detail, status: nextStatus })
        setRows((prev) => (prev ? prev.map((r) => (r.id === detail.id ? { ...r, status: nextStatus } : r)) : prev))
      }
      if (role) setDetail({ ...detail, role })
      toast({ title: L.actionSaved })
    } catch (e) {
      toast({ title: L.actionError, description: serverMessage(e), variant: 'destructive' })
    } finally {
      setSavingAction(false)
    }
  }

  const saveNote = async () => {
    if (!detail || !noteDirty) return
    setSavingNote(true)
    try {
      const r = await apiPatch<{ customer: { adminNote: string | null } }>(`/api/admin/customers/${detail.id}`, {
        adminNote: note.trim() === '' ? null : note,
      })
      setDetail({ ...detail, adminNote: r.customer.adminNote })
      setNote(r.customer.adminNote ?? '')
      toast({ title: L.saved })
    } catch (e) {
      toast({ title: L.saveError, description: serverMessage(e), variant: 'destructive' })
    } finally {
      setSavingNote(false)
    }
  }

  const initial = (n: string | null, email: string) => (n ?? email)[0]?.toUpperCase() ?? '?'
  const ChevronStart = fa ? ChevronRight : ChevronLeft
  const ChevronEnd = fa ? ChevronLeft : ChevronRight

  const COLUMNS: { key: SortKey | null; label: string }[] = [
    { key: 'email', label: L.colCustomer },
    { key: 'orderCount', label: L.colOrders },
    { key: 'totalSpent', label: L.colSpent },
    { key: 'lastOrderAt', label: L.colLastOrder },
    { key: 'createdAt', label: L.colJoined },
    { key: null, label: L.colStatus }, // no server sort key for status
    { key: null, label: '' }, // actions
  ]

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-ink">{L.title}</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={L.search}
              aria-label={L.search}
              className="h-9 w-56 ps-8"
            />
          </div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label={L.perPage}
            className="h-9 rounded-md border border-line bg-white px-2 text-xs text-ink-2"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{fmtNum(n)} · {L.perPage}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      <p className="mb-2 text-xs text-ink-3" aria-live="polite">
        {err ? (
          <>
            {L.loadError}: {err}{' '}
            <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={load}>{L.retry}</button>
          </>
        ) : (
          L.resultsOf(fmtNum(from), fmtNum(to), fmtNum(total))
        )}
      </p>

      {/* Body */}
      {loading && !rows ? (
        <Spinner label={L.loading} />
      ) : err ? (
        <EmptyState title={L.loadError} body={err} action={<Button variant="outline" size="sm" onClick={load}>{L.retry}</Button>} />
      ) : rows && rows.length === 0 ? (
        <EmptyState title={L.empty} body={L.emptyBody} />
      ) : (
        <>
          <div className={cn('overflow-hidden rounded-lg border border-line bg-white', loading && 'opacity-60')}>
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-soft/60 hover:bg-soft/60">
                  {COLUMNS.map((col, i) => (
                    <TableHead
                      key={i}
                      className={cn('text-start text-xs font-semibold uppercase tracking-wide text-ink-2', i === 0 && 'ps-4', i >= COLUMNS.length - 2 && 'text-center')}
                      aria-sort={col.key ? (sort === col.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    >
                      {col.key ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key as SortKey)}
                          aria-label={L.sortHint(col.label)}
                          className={cn(
                            'group -ms-1 inline-flex h-8 items-center gap-1 rounded px-2 transition-colors hover:text-ink',
                            sort === col.key ? 'text-brand' : 'text-ink-2',
                          )}
                        >
                          {col.label}
                          {sort === col.key ? (
                            dir === 'asc'
                              ? <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                              : <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-80" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <span aria-hidden={col.label === ''}>{col.label}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows?.map((c) => (
                  <TableRow
                    key={c.id}
                    tabIndex={0}
                    onClick={() => openDetail(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openDetail(c.id)
                      }
                    }}
                    aria-label={`${L.view}: ${c.name ?? c.email}`}
                    className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <TableCell className="ps-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand" aria-hidden>
                          {initial(c.name, c.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-52 truncate font-medium text-ink">{c.name ?? '—'}</p>
                          <p className="max-w-52 truncate text-xs text-ink-3 bdi" dir="ltr">{c.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-ink-2">{fmtNum(c.orderCount)}</TableCell>
                    <TableCell className="tabular-nums font-semibold text-ink bdi">{formatMoney(c.totalSpentMinor, locale)}</TableCell>
                    <TableCell className="text-ink-2">
                      {c.lastOrderAt ? <span className="bdi">{formatDate(c.lastOrderAt, locale)}</span> : <span className="text-ink-3">—</span>}
                    </TableCell>
                    <TableCell className="text-ink-2 bdi">{formatDate(c.createdAt, locale)}</TableCell>
                    <TableCell className="text-center">
                      <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          openDetail(c.id)
                        }}
                        aria-label={`${L.view} ${c.name ?? c.email}`}
                      >
                        <Eye className="h-4 w-4 text-ink-2" aria-hidden />
                        <span className="sr-only">{L.view}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-3 tabular-nums">
              {L.page} {fmtNum(page)} {L.of} {fmtNum(pages)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronStart className="h-4 w-4" aria-hidden />
                {L.prev}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages || loading}
              >
                {L.next}
                <ChevronEnd className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Detail dialog */}
      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" style={{ maxWidth: '42rem' }}>
          {detailLoading || !detail ? (
            <Spinner label={L.loading} />
          ) : (
            <>
              <DialogHeader className="text-start">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand" aria-hidden>
                    {initial(detail.name, detail.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate text-base font-semibold text-ink">{detail.name ?? '—'}</DialogTitle>
                    <DialogDescription className="truncate text-xs text-ink-3 bdi" dir="ltr">{detail.email}</DialogDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
                    <Badge tone={roleTone(detail.role)}>{detail.role}</Badge>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span>{L.locale}: <b className="font-medium uppercase text-ink-2 bdi">{detail.preferredLocale}</b></span>
                  <span>
                    {L.consent}:{' '}
                    <b className={cn('font-medium', detail.marketingConsent ? 'text-success' : 'text-ink-2')}>
                      {detail.marketingConsent ? L.yes : L.no}
                    </b>
                  </span>
                </div>
              </DialogHeader>

              {/* Account actions (SEC-013) — tiny inline row: role select (OWNER only) + block toggle */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-soft/40 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{L.account}</span>
                {isOwner && (
                  <select
                    value={detail.role}
                    onChange={(e) => runAccountAction(undefined, e.target.value)}
                    disabled={savingAction}
                    aria-label={L.role}
                    className="h-8 rounded-md border border-line bg-white px-2 text-xs text-ink-2"
                  >
                    {ACCOUNT_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto h-8"
                  onClick={() => runAccountAction(detail.status === 'BLOCKED' ? 'UNBLOCK' : 'BLOCK')}
                  disabled={savingAction}
                >
                  {detail.status === 'BLOCKED' ? L.unblock : L.block}
                </Button>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label={L.profile}>
                {[
                  { label: L.stOrders, value: fmtNum(detail.stats.orderCount) },
                  { label: L.stSpent, value: formatMoney(detail.stats.totalSpentMinor, locale) },
                  { label: L.stReviews, value: fmtNum(detail.stats.reviewsCount) },
                  { label: L.stTickets, value: fmtNum(detail.stats.openTicketsCount) },
                  { label: L.stWishlist, value: fmtNum(detail.stats.wishlistCount) },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-line bg-soft/50 p-3 text-center">
                    <p className="text-base font-bold tabular-nums text-ink bdi">{s.value}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Addresses */}
              <section aria-label={L.addresses}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{L.addresses}</h3>
                {detail.addresses.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-ink-3">{L.noAddresses}</p>
                ) : (
                  <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                    {detail.addresses.map((a) => (
                      <div key={a.id} className="rounded-lg border border-line bg-white p-3 text-sm">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-ink">{a.label || a.recipient}</span>
                          {a.isDefaultShipping && <Badge tone="brand">{L.defaultShip}</Badge>}
                          {a.isDefaultBilling && <Badge>{L.defaultBill}</Badge>}
                        </div>
                        <p className="text-ink-2">{a.recipient}</p>
                        <p className="text-ink-2">{a.line1}{a.line2 ? ` — ${a.line2}` : ''}</p>
                        <p className="text-ink-2">{[a.postalCode, a.city, a.region].filter(Boolean).join(' · ')}</p>
                        <p className="text-xs text-ink-3 bdi">{a.countryCode}{a.phone ? ` · ${a.phone}` : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Recent orders (display only) */}
              <section aria-label={L.recentOrders}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{L.recentOrders}</h3>
                {detail.orders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-ink-3">{L.noOrders}</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {detail.orders.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                        <span className="font-mono text-xs text-ink bdi" dir="ltr">{o.orderNumber}</span>
                        <Badge tone={orderTone(o.status)}>{o.status}</Badge>
                        <span className="ms-auto text-xs text-ink-3 bdi">{formatDate(o.createdAt, locale)}</span>
                        <span className="min-w-20 text-end font-semibold tabular-nums text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Internal admin note */}
              <section aria-label={L.noteTitle} className="rounded-lg border border-line p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <StickyNote className="h-4 w-4 text-brand" aria-hidden />
                  {L.noteTitle}
                </h3>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={L.notePlaceholder}
                  rows={3}
                  maxLength={2000}
                  aria-label={L.noteTitle}
                  className="resize-y bg-white"
                />
                <div className="mt-2 flex justify-end gap-2">
                  {noteDirty && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setNote(detail.adminNote ?? '')} disabled={savingNote}>
                      {L.cancel}
                    </Button>
                  )}
                  <Button size="sm" className="h-8" onClick={saveNote} disabled={!noteDirty || savingNote}>
                    {savingNote ? L.saving : L.save}
                  </Button>
                </div>
              </section>

              <p className="text-center text-xs text-ink-3 bdi">
                {L.memberSince}: {formatDate(detail.createdAt, locale)}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
