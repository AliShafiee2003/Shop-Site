'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LayoutDashboard, BookOpen, Package, LayoutTemplate, Star, LifeBuoy, Users, BarChart3, History, Loader2, ArrowUp, ArrowDown, ShieldAlert, Activity, Mail, Plus, Minus, ChevronUp, ChevronDown, Inbox, TrendingUp, UserMinus, Tag, TicketPercent, Trash2, CalendarClock, Shapes, BookUser, Download, Megaphone, BellRing, Layers, Check, X, PieChart, Gift, Settings2, Clock, Ban, Upload, Store, Truck, Search, Landmark, Phone, MapPin, FileUp, FileText, ArrowUpDown, Pencil, MessageSquare, ImagePlus, Smartphone, Copy, Tags, Building2, Instagram, Twitter, Youtube, Share2, GripVertical, Camera, Newspaper, KeyRound } from 'lucide-react'
import { AdminArticles } from '@/components/views/admin/ArticlesAdmin'
import { AdminAnnouncements } from '@/components/views/admin/AnnouncementsEditor'
import { AdminLegal } from '@/components/views/admin/LegalEditor'
import { AdminCustomersTable } from '@/components/views/admin/CustomersTable'
import { FullProductEditor } from '@/components/views/admin/ProductEditor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate, useRoute, localePath } from '@/lib/router'
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
type AdminDict = ReturnType<typeof getDict>['admin']
import { formatMoney, formatDate, formatDateTime, faDigits, compactOrderNumber } from '@/lib/format'
import { Spinner, EmptyState } from '@/components/storefront/bits'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import type { HomeSection, Locale, UserDTO } from '@/lib/types'

 

interface DashData {
  newOrders7d: number; revenueTodayMinor: number; revenueMonthMinor: number
  awaitingShipment: number; failedPayments: number; openReturns: number
  lowStock: { productTitle: string; sku: string; stock: number }[]
  pendingReviews: number; unansweredTickets: number
  topProducts: { title: string; units: number }[]
  recentOrders: { orderNumber: string; email: string; totalMinor: number; status: string; createdAt: string }[]
  activePromotion?: { name: string; badge: string; noteEn: string | null; noteFa: string | null } | null
  promoImpact?: { orders: number; paidOrders: number; savedMinor: number; revenueMinor: number; perPromo: { name: string; orders: number; savedMinor: number; revenueMinor: number }[] }
  giftWrap?: { orders: number; paidOrders: number; feesMinor: number; revenueMinor: number }
}

// S10 RBAC matrix — `content: true` sections are OWNER/EDITOR only (mirrors
// requireContentAdmin on the API routes); ORDER_SUPPORT sees support sections.
const ADMIN_NAV = [
  { key: '', label: 'admin.dashboard', icon: LayoutDashboard, content: false },
  { key: 'products', label: 'admin.products', icon: BookOpen, content: true },
  { key: 'orders', label: 'admin.orders', icon: Package, content: false },
  { key: 'discounts', label: 'admin.discounts', icon: TicketPercent, content: true },
  { key: 'categories', label: 'admin.categories', icon: Shapes, content: true },
  { key: 'people', label: 'admin.people', icon: BookUser, content: true },
  { key: 'articles', label: 'admin.articles', icon: Newspaper, content: true },
  { key: 'homepage', label: 'admin.homepage', icon: LayoutTemplate, content: true },
  { key: 'analytics', label: 'admin.analytics', icon: Activity, content: false },
  { key: 'marketing', label: 'admin.marketing', icon: Mail, content: true },
  { key: 'reviews', label: 'admin.reviews', icon: Star, content: true },
  { key: 'tickets', label: 'admin.tickets', icon: LifeBuoy, content: false },
  { key: 'customers', label: 'admin.customers', icon: Users, content: false },
  { key: 'announcements', label: 'admin.announcements', icon: Megaphone, content: true },
  { key: 'legal', label: 'admin.legal', icon: FileText, content: true },
  { key: 'reports', label: 'admin.reports', icon: BarChart3, content: false },
  { key: 'audit-log', label: 'admin.auditLog', icon: History, content: false },
  { key: 'settings', label: 'admin.settings', icon: Settings2, content: false },
] as const

export function AdminView({ section: rawSection }: { section: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const user = useApp((s) => s.user)
  const userLoaded = useApp((s) => s.userLoaded)

  // Deep links may use /admin/dashboard; the dashboard's canonical key is ''
  const section = rawSection === 'dashboard' ? '' : rawSection

  const isAdmin = user && ['OWNER', 'EDITOR', 'ORDER_SUPPORT'].includes(user.role)
  // Content sections are hidden from ORDER_SUPPORT (server enforces too).
  const isContentAdmin = user && ['OWNER', 'EDITOR'].includes(user.role)

  if (!userLoaded) return <Spinner label={t.common.loading} />
  if (!isAdmin) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        <EmptyState
          title={user ? t.admin.forbidden : t.admin.loginRequired}
          action={<Button onClick={() => navigate('/login')}>{t.auth.login}</Button>}
        />
      </main>
    )
  }

  const navLabels: Record<string, string> = Object.fromEntries(ADMIN_NAV.map((n) => [n.key, t.admin[n.label.split('.')[1] as keyof typeof t.admin] as string]))

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t.admin.title}</h1>
        <Button variant="outline" size="sm" className="h-9" onClick={() => navigate(`/${locale}`)}>{t.admin.store}</Button>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[210px_1fr]">
        <nav aria-label={t.admin.title} className="space-y-1">
          {ADMIN_NAV.filter((n) => isContentAdmin || !n.content).map((n) => (
            <button
              key={n.key} type="button"
              onClick={() => navigate(`/admin${n.key ? `/${n.key}` : ''}`)}
              aria-current={section === n.key ? 'page' : undefined}
              className={cn('flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium transition',
                section === n.key ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-soft hover:text-ink')}
            >
              <n.icon className="h-4 w-4" aria-hidden />{navLabels[n.key]}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === '' && <AdminDashboard />}
          {section === 'products' && (isContentAdmin ? <AdminProducts /> : <ForbiddenSection />)}
          {section === 'orders' && <AdminOrders />}
          {section === 'discounts' && (isContentAdmin ? <AdminDiscounts /> : <ForbiddenSection />)}
          {section === 'categories' && (isContentAdmin ? <AdminCategories /> : <ForbiddenSection />)}
          {section === 'people' && (isContentAdmin ? <AdminPeople /> : <ForbiddenSection />)}
          {section === 'articles' && (isContentAdmin ? <AdminArticles /> : <ForbiddenSection />)}
          {section === 'homepage' && (isContentAdmin ? <AdminHomepage /> : <ForbiddenSection />)}
          {section === 'analytics' && <AdminAnalytics />}
          {section === 'marketing' && (isContentAdmin ? <AdminMarketing /> : <ForbiddenSection />)}
          {section === 'reviews' && (isContentAdmin ? <AdminReviews /> : <ForbiddenSection />)}
          {section === 'tickets' && <AdminTickets />}
          {section === 'customers' && <AdminCustomersTable />}
          {section === 'announcements' && (isContentAdmin ? <AdminAnnouncements /> : <ForbiddenSection />)}
          {section === 'legal' && (isContentAdmin ? <AdminLegal /> : <ForbiddenSection />)}
          {section === 'reports' && <AdminReports />}
          {section === 'audit-log' && <AdminAudit />}
          {section === 'settings' && <AdminSettings />}
        </div>
      </div>
    </main>
  )
}

/** S10: rendered when a non-content role (ORDER_SUPPORT) deep-links into a
 *  content section. The API routes enforce the same matrix server-side. */
function ForbiddenSection() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-8 text-center" role="alert">
      <ShieldAlert className="mx-auto h-8 w-8 text-orange-dark" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-ink">{t.admin.forbidden}</p>
      <p className="mt-1 text-xs text-ink-3">
        {locale === 'fa'
          ? 'این بخش فقط برای مدیران محتوا (OWNER/EDITOR) در دسترس است.'
          : 'This section is only available to content managers (OWNER/EDITOR).'}
      </p>
    </div>
  )
}

function Card({ title, value, sub, tone }: { title: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</p>
      <p className={cn('mt-1.5 text-2xl font-bold tabular-nums', tone ?? 'text-ink')}><span className="bdi">{value}</span></p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function AdminDashboard() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<DashData | null>(null)

  useEffect(() => { apiGet<DashData>('/api/admin/dashboard').then(setData).catch(() => setData(null)) }, [])

  if (!data) return <Spinner label={t.common.loading} />
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={t.admin.newOrders} value={data.newOrders7d} />
        <Card title={t.admin.revenueToday} value={formatMoney(data.revenueTodayMinor, locale)} />
        <Card title={t.admin.revenueMonth} value={formatMoney(data.revenueMonthMinor, locale)} />
        <Card title={t.admin.awaitingShipment} value={data.awaitingShipment} tone={data.awaitingShipment > 0 ? 'text-orange-dark' : 'text-ink'} />
        <Card title={t.admin.failedPayments} value={data.failedPayments} tone={data.failedPayments > 0 ? 'text-error' : 'text-ink'} />
        <Card title={t.admin.openReturns} value={data.openReturns} />
        <Card title={t.admin.pendingReviews} value={data.pendingReviews} tone={data.pendingReviews > 0 ? 'text-orange-dark' : 'text-ink'} />
        <Card title={t.admin.unansweredTickets} value={data.unansweredTickets} tone={data.unansweredTickets > 0 ? 'text-orange-dark' : 'text-ink'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line" aria-label={t.admin.recentOrders}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.recentOrders}</h2>
          <ul className="divide-y divide-line">
            {data.recentOrders.map((o) => (
              <li key={o.orderNumber} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-brand bdi" dir="ltr">{o.orderNumber}</span>
                <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
                <Badge tone={o.status === 'PAID' || o.status === 'DELIVERED' ? 'success' : o.status === 'PENDING_PAYMENT' ? 'warning' : 'brand'}>{o.status}</Badge>
                <span className="font-semibold text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <PromoImpactCard data={data} />
          <GiftWrapCard data={data} />
          <section className="rounded-lg border border-line" aria-label={t.admin.topProducts}>
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topProducts}</h2>
            <ul className="divide-y divide-line">
              {data.topProducts.slice(0, 5).map((p, i) => (
                <li key={p.title} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{p.title}</span>
                  <span className="font-semibold text-ink bdi">{p.units} {t.admin.units}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-line" aria-label={t.admin.lowStock}>
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.lowStock}</h2>
            <ul className="divide-y divide-line">
              {data.lowStock.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">—</li> : data.lowStock.map((p) => (
                <li key={p.sku} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink-2">{p.productTitle}</span>
                  <span className="font-mono text-xs text-ink-3 bdi" dir="ltr">{p.sku}</span>
                  <span className="font-bold text-warning">{p.stock}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Promotion attribution — savings & adoption from checkout-time promo snapshots. */
function PromoImpactCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const impact = data.promoImpact
  const promo = data.activePromotion
  if (!impact) return null
  const share = impact.paidOrders > 0 ? Math.round((impact.orders / impact.paidOrders) * 100) : 0

  return (
    <section
      className="overflow-hidden rounded-lg border border-orange-accent/25 bg-gradient-to-br from-orange-accent/[0.07] via-transparent to-brand-soft/40"
      aria-label={t.admin.promoImpact}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/15 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><PieChart className="h-3.5 w-3.5" aria-hidden /></span>
          {t.admin.promoImpact}
        </h2>
        {promo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <span className="promo-dot inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            <span className="bdi" dir="ltr">{promo.badge}</span>
            <span className="opacity-80">{locale === 'fa' ? promo.noteFa ?? promo.name : promo.noteEn ?? promo.name}</span>
          </span>
        ) : null}
      </div>
      {impact.orders === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3">{t.admin.promoImpactNone}</p>
      ) : (
        <div className="px-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">−{formatMoney(impact.savedMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactSaved}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink">{impact.orders}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactOrders}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(impact.revenueMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.promoImpactRevenue}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-3">
              <span>{t.admin.promoImpactShare}</span>
              <span className="font-bold text-orange-dark tabular-nums">{share}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-line" role="img" aria-label={`${share}%`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-accent to-orange-dark transition-all"
                style={{ width: `${Math.max(share, 2)}%` }}
              />
            </div>
          </div>
          {impact.perPromo.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {impact.perPromo.slice(0, 3).map((p) => (
                <li key={p.name} className="flex items-center gap-2 text-xs text-ink-2">
                  <Tag className="h-3 w-3 shrink-0 text-orange-dark mirror-rtl" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium bdi" dir="ltr">{p.name}</span>
                  <span className="text-ink-3 tabular-nums">{p.orders}×</span>
                  <span className="font-semibold text-error bdi">−{formatMoney(p.savedMinor, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** Gift wrap attach rate — orders with wrap, share of paid orders, fees collected. */
function GiftWrapCard({ data }: { data: DashData }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const gw = data.giftWrap
  if (!gw) return null
  const attach = gw.paidOrders > 0 ? Math.round((gw.orders / gw.paidOrders) * 100) : 0

  return (
    <section
      className="overflow-hidden rounded-lg border border-orange-accent/20 bg-gradient-to-br from-brand-soft/30 via-transparent to-orange-accent/[0.06]"
      aria-label={t.admin.giftAttach}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><Gift className="h-3.5 w-3.5" aria-hidden /></span>
          {t.admin.giftAttach}
        </h2>
        <span className="font-mono text-xs font-bold tabular-nums text-orange-dark bdi" dir="ltr">{attach}%</span>
      </div>
      {gw.orders === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3">{t.admin.giftAttachNone}</p>
      ) : (
        <div className="px-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold tabular-nums text-ink">{gw.orders}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.giftAttachOrders}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(gw.feesMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.giftAttachRevenue}</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-ink bdi">{formatMoney(gw.revenueMinor, locale)}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{t.admin.revenue}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-ink-3">
              <span>{t.admin.giftAttachRate}</span>
              <span className="font-bold text-orange-dark tabular-nums">{attach}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-line" role="img" aria-label={`${attach}%`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-orange-accent transition-all"
                style={{ width: `${Math.max(attach, 2)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

interface AdminProduct { id: string; slug: string; status: string; title: string; titleFa: string; coverUrl?: string; priceMinor: number; stock: number; isFeatured: boolean; fixedPrice: boolean; completeness: { en: string; fa: string }; updatedAt: string }

const FORMAT_LABEL: Record<string, string> = { PAPERBACK: 'Paperback', HARDCOVER: 'Hardcover', SPECIAL: 'Special' }

interface VariantRow { id: string; sku: string; isbn13?: string | null; format: string; bookLanguage: string; editionLabel?: string | null; priceMinor: number; stock: number; lowStockThreshold: number; soldCount: number; isActive: boolean; waitingCount?: number }
interface TranslationRow { title: string; subtitle?: string | null; shortDescription?: string | null }
interface ProductEditorData {
  id: string; slug: string; status: string; coverUrl?: string | null; fixedPrice: boolean
  translations: Record<string, TranslationRow>
  variants: VariantRow[]
  priceHistory: { id: string; variantSku: string; oldPriceMinor: number | null; newPriceMinor: number; reason?: string | null; actorEmail?: string | null; effectiveAt: string }[]
}

function AdminProducts() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [products, setProducts] = useState<AdminProduct[] | null>(null)
  const [q, setQ] = useState('')
  // Inline product editor state
  const [editId, setEditId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProductEditorData | null>(null)
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})
  const [stockDeltas, setStockDeltas] = useState<Record<string, number>>({})
  // Restock → notify flow: remember which restocked variants should ping their waiting customers
  const [notifyOnRestock, setNotifyOnRestock] = useState<Record<string, boolean>>({})
  // Bulk stock editor state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  // CSV product import dialog state
  const [importOpen, setImportOpen] = useState(false)
  // Full product editor (Task 27-f): 'new' = create, id = edit
  const [fullEdit, setFullEdit] = useState<string | null>(null)
  const [fullOpen, setFullOpen] = useState(false)
  // Pagination (server-side, Task 27)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20
  // Content editor state (phase 2): per-locale draft fields
  const [contentTab, setContentTab] = useState<'en' | 'fa'>('en')
  const [contentEdits, setContentEdits] = useState<Record<'en' | 'fa', { title: string; subtitle: string; shortDescription: string }>>({
    en: { title: '', subtitle: '', shortDescription: '' },
    fa: { title: '', subtitle: '', shortDescription: '' },
  })
  const [saving, setSaving] = useState(false)
  // Stable id array for the bulk dialog effect (hooks must run before any early return)
  const selectedIds = useMemo(() => [...selected], [selected])

  const load = useCallback(() => {
    apiGet<{ items: AdminProduct[]; total: number }>('/api/admin/products?locale=' + locale + `&page=${page}&pageSize=${PAGE_SIZE}` + (q ? `&q=${encodeURIComponent(q)}` : ''))
      .then((r) => { setProducts(r.items); setTotal(r.total ?? r.items.length) }).catch(() => setProducts([]))
  }, [locale, q, page])
  useEffect(() => { load() }, [load])
  // Search box resets to the first page
  useEffect(() => { setPage(1) }, [q])

  const openEditor = async (id: string) => {
    if (editId === id) { setEditId(null); setDetail(null); return }
    setEditId(id); setDetail(null); setPriceEdits({}); setStockDeltas({}); setNotifyOnRestock({})
    try {
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)
      setDetail(r.product)
      hydrateContent(r.product)
    } catch { setEditId(null) }
  }

  const hydrateContent = (p: ProductEditorData) => {
    setContentEdits({
      en: { title: p.translations.en?.title ?? '', subtitle: p.translations.en?.subtitle ?? '', shortDescription: p.translations.en?.shortDescription ?? '' },
      fa: { title: p.translations.fa?.title ?? '', subtitle: p.translations.fa?.subtitle ?? '', shortDescription: p.translations.fa?.shortDescription ?? '' },
    })
    setContentTab('en')
  }

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    await apiPatch(`/api/admin/products/${id}`, body)
    toast({ title: msg })
    load()
    if (editId === id) openEditorRefresh(id)
  }
  const openEditorRefresh = async (id: string) => {
    try {
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)
      setDetail(r.product); setPriceEdits({}); setStockDeltas({}); setNotifyOnRestock({})
    } catch { /* keep old */ }
  }

  /** Diff the content drafts against the loaded detail → translations PATCH payload (null = no change). */
  const contentPatch = () => {
    if (!detail) return null
    const out: Record<string, { title?: string; subtitle?: string | null; shortDescription?: string | null }> = {}
    for (const loc of ['en', 'fa'] as const) {
      const orig = detail.translations[loc]
      if (!orig) continue // locale row missing → not editable inline
      const draft = contentEdits[loc]
      const entry: { title?: string; subtitle?: string | null; shortDescription?: string | null } = {}
      if (draft.title.trim() && draft.title !== orig.title) entry.title = draft.title.trim()
      if ((draft.subtitle || null) !== (orig.subtitle ?? null)) entry.subtitle = draft.subtitle.trim() || null
      if ((draft.shortDescription || null) !== (orig.shortDescription ?? null)) entry.shortDescription = draft.shortDescription.trim() || null
      if (Object.keys(entry).length > 0) out[loc] = entry
    }
    return Object.keys(out).length > 0 ? out : null
  }

  const saveContent = async () => {
    if (!detail) return
    const translations = contentPatch()
    if (!translations) { toast({ title: t.admin.noChanges }); return }
    setSaving(true)
    try {
      await apiPatch(`/api/admin/products/${detail.id}`, { translations })
      toast({ title: t.admin.contentSaved })
      const r = await apiGet<{ product: ProductEditorData }>(`/api/admin/products/${detail.id}`)
      setDetail(r.product)
      hydrateContent(r.product)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const bumpStock = (variantId: string, delta: number, stock: number) => {
    setStockDeltas((d) => {
      const next = Math.max(-stock, (d[variantId] ?? 0) + delta)
      return { ...d, [variantId]: next }
    })
  }

  /** Hard-delete a DRAFT/ARCHIVED product — server enforces referential guards
   *  (published/scheduled → 409; order history → 409). */
  const removeProduct = async (p: AdminProduct) => {
    if (!window.confirm(`${t.admin.productDeleteConfirm} (${p.title})`)) return
    try {
      await apiDelete(`/api/admin/products/${p.id}`)
      toast({ title: tf(t.admin.productDeleted, { title: p.title }) })
      if (editId === p.id) { setEditId(null); setDetail(null) }
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  /** Blob-download the catalog CSV (auth cookie rides along automatically). */
  const exportCsv = async () => {
    try {
      const res = await fetch('/api/admin/products/export')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `persepix-products-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast({ title: t.admin.exportProductsDone })
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const saveEditor = async () => {
    if (!detail) return
    const variantPrices = Object.entries(priceEdits)
      .map(([variantId, eur]) => ({ variantId, priceMinor: Math.round(Number(eur) * 100) }))
      .filter((c) => Number.isFinite(c.priceMinor) && c.priceMinor > 0)
    const stockAdjust = Object.entries(stockDeltas)
      .filter(([, delta]) => delta !== 0)
      .map(([variantId, delta]) => ({ variantId, delta }))
    if (variantPrices.length === 0 && stockAdjust.length === 0) {
      toast({ title: t.admin.noChanges })
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/api/admin/products/${detail.id}`, {
        ...(variantPrices.length > 0 ? { variantPrices } : {}),
        ...(stockAdjust.length > 0 ? { stockAdjust } : {}),
      })
      // Restock → notify: batch-ping the waiting subscribers of variants that came back in stock.
      const toNotify = stockAdjust
        .filter(({ variantId, delta }) => {
          const v = detail.variants.find((x) => x.id === variantId)
          return delta > 0 && v && v.stock === 0 && (v.waitingCount ?? 0) > 0 && (notifyOnRestock[variantId] ?? true)
        })
        .map(({ variantId }) => variantId)
      let notifiedTotal = 0
      for (const variantId of toNotify) {
        try {
          const r = await apiPost<{ notified: number }>('/api/admin/back-in-stock/notify', { variantId })
          notifiedTotal += r.notified
        } catch { /* keep going — stock save already succeeded */ }
      }
      if (notifiedTotal > 0) toast({ title: tf(t.admin.notifiedAll, { n: notifiedTotal }) })
      else toast({ title: t.admin.pricesSaved })
      load()
      openEditorRefresh(detail.id)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (!products) return <Spinner label={t.common.loading} />
  const allSelected = selected.size > 0 && selected.size === products.length
  const editingProduct = editId ? products.find((p) => p.id === editId) ?? null : null
  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t.admin.products}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm" className="h-9 gap-1.5"
            onClick={() => { setFullEdit('new'); setFullOpen(true) }}
          >
            <Plus className="h-4 w-4" aria-hidden />{t.admin.newProduct}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => void exportCsv()}
          >
            <Download className="h-4 w-4" aria-hidden />{t.admin.exportProducts}
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="h-4 w-4" aria-hidden />{t.admin.importProducts}
          </Button>
          <Button
            variant="ghost" size="sm" className="h-9 gap-1.5 text-ink-3"
            onClick={() => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)))}
            aria-pressed={allSelected}
          >
            <Layers className="h-4 w-4" aria-hidden />{t.admin.selectAll}
          </Button>
          <Input placeholder={t.common.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-56" />
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {products.map((p) => {
          const editing = editId === p.id
          return (
            <li key={p.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 transition-colors', editing && 'bg-brand-soft/40', selected.has(p.id) && 'bg-brand-soft/25')}>
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                aria-label={`${t.admin.bulkStock}: ${p.title}`}
                className="h-4 w-4 shrink-0 accent-[#014B74]"
              />
              {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-14 w-10 rounded-sm border border-line object-cover" /> : <span className="h-14 w-10 rounded-sm bg-soft" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="truncate text-xs text-ink-3" lang="fa" dir="rtl">{p.titleFa}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span className={cn('h-1.5 w-1.5 rounded-full', p.completeness.en === 'READY' ? 'bg-success' : 'bg-warning')} aria-hidden />
                  EN {p.completeness.en === 'READY' ? '✓' : '~'}
                  <span className={cn('h-1.5 w-1.5 rounded-full', p.completeness.fa === 'READY' ? 'bg-success' : 'bg-warning')} aria-hidden />
                  FA {p.completeness.fa === 'READY' ? '✓' : '~'}
                  {' · '}{p.stock} {t.admin.units.toLowerCase()}
                </p>
              </div>
              <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'default' : 'brand'}>{p.status}</Badge>
              <span className="text-sm font-semibold text-ink bdi">{formatMoney(p.priceMinor, locale)}</span>
              <div className="flex gap-1.5">
                {p.status !== 'PUBLISHED' ? (
                  <Button size="sm" className="h-8" onClick={() => patch(p.id, { status: 'PUBLISHED' }, t.admin.saved)}>{t.admin.publishProduct}</Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => patch(p.id, { status: 'DRAFT' }, t.admin.saved)}>{t.admin.unpublish}</Button>
                )}
                <Button
                  size="sm" variant={editing ? 'default' : 'outline'} className="h-8 gap-1"
                  onClick={() => openEditor(p.id)} aria-expanded={editing}
                >
                  {editing ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  {t.admin.editProduct}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setFullEdit(p.id); setFullOpen(true) }} aria-label={`${t.admin.fullEditor}: ${p.title}`}>
                  <Pencil className="h-3 w-3" aria-hidden />{t.admin.fullEditor}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/books/${p.slug}`)}>{t.admin.view}</Button>
                {(p.status === 'DRAFT' || p.status === 'ARCHIVED') && (
                  <Button
                    size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10"
                    onClick={() => void removeProduct(p)}
                    aria-label={`${t.admin.deleteProduct} ${p.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>

            </li>
          )
        })}
      </ul>

      {/* Floating bulk bar */}
      {selected.size > 0 && !bulkOpen && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="fade-up flex items-center gap-3 rounded-full border border-brand/20 bg-white/95 py-2 pe-2 ps-5 shadow-lg backdrop-blur">
            <span className="text-sm font-medium text-ink">{tf(t.admin.bulkSelected, { n: selected.size })}</span>
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs text-ink-3" onClick={() => setSelected(new Set())}>
              {t.admin.clearSel}
            </Button>
            <Button size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => setBulkOpen(true)}>
              <Layers className="h-4 w-4" aria-hidden />{t.admin.bulkStock}
            </Button>
          </div>
        </div>
      )}

      {/* Edit product — hoisted from the inline expander into a near-viewport
          dialog (user: «عرض باکس Edit product خیلی کمه، بیش از ۲ برابر بزرگترش
          کن»). The 1fr admin column capped it at ~960px; a 100vw−2rem dialog
          with a 1920px cap gives the variants/content surface >2× the working
          width on desktop screens. */}
      <Dialog open={editId !== null} onOpenChange={(o) => { if (!o) { setEditId(null); setDetail(null) } }}>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0"
          style={{ width: 'calc(100vw - 2rem)', maxWidth: '1920px' }}
        >
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold text-ink">
              {t.admin.editProduct}
              {editingProduct && (
                <span className="min-w-0 truncate text-sm font-normal text-ink-3">
                  — {locale === 'fa' && editingProduct.titleFa ? editingProduct.titleFa : editingProduct.title}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-slim">
            {!detail ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-white px-4 py-10 text-sm text-ink-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}
              </div>
            ) : (
              <div className="space-y-4">

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {t.admin.variants}
                  {detail.fixedPrice && <span className="ms-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">fixed-price</span>}
                </h3>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-8" disabled={saving} onClick={saveEditor}>{saving ? t.common.saving : t.admin.savePrices}</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditId(null); setDetail(null) }}>{t.admin.close}</Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-soft/60 text-xs uppercase tracking-wide text-ink-3">
                      <th className="px-3 py-2 text-start font-medium">{t.admin.formatCol}</th>
                      <th className="px-3 py-2 text-start font-medium">{t.admin.skuCol}</th>
                      <th className="px-3 py-2 text-end font-medium">{t.admin.price}</th>
                      <th className="px-3 py-2 text-center font-medium">{t.admin.stock}</th>
                      <th className="px-3 py-2 text-end font-medium">{t.admin.soldCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {detail.variants.map((v) => {
                      const delta = stockDeltas[v.id] ?? 0
                      const editedPrice = priceEdits[v.id]
                      const changed = delta !== 0 || editedPrice !== undefined
                      return (
                        <tr key={v.id} className={cn('transition-colors', changed && 'bg-brand-soft/40')}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-ink">{FORMAT_LABEL[v.format] ?? v.format}</p>
                            <p className="text-[11px] text-ink-3">{v.bookLanguage}{v.editionLabel ? ` · ${v.editionLabel}` : ''}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-mono text-xs text-ink-2 bdi" dir="ltr">{v.sku}</p>
                            {v.isbn13 && <p className="text-[11px] text-ink-3 bdi" dir="ltr">{v.isbn13}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-xs text-ink-3">€</span>
                              <Input
                                type="number" min={1} step="0.01" inputMode="decimal" dir="ltr"
                                defaultValue={(v.priceMinor / 100).toFixed(2)}
                                key={`${v.id}-${v.priceMinor}`}
                                onChange={(e) => setPriceEdits((s) => {
                                  const next = { ...s }
                                  const val = e.target.value
                                  if (val === '' || Math.round(Number(val) * 100) === v.priceMinor) delete next[v.id]
                                  else next[v.id] = val
                                  return next
                                })}
                                className="h-8 w-24 text-end tabular-nums"
                                aria-label={`${t.admin.price} — ${v.sku}`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => bumpStock(v.id, -1, v.stock)} aria-label="−1" className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft disabled:opacity-30" disabled={delta <= -v.stock}>
                                <Minus className="h-3.5 w-3.5" aria-hidden />
                              </button>
                              <span className="w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                                {v.stock + delta}
                                {delta !== 0 && <span className={cn('ms-0.5 text-[11px] font-medium', delta > 0 ? 'text-success' : 'text-error')}>({delta > 0 ? `+${delta}` : delta})</span>}
                              </span>
                              <button type="button" onClick={() => bumpStock(v.id, 1, v.stock)} aria-label="+1" className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft">
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                              </button>
                              <button type="button" onClick={() => bumpStock(v.id, 10, v.stock)} className="ms-1 rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-soft">+10</button>
                            </div>
                            {v.stock === 0 && (v.waitingCount ?? 0) > 0 && (
                              <label className={cn('mt-1.5 flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition',
                                delta > 0
                                  ? 'border-success/40 bg-success/10 text-success'
                                  : 'border-line bg-soft text-ink-3')}>
                                <input
                                  type="checkbox"
                                  checked={notifyOnRestock[v.id] ?? true}
                                  onChange={(e) => setNotifyOnRestock((s) => ({ ...s, [v.id]: e.target.checked }))}
                                  className="h-3 w-3 accent-[#014B74]"
                                  aria-label={tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                                />
                                <BellRing className="h-3 w-3" aria-hidden />
                                {tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                              </label>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-end text-ink-2 tabular-nums">{v.soldCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {detail.priceHistory.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.priceHistory}</h4>
                  <ul className="space-y-1">
                    {detail.priceHistory.slice(0, 5).map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        <span className="font-mono bdi" dir="ltr">{h.variantSku}</span>
                        {h.oldPriceMinor !== null && h.oldPriceMinor !== h.newPriceMinor ? (
                          <span className="bdi">{formatMoney(h.oldPriceMinor, locale)} → <span className="font-semibold text-ink-2">{formatMoney(h.newPriceMinor, locale)}</span></span>
                        ) : (
                          <span className="bdi">{h.reason ?? '—'}</span>
                        )}
                        <span className="ms-auto">{formatDateTime(h.effectiveAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Content editor (EN/FA) ── */}
              <div className="border-t border-line pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{t.admin.contentTitle}</h3>
                  <div className="flex items-center gap-2">
                    <div role="tablist" aria-label={t.admin.contentTitle} className="flex rounded-md border border-line p-0.5">
                      {(['en', 'fa'] as const).map((loc) => (
                        <button
                          key={loc} type="button" role="tab" aria-selected={contentTab === loc}
                          onClick={() => setContentTab(loc)}
                          className={cn(
                            'rounded px-3 py-1 text-xs font-semibold transition',
                            contentTab === loc ? 'bg-brand text-white shadow-sm' : 'text-ink-3 hover:text-ink',
                          )}
                        >
                          {loc === 'en' ? 'English' : 'فارسی'}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="h-8" disabled={saving || !contentPatch()} onClick={saveContent}>
                      {saving ? t.common.saving : t.admin.contentSave}
                    </Button>
                  </div>
                </div>
                {(['en', 'fa'] as const).map((loc) => {
                  const orig = detail.translations[loc]
                  const draft = contentEdits[loc]
                  const dirty = contentPatch() !== null
                  if (contentTab !== loc) return null
                  if (!orig) {
                    return (
                      <div key={loc} className="rounded-md border border-line bg-soft/40 p-4 text-sm text-ink-3">
                        {t.admin.contentMissingLocale}
                      </div>
                    )
                  }
                  return (
                    <div key={loc} className={cn('grid gap-3 rounded-md border p-3 transition-colors', dirty ? 'border-brand/30 bg-brand-soft/30' : 'border-line bg-soft/40')}>
                      <div>
                        <Label htmlFor={`ct-title-${loc}`} className="mb-1 text-xs">{t.admin.contentTitleField}</Label>
                        <Input
                          id={`ct-title-${loc}`} value={draft.title} maxLength={300}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], title: e.target.value } }))}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`ct-sub-${loc}`} className="mb-1 text-xs">{t.admin.contentSubtitleField}</Label>
                        <Input
                          id={`ct-sub-${loc}`} value={draft.subtitle} maxLength={300}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], subtitle: e.target.value } }))}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`ct-desc-${loc}`} className="mb-1 text-xs">{t.admin.contentDescField}</Label>
                        <textarea
                          id={`ct-desc-${loc}`} value={draft.shortDescription} rows={3} maxLength={1000}
                          dir={loc === 'fa' ? 'rtl' : 'ltr'} lang={loc}
                          onChange={(e) => setContentEdits((s) => ({ ...s, [loc]: { ...s[loc], shortDescription: e.target.value } }))}
                          className="flex w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        />
                      </div>
                      <p className="text-[11px] text-ink-3">{t.admin.contentDirtyHint}</p>
                    </div>
                  )
                })}
              </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BulkStockDialog
        open={bulkOpen}
        productIds={selectedIds}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) setSelected(new Set()) }}
        onApplied={(n) => { load(); toast({ title: tf(t.admin.bulkApplied, { n }) }) }}
      />

      <ImportProductsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(n) => { load(); toast({ title: tf(t.admin.importProductsApplied, { n }) }) }}
      />

      {/* Full product editor — create + edit with media upload, categories, contributors, variants, related, SEO (Task 27-f) */}
      <FullProductEditor
        productId={fullEdit}
        open={fullOpen}
        onClose={() => setFullOpen(false)}
        onSaved={(id) => { setFullOpen(false); setPage(1); load(); if (id) openEditorRefresh(id) }}
      />

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
          <span>{tf(t.admin.pageInfo, { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total: String(total) })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t.admin.pagePrev}</Button>
            <span className="tabular-nums">{page} / {Math.ceil(total / PAGE_SIZE)}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>{t.admin.pageNext}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Multi-product stock editor: one dialog, per-variant steppers, one audited batch.
 *  Out-of-stock variants with waiting subscribers get a "notify on restock" toggle
 *  (default on) — positive deltas on those variants ping their waiters in the same tx. */
function BulkStockDialog({ open, productIds, onOpenChange, onApplied }: {
  open: boolean
  productIds: string[]
  onOpenChange: (o: boolean) => void
  onApplied: (n: number) => void
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [groups, setGroups] = useState<{ product: ProductEditorData }[] | null>(null)
  const [deltas, setDeltas] = useState<Record<string, { delta: number; stock: number; sku: string; waiting: number }>>({})
  const [notifyOn, setNotifyOn] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || productIds.length === 0) { setGroups(null); setDeltas({}); setNotifyOn({}); return }
    let alive = true
    setGroups(null)
    Promise.all(productIds.map((id) => apiGet<{ product: ProductEditorData }>(`/api/admin/products/${id}`)))
      .then((rs) => { if (alive) setGroups(rs) })
      .catch(() => { if (alive) setGroups([]) })
    return () => { alive = false }
  }, [open, productIds])

  const bump = (v: VariantRow, delta: number) => {
    setDeltas((d) => {
      const next = Math.max(-v.stock, (d[v.id]?.delta ?? 0) + delta)
      if (next === 0) {
        const rest = { ...d }
        delete rest[v.id]
        return rest
      }
      return { ...d, [v.id]: { delta: next, stock: v.stock, sku: v.sku, waiting: v.waitingCount ?? 0 } }
    })
  }

  const apply = async () => {
    const adjustments = Object.entries(deltas).map(([variantId, d]) => ({ variantId, delta: d.delta }))
    if (adjustments.length === 0) return
    const notifyVariantIds = Object.entries(deltas)
      .filter(([variantId, d]) => d.delta > 0 && d.stock === 0 && d.waiting > 0 && (notifyOn[variantId] ?? true))
      .map(([variantId]) => variantId)
    setBusy(true)
    try {
      const res = await apiPost<{ updated: { variantId: string }[]; notified: { count: number }[] }>('/api/admin/products/bulk-stock', {
        adjustments,
        ...(notifyVariantIds.length > 0 ? { notifyVariantIds } : {}),
      })
      const notifiedTotal = (res.notified ?? []).reduce((s, n) => s + n.count, 0)
      onApplied(adjustments.length)
      if (notifiedTotal > 0) toast({ title: tf(t.admin.notifiedAll, { n: notifiedTotal }) })
      onOpenChange(false)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const pending = Object.keys(deltas).length

  // ── CSV export: current stock of every loaded variant ──
  const exportCsv = () => {
    if (!groups) return
    const rows: string[][] = [['sku', 'title', 'format', 'current_stock', 'new_stock']]
    for (const { product } of groups) {
      const title = product.translations.en?.title ?? product.slug
      for (const v of product.variants) {
        rows.push([v.sku, title, v.format, String(v.stock), String(v.stock)])
      }
    }
    const csv = rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `persepix-stock-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV import: stage deltas from sku,new_stock rows ──
  const importCsv = async (file: File) => {
    if (!groups) return
    let text = ''
    try { text = await file.text() } catch { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
    const skuIdx = header.indexOf('sku')
    const stockIdx = header.indexOf('new_stock')
    if (skuIdx === -1 || stockIdx === -1) { toast({ title: t.admin.bulkImportBad, variant: 'destructive' }); return }

    const bySku = new Map<string, VariantRow>()
    for (const { product } of groups) for (const v of product.variants) bySku.set(v.sku.toLowerCase(), v)

    let matched = 0
    let skipped = 0
    const staged: NonNullable<typeof deltas> = {}
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line)
      const sku = (cells[skuIdx] ?? '').trim().toLowerCase()
      const newStock = Number.parseInt((cells[stockIdx] ?? '').trim(), 10)
      const variant = bySku.get(sku)
      if (!variant || !Number.isFinite(newStock) || newStock < 0) { skipped++; continue }
      const delta = Math.max(-variant.stock, newStock - variant.stock)
      if (delta === 0) continue // unchanged — nothing to stage
      staged[variant.id] = { delta, stock: variant.stock, sku: variant.sku, waiting: variant.waitingCount ?? 0 }
      matched++
    }
    if (matched > 0) setDeltas((d) => ({ ...d, ...staged }))
    toast({ title: tf(t.admin.bulkImported, { n: lines.length - 1, m: matched, k: skipped }) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" style={{ maxWidth: '42rem' }} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand"><Layers className="h-4 w-4" aria-hidden /></span>
            {t.admin.bulkTitle}
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{tf(t.admin.bulkSelected, { n: productIds.length })}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-3">{t.admin.bulkHint}</p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv} disabled={!groups} aria-label={t.admin.bulkExport}>
              <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.bulkExport}
            </Button>
            <label className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground',
              !groups && 'pointer-events-none opacity-50',
            )} aria-label={t.admin.bulkImport}>
              <Upload className="h-3.5 w-3.5" aria-hidden />{t.admin.bulkImport}
              <input
                type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importCsv(f)
                  e.target.value = '' // allow re-importing the same file
                }}
              />
            </label>
          </div>
        </div>
        <p className="-mt-1 font-mono text-[10.5px] text-ink-3 bdi" dir="ltr">{t.admin.bulkImportHint}</p>
        {!groups ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}</div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">{t.common.error}</p>
        ) : (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pe-1 scrollbar-slim">
            {groups.map(({ product }) => (
              <div key={product.id} className="rounded-md border border-line">
                <p className="border-b border-line bg-soft/60 px-3 py-2 text-sm font-semibold text-ink">{product.translations.en?.title ?? product.slug}</p>
                <ul className="divide-y divide-line">
                  {product.variants.map((v) => {
                    const d = deltas[v.id]
                    const notifyEligible = v.stock === 0 && (v.waitingCount ?? 0) > 0
                    return (
                      <li key={v.id} className={cn('flex items-center gap-3 px-3 py-2 transition-colors', d && 'bg-brand-soft/40')}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{FORMAT_LABEL[v.format] ?? v.format}</p>
                          <p className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{v.sku}</p>
                          {notifyEligible && (
                            <label className={cn(
                              'mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition',
                              d && d.delta > 0 && (notifyOn[v.id] ?? true)
                                ? 'border-success/40 bg-success/10 text-success'
                                : 'border-line text-ink-3',
                            )}>
                              <Checkbox
                                checked={notifyOn[v.id] ?? true}
                                onCheckedChange={(val) => setNotifyOn((n) => ({ ...n, [v.id]: val === true }))}
                                className="h-3 w-3"
                                aria-label={tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                              />
                              <BellRing className="h-3 w-3" aria-hidden />
                              {tf(t.admin.notifyWaiting, { n: v.waitingCount ?? 0 })}
                            </label>
                          )}
                        </div>
                        <span className="text-sm tabular-nums text-ink-2" aria-live="polite">
                          {v.stock + (d?.delta ?? 0)}
                          {d && <span className={cn('ms-1 text-[11px] font-semibold', d.delta > 0 ? 'text-success' : 'text-error')}>({d.delta > 0 ? `+${d.delta}` : d.delta})</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => bump(v, -1)} disabled={!!d && d.delta <= -v.stock} aria-label={`−1 ${v.sku}`} className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft disabled:opacity-30"><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                          <button type="button" onClick={() => bump(v, 1)} aria-label={`+1 ${v.sku}`} className="flex h-7 w-7 items-center justify-center rounded border border-line text-ink-2 hover:bg-soft"><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                          <button type="button" onClick={() => bump(v, 10)} aria-label={`+10 ${v.sku}`} className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-soft">+10</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-9" onClick={() => onOpenChange(false)}>{t.admin.close}</Button>
          <Button size="sm" className="h-9" disabled={busy || pending === 0} onClick={apply}>
            {busy ? t.common.saving : `${t.admin.bulkApply}${pending > 0 ? ` (${pending})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Minimal CSV line parser (quoted fields, escaped quotes, comma-separated). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const IMPORT_TEMPLATE = [
  'slug,title_en,title_fa,price_eur,stock,sku,format,status,category,cover_url,authors',
  'the-winter-catalogue,"The Winter Catalogue","کاتالوگ زمستان",24.00,12,,PAPERBACK,PUBLISHED,fiction,,neda-ahmadi',
  'letters-from-the-alborz,"Letters from the Alborz","",18.50,3,SP-ALBORZ,HARDCOVER,DRAFT,poetry,,shirin-golzar;martin-ellison',
].join('\n')

/** CSV product import: paste or pick a .csv, preview parsed rows client-side,
 *  then POST the raw CSV — the server re-validates authoritatively, creates the
 *  products (+ one default variant each) in one transaction and reports skips. */
function ImportProductsDialog({ open, onOpenChange, onImported }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImported: (n: number) => void
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [skips, setSkips] = useState<{ row: number; reason: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // Known person slugs for the authors column — loaded once when the dialog opens.
  const [knownSlugs, setKnownSlugs] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    apiGet<{ people: { slug: string }[] }>('/api/admin/people')
      .then((r) => setKnownSlugs(r.people.map((p) => p.slug)))
      .catch(() => setKnownSlugs([]))
  }, [open])

  const rows = useMemo(() => parseImportPreview(csv, knownSlugs), [csv, knownSlugs])
  const readyCount = rows.filter((r) => !r.error).length

  const pickFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setCsv(String(reader.result ?? '')); setSkips([]) }
    reader.readAsText(file)
  }

  const apply = async () => {
    if (readyCount === 0 || busy) return
    setBusy(true)
    try {
      const r = await apiPost<{ created: { id: string }[]; skipped: { row: number; reason: string }[] }>('/api/admin/products/import', { csv })
      setSkips(r.skipped)
      if (r.created.length > 0) onImported(r.created.length)
      if (r.created.length > 0 && r.skipped.length === 0) {
        setCsv('')
        onOpenChange(false)
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.admin.importProductsBad, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSkips([]) }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" style={{ maxWidth: '42rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
              <FileUp className="h-4 w-4" aria-hidden />
            </span>
            {t.admin.importProductsTitle}
          </DialogTitle>
        </DialogHeader>

        <p className="-mt-1 text-xs leading-relaxed text-ink-3">{t.admin.importProductsHint}</p>

        {/* Column reference — mono, LTR always */}
        <div dir="ltr" className="rounded-md border border-brand/20 bg-brand-soft/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-brand">
          {t.admin.importProductsDoc}
        </div>

        {/* Toolbar: file picker + template */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" aria-hidden />{t.admin.importProductsEdit}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-ink-3" onClick={() => {
            const blob = new Blob(['\uFEFF' + IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'persepix-product-import-template.csv'
            a.click()
            URL.revokeObjectURL(a.href)
          }}>
            <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.importProductsTemplate}
          </Button>
        </div>

        {/* Paste area */}
        <div>
          <Label htmlFor="import-csv" className="text-xs">{t.admin.importProductsPaste}</Label>
          <textarea
            id="import-csv" dir="ltr" rows={4} spellCheck={false}
            value={csv} onChange={(e) => { setCsv(e.target.value); setSkips([]) }}
            placeholder={'slug,title_en,price_eur,authors\nmy-next-book,"My Next Book",21.00,neda-ahmadi'}
            className="mt-1.5 flex w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          />
          {knownSlugs.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              {t.admin.importProductsAuthorsHint}{' '}
              <span className="font-mono text-[10px] text-ink-2 bdi" dir="ltr">{knownSlugs.slice(0, 6).join(' · ')}{knownSlugs.length > 6 ? ' …' : ''}</span>
            </p>
          )}
        </div>

        {/* Preview table */}
        {csv.trim() ? (
          rows.length === 0 ? (
            <p className="rounded-md border border-orange-accent/30 bg-orange-accent/5 px-3 py-2 text-xs font-medium text-orange-dark" role="alert">
              {t.admin.importProductsBad}
            </p>
          ) : (
            <div>
              <p className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink">
                <span>{t.admin.importProductsPreview}</span>
                <span className="font-normal text-ink-3 bdi" dir="ltr">
                  {readyCount}/{rows.length}
                </span>
              </p>
              <div className="max-h-60 overflow-y-auto rounded-md border border-line" dir="ltr">
                <table className="w-full text-start text-xs">
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.line} className={cn('transition-colors', r.error || r.authorsError ? 'bg-orange-accent/[0.07]' : 'bg-success/[0.05]')}>
                        <td className="px-2.5 py-2 font-mono text-[11px] text-ink-3">{r.line}</td>
                        <td className="max-w-44 px-2 py-2">
                          <span className="block truncate font-medium text-ink">{r.title || '—'}</span>
                          {r.titleFa && <span className="block truncate text-[11px] text-ink-3" lang="fa" dir="rtl">{r.titleFa}</span>}
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] text-ink-3">{r.slug || '—'}</td>
                        <td className="px-2 py-2 bdi" dir="ltr">{r.price || '—'}</td>
                        <td className="px-2 py-2 text-end bdi" dir="ltr">{r.stock || '0'}</td>
                        <td className="max-w-40 px-2 py-2">
                          {r.authors ? (
                            <span
                              className={cn('block truncate font-mono text-[11px]', r.authorsError ? 'text-orange-dark' : 'text-ink-2')}
                              title={r.authorsError ?? r.authors}
                            >
                              {r.authors}
                            </span>
                          ) : (
                            <span className="text-[11px] text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-end">
                          {r.error || r.authorsError ? (
                            <span className="inline-flex items-center rounded-full bg-orange-accent/15 px-2 py-0.5 text-[10px] font-bold text-orange-dark" title={r.error ?? r.authorsError}>?</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                              <Check className="h-2.5 w-2.5" aria-hidden />{t.admin.importProductsOk}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <p className="rounded-md border border-dashed border-line bg-soft/50 px-3 py-3 text-center text-xs text-ink-3">
            {t.admin.importProductsEmpty}
          </p>
        )}

        {/* Skipped rows report (after server apply) */}
        {skips.length > 0 && (
          <div className="rounded-md border border-orange-accent/30 bg-orange-accent/5 px-3 py-2">
            <p className="text-xs font-semibold text-orange-dark">{tf(t.admin.importProductsSkipped, { n: skips.length })}</p>
            <ul className="mt-1 space-y-0.5">
              {skips.slice(0, 6).map((s) => (
                <li key={s.row} className="text-[11px] text-ink-2 bdi" dir="ltr">
                  row {s.row}: {s.reason}
                </li>
              ))}
              {skips.length > 6 && <li className="text-[11px] text-ink-3">…</li>}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => onOpenChange(false)}>{t.nav.close}</Button>
          <Button size="sm" className="h-9 gap-1.5" disabled={busy || readyCount === 0} onClick={apply}>
            <FileUp className="h-4 w-4" aria-hidden />
            {busy ? t.common.saving : tf(t.admin.importProductsApply, { n: readyCount })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Light client-side preview for the import dialog (server stays authoritative).
 *  knownSlugs powers the authors-column check: unknown slugs turn the row orange
 *  with a nearest-match hint so typos surface before the import runs. */
function parseImportPreview(csv: string, knownSlugs: string[]): { line: number; slug: string; title: string; titleFa: string; price: string; stock: string; authors: string; authorsError?: string; error?: string }[] {
  const trimmed = csv.trim()
  if (!trimmed) return []
  const grid = trimmed.split(/\r?\n/).filter((l) => l.trim() !== '').map(parseCsvLine)
  if (grid.length < 2) return []
  const header = grid[0].map((h) => h.trim().toLowerCase())
  const ci = (name: string) => header.indexOf(name)
  if (ci('title_en') < 0 || ci('price_eur') < 0) {
    return grid.slice(1).map((_, i) => ({ line: i + 2, slug: '', title: '', titleFa: '', price: '', stock: '', authors: '', error: 'header' }))
  }
  const nearestSlug = (raw: string): string | undefined => {
    const s = raw.toLowerCase()
    return knownSlugs.find((k) => k.startsWith(s.slice(0, 4)) || s.startsWith(k.slice(0, 4)) || k.includes(s))
  }
  return grid.slice(1).map((cells, i) => {
    const get = (n: string) => (ci(n) >= 0 ? (cells[ci(n)] ?? '').trim() : '')
    const title = get('title_en')
    const priceRaw = get('price_eur')
    const slug = (get('slug') || title)
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const price = Number(priceRaw.replace(',', '.').replace(/[^\d.]/g, ''))
    let error: string | undefined
    if (!title) error = 'title_en'
    else if (!Number.isFinite(price) || price <= 0) error = 'price_eur'
    else if (slug.length < 2) error = 'slug'
    // Authors cell (client-side hint only — the server re-checks against the DB)
    const authorsRaw = get('authors')
    let authorsError: string | undefined
    if (authorsRaw && knownSlugs.length > 0) {
      const slugs = authorsRaw.split(';').map((s) => s.trim()).filter(Boolean)
      const unknown = slugs.filter((s) => !knownSlugs.includes(s.toLowerCase()))
      if (unknown.length > 0) {
        const hint = nearestSlug(unknown[0])
        authorsError = `“${unknown[0]}”${hint ? ` → ${hint}` : ''}`
      }
    }
    return { line: i + 2, slug, title, titleFa: get('title_fa'), price: priceRaw, stock: get('stock'), authors: authorsRaw, authorsError, error }
  })
}

interface AdminOrder { id: string; orderNumber: string; email: string; status: string; totalMinor: number; createdAt: string; fulfillmentStatus: string }

function AdminOrders() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [carrier, setCarrier] = useState('Austria Post')
  const [tracking, setTracking] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const user = useApp((s) => s.user)
  const PAGE_SIZE = 20

  const load = useCallback(() => {
    apiGet<{ items: AdminOrder[]; total: number }>(`/api/admin/orders?page=${page}&pageSize=${PAGE_SIZE}` + (statusFilter ? `&status=${statusFilter}` : '') + (q ? `&q=${encodeURIComponent(q)}` : ''))
      .then((r) => { setOrders(r.items); setTotal(r.total ?? r.items.length) }).catch(() => setOrders([]))
  }, [q, statusFilter, page])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [q, statusFilter])

  const open = async (id: string) => {
    const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
    setDetail(r.order)
    setNote(String((r.order.internalNote as string) ?? ''))
  }
  // Escape closes the hand-rolled dialog (audit UX: it used to trap the keyboard).
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const ship = async (id: string) => {
    try {
      await apiPost(`/api/admin/orders/${id}/ship`, { carrier, trackingNumber: tracking || undefined })
      toast({ title: t.admin.shippedOk })
      setDetail(null); setTracking('')
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  const refund = async (id: string, total: number) => {
    try {
      await apiPost(`/api/admin/orders/${id}/refund`, { amountMinor: Math.round(Number(refundAmount) * 100) || total, reason: refundReason || undefined })
      toast({ title: t.admin.refundOk })
      setDetail(null); setRefundAmount(''); setRefundReason('')
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  /** Stage approval — writes the REAL order status + an OrderEvent row, which
   *  is exactly what the customer dashboard timeline renders (user requirement:
   *  the timeline must be backend-driven, not visual-only). */
  const advance = async (id: string, status: 'PROCESSING' | 'DELIVERED') => {
    try {
      await apiPatch(`/api/admin/orders/${id}`, { status })
      toast({ title: status === 'PROCESSING' ? t.admin.startProcessing : t.admin.markDelivered })
      const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
      setDetail(r.order)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  /** Cancel (audit P1: the API matrix always allowed it — the button was missing).
   *  Server restores stock and the timeline shows CANCELLED to the customer. */
  const cancelOrder = async (id: string) => {
    if (!window.confirm(t.admin.cancelConfirm)) return
    setCancelBusy(true)
    try {
      await apiPatch(`/api/admin/orders/${id}`, { status: 'CANCELLED' })
      toast({ title: t.admin.orderCancelled })
      const r = await apiGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${id}`)
      setDetail(r.order)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setCancelBusy(false) }
  }
  const saveNote = async (id: string) => {
    setNoteBusy(true)
    try {
      await apiPatch(`/api/admin/orders/${id}`, { noteInternal: note.trim() || null })
      toast({ title: t.admin.noteSaved })
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setNoteBusy(false) }
  }

  if (!orders) return <Spinner label={t.common.loading} />
  const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']
  const payments = (detail?.payments as { id: string; provider: string; amountMinor: number; status: string; cardBrand: string | null; cardLast4: string | null; failureReason: string | null; createdAt: string }[] | undefined) ?? []
  const refunds = (detail?.refunds as { id: string; amountMinor: number; reason: string | null; status: string; createdAt: string }[] | undefined) ?? []
  const returns = (detail?.returns as { id: string; status: string; reason: string; resolution: string | null; createdAt: string }[] | undefined) ?? []
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t.admin.orders}</h2>
        <Input placeholder="SP2612130011 / SP-26-12-13-0011 / email / phone" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-72" />
      </div>
      {/* Status filter chips (audit: the API filter existed, the UI never used it) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setStatusFilter('')} className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === '' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
          {t.admin.filterAll}
        </button>
        {ORDER_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-brand bdi" dir="ltr">{o.orderNumber}</span>
              <button
                type="button"
                title={`${t.admin.copyCustomerCode}: ${compactOrderNumber(o.orderNumber)}`}
                aria-label={`${t.admin.copyCustomerCode} ${compactOrderNumber(o.orderNumber)}`}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-3 transition hover:bg-soft hover:text-brand"
                onClick={(e) => {
                  e.stopPropagation()
                  void navigator.clipboard?.writeText(compactOrderNumber(o.orderNumber))
                }}
              >
                <Copy className="h-3 w-3" aria-hidden />
              </button>
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
            <Badge tone={o.status === 'PAID' || o.status === 'DELIVERED' ? 'success' : o.status === 'PENDING_PAYMENT' ? 'warning' : o.status === 'REFUNDED' ? 'default' : 'brand'}>{o.status}</Badge>
            <span className="text-xs text-ink-3">{formatDate(o.createdAt, locale)}</span>
            <span className="font-semibold text-ink bdi">{formatMoney(o.totalMinor, locale)}</span>
            <Button size="sm" variant="outline" className="h-8" onClick={() => open(o.id)}>{t.admin.view}</Button>
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-3">
          <span>{tf(t.admin.pageInfo, { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total: String(total) })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t.admin.pagePrev}</Button>
            <span className="tabular-nums">{page} / {Math.ceil(total / PAGE_SIZE)}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>{t.admin.pageNext}</Button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t.admin.orders} onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 scrollbar-slim" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-ink bdi" dir="ltr">{String(detail.orderNumber)}</h3>
              <button
                type="button"
                title={`${t.admin.copyCustomerCode}: ${compactOrderNumber(String(detail.orderNumber))}`}
                aria-label={`${t.admin.copyCustomerCode} ${compactOrderNumber(String(detail.orderNumber))}`}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition hover:bg-soft hover:text-brand"
                onClick={() => void navigator.clipboard?.writeText(compactOrderNumber(String(detail.orderNumber)))}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetail(null)}>✕</Button>
            </div>
            <p className="mt-1 text-sm text-ink-3 bdi" dir="ltr">{String(detail.email)}</p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <p className="mb-1 font-semibold">{t.checkout.step2}</p>
                <p className="text-ink-2">{String((detail.shippingAddress as Record<string, string>)?.recipient)}</p>
                <p className="text-ink-3 bdi">{String((detail.shippingAddress as Record<string, string>)?.line1)}, {String((detail.shippingAddress as Record<string, string>)?.postalCode)} {String((detail.shippingAddress as Record<string, string>)?.city)}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="mb-1 font-semibold">{t.common.total}</p>
                <p className="text-xl font-bold bdi">{formatMoney(Number(detail.totalMinor), locale)}</p>
                <p className="text-xs text-ink-3">{String(detail.paymentStatus)} · {String(detail.fulfillmentStatus)}</p>
                {Number(detail.discountMinor) > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                    <Tag className="h-3 w-3" aria-hidden />{String(detail.discountCode ?? '')} −{formatMoney(Number(detail.discountMinor), locale)}
                  </p>
                )}
                {detail.giftWrap === true && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-orange-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-accent">
                    <Gift className="h-3 w-3" aria-hidden />{t.admin.giftWrapCol}{Number(detail.giftWrapMinor) > 0 ? ` · ${formatMoney(Number(detail.giftWrapMinor), locale)}` : ''}
                  </p>
                )}
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
              {(detail.items as { title: string; quantity: number; totalMinor: number }[]).map((it, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span>{it.title} × {it.quantity}</span>
                  <span className="bdi">{formatMoney(it.totalMinor, locale)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Stage approval row — PAID → PROCESSING → (ship) → SHIPPED → DELIVERED.
                  Each action persists a status transition + timeline event. */}
              <div className="space-y-2 rounded-lg border border-line p-3 sm:col-span-2">
                <p className="text-sm font-semibold">{t.account.timeline}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {detail.status === 'PENDING_PAYMENT' && <Badge tone="warning">{String(detail.status)}</Badge>}
                  {detail.status === 'PAID' && (
                    <Button size="sm" className="h-8" onClick={() => advance(String(detail.id), 'PROCESSING')}>
                      {t.admin.startProcessing}
                    </Button>
                  )}
                  {detail.status === 'PROCESSING' && (
                    <p className="text-xs text-ink-3">{t.admin.fulfill} ↓ — {t.admin.ship} → SHIPPED</p>
                  )}
                  {detail.status === 'SHIPPED' && (
                    <Button size="sm" variant="outline" className="h-8 border-brand/40 text-brand hover:bg-brand/10" onClick={() => advance(String(detail.id), 'DELIVERED')}>
                      {t.admin.markDelivered}
                    </Button>
                  )}
                  {['DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(String(detail.status)) && (
                    <Badge tone={detail.status === 'DELIVERED' ? 'success' : 'default'}>{String(detail.status)}</Badge>
                  )}
                  {['PENDING_PAYMENT', 'PAID', 'PROCESSING'].includes(String(detail.status)) && (
                    <Button size="sm" variant="ghost" className="ms-auto h-8 text-error hover:bg-error/10" disabled={cancelBusy} onClick={() => cancelOrder(String(detail.id))}>
                      <Ban className="h-3.5 w-3.5" aria-hidden />{t.admin.cancelOrder}
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{t.admin.fulfill}</p>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={t.admin.carrier} className="h-9" />
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t.admin.tracking} dir="ltr" className="h-9" />
                <Button size="sm" className="w-full" onClick={() => ship(String(detail.id))}>{t.admin.ship}</Button>
              </div>
              {user?.role === 'OWNER' && (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <p className="text-sm font-semibold">{t.admin.refund}</p>
                  <Input type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={t.admin.amount} className="h-9" />
                  <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t.admin.reasonCol} className="h-9" />
                  <Button size="sm" variant="outline" className="w-full border-error/40 text-error hover:bg-error/10" onClick={() => refund(String(detail.id), Number(detail.totalMinor))}>{t.admin.refund}</Button>
                </div>
              )}
            </div>

            {/* Payments / refunds / returns — the API always returned these, the dialog threw them away (audit). */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="mb-2 font-semibold">{t.admin.payments}</p>
                {payments.length === 0 ? <p className="text-xs text-ink-3">{t.admin.noPaymentData}</p> : (
                  <ul className="space-y-2">
                    {payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'error' : 'default'}>{p.status}</Badge>
                        <span className="font-semibold text-ink bdi">{formatMoney(p.amountMinor, locale)}</span>
                        <span className="text-ink-3 bdi" dir="ltr">{p.provider}</span>
                        {p.cardBrand && p.cardLast4 && <span className="text-ink-3 bdi" dir="ltr">{p.cardBrand} ••••{p.cardLast4}</span>}
                        {p.failureReason && <span className="text-error bdi" dir="ltr">{p.failureReason}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(p.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="mb-2 font-semibold">{t.admin.refunds}</p>
                {refunds.length === 0 ? <p className="text-xs text-ink-3">—</p> : (
                  <ul className="space-y-2">
                    {refunds.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                        <Badge tone={r.status === 'SUCCEEDED' ? 'success' : 'error'}>{r.status}</Badge>
                        <span className="font-semibold text-error bdi">−{formatMoney(r.amountMinor, locale)}</span>
                        {r.reason && <span className="text-ink-3">{r.reason}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(r.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {returns.length > 0 && (
                <div className="rounded-lg border border-line p-3 text-sm sm:col-span-2">
                  <p className="mb-2 font-semibold">{t.admin.returns}</p>
                  <ul className="space-y-2">
                    {returns.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                        <Badge tone={r.status === 'REQUESTED' ? 'warning' : r.status === 'REJECTED' ? 'error' : 'success'}>{r.status}</Badge>
                        <span className="text-ink-2">{r.reason}</span>
                        {r.resolution && <span className="text-ink-3">{t.admin.resolution}: {r.resolution}</span>}
                        <span className="ms-auto text-ink-3">{formatDateTime(r.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-line p-3 sm:col-span-2">
                <p className="mb-2 text-sm font-semibold">{t.admin.internalNote}</p>
                <textarea
                  value={note} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t.admin.notePlaceholder}
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" className="h-8" disabled={noteBusy} onClick={() => saveNote(String(detail.id))}>{noteBusy ? t.common.saving : t.admin.saveNote}</Button>
                </div>
              </div>
            </div>
            {(detail.events as { type: string; message: string; createdAt: string }[])?.length > 0 && (
              <div className="mt-4 rounded-lg border border-line p-3">
                <p className="mb-2 text-sm font-semibold">{t.account.timeline}</p>
                <ol className="space-y-1.5">
                  {(detail.events as { type: string; message: string; createdAt: string }[]).map((ev, i) => (
                    <li key={i} className="text-xs text-ink-3"><span className="font-medium text-ink-2">{formatDateTime(ev.createdAt, locale)}</span> — {ev.message}</li>
                  ))}
                </ol>
              </div>
            )}
            {detail.giftWrap === true && typeof detail.giftMessage === 'string' && detail.giftMessage && (
              <div className="mt-4 rounded-lg border border-dashed border-orange-accent/40 bg-orange-accent/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-accent"><Gift className="h-4 w-4" aria-hidden />{t.admin.giftMessageCol}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">“{String(detail.giftMessage)}”</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


/* ───────────────────────── Admin: discount codes ───────────────────────── */

interface DiscountRow {
  id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number
  minSubtotalMinor: number; maxRedemptions: number | null; timesUsed: number
  paidOrders: number; givenAwayMinor: number
  startsAt: string | null; endsAt: string | null; isActive: boolean
  noteEn: string | null; noteFa: string | null; createdAt: string
  scope?: DiscountScope
  scopeResolved?: ScopeSel
}

/** Task 50 — discount eligibility scope. Empty lists = whole catalog. */
interface DiscountScope {
  productIds: string[]; categoryIds: string[]; publisherNames: string[]; personIds: string[]
}

/** Labelled scope entries (ids resolved to names for display/editing). */
interface ScopeLabel { id: string; en: string; fa: string }
interface ScopeSel {
  products: ScopeLabel[]; categories: ScopeLabel[]; publishers: ScopeLabel[]; people: ScopeLabel[]
}

const emptyScopeSel = (): ScopeSel => ({ products: [], categories: [], publishers: [], people: [] })

const scopeSelIsLimited = (s: ScopeSel): boolean =>
  s.products.length > 0 || s.categories.length > 0 || s.publishers.length > 0 || s.people.length > 0

/** ScopeSel → API payload (ids only). */
const scopeSelToPayload = (s: ScopeSel): DiscountScope => ({
  productIds: s.products.map((x) => x.id),
  categoryIds: s.categories.map((x) => x.id),
  publisherNames: s.publishers.map((x) => x.id),
  personIds: s.people.map((x) => x.id),
})

const scopePayloadToSel = (resolved?: ScopeSel): ScopeSel => ({
  products: resolved?.products ?? [],
  categories: resolved?.categories ?? [],
  publishers: resolved?.publishers ?? [],
  people: resolved?.people ?? [],
})

/** Scope editor — pick the products / categories / publishers / contributors a
 *  code applies to. mode='all' (empty payload) or 'limited' (explicit selection;
 *  matches the engine in lib/server/discounts.ts: OR semantics across the lists). */
function DiscountScopeEditor({ mode, onModeChange, value, onChange, publishers }: {
  mode: 'all' | 'limited'
  onModeChange: (m: 'all' | 'limited') => void
  value: ScopeSel
  onChange: (s: ScopeSel) => void
  publishers: string[]
}) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const limited = mode === 'limited'

  // Reference data (admin endpoints include ids + bilingual names)
  const [cats, setCats] = useState<AdminCategoryRow[] | null>(null)
  const [people, setPeople] = useState<{ id: string; nameEn: string | null; nameFa: string | null }[] | null>(null)
  useEffect(() => {
    let alive = true
    apiGet<{ categories: AdminCategoryRow[] }>('/api/admin/categories').then((r) => { if (alive) setCats(r.categories ?? []) }).catch(() => { if (alive) setCats([]) })
    apiGet<{ people: { id: string; nameEn: string | null; nameFa: string | null }[] }>('/api/admin/people').then((r) => { if (alive) setPeople(r.people ?? []) }).catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [])

  // Product search (debounced, like the related picker)
  const [pq, setPq] = useState('')
  const [pResults, setPResults] = useState<{ id: string; title: string; titleFa: string | null }[]>([])
  const [pSearching, setPSearching] = useState(false)
  useEffect(() => {
    if (!limited) return
    const timer = setTimeout(async () => {
      setPSearching(true)
      try {
        const r = await apiGet<{ items: { id: string; title: string; titleFa?: string | null }[] }>(
          `/api/admin/products?locale=en${pq.trim() ? `&q=${encodeURIComponent(pq.trim())}` : ''}`,
        )
        setPResults((r.items ?? []).slice(0, 8).map((p) => ({ id: p.id, title: p.title, titleFa: p.titleFa ?? null })))
      } catch { setPResults([]) } finally { setPSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [limited, pq])

  // People filter (client-side)
  const [personQ, setPersonQ] = useState('')
  const peopleFiltered = useMemo(() => {
    if (!people) return []
    const q = personQ.trim().toLowerCase()
    const base = people.filter((p) => !value.people.some((x) => x.id === p.id))
    if (!q) return base.slice(0, 6)
    return base.filter((p) => (p.nameEn ?? '').toLowerCase().includes(q) || (p.nameFa ?? '').includes(personQ.trim())).slice(0, 6)
  }, [people, personQ, value.people])

  const toggle = (key: 'products' | 'categories' | 'publishers' | 'people', label: ScopeLabel) => {
    const list = value[key]
    onChange({ ...value, [key]: list.some((x) => x.id === label.id) ? list.filter((x) => x.id !== label.id) : [...list, label] })
  }
  const removeAt = (key: 'products' | 'categories' | 'publishers' | 'people', id: string) =>
    onChange({ ...value, [key]: value[key].filter((x) => x.id !== id) })

  const modeBtn = (active: boolean) =>
    cn('h-8 rounded-md px-3 text-xs font-semibold transition-colors', active ? 'bg-brand text-white shadow-sm' : 'bg-white text-ink-2 border border-line hover:bg-soft')

  const chip = (key: 'products' | 'categories' | 'publishers' | 'people', l: ScopeLabel) => (
    <span key={l.id} className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-brand/25 bg-brand-soft/60 py-0.5 pe-1 ps-2 text-xs text-brand">
      <span className="truncate">{isFa ? l.fa || l.en : l.en || l.fa}</span>
      <button type="button" onClick={() => removeAt(key, l.id)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-brand/70 transition hover:bg-brand/15 hover:text-brand" aria-label={`${t.common.delete} ${l.en}`}>
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )

  const sectionCls = 'rounded-md border border-line bg-white/70 p-3'
  const headCls = 'mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3'

  return (
    <div className={cn('rounded-lg border p-3.5 transition-colors', limited ? 'border-brand/35 bg-brand-soft/20' : 'border-line bg-white/50')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-ink">{t.admin.discountScopeTitle}</p>
        <div className="flex items-center gap-1.5" role="group" aria-label={t.admin.discountScopeTitle}>
          <button type="button" className={modeBtn(mode === 'all')} aria-pressed={mode === 'all'} onClick={() => onModeChange('all')}>
            {t.admin.discountScopeAll}
          </button>
          <button type="button" className={modeBtn(limited)} aria-pressed={limited} onClick={() => onModeChange('limited')}>
            {t.admin.discountScopeLimited}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{t.admin.discountScopeHint}</p>

      {limited && (
        <div className="mt-3 space-y-3">
          {scopeSelIsLimited(value) === false && (
            <p className="rounded-md bg-orange-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-orange-dark">{t.admin.discountScopeEmptyWarn}</p>
          )}

          {/* Products — search + chips */}
          <div className={sectionCls}>
            <p className={headCls}><Package className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopeProducts} <span className="text-brand">{value.products.length > 0 && `(${value.products.length})`}</span></p>
            <Input value={pq} onChange={(e) => setPq(e.target.value)} dir="ltr" placeholder={t.admin.discountScopeSearchProducts} className="h-8 text-xs" />
            {pSearching && <p className="mt-1 text-[11px] text-ink-3">…</p>}
            {!pSearching && pResults.length > 0 && (
              <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {pResults.filter((p) => !value.products.some((x) => x.id === p.id)).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle('products', { id: p.id, en: p.title, fa: p.titleFa ?? p.title })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand">
                      <span className="truncate">{p.title}</span>
                      <Plus className="h-3 w-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {value.products.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{value.products.map((l) => chip('products', l))}</div>}
          </div>

          {/* Categories — toggle chips */}
          <div className={sectionCls}>
            <p className={headCls}><Tags className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopeCategories}</p>
            {!cats ? <p className="text-[11px] text-ink-3">…</p> : cats.length === 0 ? <p className="text-[11px] text-ink-3">—</p> : (
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const on = value.categories.some((x) => x.id === c.id)
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle('categories', { id: c.id, en: c.nameEn ?? c.slug, fa: c.nameFa ?? c.nameEn ?? c.slug })} className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition', on ? 'bg-brand text-white shadow-sm' : 'border border-line bg-white text-ink-2 hover:bg-soft')}>
                      {isFa ? c.nameFa ?? c.nameEn ?? c.slug : c.nameEn ?? c.slug}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Publishers — dropdown + chips */}
          <div className={sectionCls}>
            <p className={headCls}><Building2 className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopePublishers}</p>
            {publishers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggle('publishers', { id: e.target.value, en: e.target.value, fa: e.target.value }) }}
                  className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                  aria-label={t.admin.discountScopeSelectPublisher}
                >
                  <option value="">{t.admin.discountScopeSelectPublisher}</option>
                  {publishers.filter((p) => !value.publishers.some((x) => x.id === p)).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {value.publishers.length > 0 && <div className="flex flex-wrap gap-1.5">{value.publishers.map((l) => chip('publishers', l))}</div>}
              </div>
            ) : <p className="text-[11px] text-ink-3">—</p>}
          </div>

          {/* People — searchable + chips */}
          <div className={sectionCls}>
            <p className={headCls}><BookUser className="h-3.5 w-3.5" aria-hidden />{t.admin.discountScopePeople}</p>
            <Input value={personQ} onChange={(e) => setPersonQ(e.target.value)} placeholder={t.admin.discountScopeSearchPeople} className="h-8 text-xs" />
            {!people ? <p className="mt-1 text-[11px] text-ink-3">…</p> : peopleFiltered.length > 0 && (
              <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {peopleFiltered.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle('people', { id: p.id, en: p.nameEn ?? p.id, fa: p.nameFa ?? p.nameEn ?? p.id })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-start text-xs text-ink-2 transition hover:bg-brand-soft/60 hover:text-brand">
                      <span className="truncate">{isFa ? p.nameFa ?? p.nameEn : p.nameEn ?? p.nameFa}</span>
                      <Plus className="h-3 w-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {value.people.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{value.people.map((l) => chip('people', l))}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact scope summary for table rows — «همهٔ کالاها» or labelled chips. */
function DiscountScopeSummary({ sel }: { sel?: ScopeSel }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  if (!sel || !scopeSelIsLimited(sel)) {
    return <span className="text-[11px] text-ink-3">{t.admin.discountScopeAppliesAll}</span>
  }
  const parts: string[] = []
  const name = (l: ScopeLabel) => (isFa ? l.fa || l.en : l.en || l.fa)
  if (sel.products.length > 0) parts.push(sel.products.length === 1 ? name(sel.products[0]) : `${sel.products.length} ${isFa ? 'کالا' : 'products'}`)
  if (sel.categories.length > 0) parts.push(sel.categories.map(name).join('، '))
  if (sel.publishers.length > 0) parts.push(sel.publishers.map(name).join('، '))
  if (sel.people.length > 0) parts.push(sel.people.map(name).join('، '))
  const shown = parts.slice(0, 3)
  const rest = parts.length - shown.length
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      {shown.map((p, i) => (
        <span key={i} className="rounded-full bg-brand-soft/70 px-1.5 py-0.5 font-medium text-brand">{p}</span>
      ))}
      {rest > 0 && <span className="text-ink-3">+{rest}</span>}
    </span>
  )
}

interface PromoRow {
  id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number
  isActive: boolean; startsAt: string | null; endsAt: string | null
  noteEn: string | null; noteFa: string | null; inWindow?: boolean
  excludedProductIds?: string[]
}

interface AdminProductLite {
  id: string; title: string; titleEn: string | null; titleFa: string | null
  priceMinor: number | null; fixedPrice: boolean; status: string
}

/** Per-promotion product exclusion picker — exempted titles keep their list price. */
function PromoExclusionsDialog({ row, onSaved }: { row: PromoRow; onSaved: (ids: string[]) => void }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AdminProductLite[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setSelected(new Set(row.excludedProductIds ?? []))
    apiGet<{ items: AdminProductLite[] }>('/api/admin/products')
      .then((r) => { if (alive) setItems(r.items) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [open, row.id, row.excludedProductIds])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      await apiPatch(`/api/admin/promotions/${row.id}`, { excludedProductIds: [...selected] })
      toast({ title: t.admin.promoExcludedSaved })
      onSaved([...selected])
      setOpen(false)
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const count = row.excludedProductIds?.length ?? 0
  const filtered = (items ?? []).filter((p) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return (p.titleEn ?? '').toLowerCase().includes(needle)
      || (p.titleFa ?? '').includes(needle)
      || p.title.toLowerCase().includes(needle)
  })
  const selectedSorted = [...selected]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className={cn('h-8 gap-1.5', count > 0 ? 'text-orange-dark hover:bg-orange-accent/10' : 'text-ink-3 hover:bg-soft')}
          aria-label={`${t.admin.promoExcludedBtn} — ${row.name}`}
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          {t.admin.promoExcludedBtn}
          {count > 0 && (
            <span className="rounded-full bg-orange-accent/15 px-1.5 py-px text-[10px] font-bold text-orange-dark bdi" dir="ltr">
              {locale === 'fa' ? faDigits(String(count)) : count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><Ban className="h-4 w-4" aria-hidden /></span>
            {t.admin.promoExcluded}
            {count > 0 && (
              <span className="rounded-full bg-orange-accent/15 px-2 py-0.5 text-xs font-semibold text-orange-dark">{tf(t.admin.promoExcludedCount, { n: count })}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-ink-3">{t.admin.promoExcludedHint}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.admin.promoExcludedSearch} className="h-9 ps-8" />
        </div>
        {!items ? (
          <div className="flex items-center gap-2 py-6 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">{t.common.empty}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto pe-1 scrollbar-slim">
            {filtered.map((p) => {
              const checked = selected.has(p.id)
              return (
                <li key={p.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                      checked ? 'border-orange-accent/45 bg-orange-accent/[0.07]' : 'border-line hover:bg-soft/60',
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} className="mt-0" aria-label={p.titleEn ?? p.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{isFa ? p.titleFa ?? p.titleEn ?? p.title : p.titleEn ?? p.title}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        {p.priceMinor != null ? <span className="bdi" dir="ltr">{formatMoney(p.priceMinor, locale)}</span> : null}
                        {p.fixedPrice && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">fixed-price</span>}
                        {p.status !== 'PUBLISHED' && <span>{t.admin.statusDraft}</span>}
                      </span>
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-orange-dark" aria-hidden />}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {items != null && selectedSorted.length === 0 && filtered.length > 0 && (
          <p className="text-[11px] text-ink-3">{t.admin.promoExcludedEmpty}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setOpen(false)}>{t.admin.close}</Button>
          <Button size="sm" className="h-9" disabled={busy || items == null} onClick={save}>
            {busy ? t.common.saving : t.admin.promoExcludedSave}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Sitewide auto promotion manager — one live promotion at a time. */
function AdminPromotionCard() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [rows, setRows] = useState<PromoRow[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [noteEn, setNoteEn] = useState('')
  const [noteFa, setNoteFa] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ promotions: PromoRow[] }>('/api/admin/promotions').then((r) => setRows(r.promotions)).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    const numericValue = Math.round(Number(value) * (type === 'PERCENT' ? 1 : 100))
    if (!name.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
      toast({ title: t.admin.promoFillRequired, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await apiPost('/api/admin/promotions', {
        name: name.trim(), type, value: numericValue,
        isActive: false,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        noteEn: noteEn || null, noteFa: noteFa || null,
      })
      toast({ title: t.admin.promoSaved })
      setName(''); setValue(''); setStartsAt(''); setEndsAt(''); setNoteEn(''); setNoteFa(''); setShowForm(false)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const setActive = async (row: PromoRow, active: boolean) => {
    try {
      await apiPatch(`/api/admin/promotions/${row.id}`, { isActive: active })
      toast({ title: active ? t.admin.promoActivated : t.admin.promoDeactivated })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const remove = async (row: PromoRow) => {
    await apiDelete(`/api/admin/promotions/${row.id}`)
    toast({ title: t.admin.promoDeleted })
    load()
  }

  const fmt = (r: PromoRow) => (r.type === 'PERCENT' ? `${r.value}%` : formatMoney(r.value, locale))
  const live = rows?.find((r) => r.isActive && r.inWindow !== false)

  return (
    <section className="mb-6 rounded-lg border border-orange-accent/25 bg-gradient-to-b from-orange-accent/[0.06] to-transparent p-4" aria-label={t.admin.promoAuto}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-accent/15 text-orange-dark">
            <Megaphone className="h-4.5 w-4.5 mirror-rtl" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">{t.admin.promoAuto}</h3>
            <p className="text-xs text-ink-3">{t.admin.promoAutoHint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
              <span className="bdi" dir="ltr">{fmt(live)}</span> · {t.admin.promoLive}
            </span>
          ) : null}
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
            {showForm ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {t.admin.promoNew}
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          className="mt-4 grid gap-3 rounded-md border border-line bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}
        >
          <div>
            <Label htmlFor="pr-name" className="mb-1 text-xs">{t.admin.promoName}</Label>
            <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" maxLength={80} required />
          </div>
          <div>
            <Label htmlFor="pr-type" className="mb-1 text-xs">{t.admin.discountType}</Label>
            <select id="pr-type" value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
              <option value="PERCENT">{t.admin.discountPercent}</option>
              <option value="FIXED">{t.admin.discountFixed}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="pr-value" className="mb-1 text-xs">{type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
            <Input id="pr-value" type="number" min={type === 'PERCENT' ? 1 : 1} max={type === 'PERCENT' ? 90 : 10000} step={type === 'PERCENT' ? 1 : '0.5'} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" className="h-9" required />
          </div>
          <div>
            <Label htmlFor="pr-starts" className="mb-1 text-xs">{t.admin.promoStarts}</Label>
            <Input id="pr-starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} dir="ltr" className="h-9" />
          </div>
          <div>
            <Label htmlFor="pr-ends" className="mb-1 text-xs">{t.admin.promoEnds}</Label>
            <Input id="pr-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} dir="ltr" className="h-9" />
          </div>
          <div>
            <Label htmlFor="pr-note-en" className="mb-1 text-xs">{t.admin.promoNoteEn}</Label>
            <Input id="pr-note-en" value={noteEn} onChange={(e) => setNoteEn(e.target.value)} className="h-9" maxLength={160} placeholder="Autumn sale — 10% off everything" />
          </div>
          <div lang="fa" dir="rtl">
            <Label htmlFor="pr-note-fa" className="mb-1 text-xs">{t.admin.promoNoteFa}</Label>
            <Input id="pr-note-fa" value={noteFa} onChange={(e) => setNoteFa(e.target.value)} className="h-9" maxLength={160} placeholder="فروش پاییزه — ۱۰٪ تخفیف" />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" className="h-9 w-full" disabled={busy}>{busy ? t.common.saving : t.admin.promoSave}</Button>
          </div>
        </form>
      )}

      {!rows ? (
        <div className="mt-4"><Spinner label={t.common.loading} /></div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t.admin.promoNone}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => {
            const now = new Date()
            const expired = r.endsAt != null && new Date(r.endsAt) < now
            const notStarted = r.startsAt != null && new Date(r.startsAt) > now
            const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000))
            return (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-white px-3 py-2.5', !r.isActive && 'opacity-75')}>
                <Switch checked={r.isActive} onCheckedChange={(v) => setActive(r, v)} disabled={expired} aria-label={`${r.name} ${r.isActive ? t.admin.promoDeactivated : t.admin.promoActivate}`} />
                <span className="font-semibold text-ink bdi">{isFa ? r.noteFa ?? r.name : r.noteEn ?? r.name}</span>
                <span className="rounded bg-orange-accent/10 px-1.5 py-0.5 font-mono text-xs font-bold text-orange-dark bdi" dir="ltr">{fmt(r)}</span>
                {notStarted && !expired ? (
                  <Badge tone="warning"><CalendarClock className="me-1 h-3 w-3" aria-hidden />{tf(t.admin.promoStartsIn, { d: daysUntil(r.startsAt!) })}</Badge>
                ) : expired ? (
                  <Badge tone="warning">{t.admin.promoExpired}</Badge>
                ) : r.endsAt ? (
                  <Badge tone="success"><CalendarClock className="me-1 h-3 w-3" aria-hidden />{tf(t.admin.promoEndsIn, { d: daysUntil(r.endsAt) })}</Badge>
                ) : null}
                {r.endsAt ? (
                  <span className="inline-flex items-center gap-1 text-xs text-ink-3"><CalendarClock className="h-3 w-3" aria-hidden />{formatDate(r.endsAt, locale)}</span>
                ) : null}
                <span className="ms-auto flex items-center gap-1">
                  <PromoExclusionsDialog
                    row={r}
                    onSaved={(ids) => setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, excludedProductIds: ids } : x)))}
                  />
                  <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.admin.promoDelete} ${r.name}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Per-code usage list (orders) + CSV export, shown in a dialog. */
function DiscountUsageDialog({ row, trigger }: { row: DiscountRow; trigger: React.ReactNode }) {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ orders: { orderNumber: string; email: string; status: string; paymentStatus: string; discountMinor: number; totalMinor: number; createdAt: string }[]; paidCount: number; givenAwayMinor: number } | null>(null)

  const load = useCallback(() => {
    apiGet<{ orders: { orderNumber: string; email: string; status: string; paymentStatus: string; discountMinor: number; totalMinor: number; createdAt: string }[]; paidCount: number; givenAwayMinor: number }>(`/api/admin/discounts/${row.id}`).then(setData).catch(() => setData(null))
  }, [row.id])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); else setData(null) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl" style={{ maxWidth: '42rem' }} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {t.admin.discountUsageTitle}
            <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-brand bdi" dir="ltr">{row.code}</span>
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <Spinner label={t.common.loading} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
              <span><span className="font-semibold text-ink bdi">{data.paidCount}</span> {t.admin.discountOrders}</span>
              <span>{t.admin.discountGiven}: <span className="font-semibold text-error bdi">−{formatMoney(data.givenAwayMinor, locale)}</span></span>
              <a
                href={`/api/admin/discounts/${row.id}?format=csv`}
                className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-brand transition hover:bg-brand-soft"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />{t.admin.discountUsageExport}
              </a>
            </div>
            {data.orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">{t.admin.discountUsageEmpty}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {data.orders.map((o) => (
                  <li key={o.orderNumber} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="font-mono text-xs font-semibold text-brand bdi" dir="ltr">{o.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-3 bdi" dir="ltr">{o.email}</span>
                    <Badge tone={o.paymentStatus === 'SUCCEEDED' || o.paymentStatus === 'PARTIALLY_REFUNDED' ? 'success' : o.paymentStatus === 'FAILED' ? 'error' : 'warning'}>
                      {o.paymentStatus}
                    </Badge>
                    <span className="font-semibold text-success bdi">−{formatMoney(o.discountMinor, locale)}</span>
                    <span className="w-20 text-end text-xs text-ink-3">{formatDate(o.createdAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AdminDiscounts() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [rows, setRows] = useState<DiscountRow[] | null>(null)
  const [publishers, setPublishers] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  // create form state
  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('')
  const [minEur, setMinEur] = useState('')
  const [maxRed, setMaxRed] = useState('')
  const [noteEn, setNoteEn] = useState('')
  const [noteFa, setNoteFa] = useState('')
  const [scope, setScope] = useState<ScopeSel>(emptyScopeSel())
  const [scopeMode, setScopeMode] = useState<'all' | 'limited'>('all')
  const [busy, setBusy] = useState(false)
  // Edit-after-create (audit P1: the PATCH API always accepted edits — UI never offered them)
  const [editing, setEditing] = useState<DiscountRow | null>(null)
  const [edValue, setEdValue] = useState('')
  const [edMin, setEdMin] = useState('')
  const [edMax, setEdMax] = useState('')
  const [edStarts, setEdStarts] = useState('')
  const [edEnds, setEdEnds] = useState('')
  const [edNoteEn, setEdNoteEn] = useState('')
  const [edNoteFa, setEdNoteFa] = useState('')
  const [edScope, setEdScope] = useState<ScopeSel>(emptyScopeSel())
  const [edScopeMode, setEdScopeMode] = useState<'all' | 'limited'>('all')
  const [edBusy, setEdBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ discounts: DiscountRow[]; publishers?: string[] }>('/api/admin/discounts')
      .then((r) => { setRows(r.discounts); setPublishers(r.publishers ?? []) })
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    const numericValue = Math.round(Number(value) * (type === 'PERCENT' ? 1 : 100))
    if (!code.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
      toast({ title: t.admin.discountFillRequired, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await apiPost('/api/admin/discounts', {
        code: code.trim(),
        type,
        value: numericValue,
        minSubtotalMinor: minEur ? Math.round(Number(minEur) * 100) : 0,
        maxRedemptions: maxRed ? Number(maxRed) : null,
        noteEn: noteEn || null,
        noteFa: noteFa || null,
        scope: scopeMode === 'limited' ? scopeSelToPayload(scope) : { productIds: [], categoryIds: [], publisherNames: [], personIds: [] },
      })
      toast({ title: t.admin.discountCreated })
      setCode(''); setValue(''); setMinEur(''); setMaxRed(''); setNoteEn(''); setNoteFa(''); setScope(emptyScopeSel()); setScopeMode('all'); setShowForm(false)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const toggle = async (row: DiscountRow) => {
    await apiPatch(`/api/admin/discounts/${row.id}`, { isActive: !row.isActive })
    toast({ title: row.isActive ? t.admin.discountDisabled : t.admin.discountEnabled })
    load()
  }

  const remove = async (row: DiscountRow) => {
    // Audit: destructive actions must confirm (order snapshots survive, but still).
    if (!window.confirm(tf(t.admin.confirmDelete, { name: row.code }))) return
    await apiDelete(`/api/admin/discounts/${row.id}`)
    toast({ title: t.admin.discountDeleted })
    load()
  }

  const openEdit = (row: DiscountRow) => {
    setEditing(row)
    setEdValue(row.type === 'PERCENT' ? String(row.value) : (row.value / 100).toFixed(2))
    setEdMin(row.minSubtotalMinor > 0 ? (row.minSubtotalMinor / 100).toFixed(2) : '')
    setEdMax(row.maxRedemptions !== null ? String(row.maxRedemptions) : '')
    setEdStarts(row.startsAt ? row.startsAt.slice(0, 10) : '')
    setEdEnds(row.endsAt ? row.endsAt.slice(0, 10) : '')
    setEdNoteEn(row.noteEn ?? '')
    setEdNoteFa(row.noteFa ?? '')
    setEdScope(scopePayloadToSel(row.scopeResolved))
    setEdScopeMode(row.scope && scopeSelIsLimited(scopePayloadToSel(row.scopeResolved)) ? 'limited' : 'all')
  }

  const saveEdit = async () => {
    if (!editing) return
    const numericValue = editing.type === 'PERCENT'
      ? Math.round(Number(edValue))
      : Math.round(Number(edValue) * 100)
    const nextScope = edScopeMode === 'limited' ? scopeSelToPayload(edScope) : { productIds: [], categoryIds: [], publisherNames: [], personIds: [] }
    const scopeChanged = JSON.stringify(nextScope) !== JSON.stringify(editing.scope ?? { productIds: [], categoryIds: [], publisherNames: [], personIds: [] })
    setEdBusy(true)
    try {
      await apiPatch(`/api/admin/discounts/${editing.id}`, {
        ...(Number.isFinite(numericValue) && numericValue > 0 && numericValue !== editing.value ? { value: numericValue } : {}),
        ...(edMin !== '' || editing.minSubtotalMinor > 0 ? { minSubtotalMinor: edMin ? Math.round(Number(edMin) * 100) : 0 } : {}),
        ...(edMax !== '' || editing.maxRedemptions !== null ? { maxRedemptions: edMax ? Number(edMax) : null } : {}),
        ...(edStarts || editing.startsAt ? { startsAt: edStarts ? new Date(edStarts + 'T00:00:00Z').toISOString() : null } : {}),
        ...(edEnds || editing.endsAt ? { endsAt: edEnds ? new Date(edEnds + 'T23:59:59Z').toISOString() : null } : {}),
        ...(edNoteEn !== (editing.noteEn ?? '') ? { noteEn: edNoteEn || null } : {}),
        ...(edNoteFa !== (editing.noteFa ?? '') ? { noteFa: edNoteFa || null } : {}),
        ...(scopeChanged ? { scope: nextScope } : {}),
      })
      toast({ title: t.admin.discountUpdated })
      setEditing(null)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setEdBusy(false) }
  }

  const fmtValue = (r: DiscountRow) => (r.type === 'PERCENT' ? `${r.value}%` : formatMoney(r.value, locale))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t.admin.discounts}</h2>
          <p className="text-xs text-ink-3">{t.admin.discountsHint}</p>
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {t.admin.discountNew}
        </Button>
      </div>

      <AdminPromotionCard />
      {showForm && (
        <form
          className="mb-5 grid gap-3 rounded-lg border border-brand/20 bg-brand-soft/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => { e.preventDefault(); void create() }}
        >
          <div>
            <Label htmlFor="dc-code" className="mb-1 text-xs">{t.admin.discountCodeLabel}</Label>
            <Input id="dc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} dir="ltr" placeholder="SPRING25" className="h-9 font-mono uppercase" maxLength={40} required />
          </div>
          <div>
            <Label htmlFor="dc-type" className="mb-1 text-xs">{t.admin.discountType}</Label>
            <select id="dc-type" value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
              <option value="PERCENT">{t.admin.discountPercent}</option>
              <option value="FIXED">{t.admin.discountFixed}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="dc-value" className="mb-1 text-xs">{type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
            <Input id="dc-value" type="number" min={type === 'PERCENT' ? 1 : 0.5} max={type === 'PERCENT' ? 90 : 10000} step={type === 'PERCENT' ? 1 : '0.5'} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" className="h-9" required />
          </div>
          <div>
            <Label htmlFor="dc-min" className="mb-1 text-xs">{t.admin.discountMinEur}</Label>
            <Input id="dc-min" type="number" min={0} step="0.5" value={minEur} onChange={(e) => setMinEur(e.target.value)} dir="ltr" placeholder="0" className="h-9" />
          </div>
          <div>
            <Label htmlFor="dc-max" className="mb-1 text-xs">{t.admin.discountMaxRed}</Label>
            <Input id="dc-max" type="number" min={1} step={1} value={maxRed} onChange={(e) => setMaxRed(e.target.value)} dir="ltr" placeholder="∞" className="h-9" />
          </div>
          <div>
            <Label htmlFor="dc-note-en" className="mb-1 text-xs">{t.admin.discountNoteEn}</Label>
            <Input id="dc-note-en" value={noteEn} onChange={(e) => setNoteEn(e.target.value)} className="h-9" maxLength={200} />
          </div>
          <div lang="fa" dir="rtl">
            <Label htmlFor="dc-note-fa" className="mb-1 text-xs">{t.admin.discountNoteFa}</Label>
            <Input id="dc-note-fa" value={noteFa} onChange={(e) => setNoteFa(e.target.value)} className="h-9" maxLength={200} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <DiscountScopeEditor mode={scopeMode} onModeChange={setScopeMode} value={scope} onChange={setScope} publishers={publishers} />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" className="h-9 w-full" disabled={busy}>{busy ? t.common.saving : t.admin.discountCreate}</Button>
          </div>
        </form>
      )}

      {!rows ? (
        <Spinner label={t.common.loading} />
      ) : rows.length === 0 ? (
        <EmptyState title={t.admin.discountNoneYet} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-soft/60 text-xs uppercase tracking-wide text-ink-3">
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountCodeLabel}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountType}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.discountMinEur}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t.admin.discountUsage}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.discountGiven}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t.admin.discountWindow}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t.admin.status}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t.admin.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {rows.map((r) => {
                const exhausted = r.maxRedemptions !== null && r.timesUsed >= r.maxRedemptions
                const expired = r.endsAt !== null && new Date(r.endsAt) < new Date()
                return (
                  <tr key={r.id} className={cn('transition-colors hover:bg-soft/40', (!r.isActive || exhausted || expired) && 'opacity-70')}>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-brand bdi" dir="ltr">{r.code}</span>
                      {(isFa ? r.noteFa : r.noteEn) && <p className="mt-1 max-w-[180px] truncate text-[11px] text-ink-3">{isFa ? r.noteFa : r.noteEn}</p>}
                      <p className="mt-1 max-w-[200px]">
                        <DiscountScopeSummary sel={r.scopeResolved} />
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink bdi">{fmtValue(r)}</td>
                    <td className="px-3 py-2.5 text-end text-ink-2 bdi">{r.minSubtotalMinor > 0 ? formatMoney(r.minSubtotalMinor, locale) : '—'}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      <span className={cn('font-semibold', exhausted && 'text-error')}>{r.timesUsed}</span>
                      <span className="text-ink-3"> / {r.maxRedemptions ?? '∞'}</span>
                      {r.paidOrders > 0 && <p className="text-[11px] text-ink-3">{r.paidOrders} {t.admin.discountOrders}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums text-ink-2 bdi">{r.givenAwayMinor > 0 ? `−${formatMoney(r.givenAwayMinor, locale)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">
                      {r.endsAt ? (
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden />{formatDate(r.endsAt, locale)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Switch checked={r.isActive} onCheckedChange={() => toggle(r)} aria-label={`${r.code} ${r.isActive ? t.admin.discountDisable : t.admin.discountEnable}`} disabled={exhausted || expired} />
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8 text-ink-2 hover:bg-soft" onClick={() => openEdit(r)} aria-label={`${t.admin.editDiscount} ${r.code}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <DiscountUsageDialog
                          row={r}
                          trigger={
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-ink-2 hover:bg-soft" aria-label={`${t.admin.discountUsage} ${r.code}`}>
                              <Inbox className="h-3.5 w-3.5" aria-hidden />
                              {r.paidOrders}
                            </Button>
                          }
                        />
                        <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.common.delete} ${r.code}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog — value/min/max/window/notes/scope (PATCH API existed since day one) */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t.admin.editDiscount}
              {editing && <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand bdi" dir="ltr">{editing.code}</span>}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 text-xs">{editing.type === 'PERCENT' ? t.admin.discountValuePct : t.admin.discountValueEur}</Label>
                  <Input type="number" min={editing.type === 'PERCENT' ? 1 : 0.5} step={editing.type === 'PERCENT' ? 1 : '0.5'} value={edValue} onChange={(e) => setEdValue(e.target.value)} dir="ltr" className="h-9" />
                </div>
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountMinEur}</Label>
                  <Input type="number" min={0} step="0.5" value={edMin} onChange={(e) => setEdMin(e.target.value)} dir="ltr" className="h-9" />
                </div>
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountMaxRed}</Label>
                  <Input type="number" min={1} step={1} value={edMax} onChange={(e) => setEdMax(e.target.value)} dir="ltr" placeholder="∞" className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 text-xs">{t.admin.startsAt}</Label>
                    <Input type="date" value={edStarts} onChange={(e) => setEdStarts(e.target.value)} dir="ltr" className="h-9" />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs">{t.admin.endsAt}</Label>
                    <Input type="date" value={edEnds} onChange={(e) => setEdEnds(e.target.value)} dir="ltr" className="h-9" />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 text-xs">{t.admin.discountNoteEn}</Label>
                  <Input value={edNoteEn} onChange={(e) => setEdNoteEn(e.target.value)} className="h-9" maxLength={200} />
                </div>
                <div lang="fa" dir="rtl">
                  <Label className="mb-1 text-xs">{t.admin.discountNoteFa}</Label>
                  <Input value={edNoteFa} onChange={(e) => setEdNoteFa(e.target.value)} className="h-9" maxLength={200} />
                </div>
              </div>
              <DiscountScopeEditor mode={edScopeMode} onModeChange={setEdScopeMode} value={edScope} onChange={setEdScope} publishers={publishers} />
              <p className="text-[11px] text-ink-3">{editing.type === 'PERCENT' ? '1–90%' : '>= 0.50 €'}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                <Button size="sm" className="h-9" disabled={edBusy} onClick={saveEdit}>{edBusy ? t.common.saving : t.common.save}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ───────────────────────── Admin: categories & contributors ───────────────────────── */

interface AdminCategoryRow {
  id: string; slug: string; sortOrder: number; isActive: boolean
  icon: string | null; iconUrl: string | null; color: string | null
  nameEn: string | null; nameFa: string | null
  descriptionEn: string | null; descriptionFa: string | null
  productCount: number
}

/** Same icon set the storefront homepage circles use (HomeSections ICONS). */
const HOME_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  BookOpen: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>,
  Feather: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" /><path d="M16 8 2 22" /><path d="M17.5 15H9" /></svg>,
  NotebookPen: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6a2 2 0 0 0-.6-1.4l-4.6-4.6a2 2 0 0 0-1.4-.6z" /><path d="M9 13a1 1 0 0 0-1 1v2h1l4.6-4.6-1-1z" /></svg>,
  Shapes: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" /><rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" /></svg>,
  Camera: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>,
  UserRound: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>,
}

const CATEGORY_ICON_NAMES = ['BookOpen', 'Feather', 'NotebookPen', 'Shapes', 'Camera', 'UserRound'] as const
const CATEGORY_COLORS = ['#014B74', '#E87524', '#0F766E', '#A16207', '#9F1239', '#44403C']

function AdminCategories() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminCategoryRow[] | null>(null)
  // Server baseline per row id — the source of truth for dirty checks / Save diffs.
  const [baseline, setBaseline] = useState<Map<string, AdminCategoryRow>>(new Map())
  const [newName, setNewName] = useState('')
  const [newFa, setNewFa] = useState('')
  const [newIcon, setNewIcon] = useState<string>('BookOpen')
  const [newIconUrl, setNewIconUrl] = useState<string | null>(null)
  const [newColor, setNewColor] = useState<string>('#014B74')
  const [busy, setBusy] = useState(false)
  // Custom PNG icon upload — per-row spinner key ('__new__' = create form)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ categories: AdminCategoryRow[] }>('/api/admin/categories').then((r) => {
      setRows(r.categories)
      setBaseline(new Map(r.categories.map((c) => [c.id, c])))
    }).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (id: string, data: Partial<AdminCategoryRow>) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...data } : r)) ?? prev)
  }
  const rowDirty = (r: AdminCategoryRow) => {
    const orig = baseline.get(r.id)
    if (!orig) return false
    return r.nameEn !== orig.nameEn || r.nameFa !== orig.nameFa || r.isActive !== orig.isActive || r.icon !== orig.icon || r.iconUrl !== orig.iconUrl || r.color !== orig.color
      || r.descriptionEn !== orig.descriptionEn || r.descriptionFa !== orig.descriptionFa
  }

  const save = async (r: AdminCategoryRow) => {
    const orig = baseline.get(r.id)
    if (!orig) return
    const data: Record<string, unknown> = { isActive: r.isActive }
    if (r.nameEn !== orig.nameEn) data.nameEn = r.nameEn
    if (r.nameFa !== orig.nameFa) data.nameFa = r.nameFa
    if (r.icon !== orig.icon) data.icon = r.icon
    if (r.iconUrl !== orig.iconUrl) data.iconUrl = r.iconUrl
    if (r.color !== orig.color) data.color = r.color
    if (r.descriptionEn !== orig.descriptionEn) data.descriptionEn = r.descriptionEn
    if (r.descriptionFa !== orig.descriptionFa) data.descriptionFa = r.descriptionFa
    try {
      await apiPatch(`/api/admin/categories/${r.id}`, data)
      toast({ title: t.admin.catSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!rows) return
    const j = index + dir
    if (j < 0 || j >= rows.length) return
    const a = rows[index]
    const b = rows[j]
    try {
      await Promise.all([
        apiPatch(`/api/admin/categories/${a.id}`, { sortOrder: b.sortOrder }),
        apiPatch(`/api/admin/categories/${b.id}`, { sortOrder: a.sortOrder }),
      ])
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  /** Upload a custom PNG icon via the shared admin media endpoint, then wire
   *  the returned URL into the row (or the create form when r === null). */
  const uploadIcon = async (r: AdminCategoryRow | null, file: File) => {
    const key = r?.id ?? '__new__'
    setUploadingId(key)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`)
      }
      const { url } = (await res.json()) as { url: string }
      if (r) {
        patch(r.id, { iconUrl: url })
        toast({ title: t.admin.catIconUploaded })
      } else {
        setNewIconUrl(url)
        toast({ title: t.admin.catIconUploaded })
      }
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally {
      setUploadingId(null)
    }
  }

  const create = async () => {
    if (newName.trim().length < 2) { toast({ title: t.admin.catNameRequired, variant: 'destructive' }); return }
    setBusy(true)
    try {
      await apiPost('/api/admin/categories', {
        nameEn: newName.trim(),
        ...(newFa.trim() ? { nameFa: newFa.trim() } : {}),
        icon: newIcon,
        ...(newIconUrl ? { iconUrl: newIconUrl } : {}),
        color: newColor,
      })
      toast({ title: t.admin.catCreated })
      setNewName(''); setNewFa(''); setNewIconUrl(null)
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const remove = async (r: AdminCategoryRow) => {
    if (!window.confirm(`${t.admin.catDeleteConfirm} (${r.slug})`)) return
    await apiDelete(`/api/admin/categories/${r.id}`)
    toast({ title: t.admin.catDeleted })
    load()
  }

  if (!rows) return <Spinner label={t.common.loading} />

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t.admin.catsTitle}</h2>
        <p className="text-xs text-ink-3">{t.admin.catsHint}</p>
      </div>

      <form className="mb-4 rounded-lg border border-line bg-soft/40 p-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.admin.catNewName} className="h-9 w-52" maxLength={60} dir="ltr" />
          <Input value={newFa} onChange={(e) => setNewFa(e.target.value)} placeholder={t.admin.catNameFa} className="h-9 w-44" maxLength={60} dir="rtl" lang="fa" />
          <div role="radiogroup" aria-label={t.admin.catIcon} className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
            {CATEGORY_ICON_NAMES.map((name) => {
              const Icon = HOME_ICONS[name]
              return (
                <button
                  key={name} type="button" role="radio" aria-checked={newIcon === name} aria-label={name}
                  onClick={() => setNewIcon(name)}
                  className={cn('flex h-7 w-7 items-center justify-center rounded transition', newIcon === name ? 'bg-brand text-white' : 'text-ink-3 hover:bg-soft hover:text-ink')}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              )
            })}
            {/* Custom PNG icon upload (user: white glyph on the colored disc) */}
            <label
              className={cn('flex h-7 cursor-pointer items-center gap-1 rounded px-1.5 text-[11px] font-medium text-ink-3 transition hover:bg-soft hover:text-ink', uploadingId === '__new__' && 'pointer-events-none opacity-60')}
              title={t.admin.catUploadIcon}
              aria-label={uploadingId === '__new__' ? t.admin.catUploading : t.admin.catUploadIcon}
            >
              {uploadingId === '__new__' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
              {uploadingId === '__new__' ? '' : t.admin.catUploadIcon}
              <input
                type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadIcon(null, f); e.currentTarget.value = '' }}
              />
            </label>
          </div>
          <div role="radiogroup" aria-label={t.admin.catColor} className="flex items-center gap-1.5 rounded-md border border-line bg-white p-1.5">
            {CATEGORY_COLORS.map((hex) => (
              <button
                key={hex} type="button" role="radio" aria-checked={newColor === hex} aria-label={hex}
                onClick={() => setNewColor(hex)}
                className={cn('h-6 w-6 rounded-full border-2 transition', newColor === hex ? 'border-ink scale-110' : 'border-transparent hover:scale-105')}
                style={{ backgroundColor: hex }}
              />
            ))}
            {/* Free colour choice — native picker + live hex (user: آزادانه رنگ را انتخاب کنم) */}
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
            <input
              type="color" value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label={t.admin.catCustomColor} title={t.admin.catCustomColor}
              className="h-6 w-8 cursor-pointer rounded border border-line bg-white p-0.5"
            />
            <span className="font-mono text-[10px] uppercase text-ink-3 bdi" dir="ltr">{newColor}</span>
          </div>
          {/* live preview chip — mirrors the storefront disc (custom square PNG covers the whole disc as a circle) */}
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: newIconUrl ? newColor : `${newColor}1A` }}>
              {newIconUrl ? (
                <img src={newIconUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (() => { const Icon = HOME_ICONS[newIcon] ?? HOME_ICONS.BookOpen; return <Icon className="h-4 w-4" style={{ color: newColor }} aria-hidden /> })()}
            </span>
          </span>
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={busy}>
            <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.catAdd}
          </Button>
        </div>
      </form>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <CategoryEditorRow
            key={r.id} r={r} isDirty={rowDirty(r)} index={i} count={rows.length} t={t}
            patch={patch} save={save} move={move} remove={remove}
            uploading={uploadingId === r.id}
            onUpload={(f) => void uploadIcon(r, f)}
          />
        ))}
      </ul>
    </div>
  )
}

type Dict = ReturnType<typeof getDict>

function CategoryEditorRow({ r, isDirty, index, count, t, patch, save, move, remove, uploading, onUpload }: {
  r: AdminCategoryRow; isDirty: boolean; index: number; count: number; t: Dict
  patch: (id: string, data: Partial<AdminCategoryRow>) => void
  save: (r: AdminCategoryRow) => void
  move: (index: number, dir: -1 | 1) => void
  remove: (r: AdminCategoryRow) => void
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(r.color ?? '') ? (r.color as string) : '#014B74'
  return (
    <li className={cn('rounded-lg border bg-white p-3 transition', isDirty ? 'border-brand/40 bg-brand-soft/20' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="flex h-5 w-6 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === count - 1} aria-label="Move down" className="flex h-5 w-6 items-center justify-center rounded text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
        <Switch checked={r.isActive} onCheckedChange={(v) => patch(r.id, { isActive: v })} aria-label={`${r.nameEn ?? r.slug} ${r.isActive ? t.admin.catVisible : t.admin.catHidden}`} />
        {/* Disc preview — custom square PNG fills the disc as a circular badge,
            exactly like the storefront TiltCircle renders it (Task 51) */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-inset ring-black/5"
          style={{ backgroundColor: safeColor }}
          aria-hidden
        >
          {r.iconUrl ? (
            <img src={r.iconUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (() => { const Icon = HOME_ICONS[r.icon ?? ''] ?? HOME_ICONS.BookOpen; return <Icon className="h-4 w-4 text-white" /> })()}
        </span>
        {/* Shelf look — icon + disc color, mirrored live on the storefront circles */}
        <div role="radiogroup" aria-label={`${t.admin.catIcon} (${r.slug})`} className="flex items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
          {CATEGORY_ICON_NAMES.map((name) => {
            const Icon = HOME_ICONS[name]
            const active = !r.iconUrl && (r.icon ?? 'BookOpen') === name
            return (
              <button
                key={name} type="button" role="radio" aria-checked={active} aria-label={name}
                onClick={() => patch(r.id, { icon: name })}
                className={cn('flex h-6 w-6 items-center justify-center rounded transition', active ? 'bg-brand text-white' : 'text-ink-3 hover:bg-soft hover:text-ink')}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            )
          })}
          {/* Custom PNG icon — upload replaces the preset mark on the storefront disc */}
          <label
            className={cn('flex h-6 w-6 cursor-pointer items-center justify-center rounded transition',
              r.iconUrl ? 'bg-success/10 text-success' : 'text-ink-3 hover:bg-soft hover:text-ink',
              uploading && 'pointer-events-none opacity-60')}
            title={uploading ? t.admin.catUploading : t.admin.catUploadIcon}
            aria-label={uploading ? t.admin.catUploading : t.admin.catUploadIcon}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
            <input
              type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onUpload(f); e.currentTarget.value = '' }}
            />
          </label>
          {r.iconUrl && (
            <button
              type="button" onClick={() => patch(r.id, { iconUrl: null })}
              aria-label={t.admin.catRemoveIcon} title={t.admin.catRemoveIcon}
              className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition hover:bg-error/10 hover:text-error"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label={`${t.admin.catColor} (${r.slug})`} className="flex items-center gap-1 rounded-md border border-line bg-white p-1">
          {CATEGORY_COLORS.map((hex) => (
            <button
              key={hex} type="button" role="radio" aria-checked={(r.color ?? '#014B74') === hex} aria-label={hex}
              onClick={() => patch(r.id, { color: hex })}
              className={cn('h-5 w-5 rounded-full border-2 transition', (r.color ?? '#014B74') === hex ? 'border-ink scale-110' : 'border-transparent hover:scale-105')}
              style={{ backgroundColor: hex }}
            />
          ))}
          {/* Free colour choice — native picker + hex field (user: آزادانه رنگ را انتخاب کنم) */}
          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <input
            type="color" value={safeColor}
            onChange={(e) => patch(r.id, { color: e.target.value })}
            aria-label={`${t.admin.catCustomColor} (${r.slug})`} title={t.admin.catCustomColor}
            className="h-5 w-7 cursor-pointer rounded border border-line bg-white p-0"
          />
          <Input
            value={r.color ?? ''}
            onChange={(e) => patch(r.id, { color: e.target.value })}
            aria-label={`${t.admin.catCustomColor} hex (${r.slug})`}
            className="h-6 w-[4.5rem] rounded font-mono text-[11px] uppercase"
            dir="ltr" maxLength={7} placeholder="#014B74" spellCheck={false}
          />
        </div>
        <Input
          value={r.nameEn ?? ''} onChange={(e) => patch(r.id, { nameEn: e.target.value })} dir="ltr"
          aria-label={t.admin.catNameEn} className="h-9 w-44 text-sm" maxLength={60}
        />
        <Input
          value={r.nameFa ?? ''} onChange={(e) => patch(r.id, { nameFa: e.target.value })} dir="rtl" lang="fa"
          aria-label={t.admin.catNameFa} className="h-9 w-36 text-sm" maxLength={60}
        />
        <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{r.slug}</span>
        <span className="text-xs text-ink-3">{r.productCount} {t.admin.catBooks}</span>
        <span className={cn('text-[11px] font-medium', r.isActive ? 'text-success' : 'text-ink-3')}>{r.isActive ? t.admin.catVisible : t.admin.catHidden}</span>
        <span className="ms-auto flex items-center gap-1.5">
          {isDirty && (
            <Button size="sm" className="h-8" onClick={() => save(r)}>{t.common.save}</Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={() => remove(r)} aria-label={`${t.admin.catDelete} ${r.slug}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
      </div>
      {/* Category descriptions (EN/FA) — the API always accepted them, the UI finally uses them (audit) */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={r.descriptionEn ?? ''} onChange={(e) => patch(r.id, { descriptionEn: e.target.value })} dir="ltr"
          placeholder={t.admin.catDescEn} aria-label={`${t.admin.catDescEn} (${r.slug})`} className="h-8 text-xs" maxLength={300}
        />
        <Input
          value={r.descriptionFa ?? ''} onChange={(e) => patch(r.id, { descriptionFa: e.target.value })} dir="rtl" lang="fa"
          placeholder={t.admin.catDescFa} aria-label={`${t.admin.catDescFa} (${r.slug})`} className="h-8 text-xs" maxLength={300}
        />
      </div>
    </li>
  )
}

interface AdminPersonRow {
  id: string; slug: string; status: string; portraitUrl: string | null
  nationality: string | null; profession: string | null
  nameEn: string | null; nameFa: string | null
  shortBioEn: string | null; shortBioFa: string | null
  bookCount: number
}

const STATUS_TONES: Record<string, 'success' | 'warning' | 'brand'> = { PUBLISHED: 'success', DRAFT: 'warning', ARCHIVED: 'brand' }

function AdminPeople() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminPersonRow[] | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Per-row portrait upload spinner (Task 51)
  const [portraitBusyId, setPortraitBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<{ people: AdminPersonRow[] }>('/api/admin/people').then((r) => setRows(r.people)).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (id: string, data: Partial<AdminPersonRow>) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...data } : r)) ?? prev)
  }

  const save = async (r: AdminPersonRow, orig: AdminPersonRow) => {
    const data: Record<string, unknown> = {}
    if (r.nameEn !== orig.nameEn) data.nameEn = r.nameEn
    if (r.nameFa !== orig.nameFa) data.nameFa = r.nameFa
    if (r.shortBioEn !== orig.shortBioEn) data.shortBioEn = r.shortBioEn
    if (r.shortBioFa !== orig.shortBioFa) data.shortBioFa = r.shortBioFa
    if (r.profession !== orig.profession) data.profession = r.profession
    if (r.status !== orig.status) data.status = r.status
    if (r.portraitUrl !== orig.portraitUrl) data.portraitUrl = r.portraitUrl
    try {
      await apiPatch(`/api/admin/people/${r.id}`, data)
      toast({ title: t.admin.personSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    }
  }

  const create = async () => {
    if (newName.trim().length < 2) { toast({ title: t.admin.personNameRequired, variant: 'destructive' }); return }
    setBusy(true)
    try {
      await apiPost('/api/admin/people', { nameEn: newName.trim() })
      toast({ title: t.admin.personCreated })
      setNewName('')
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  /** Portrait upload — instant-save PATCH (Task 51): pick a file → /api/admin/upload
   *  → portraitUrl persisted immediately; the avatar spinner covers the round-trip. */
  const setPortrait = async (r: AdminPersonRow, file: File) => {
    setPortraitBusyId(r.id)
    try {
      const url = await uploadImageFile(file)
      await apiPatch(`/api/admin/people/${r.id}`, { portraitUrl: url })
      toast({ title: t.admin.personPortraitSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setPortraitBusyId(null) }
  }

  const clearPortrait = async (r: AdminPersonRow) => {
    setPortraitBusyId(r.id)
    try {
      await apiPatch(`/api/admin/people/${r.id}`, { portraitUrl: null })
      toast({ title: t.admin.personPortraitSaved })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setPortraitBusyId(null) }
  }

  if (!rows) return <Spinner label={t.common.loading} />

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t.admin.peopleTitle}</h2>
        <p className="text-xs text-ink-3">{t.admin.peopleHint}</p>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.admin.personNewName} className="h-9 w-56" maxLength={80} />
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={busy}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.personAdd}
        </Button>
      </form>

      <ul className="space-y-2">
        {rows.map((r) => {
          const open = expanded === r.id
          return (
            <li key={r.id} className="rounded-lg border border-line bg-white">
              <div className="flex flex-wrap items-center gap-2.5 p-3">
                {/* Portrait — click the camera badge to upload (instant save) */}
                <label
                  className={cn('group relative shrink-0 cursor-pointer rounded-full', portraitBusyId === r.id && 'pointer-events-none')}
                  title={t.admin.personPortraitUpload}
                  aria-label={t.admin.personPortraitUpload}
                >
                  {r.portraitUrl ? (
                    <img src={r.portraitUrl} alt="" className="h-9 w-9 rounded-full border border-line object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{(r.nameEn ?? r.slug).slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-white text-ink-3 shadow-sm transition group-hover:text-brand" aria-hidden>
                    {portraitBusyId === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Camera className="h-2.5 w-2.5" />}
                  </span>
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void setPortrait(r, f); e.currentTarget.value = '' }}
                  />
                </label>
                <span className="font-semibold text-ink bdi">{r.nameEn ?? r.slug}</span>
                {r.nameFa ? <span className="text-sm text-ink-2 bdi" dir="rtl" lang="fa">{r.nameFa}</span> : null}
                <span className="font-mono text-[11px] text-ink-3 bdi" dir="ltr">{r.slug}</span>
                <Badge tone={STATUS_TONES[r.status] ?? 'brand'}>{r.status === 'PUBLISHED' ? t.admin.statusPublished : r.status === 'DRAFT' ? t.admin.statusDraft : t.admin.statusArchived}</Badge>
                <span className="text-xs text-ink-3">{r.bookCount} {t.admin.personBooks}</span>
                <Button
                  size="sm" variant="ghost" className="ms-auto h-8 gap-1 text-ink-2 hover:bg-soft"
                  aria-expanded={open} onClick={() => setExpanded(open ? null : r.id)}
                >
                  {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  {t.common.edit}
                </Button>
              </div>
              {open && <PersonEditor r={r} t={t} busy={portraitBusyId === r.id} onSave={save} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Expandable editor: local draft state per row; Save diffs against the row snapshot. */
function PersonEditor({ r, t, busy, onSave }: {
  r: AdminPersonRow; t: Dict; busy: boolean
  onSave: (r: AdminPersonRow, orig: AdminPersonRow) => void
}) {
  const [draft, setDraft] = useState<AdminPersonRow>(r)
  const dirty =
    draft.nameEn !== r.nameEn || draft.nameFa !== r.nameFa ||
    draft.shortBioEn !== r.shortBioEn || draft.shortBioFa !== r.shortBioFa ||
    draft.profession !== r.profession || draft.status !== r.status ||
    draft.portraitUrl !== r.portraitUrl
  const set = (data: Partial<AdminPersonRow>) => setDraft((d) => ({ ...d, ...data }))

  return (
    <div className="border-t border-line bg-soft/40 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Portrait (Task 51) — upload replaces the letter avatar on the public
            author page, search results and this list; instant-save lives on the
            row avatar camera, this one rides the Save button like every field. */}
        <div>
          <Label className="mb-1 text-xs">{t.admin.personPortrait}</Label>
          <div className="flex items-center gap-2.5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white">
              {draft.portraitUrl ? (
                <img src={draft.portraitUrl} alt="" className="h-14 w-14 object-cover" />
              ) : (
                <span className="text-lg font-bold text-brand">{(draft.nameEn ?? r.slug).slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <div className="flex flex-col items-start gap-1">
              <UploadButton onUploaded={(url) => set({ portraitUrl: url })} label={t.admin.upload} busyLabel={t.admin.uploading} />
              {draft.portraitUrl && (
                <button
                  type="button" onClick={() => set({ portraitUrl: null })}
                  className="text-xs text-ink-3 transition hover:text-error"
                >
                  {t.admin.personPortraitRemove}
                </button>
              )}
              {busy && <span className="inline-flex items-center gap-1 text-[11px] text-ink-3"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{t.admin.uploading}</span>}
            </div>
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personNameEn}</Label>
          <Input value={draft.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} dir="ltr" className={cn('h-9 text-sm', draft.nameEn !== r.nameEn && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div lang="fa" dir="rtl">
          <Label className="mb-1 text-xs">{t.admin.personNameFa}</Label>
          <Input value={draft.nameFa ?? ''} onChange={(e) => set({ nameFa: e.target.value })} className={cn('h-9 text-sm', draft.nameFa !== r.nameFa && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personProfession}</Label>
          <Input value={draft.profession ?? ''} onChange={(e) => set({ profession: e.target.value })} dir="ltr" className={cn('h-9 text-sm', draft.profession !== r.profession && 'border-brand/50 bg-brand-soft/30')} maxLength={80} />
        </div>
        <div>
          <Label className="mb-1 text-xs">{t.admin.personStatus}</Label>
          <select
            value={draft.status} onChange={(e) => set({ status: e.target.value })}
            className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
            aria-label={t.admin.personStatus}
          >
            <option value="PUBLISHED">{t.admin.statusPublished}</option>
            <option value="DRAFT">{t.admin.statusDraft}</option>
            <option value="ARCHIVED">{t.admin.statusArchived}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-1 text-xs">{t.admin.personBioEn}</Label>
          <textarea
            value={draft.shortBioEn ?? ''} onChange={(e) => set({ shortBioEn: e.target.value })} dir="ltr" rows={2}
            className={cn('w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm', draft.shortBioEn !== r.shortBioEn && 'border-brand/50 bg-brand-soft/30')}
            maxLength={600}
          />
        </div>
        <div className="sm:col-span-2" lang="fa" dir="rtl">
          <Label className="mb-1 text-xs">{t.admin.personBioFa}</Label>
          <textarea
            value={draft.shortBioFa ?? ''} onChange={(e) => set({ shortBioFa: e.target.value })} rows={2}
            className={cn('w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm', draft.shortBioFa !== r.shortBioFa && 'border-brand/50 bg-brand-soft/30')}
            maxLength={600}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" className="h-9" disabled={!dirty} onClick={() => onSave(draft, r)}>{t.common.save}</Button>
      </div>
    </div>
  )
}

/* ───────────────────── Admin: homepage deep editors (Task 27, audit P0-2) ───────────────────── */

/** Shared image upload → returns the public /uploads/... URL (admin-only endpoint). */
async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
  const j = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
  if (!res.ok || !j.url) throw new Error(j.message ?? `Upload failed (HTTP ${res.status})`)
  return j.url
}

/** Upload button with busy state — used by hero slide / poster / editorial image fields. */
function UploadButton({ onUploaded, label, busyLabel }: { onUploaded: (url: string) => void; label: string; busyLabel: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <label
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink-2 transition hover:bg-soft',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
      {busy ? busyLabel : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try { onUploaded(await uploadImageFile(file)) } finally { setBusy(false) }
        }}
      />
    </label>
  )
}

const SECTION_DEFAULTS: Record<string, { slides?: Record<string, unknown>[]; posters?: Record<string, unknown>[] } & Record<string, unknown>> = {
  HERO: {
    autoplayMs: 6000,
    motion: 'slide',
    slides: [{ image: '/images/hero-season.png', eyebrowEn: '', eyebrowFa: '', titleEn: 'New season titles', titleFa: 'تازه‌های فصل', bodyEn: '', bodyFa: '', ctaEn: 'Discover the new titles', ctaFa: 'کشف تازه‌های نشر', href: '/books', textColor: 'light', position: 'center', bg: '' }],
  },
  PRODUCT_SHELF: { headingEn: 'New titles', headingFa: 'تازه‌های نشر', descriptionEn: '', descriptionFa: '', source: 'newest', layout: 'grid', limit: 8, hideOutOfStock: false, ctaEn: '', ctaFa: '', ctaHref: '', categorySlug: '' },
  POSTER_GRID: { template: 'standard', posters: [] },
  EDITORIAL_FEATURE: { layout: 'image-left', bg: 'paper', minH: 600, accentOrange: false, image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', quoteEn: '', quoteFa: '', textEn: '', textFa: '', attributionEn: '', attributionFa: '', ctaEn: '', ctaFa: '', ctaHref: '' },
  CATEGORY_CAROUSEL: { headingEn: 'Browse the shelves', headingFa: 'گشت‌وگذار در قفسه‌ها', descriptionEn: '', descriptionFa: '', slugs: [] },
  FOR_YOU: { headingEn: '', headingFa: '', limit: 12 },
  RECENTLY_VIEWED: { headingEn: '', headingFa: '', limit: 12 },
  ARTICLES: { headingEn: 'From the journal', headingFa: 'از مجلهٔ پرس‌پیکس', descriptionEn: '', descriptionFa: '', limit: 3, bg: 'white', ctaEn: 'All articles', ctaFa: 'همهٔ مقاله‌ها', ctaHref: '/articles' },
  SCROLL_STORY: { eyebrowEn: 'Book spotlight', eyebrowFa: 'معرفی کتاب', ctaEn: 'Get the book', ctaFa: 'خرید کتاب', ctaHref: '/books', heightPreset: 'classic', layout: 'split', slides: [{ image: '', eyebrowEn: 'Part I', eyebrowFa: 'دفتر نخست', titleEn: '', titleFa: '', textEn: '', textFa: '' }] },
}

type SectionRec = { id: string; type: string; sortOrder: number; enabled: boolean; settings: Record<string, unknown> }

function AdminHomepage() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [data, setData] = useState<{ draft: { id: string; sections: SectionRec[] }; published: { publishedAt: string; changeSummary?: string } | null } | null>(null)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  // Press-&-hold drag reorder (same pattern as the product gallery, Task 49/50):
  // grab the handle → the row becomes draggable → hover the target row → drop.
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [armDrag, setArmDrag] = useState<string | null>(null)

  const load = useCallback(() => {
    apiGet<typeof data>('/api/admin/homepage?locale=' + locale).then((r) => { setData(r as NonNullable<typeof data>); setSummary('') }).catch(() => setData(null))
  }, [locale])
  useEffect(() => { load() }, [load])

  if (!data) return <Spinner label={t.common.loading} />
  const sections = data.draft?.sections ?? []

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    const ordered = next.map((s, i) => ({ ...s, sortOrder: i }))
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: ordered } } : d)
  }
  /** Drag & drop reorder (from → to), renumbering sortOrder. */
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) return
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ordered = next.map((s, i) => ({ ...s, sortOrder: i }))
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: ordered } } : d)
  }
  const toggle = (id: string, enabled: boolean) => {
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.map((s) => s.id === id ? { ...s, enabled } : s) } } : d)
  }
  /** Deep-merge a patch into a section's settings (local draft only — persisted on Save draft/Publish). */
  const patchSettings = (id: string, patch: Record<string, unknown>) => {
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.map((s) => s.id === id ? { ...s, settings: { ...s.settings, ...patch } } : s) } } : d)
  }
  const addSection = (type: string) => {
    setAddOpen(false)
    const fresh: SectionRec = { id: `new-${Date.now()}`, type, sortOrder: sections.length, enabled: true, settings: structuredClone(SECTION_DEFAULTS[type] ?? {}) }
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: [...d.draft.sections, fresh] } } : d)
    setEditingId(fresh.id)
    toast({ title: locale === 'fa' ? 'بخش اضافه شد — برای انتشار ذخیره کنید' : 'Section added — save draft or publish to persist' })
  }
  const removeSection = (id: string) => {
    if (!window.confirm(t.admin.removeConfirm)) return
    setData((d) => d ? { ...d, draft: { ...d.draft, sections: d.draft.sections.filter((s) => s.id !== id).map((s, i) => ({ ...s, sortOrder: i })) } } : d)
    if (editingId === id) setEditingId(null)
  }
  const save = async (action: 'draft' | 'publish') => {
    setBusy(true)
    try {
      await apiPut('/api/admin/homepage', {
        locale,
        changeSummary: summary || (action === 'publish' ? 'Publish from admin' : 'Draft edit'),
        action,
        sections: sections.map((s, i) => ({ type: s.type, sortOrder: i, enabled: s.enabled, settings: s.settings })),
      })
      // Task 50 — explicit success feedback (was: a bare “Publish” title).
      const now = formatDateTime(new Date().toISOString(), locale)
      toast({
        title: action === 'publish' ? t.admin.publishSuccess : t.admin.draft,
        description: action === 'publish'
          ? tf(t.admin.publishSuccessDesc, { n: sections.length, time: now })
          : tf(t.admin.draftSavedDesc, { time: now }),
      })
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }

  const typeLabels: Record<string, string> = {
    HERO: locale === 'fa' ? 'اسلایدروی صفحهٔ اصلی' : 'Hero slider',
    PRODUCT_SHELF: locale === 'fa' ? 'قفسهٔ کتاب' : 'Product shelf',
    CATEGORY_CAROUSEL: locale === 'fa' ? 'چرخ‌وفلک موضوع‌ها' : 'Category carousel',
    POSTER_GRID: locale === 'fa' ? 'شبکهٔ پوستر' : 'Poster grid',
    EDITORIAL_FEATURE: locale === 'fa' ? 'ویژهٔ تحریریه' : 'Editorial feature',
    FOR_YOU: locale === 'fa' ? 'قفسهٔ «برای شما» (شخصی‌سازی)' : 'For-you shelf (personalized)',
    RECENTLY_VIEWED: locale === 'fa' ? 'بازدیدهای اخیر' : 'Recently viewed',
    ARTICLES: locale === 'fa' ? 'معرفی مقاله‌ها' : 'Articles teaser',
    SCROLL_STORY: locale === 'fa' ? 'قصّهٔ اسکرولی (سنجاق‌شده)' : 'Scroll story (pinned)',
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t.admin.homepage} <span className="text-sm font-normal text-ink-3">({locale.toUpperCase()})</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder={t.admin.changeSummary} value={summary} onChange={(e) => setSummary(e.target.value)} className="h-9 w-48" />
          <Button variant="outline" className="h-9" disabled={busy} onClick={() => save('draft')}>{t.admin.draft}</Button>
          <Button className="h-9" disabled={busy} onClick={() => save('publish')}>{t.admin.publish}</Button>
        </div>
      </div>
      {data.published && (
        <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
          {t.admin.published}: {formatDateTime(data.published.publishedAt, locale)}{data.published.changeSummary ? ` — ${data.published.changeSummary}` : ''}
        </p>
      )}

      {/* Add-section menu (audit P1: sections could not be added) */}
      <div className="relative mb-3 inline-block">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
          <Plus className="h-4 w-4" aria-hidden />{t.admin.addSection}
        </Button>
        {addOpen && (
          <div className="absolute z-20 mt-1 w-56 rounded-lg border border-line bg-white p-1 shadow-lg">
            {Object.keys(typeLabels).map((type) => (
              <button key={type} type="button" onClick={() => addSection(type)} className="flex w-full items-center rounded-md px-3 py-2 text-start text-sm text-ink-2 hover:bg-soft hover:text-ink">
                {typeLabels[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {sections.map((s, i) => {
          const editing = editingId === s.id
          const summaryLine =
            s.type === 'PRODUCT_SHELF' ? `${s.settings.source ?? 'newest'} · ${s.settings.limit ?? 8}` :
            s.type === 'HERO' ? `${(s.settings.slides as unknown[] | undefined)?.length ?? 0} slides` :
            s.type === 'POSTER_GRID' ? `${(s.settings.posters as unknown[] | undefined)?.length ?? 0} posters` :
            s.type === 'CATEGORY_CAROUSEL' ? ((s.settings.slugs as string[] | undefined) ?? []).join(', ') :
            s.type === 'FOR_YOU' || s.type === 'RECENTLY_VIEWED' ? `${s.settings.limit ?? 12} books` :
            s.type === 'ARTICLES' ? `${s.settings.limit ?? 3} articles${s.settings.bg && s.settings.bg !== 'white' ? ` · ${String(s.settings.bg)}` : ''}` :
            s.type === 'EDITORIAL_FEATURE' ? `${String(s.settings.layout ?? 'image-left')} · ${Number(s.settings.minH ?? 600)}px` :
            s.type === 'SCROLL_STORY' ? `${((s.settings.slides as unknown[] | undefined) ?? []).length} scenes · ${String(s.settings.layout ?? 'split')}${s.settings.coverImage ? ' · cover' : ''} · ${String(s.settings.heightPreset ?? 'classic')}` :
            String(s.settings.layout ?? '')
          return (
            <li
              key={s.id}
              draggable={armDrag === s.id}
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); setArmDrag(null) }}
              onDragOver={(e) => {
                if (dragFrom !== null && dragFrom !== i) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOver(i)
                }
              }}
              onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                const raw = dragFrom ?? Number.parseInt(e.dataTransfer.getData('text/plain') || '', 10)
                setDragFrom(null)
                setDragOver(null)
                setArmDrag(null)
                if (Number.isFinite(raw)) reorder(raw, i)
              }}
              className={cn(
                'rounded-lg border px-4 py-3 transition-colors',
                editing ? 'border-brand/40 bg-brand-soft/20'
                  : dragOver === i ? 'border-brand bg-brand-soft/70 ring-2 ring-brand/30'
                    : dragFrom === i ? 'border-brand/40 opacity-50'
                      : 'border-line bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                {/* Drag handle — press & hold, then hover into place (HTML5 drag) */}
                <button
                  type="button"
                  aria-label={t.admin.dragSectionHint}
                  title={t.admin.dragSectionHint}
                  onMouseDown={() => setArmDrag(s.id)}
                  onMouseUp={() => setArmDrag((cur) => (cur === s.id ? null : cur))}
                  onTouchStart={() => setArmDrag(s.id)}
                  onTouchEnd={() => setArmDrag(null)}
                  className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 transition hover:bg-soft hover:text-ink active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex flex-col gap-0.5">
                  <button type="button" aria-label={t.admin.moveUp} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-ink-3 hover:bg-soft disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" aria-label={t.admin.moveDown} disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-ink-3 hover:bg-soft disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink"><span className="me-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-soft text-[11px] font-bold text-ink-2 bdi" dir="ltr">{i + 1}</span>{typeLabels[s.type] ?? s.type}</p>
                  <p className="truncate text-xs text-ink-3" dir="auto">{summaryLine}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={editing ? 'default' : 'outline'} className="h-8 gap-1" aria-expanded={editing} onClick={() => setEditingId(editing ? null : s.id)}>
                    {editing ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3 w-3" aria-hidden />}
                    {editing ? t.admin.doneEdit : t.admin.editSection}
                  </Button>
                  <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} aria-label={t.admin.enable} />
                  <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" aria-label={t.admin.removeSection} onClick={() => removeSection(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
              {editing && (
                <div className="mt-3 border-t border-line pt-3">
                  {s.type === 'HERO' && <HeroSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'POSTER_GRID' && <PosterSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'PRODUCT_SHELF' && <ShelfSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'CATEGORY_CAROUSEL' && <CarouselSectionEditor section={s} onPatch={patchSettings} />}
                  {(s.type === 'FOR_YOU' || s.type === 'RECENTLY_VIEWED') && <SimpleShelfSectionEditor section={s} onPatch={patchSettings} />}
                  {s.type === 'ARTICLES' && <ArticlesSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'EDITORIAL_FEATURE' && <EditorialSectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  {s.type === 'SCROLL_STORY' && <ScrollStorySectionEditor section={s} onPatch={patchSettings} locale={locale} />}
                  <p className="mt-3 text-[11px] text-ink-3">
                    {locale === 'fa' ? 'تغییرها ابتدا روی پیش‌نویس اعمال می‌شوند؛ با «انتشار» برای بازدیدکنندگان فعال می‌شوند.' : 'Edits land on the draft; “Publish” makes them live for visitors.'}
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-xs text-ink-3">
        {locale === 'fa' ? 'بخش‌ها از انواع تأییدشده انتخاب می‌شوند؛ محتوای هر بخش در پیش‌نویس ذخیره و با «انتشار» برای همه بازدیدکنندگان فعال می‌شود.' : 'Sections compose from approved types only. Content is saved as a draft; “Publish” makes it live for all visitors.'}
      </p>
    </div>
  )
}

/* ── Field primitives shared by the section editors ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 text-xs text-ink-3">{label}</Label>
      {children}
    </div>
  )
}

function SectionText({ value, onChange, dir, lang, placeholder, rows, mono }: { value: string; onChange: (v: string) => void; dir?: 'ltr' | 'rtl'; lang?: string; placeholder?: string; rows?: number; mono?: boolean }) {
  if (rows) {
    return (
      <textarea
        value={value} rows={rows} dir={dir} lang={lang} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn('w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40', mono && 'font-mono text-[13px]')}
      />
    )
  }
  return (
    <Input value={value} dir={dir} lang={lang} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 bg-white" />
  )
}

function BilingualPair({ labelEn, labelFa, valueEn, valueFa, onChangeEn, onChangeFa, rows }: { labelEn: string; labelFa: string; valueEn: string; valueFa: string; onChangeEn: (v: string) => void; onChangeFa: (v: string) => void; rows?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={labelEn}><SectionText value={valueEn} onChange={onChangeEn} dir="ltr" lang="en" rows={rows} /></Field>
      <Field label={labelFa}><SectionText value={valueFa} onChange={onChangeFa} dir="rtl" lang="fa" rows={rows} /></Field>
    </div>
  )
}

/** Task 47 — collapsible per-device override group for sliders: the admin can
 *  give phones (<768px) their own portrait image and shorter copy (4 states:
 *  web/mobile × EN/FA). Blank fields fall back to the web values at runtime;
 *  the orange chip counts how many overrides are filled in. */
function MobileVariantBox({ locale, filled, children }: { locale: Locale; filled: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const fa = locale === 'fa'
  return (
    <div className={cn('rounded-md border', filled > 0 ? 'border-orange-accent/40 bg-orange-accent/[0.05]' : 'border-line bg-transparent')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-start">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-orange-accent" aria-hidden />
        <span className="min-w-0 flex-1 text-xs font-semibold text-ink-2">
          {fa ? 'نسخهٔ گوشی (اختیاری)' : 'Mobile variant (optional)'}
          <span className="ms-2 hidden font-normal text-ink-3 sm:inline">
            {fa ? 'فقط زیر ۷۶۸px — خالی = همان مقدار نسخهٔ وب' : 'phones <768px only — blank = web value'}
          </span>
        </span>
        {filled > 0 && (
          <span className="shrink-0 rounded-full bg-orange-accent/15 px-2 py-0.5 text-[10px] font-bold text-orange-dark">{faDigits(filled)}</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="space-y-3 border-t border-line px-3 pb-3 pt-3">{children}</div>}
    </div>
  )
}

const mobileFilled = (vals: unknown[]) => vals.filter((v) => String(v ?? '').trim() !== '').length

function ImageField({ label, value, onChange, t, onRemove }: { label: string; value: string; onChange: (v: string) => void; t: AdminDict; onRemove?: () => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded border border-line bg-soft">
            {/* plain img: runtime-chosen admin URL — next/image has no benefit here */}
            <img src={value} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink-3">—</span>
        )}
        <div className="min-w-40 flex-1"><SectionText value={value} onChange={onChange} dir="ltr" placeholder="/images/…" /></div>
        <UploadButton label={t.upload} busyLabel={t.uploading} onUploaded={onChange} />
        {onRemove && value && (
          <Button size="sm" variant="ghost" className="h-8 text-error hover:bg-error/10" onClick={onRemove} aria-label={t.clear}><X className="h-3.5 w-3.5" aria-hidden /></Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">{t.uploadHint}</p>
    </Field>
  )
}

/** HERO — per-slide editor (audit P0-2: slides were completely uneditable). */
function HeroSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const slides = (section.settings.slides as Record<string, unknown>[] | undefined) ?? []
  const setSlides = (next: Record<string, unknown>[]) => onPatch(section.id, { slides: next })
  const setSlide = (i: number, patch: Record<string, unknown>) => setSlides(slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.admin.autoplayMs}>
          <Input type="number" min={2000} step={500} dir="ltr" value={String(section.settings.autoplayMs ?? 6000)} onChange={(e) => onPatch(section.id, { autoplayMs: Number(e.target.value) || 6000 })} className="h-9 bg-white" />
        </Field>
        <Field label={t.admin.motion}>
          <select value={String(section.settings.motion ?? 'slide')} onChange={(e) => onPatch(section.id, { motion: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="slide">slide</option>
            <option value="fade">fade</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.slides} ({slides.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setSlides([...slides, { ...(SECTION_DEFAULTS.HERO.slides?.[0] ?? {}), titleEn: '', titleFa: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addSlide}
        </Button>
      </div>
      {slides.map((sl, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...slides]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSlides(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === slides.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...slides]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setSlides(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSlide} onClick={() => setSlides(slides.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(sl.image ?? '')} onChange={(v) => setSlide(i, { image: v })} t={t.admin} />
          <MobileVariantBox locale={locale} filled={mobileFilled([sl.imageMobile, sl.eyebrowMobileEn, sl.eyebrowMobileFa, sl.titleMobileEn, sl.titleMobileFa, sl.bodyMobileEn, sl.bodyMobileFa])}>
            <ImageField label={locale === 'fa' ? 'تصویر گوشی (عمودی ۹:۱۶)' : 'Mobile image (portrait 9:16)'} value={String(sl.imageMobile ?? '')} onChange={(v) => setSlide(i, { imageMobile: v })} t={t.admin} />
            <BilingualPair labelEn="Eyebrow — mobile (EN)" labelFa="سرنویس گوشی (فارسی)" valueEn={String(sl.eyebrowMobileEn ?? '')} valueFa={String(sl.eyebrowMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowMobileEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowMobileFa: v })} />
            <BilingualPair labelEn="Title — mobile (EN)" labelFa="عنوان گوشی (فارسی)" valueEn={String(sl.titleMobileEn ?? '')} valueFa={String(sl.titleMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { titleMobileEn: v })} onChangeFa={(v) => setSlide(i, { titleMobileFa: v })} />
            <BilingualPair labelEn="Body — mobile (EN)" labelFa="متن گوشی (فارسی)" valueEn={String(sl.bodyMobileEn ?? '')} valueFa={String(sl.bodyMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { bodyMobileEn: v })} onChangeFa={(v) => setSlide(i, { bodyMobileFa: v })} rows={2} />
          </MobileVariantBox>
          <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(sl.eyebrowEn ?? '')} valueFa={String(sl.eyebrowFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(sl.titleEn ?? '')} valueFa={String(sl.titleFa ?? '')} onChangeEn={(v) => setSlide(i, { titleEn: v })} onChangeFa={(v) => setSlide(i, { titleFa: v })} />
          <BilingualPair labelEn="Body (EN)" labelFa="متن (فارسی)" valueEn={String(sl.bodyEn ?? '')} valueFa={String(sl.bodyFa ?? '')} onChangeEn={(v) => setSlide(i, { bodyEn: v })} onChangeFa={(v) => setSlide(i, { bodyFa: v })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t.admin.ctaLabel}><SectionText value={String(sl.ctaEn ?? '')} onChange={(v) => setSlide(i, { ctaEn: v })} dir="ltr" placeholder="Discover the new titles" /></Field>
            <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(sl.ctaFa ?? '')} onChange={(v) => setSlide(i, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label={t.admin.ctaLink}><SectionText value={String(sl.href ?? '')} onChange={(v) => setSlide(i, { href: v })} dir="ltr" placeholder="/books" /></Field>
            <Field label={t.admin.textPosition}>
              <select value={String(sl.position ?? 'center')} onChange={(e) => setSlide(i, { position: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="left">{t.admin.posLeft}</option>
                <option value="center">{t.admin.posCenter}</option>
                <option value="right">{t.admin.posRight}</option>
              </select>
            </Field>
            <Field label={t.admin.textColor}>
              <select value={String(sl.textColor ?? 'light')} onChange={(e) => setSlide(i, { textColor: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="light">{t.admin.light}</option>
                <option value="dark">{t.admin.dark}</option>
              </select>
            </Field>
            <Field label={t.admin.bgColor}>
              <div className="flex items-center gap-1.5">
                <SectionText value={String(sl.bg ?? '')} onChange={(v) => setSlide(i, { bg: v })} dir="ltr" placeholder="#014B74 / linear-gradient(…)" mono />
                {String(sl.bg ?? '').startsWith('#') && <span className="h-7 w-7 shrink-0 rounded border border-line" style={{ backgroundColor: String(sl.bg) }} aria-hidden />}
              </div>
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

/** POSTER_GRID — per-poster editor with image/bg/span (audit P0-2). */
function PosterSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const posters = (section.settings.posters as Record<string, unknown>[] | undefined) ?? []
  const setPosters = (next: Record<string, unknown>[]) => onPatch(section.id, { posters: next })
  const setPoster = (i: number, patch: Record<string, unknown>) => setPosters(posters.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.admin.template}>
          <select value={String(section.settings.template ?? 'standard')} onChange={(e) => onPatch(section.id, { template: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="standard">standard</option>
            <option value="wide-first">wide-first</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.posters} ({posters.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPosters([...posters, { image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', textEn: '', textFa: '', ctaEn: '', ctaFa: '', href: '', bg: '', textColor: 'light', span: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addPoster}
        </Button>
      </div>
      {posters.map((p, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...posters]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setPosters(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === posters.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...posters]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setPosters(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSection} onClick={() => setPosters(posters.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(p.image ?? '')} onChange={(v) => setPoster(i, { image: v })} t={t.admin} />
          <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(p.eyebrowEn ?? '')} valueFa={String(p.eyebrowFa ?? '')} onChangeEn={(v) => setPoster(i, { eyebrowEn: v })} onChangeFa={(v) => setPoster(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(p.titleEn ?? '')} valueFa={String(p.titleFa ?? '')} onChangeEn={(v) => setPoster(i, { titleEn: v })} onChangeFa={(v) => setPoster(i, { titleFa: v })} />
          <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(p.textEn ?? '')} valueFa={String(p.textFa ?? '')} onChangeEn={(v) => setPoster(i, { textEn: v })} onChangeFa={(v) => setPoster(i, { textFa: v })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label={t.admin.ctaLabel}><SectionText value={String(p.ctaEn ?? '')} onChange={(v) => setPoster(i, { ctaEn: v })} dir="ltr" /></Field>
            <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(p.ctaFa ?? '')} onChange={(v) => setPoster(i, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
            <Field label={t.admin.ctaLink}><SectionText value={String(p.href ?? '')} onChange={(v) => setPoster(i, { href: v })} dir="ltr" placeholder="/articles/…" /></Field>
            <Field label={t.admin.span}><SectionText value={String(p.span ?? '')} onChange={(v) => setPoster(i, { span: v })} dir="ltr" placeholder="col-span-2" mono /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t.admin.bgColor}>
              <div className="flex items-center gap-1.5">
                <SectionText value={String(p.bg ?? '')} onChange={(v) => setPoster(i, { bg: v })} dir="ltr" placeholder="#014B74 / linear-gradient(…)" mono />
                {String(p.bg ?? '').startsWith('#') && <span className="h-7 w-7 shrink-0 rounded border border-line" style={{ backgroundColor: String(p.bg) }} aria-hidden />}
              </div>
            </Field>
            <Field label={t.admin.textColor}>
              <select value={String(p.textColor ?? 'light')} onChange={(e) => setPoster(i, { textColor: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
                <option value="light">{t.admin.light}</option>
                <option value="dark">{t.admin.dark}</option>
              </select>
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

/** PRODUCT_SHELF — source/limit/category were read-only before (audit P1). */
function ShelfSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const source = String(s.source ?? 'newest')
  return (
    <div className="space-y-3">
      <BilingualPair labelEn={t.admin.headingEn} labelFa={t.admin.headingFa} valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn={t.admin.descEn} labelFa={t.admin.descFa} valueEn={String(s.descriptionEn ?? '')} valueFa={String(s.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label={t.admin.shelfSource}>
          <select value={source} onChange={(e) => onPatch(section.id, { source: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="newest">{t.admin.sourceNewest}</option>
            <option value="bestselling">{t.admin.sourceBestsellers}</option>
            <option value="featured">{t.admin.sourceFeatured}</option>
            <option value="category">{t.admin.sourceCategory}</option>
            <option value="discounted">{t.admin.sourceOnSale}</option>
            <option value="flash">{t.admin.sourceFlash}</option>
          </select>
        </Field>
        <Field label={t.admin.limitLabel}>
          <Input type="number" min={2} max={24} dir="ltr" value={String(s.limit ?? 8)} onChange={(e) => onPatch(section.id, { limit: Math.max(2, Math.min(24, Number(e.target.value) || 8)) })} className="h-9 bg-white" />
        </Field>
        {source === 'category' ? (
          <Field label={t.admin.categorySlug}><SectionText value={String(s.categorySlug ?? '')} onChange={(v) => onPatch(section.id, { categorySlug: v })} dir="ltr" placeholder="fiction" mono /></Field>
        ) : source === 'flash' ? (
          <Field label={t.admin.flashHours}><Input type="number" min={1} max={72} dir="ltr" value={String(s.flashHours ?? 12)} onChange={(e) => onPatch(section.id, { flashHours: Math.max(1, Math.min(72, Number(e.target.value) || 12)) })} className="h-9 bg-white" /></Field>
        ) : <span />}
        <Field label="Layout">
          <select value={String(s.layout ?? 'grid')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="grid">grid</option>
            <option value="carousel">carousel</option>
            <option value="featured">featured</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t.admin.shelfCta}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.shelfCta} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
        <Field label={t.admin.shelfCtaHref}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/books?sort=new" mono /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <Checkbox checked={Boolean(s.hideWhenEmpty)} onCheckedChange={(v) => onPatch(section.id, { hideWhenEmpty: v === true })} />
        {t.admin.hideWhenEmpty}
      </label>
    </div>
  )
}

/** FOR_YOU / RECENTLY_VIEWED — optional heading override + item limit.
 *  An empty heading falls back to the storefront's built-in dictionary label. */
function SimpleShelfSectionEditor({ section, onPatch }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void }) {
  const s = section.settings
  return (
    <div className="space-y-3">
      <BilingualPair
        labelEn="Heading (EN) — empty = default" labelFa="عنوان (فارسی) — خالی = پیش‌فرض"
        valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')}
        onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Limit">
          <Input type="number" min={3} max={12} dir="ltr" value={String(s.limit ?? 12)} onChange={(e) => onPatch(section.id, { limit: Math.max(3, Math.min(12, Number(e.target.value) || 12)) })} className="h-9 bg-white" />
        </Field>
      </div>
      <p className="text-[11px] text-ink-3">Personalized shelves stay hidden automatically while the visitor has no matching history.</p>
    </div>
  )
}

/** ARTICLES — headings/description + count (2–4) + background + CTA.
 *  Hides itself when the journal is empty. The rendered grid always adapts
 *  to the real article count; this select caps how many are pulled. */
function ArticlesSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const bg = String(s.bg ?? 'white')
  const bgIsPreset = ['white', 'soft', 'paper', 'brand'].includes(bg)
  const selectCls = 'flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm'
  return (
    <div className="space-y-3">
      <BilingualPair labelEn="Heading (EN)" labelFa="عنوان (فارسی)" valueEn={String(s.headingEn ?? '')} valueFa={String(s.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn="Description (EN)" labelFa="توضیح (فارسی)" valueEn={String(s.descriptionEn ?? '')} valueFa={String(s.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label={t.admin.articleCount}>
          <select value={String(s.limit ?? 3)} onChange={(e) => onPatch(section.id, { limit: Number(e.target.value) })} className={selectCls}>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </Field>
        <Field label={t.admin.bgColor}>
          <select value={bgIsPreset ? bg : 'custom'} onChange={(e) => onPatch(section.id, { bg: e.target.value === 'custom' ? '#EAF4F8' : e.target.value })} className={selectCls}>
            <option value="white">{t.admin.bgWhite}</option>
            <option value="soft">{t.admin.bgSoft}</option>
            <option value="paper">{t.admin.bgPaper}</option>
            <option value="brand">{t.admin.bgBrand}</option>
            <option value="custom">{t.admin.bgCustom}</option>
          </select>
        </Field>
        <Field label="CTA (EN)"><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label="CTA (FA)"><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {!bgIsPreset && (
          <Field label={`${t.admin.bgColor} (hex)`}>
            <SectionText value={bg} onChange={(v) => onPatch(section.id, { bg: v })} dir="ltr" placeholder="#EAF4F8" mono />
          </Field>
        )}
        <Field label="CTA link"><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/articles" mono /></Field>
      </div>
    </div>
  )
}

/** SCROLL_STORY — pinned scrollytelling spotlight for ONE book: a tall
 *  section whose sticky panel morphs through scenes as the visitor scrolls
 *  (real scroll, no hijacking). Editor: layout (split / backdrop), per-scene
 *  travel preset, shared eyebrow + CTA, backdrop cover image, and the scene
 *  list (image + label + title + text each). */
function ScrollStorySectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const slides = (s.slides as Record<string, unknown>[] | undefined) ?? []
  const setSlides = (next: Record<string, unknown>[]) => onPatch(section.id, { slides: next })
  const setSlide = (i: number, patch: Record<string, unknown>) => setSlides(slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)))
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={locale === 'fa' ? 'چیدمان' : 'Layout'}>
          <select value={String(s.layout ?? 'split')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="split">{locale === 'fa' ? 'دو ستونه (متن + تصویر)' : 'Split (text + image)'}</option>
            <option value="backdrop">{locale === 'fa' ? 'تمام‌صفحه (بک‌گراند + جلد)' : 'Backdrop (full-bleed + cover)'}</option>
          </select>
        </Field>
        <Field label={locale === 'fa' ? 'طول اسکرول هر صحنه' : 'Scroll length per scene'}>
          <select value={String(s.heightPreset ?? 'classic')} onChange={(e) => onPatch(section.id, { heightPreset: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="compact">{locale === 'fa' ? 'کوتاه (۷۸vh)' : 'Compact (78vh)'}</option>
            <option value="classic">{locale === 'fa' ? 'استاندارد (۱۰۰vh)' : 'Classic (100vh)'}</option>
            <option value="cinematic">{locale === 'fa' ? 'سینمایی (۱۳۰vh)' : 'Cinematic (130vh)'}</option>
          </select>
        </Field>
        <Field label={t.admin.ctaLabel}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
      </div>
      <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(s.eyebrowEn ?? '')} valueFa={String(s.eyebrowFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowFa: v })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t.admin.ctaLink}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/books/…" mono /></Field>
        {/* Backdrop layout: the ONE book's small cover floating over the
            morphing scenes — often the same artwork as the backgrounds. */}
        <ImageField label={locale === 'fa' ? 'جلد شناور (چیدمان تمام‌صفحه)' : 'Floating cover (backdrop layout)'} value={String(s.coverImage ?? '')} onChange={(v) => onPatch(section.id, { coverImage: v })} t={t.admin} />
      </div>
      <MobileVariantBox locale={locale} filled={mobileFilled([s.eyebrowMobileEn, s.eyebrowMobileFa, s.coverImageMobile])}>
        <BilingualPair labelEn="Eyebrow — mobile (EN)" labelFa="سرنویس گوشی (فارسی)" valueEn={String(s.eyebrowMobileEn ?? '')} valueFa={String(s.eyebrowMobileFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowMobileEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowMobileFa: v })} />
        <ImageField label={locale === 'fa' ? 'جلد شناور گوشی (عمودی)' : 'Floating cover — mobile (portrait)'} value={String(s.coverImageMobile ?? '')} onChange={(v) => onPatch(section.id, { coverImageMobile: v })} t={t.admin} />
      </MobileVariantBox>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{t.admin.slides} ({slides.length})</h4>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setSlides([...slides, { image: '', eyebrowEn: '', eyebrowFa: '', titleEn: '', titleFa: '', textEn: '', textFa: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t.admin.addSlide}
        </Button>
      </div>
      {slides.map((sl, i) => (
        <div key={i} className="space-y-3 rounded-md border border-line bg-soft/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">#{i + 1}</p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0} aria-label={t.admin.moveUp} onClick={() => { const next = [...slides]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSlides(next) }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === slides.length - 1} aria-label={t.admin.moveDown} onClick={() => { const next = [...slides]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setSlides(next) }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
              <Button size="sm" variant="ghost" className="h-7 text-error hover:bg-error/10" aria-label={t.admin.removeSlide} onClick={() => setSlides(slides.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
            </div>
          </div>
          <ImageField label={t.admin.slideImage} value={String(sl.image ?? '')} onChange={(v) => setSlide(i, { image: v })} t={t.admin} />
          <MobileVariantBox locale={locale} filled={mobileFilled([sl.imageMobile, sl.eyebrowMobileEn, sl.eyebrowMobileFa, sl.titleMobileEn, sl.titleMobileFa, sl.textMobileEn, sl.textMobileFa])}>
            <ImageField label={locale === 'fa' ? 'تصویر گوشی (عمودی ۹:۱۶)' : 'Mobile image (portrait 9:16)'} value={String(sl.imageMobile ?? '')} onChange={(v) => setSlide(i, { imageMobile: v })} t={t.admin} />
            <BilingualPair labelEn="Scene label — mobile (EN)" labelFa="برچسب صحنهٔ گوشی (فارسی)" valueEn={String(sl.eyebrowMobileEn ?? '')} valueFa={String(sl.eyebrowMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowMobileEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowMobileFa: v })} />
            <BilingualPair labelEn="Title — mobile (EN)" labelFa="عنوان گوشی (فارسی)" valueEn={String(sl.titleMobileEn ?? '')} valueFa={String(sl.titleMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { titleMobileEn: v })} onChangeFa={(v) => setSlide(i, { titleMobileFa: v })} />
            <BilingualPair labelEn="Text — mobile (EN)" labelFa="متن گوشی (فارسی)" valueEn={String(sl.textMobileEn ?? '')} valueFa={String(sl.textMobileFa ?? '')} onChangeEn={(v) => setSlide(i, { textMobileEn: v })} onChangeFa={(v) => setSlide(i, { textMobileFa: v })} rows={2} />
          </MobileVariantBox>
          <BilingualPair labelEn="Scene label (EN)" labelFa="برچسب صحنه (فارسی)" valueEn={String(sl.eyebrowEn ?? '')} valueFa={String(sl.eyebrowFa ?? '')} onChangeEn={(v) => setSlide(i, { eyebrowEn: v })} onChangeFa={(v) => setSlide(i, { eyebrowFa: v })} />
          <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(sl.titleEn ?? '')} valueFa={String(sl.titleFa ?? '')} onChangeEn={(v) => setSlide(i, { titleEn: v })} onChangeFa={(v) => setSlide(i, { titleFa: v })} />
          <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(sl.textEn ?? '')} valueFa={String(sl.textFa ?? '')} onChangeEn={(v) => setSlide(i, { textEn: v })} onChangeFa={(v) => setSlide(i, { textFa: v })} rows={2} />
        </div>
      ))}
    </div>
  )
}

/** CATEGORY_CAROUSEL — headings + category slug list. */
function CarouselSectionEditor({ section, onPatch }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void }) {
  const slugs = ((section.settings.slugs as string[] | undefined) ?? []).join(', ')
  return (
    <div className="space-y-3">
      <BilingualPair labelEn="Heading (EN)" labelFa="عنوان (فارسی)" valueEn={String(section.settings.headingEn ?? '')} valueFa={String(section.settings.headingFa ?? '')} onChangeEn={(v) => onPatch(section.id, { headingEn: v })} onChangeFa={(v) => onPatch(section.id, { headingFa: v })} />
      <BilingualPair labelEn="Description (EN)" labelFa="توضیح (فارسی)" valueEn={String(section.settings.descriptionEn ?? '')} valueFa={String(section.settings.descriptionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { descriptionEn: v })} onChangeFa={(v) => onPatch(section.id, { descriptionFa: v })} />
      <Field label="Category slugs (comma-separated)">
        <SectionText value={slugs} onChange={(v) => onPatch(section.id, { slugs: v.split(',').map((x) => x.trim()).filter(Boolean) })} dir="ltr" placeholder="fiction, poetry, history" mono />
      </Field>
    </div>
  )
}

/** EDITORIAL_FEATURE — layout/background/image/texts/CTA. This is the
 *  “highlight ONE article / ONE author” module («From the journal»,
 *  «From the author»): the admin can place any number of them anywhere. */
function EditorialSectionEditor({ section, onPatch, locale }: { section: SectionRec; onPatch: (id: string, patch: Record<string, unknown>) => void; locale: Locale }) {
  const t = getDict(locale)
  const s = section.settings
  const bg = String(s.bg ?? 'paper')
  const bgIsPreset = ['white', 'soft', 'paper', 'brand'].includes(bg)
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Layout">
          <select value={String(s.layout ?? 'image-left')} onChange={(e) => onPatch(section.id, { layout: e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="image-left">image-left</option>
            <option value="image-right">image-right</option>
            <option value="stacked">stacked</option>
          </select>
        </Field>
        <Field label={t.admin.bgColor}>
          <select value={bgIsPreset ? bg : 'custom'} onChange={(e) => onPatch(section.id, { bg: e.target.value === 'custom' ? '#EAF4F8' : e.target.value })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="white">{t.admin.bgWhite}</option>
            <option value="soft">{t.admin.bgSoft}</option>
            <option value="paper">{t.admin.bgPaper}</option>
            <option value="brand">{t.admin.bgBrand}</option>
            <option value="custom">{t.admin.bgCustom}</option>
          </select>
        </Field>
        <Field label={t.admin.minHeight}>
          <select value={String(s.minH ?? 600)} onChange={(e) => onPatch(section.id, { minH: Number(e.target.value) })} className="flex h-9 w-full rounded-md border border-line bg-white px-2 text-sm">
            <option value="480">480 px</option>
            <option value="600">600 px</option>
            <option value="720">720 px</option>
          </select>
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Checkbox checked={Boolean(s.accentOrange)} onCheckedChange={(v) => onPatch(section.id, { accentOrange: v === true })} /> accent orange
          </label>
        </div>
      </div>
      {!bgIsPreset && (
        <Field label={`${t.admin.bgColor} (hex)`}>
          <SectionText value={bg} onChange={(v) => onPatch(section.id, { bg: v })} dir="ltr" placeholder="#EAF4F8" mono />
        </Field>
      )}
      <ImageField label={t.admin.slideImage} value={String(s.image ?? '')} onChange={(v) => onPatch(section.id, { image: v })} t={t.admin} />
      <BilingualPair labelEn="Eyebrow (EN)" labelFa="سرنویس (فارسی)" valueEn={String(s.eyebrowEn ?? '')} valueFa={String(s.eyebrowFa ?? '')} onChangeEn={(v) => onPatch(section.id, { eyebrowEn: v })} onChangeFa={(v) => onPatch(section.id, { eyebrowFa: v })} />
      <BilingualPair labelEn="Title (EN)" labelFa="عنوان (فارسی)" valueEn={String(s.titleEn ?? '')} valueFa={String(s.titleFa ?? '')} onChangeEn={(v) => onPatch(section.id, { titleEn: v })} onChangeFa={(v) => onPatch(section.id, { titleFa: v })} />
      <BilingualPair labelEn="Text (EN)" labelFa="متن (فارسی)" valueEn={String(s.textEn ?? '')} valueFa={String(s.textFa ?? '')} onChangeEn={(v) => onPatch(section.id, { textEn: v })} onChangeFa={(v) => onPatch(section.id, { textFa: v })} rows={3} />
      <BilingualPair labelEn="Quote (EN)" labelFa="نقل‌قول (فارسی)" valueEn={String(s.quoteEn ?? '')} valueFa={String(s.quoteFa ?? '')} onChangeEn={(v) => onPatch(section.id, { quoteEn: v })} onChangeFa={(v) => onPatch(section.id, { quoteFa: v })} rows={2} />
      <BilingualPair labelEn="Attribution (EN)" labelFa="منبع (فارسی)" valueEn={String(s.attributionEn ?? '')} valueFa={String(s.attributionFa ?? '')} onChangeEn={(v) => onPatch(section.id, { attributionEn: v })} onChangeFa={(v) => onPatch(section.id, { attributionFa: v })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t.admin.ctaLabel}><SectionText value={String(s.ctaEn ?? '')} onChange={(v) => onPatch(section.id, { ctaEn: v })} dir="ltr" /></Field>
        <Field label={`${t.admin.ctaLabel} (FA)`}><SectionText value={String(s.ctaFa ?? '')} onChange={(v) => onPatch(section.id, { ctaFa: v })} dir="rtl" lang="fa" /></Field>
        <Field label={t.admin.ctaLink}><SectionText value={String(s.ctaHref ?? '')} onChange={(v) => onPatch(section.id, { ctaHref: v })} dir="ltr" placeholder="/articles/…" mono /></Field>
      </div>
    </div>
  )
}

interface AdminReview { id: string; productTitle: string; authorName: string; rating: number; title?: string; body: string; moderationState: string; moderationReason?: string | null; reply?: string | null; repliedAt?: string | null; createdAt: string; locale: string }

function AdminReviews() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [reviews, setReviews] = useState<AdminReview[] | null>(null)
  const [state, setState] = useState('PENDING')
  // Per-review action state (Task 27: reject reason + public press reply)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [reasonOpen, setReasonOpen] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ items: AdminReview[] }>('/api/admin/reviews?state=' + state).then((r) => setReviews(r.items)).catch(() => setReviews([]))
  }, [state])
  useEffect(() => { load() }, [load])

  const moderate = async (id: string, moderationState: string, reason?: string | null) => {
    setBusy(true)
    try {
      await apiPatch(`/api/admin/reviews/${id}`, { moderationState, ...(reason !== undefined ? { reason } : {}) })
      toast({ title: t.admin.saved })
      setReasonOpen(null); setReasonText('')
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }
  const saveReply = async (id: string) => {
    const reply = (replyDraft[id] ?? '').trim()
    setBusy(true)
    try {
      await apiPatch(`/api/admin/reviews/${id}`, { reply: reply || null })
      toast({ title: t.admin.replySaved })
      setReplyDraft((d) => ({ ...d, [id]: '' }))
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  if (!reviews) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'SPAM'].map((s) => (
          <button key={s} type="button" onClick={() => setState(s)}
            className={cn('h-9 rounded-md border px-3 text-xs font-medium', state === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2')}>
            {s}
          </button>
        ))}
      </div>
      {reviews.length === 0 ? <EmptyState title={t.admin.reviews} /> : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-orange-accent" aria-hidden>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <p className="text-sm font-semibold text-ink">{r.title}</p>
                <Badge tone={r.moderationState === 'APPROVED' ? 'success' : r.moderationState === 'PENDING' ? 'warning' : 'default'}>{r.moderationState}</Badge>
                <span className="ms-auto text-xs text-ink-3">{r.authorName} · {formatDate(r.createdAt, locale)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{r.productTitle} · <span className="bdi" dir="ltr">{r.locale}</span></p>
              <p className="mt-2 text-sm text-ink-2">{r.body}</p>
              {r.reply && (
                <div className="mt-2 rounded-e-md border-s-2 border-brand/30 bg-soft/60 px-3 py-2" role="note">
                  <p className="text-[11px] font-semibold text-brand">{t.admin.replyLabel}{r.repliedAt ? ` · ${formatDate(r.repliedAt, locale)}` : ''}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{r.reply}</p>
                </div>
              )}
              {r.moderationReason && <p className="mt-1.5 text-[11px] text-ink-3">{t.admin.rejectReason}: {r.moderationReason}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-8" disabled={busy} onClick={() => moderate(r.id, 'APPROVED')}>{t.admin.approve}</Button>
                {reasonOpen === r.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder={t.admin.reasonPlaceholder} className="h-8 min-w-48 flex-1" autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') void moderate(r.id, 'REJECTED', reasonText.trim() || null) }} />
                    <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void moderate(r.id, 'REJECTED', reasonText.trim() || null)}>{t.admin.reject}</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setReasonOpen(null)}>{t.common.cancel}</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => { setReasonOpen(r.id); setReasonText(r.moderationReason ?? '') }}>{t.admin.reject}</Button>
                )}
                <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => moderate(r.id, 'SPAM')}>{t.admin.spam}</Button>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Label htmlFor={`rv-reply-${r.id}`} className="mb-1 text-xs text-ink-3">{t.admin.replyLabel}</Label>
                  <textarea
                    id={`rv-reply-${r.id}`} rows={2} value={replyDraft[r.id] ?? ''} maxLength={2000} placeholder={t.admin.replyPlaceholder}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8" disabled={busy || !(replyDraft[r.id] ?? '').trim()} onClick={() => void saveReply(r.id)}>
                  {t.admin.replySaved.length ? t.admin.saved : t.admin.saved}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


function AdminTickets() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [tickets, setTickets] = useState<{ id: string; ticketNumber: string; subject: string; email: string; name?: string | null; status: string; priority: string; category: string; relatedOrderNumber?: string | null; createdAt: string; lastMessagePreview?: string | null }[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  // Thread dialog (audit: the API returned the full conversation — the UI never called it)
  const [thread, setThread] = useState<{ id: string; ticketNumber: string; subject: string; email: string; name?: string | null; status: string; priority: string; relatedOrderNumber?: string | null; createdAt: string; messages: { id: string; senderType: string; senderName: string; body: string; createdAt: string }[]; relatedOrder?: { orderNumber: string; status: string; totalMinor: number; email: string } | null } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiGet<{ items: NonNullable<typeof tickets> }>('/api/admin/tickets' + (statusFilter ? `?status=${statusFilter}` : '')).then((r) => setTickets(r.items)).catch(() => setTickets([]))
  }, [statusFilter])
  useEffect(() => { load() }, [load])

  const openThread = async (id: string) => {
    setReply('')
    try {
      const r = await apiGet<{ ticket: NonNullable<typeof thread> }>(`/api/admin/tickets/${id}`)
      setThread(r.ticket)
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }
  useEffect(() => {
    if (!thread) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setThread(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [thread])

  const send = async () => {
    if (!thread || !reply.trim()) return
    setBusy(true)
    try {
      await apiPost(`/api/admin/tickets/${thread.id}/messages`, { body: reply.trim() })
      setReply('')
      toast({ title: t.admin.replySaved.length ? t.admin.replySaved : t.admin.saved })
      await openThread(thread.id)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) } finally { setBusy(false) }
  }
  const patchTicket = async (id: string, patch: { status?: string; priority?: string }) => {
    try {
      await apiPatch(`/api/admin/tickets/${id}`, patch)
      await openThread(id)
      load()
    } catch (e) { toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' }) }
  }

  const prioTone = (p: string) => (p === 'HIGH' ? 'error' : p === 'LOW' ? 'default' : 'brand') as 'error' | 'default' | 'brand'
  const STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_SUPPORT', 'CLOSED']

  if (!tickets) return <Spinner label={t.common.loading} />
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-lg font-semibold text-ink">{t.admin.tickets}</h2>
        {['', ...STATUSES].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)}
            className={cn('h-8 rounded-md border px-3 text-xs font-medium', statusFilter === s ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
            {s === '' ? t.admin.filterAll : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {tickets.length === 0 ? <EmptyState title={t.admin.tickets} /> : (
        <ul className="space-y-3">
          {tickets.map((tk) => (
            <li key={tk.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{tk.subject}</p>
                <Badge tone={tk.status === 'OPEN' ? 'warning' : tk.status === 'CLOSED' ? 'default' : 'brand'}>{tk.status.replace(/_/g, ' ')}</Badge>
                <Badge tone={prioTone(tk.priority)}>{tk.priority}</Badge>
                <span className="ms-auto text-xs text-ink-3 bdi" dir="ltr">{tk.ticketNumber} · {tk.email}</span>
              </div>
              {tk.lastMessagePreview && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{tk.lastMessagePreview}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openThread(tk.id)}>
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />{t.admin.viewThread}
                </Button>
                {tk.status === 'CLOSED' && (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => patchTicket(tk.id, { status: 'OPEN' })}>{t.admin.reopen}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {thread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t.admin.thread} onClick={() => setThread(null)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-ink">{thread.subject}</h3>
                  <p className="mt-0.5 text-xs text-ink-3 bdi" dir="ltr">{thread.ticketNumber} · {thread.name ?? thread.email}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setThread(null)}>✕</Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={thread.status} onChange={(e) => patchTicket(thread.id, { status: e.target.value })} className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={thread.priority} onChange={(e) => patchTicket(thread.id, { priority: e.target.value })} className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium">
                  <option value="LOW">{t.admin.prioLow}</option>
                  <option value="NORMAL">{t.admin.prioNormal}</option>
                  <option value="HIGH">{t.admin.prioHigh}</option>
                </select>
                {thread.relatedOrder && (
                  <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand bdi" dir="ltr">
                    {t.admin.relatedOrder}: {thread.relatedOrder.orderNumber} · {formatMoney(thread.relatedOrder.totalMinor, locale)}
                  </span>
                )}
              </div>
            </div>
            <div className="min-h-40 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-slim">
              {thread.messages.map((m) => {
                const mine = m.senderType === 'SUPPORT'
                return (
                  <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                    <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                      mine ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-line bg-soft/70 text-ink')}>
                      {m.body}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-3">{mine ? t.admin.you : t.admin.customer} · {formatDateTime(m.createdAt, locale)}</p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-line p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply} rows={2} onChange={(e) => setReply(e.target.value)} placeholder={t.admin.reply}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send() }}
                  className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                />
                <Button size="sm" className="h-9" disabled={busy || !reply.trim()} onClick={() => void send()}>{t.admin.sendReply}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function AdminReports() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<{
    daily: { date: string; orders: number; revenueMinor: number }[]
    byProduct: { title: string; units: number; revenueMinor: number }[]
    byCountry: { countryCode: string; orders: number; revenueMinor: number }[]
    byPromotion: { name: string; orders: number; savedMinor: number; revenueMinor: number }[]
    totals: { orders: number; revenueMinor: number; refundsMinor: number; taxMinor: number; aovMinor: number }
  } | null>(null)

  const [days, setDays] = useState(30)
  useEffect(() => { apiGet<typeof data>(`/api/admin/reports?days=${days}`).then(setData).catch(() => setData(null)) }, [days])

  if (!data) return <Spinner label={t.common.loading} />
  const maxRevenue = Math.max(...data.daily.map((d) => d.revenueMinor), 1)
  const maxPromoRevenue = Math.max(...data.byPromotion.map((p) => p.revenueMinor), 1)
  const promoOrdersTotal = data.byPromotion.reduce((s, p) => s + p.orders, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{t.admin.reports}</h2>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={cn('h-8 rounded-md border px-3 text-xs font-medium', days === d ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-soft')}>
              {locale === 'fa' ? faDigits(d) : d} {locale === 'fa' ? 'روز' : 'd'}
            </button>
          ))}
          <a href={`/api/admin/reports/export?days=${days}`} className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink-2 hover:bg-soft">{t.admin.exportCsv}</a>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={t.admin.orders} value={data.totals.orders} />
        <Card title={t.admin.revenue} value={formatMoney(data.totals.revenueMinor, locale)} />
        <Card title="AOV" value={formatMoney(data.totals.aovMinor, locale)} />
        <Card title="VAT" value={formatMoney(data.totals.taxMinor, locale)} />
      </div>
      <section className="rounded-lg border border-line p-4" aria-label={t.admin.daily}>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t.admin.daily}</h3>
        <div className="flex h-36 items-end gap-1">
          {data.daily.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${formatMoney(d.revenueMinor, locale)}`}>
              <div className="rounded-t bg-brand/80 transition group-hover:bg-brand" style={{ height: `${Math.max(3, (d.revenueMinor / maxRevenue) * 130)}px` }} />
            </div>
          ))}
        </div>
      </section>

      {/* Promotion performance — attribution from order snapshots */}
      <section className="overflow-hidden rounded-lg border border-orange-accent/25 bg-gradient-to-b from-orange-accent/[0.04] to-white" aria-label={t.admin.byPromotion}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-accent/20 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-accent/15 text-orange-accent" aria-hidden><PieChart className="h-3.5 w-3.5" /></span>
            {t.admin.byPromotion}
          </h3>
          {data.byPromotion.length > 0 && <Badge tone="warning">{tf(t.admin.discountOrders, { n: promoOrdersTotal })}</Badge>}
        </div>
        {data.byPromotion.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-3">{t.admin.promoImpactNone}</p>
        ) : (
          <ul className="divide-y divide-orange-accent/10">
            {data.byPromotion.map((p) => {
              const share = data.totals.orders > 0 ? Math.round((p.orders / data.totals.orders) * 100) : 0
              return (
                <li key={p.name} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-accent/15 text-xs font-bold text-orange-accent" aria-hidden>%</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                    <Badge>{p.orders} {t.admin.discountOrders}</Badge>
                    <span className="text-xs text-ink-3">{t.admin.promoSavedCol}: <span className="font-semibold text-success bdi">−{formatMoney(p.savedMinor, locale)}</span></span>
                    <span className="text-sm font-semibold text-ink bdi">{formatMoney(p.revenueMinor, locale)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 ps-9">
                    <div className="h-1.5 max-w-64 flex-1 overflow-hidden rounded-full bg-soft" role="presentation">
                      <div className="h-full rounded-full bg-gradient-to-r from-orange-accent/70 to-orange-accent" style={{ width: `${Math.max(4, (p.revenueMinor / maxPromoRevenue) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-ink-3 bdi">{share}% {t.admin.promoShareCol.toLowerCase()}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line" aria-label="By product">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topProducts}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.byProduct.slice(0, 8).map((p) => (
              <li key={p.title} className="flex justify-between px-4 py-2.5">
                <span className="min-w-0 truncate text-ink-2">{p.title}</span>
                <span className="shrink-0 ps-3 bdi">{p.units} {t.admin.units} · {formatMoney(p.revenueMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-line" aria-label="By country">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.country}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.byCountry.map((c) => (
              <li key={c.countryCode} className="flex justify-between px-4 py-2.5">
                <span className="bdi" dir="ltr">{c.countryCode}</span>
                <span className="bdi">{c.orders} · {formatMoney(c.revenueMinor, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function AdminAudit() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [entries, setEntries] = useState<{ id: string; actorEmail: string; action: string; entityType: string; entityId: string; summary: string; createdAt: string }[] | null>(null)
  const [limit, setLimit] = useState(50)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    apiGet<{ items: NonNullable<typeof entries> }>(`/api/admin/audit-log?limit=${limit}`)
      .then((r) => { setEntries(r.items); setExhausted(r.items.length < limit) })
      .catch(() => setEntries([]))
  }, [limit])

  if (!entries) return <Spinner label={t.common.loading} />
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">{t.admin.auditLog}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-2.5">
            <p className="text-ink-2">{e.summary}</p>
            <p className="mt-0.5 text-xs text-ink-3 bdi" dir="ltr">{e.action} · {e.actorEmail} · {formatDateTime(e.createdAt, locale)}</p>
          </li>
        ))}
      </ul>
      {!exhausted && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setLimit((l) => Math.min(200, l + 50))}>
            {t.admin.loadMore} ({entries.length})
          </Button>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Analytics (PRD 30.1) ─────────────────────────

interface AnalyticsData {
  totals: { viewProduct: number; addToCart: number; beginCheckout: number; purchase: number; search: number; viewArticle: number }
  topViewed: { slug: string; title: string; views: number }[]
  daily: { date: string; view_product: number; add_to_cart: number; begin_checkout: number; purchase: number }[]
  recentPurchases: { id: string; path?: string; locale: string; valueMinor?: number; createdAt: string }[]
}

function FunnelCard({ label, value, prev, icon }: { label: string; value: number; prev?: number; icon?: React.ReactNode }) {
  const pct = prev && prev > 0 ? Math.round((value / prev) * 100) : null
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
        {icon}{label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {pct !== null && <p className="mt-0.5 text-xs text-ink-3 bdi">→ {pct}%</p>}
    </div>
  )
}

function AdminAnalytics() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const [data, setData] = useState<AnalyticsData | null>(null)

  useEffect(() => { apiGet<AnalyticsData>('/api/admin/analytics').then(setData).catch(() => setData(null)) }, [])

  if (!data) return <Spinner label={t.common.loading} />

  const stages = [data.totals.viewProduct, data.totals.addToCart, data.totals.beginCheckout, data.totals.purchase]
  const maxStage = Math.max(...stages, 1)
  const maxDaily = Math.max(...data.daily.map((d) => Math.max(d.view_product, d.add_to_cart, d.begin_checkout, d.purchase)), 1)
  const stageColors: Record<string, string> = {
    view_product: 'bg-brand',
    add_to_cart: 'bg-orange-accent',
    begin_checkout: 'bg-success',
    purchase: 'bg-ink',
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">{t.admin.analytics}</h2>

      {/* Funnel */}
      <section aria-label={t.admin.funnel}>
        <h3 className="mb-3 text-sm font-semibold text-ink">{t.admin.funnel}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FunnelCard label={t.admin.stageViews} value={data.totals.viewProduct} icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />} />
          <FunnelCard label={t.admin.stageCarts} value={data.totals.addToCart} prev={data.totals.viewProduct} />
          <FunnelCard label={t.admin.stageCheckout} value={data.totals.beginCheckout} prev={data.totals.addToCart} />
          <FunnelCard label={t.admin.stagePurchases} value={data.totals.purchase} prev={data.totals.beginCheckout} />
        </div>
        {/* Relative bar overview */}
        <div className="mt-3 space-y-1.5">
          {([
            [t.admin.stageViews, data.totals.viewProduct, 'bg-brand'],
            [t.admin.stageCarts, data.totals.addToCart, 'bg-orange-accent'],
            [t.admin.stageCheckout, data.totals.beginCheckout, 'bg-success'],
            [t.admin.stagePurchases, data.totals.purchase, 'bg-ink'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-ink-3">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(2, (value / maxStage) * 100)}%` }} />
              </div>
              <span className="w-10 text-end text-xs font-semibold tabular-nums text-ink-2">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Daily grouped bars */}
      <section className="rounded-lg border border-line p-4" aria-label={t.admin.eventsByDay}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t.admin.eventsByDay}</h3>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
            {([['view_product', t.admin.stageViews], ['add_to_cart', t.admin.stageCarts], ['begin_checkout', t.admin.stageCheckout], ['purchase', t.admin.stagePurchases]] as [string, string][]).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-sm', stageColors[k])} aria-hidden />{label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-36 items-end gap-1">
          {data.daily.map((d) => (
            <div
              key={d.date}
              className="group relative flex flex-1 items-end justify-center gap-px"
              title={`${d.date}: ${d.view_product} / ${d.add_to_cart} / ${d.begin_checkout} / ${d.purchase}`}
            >
              <div className={cn('w-1/4 rounded-t-sm', stageColors.view_product, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.view_product / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.add_to_cart, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.add_to_cart / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.begin_checkout, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.begin_checkout / maxDaily) * 130)}px` }} />
              <div className={cn('w-1/4 rounded-t-sm', stageColors.purchase, 'opacity-80 transition group-hover:opacity-100')} style={{ height: `${Math.max(2, (d.purchase / maxDaily) * 130)}px` }} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top viewed */}
        <section className="rounded-lg border border-line" aria-label={t.admin.topViewed}>
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.topViewed}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.topViewed.length === 0 ? <li className="px-4 py-3 text-ink-3">—</li> : data.topViewed.map((p, i) => (
              <li key={p.slug} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{p.title}</span>
                <span className="text-xs font-semibold tabular-nums text-ink">{p.views} 👁</span>
              </li>
            ))}
          </ul>
        </section>
        {/* Secondary totals */}
        <section className="grid content-start gap-3 sm:grid-cols-2" aria-label={t.admin.searches}>
          <Card title={t.admin.searches} value={data.totals.search} />
          <Card title={t.admin.articleViews} value={data.totals.viewArticle} />
          <div className="sm:col-span-2 rounded-lg border border-line">
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.admin.stagePurchases}</h3>
            <ul className="divide-y divide-line text-sm">
              {data.recentPurchases.length === 0 ? <li className="px-4 py-3 text-ink-3">—</li> : data.recentPurchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-ink-3">{formatDateTime(p.createdAt, locale)}</span>
                  {p.valueMinor != null && <span className="text-xs font-semibold bdi">{formatMoney(p.valueMinor, locale)}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

// ───────────────────────── Marketing (newsletter + email outbox) ─────────────────────────

interface Subscriber { id: string; email: string; locale: string; source: string; status: string; createdAt: string }
interface BisGroup {
  variantId: string; sku: string; stock: number
  productTitle: string; productTitleFa: string; productSlug: string
  requests: { id: string; email: string; locale: string; notifiedAt: string | null; createdAt: string }[]
}
interface OutboxEmail {
  id: string; orderId: string | null; orderNumber: string; to: string; kind: 'ORDER_CONFIRMATION' | 'SHIPPING_NOTICE' | 'BACK_IN_STOCK' | 'PASSWORD_RESET'
  locale: string; createdAt: string; subject: string; greeting: string; intro: string
  items: { title: string; qty: number; lineTotalMinor: number }[]
  subtotalMinor: number; discountCode?: string | null; discountMinor?: number
  giftWrap?: boolean; giftWrapMinor?: number; giftMessage?: string | null
  shippingMinor: number; totalMinor: number
  carrier?: string; trackingUrl?: string
  product?: { title: string; titleFa: string; slug: string; sku: string } | null
  footerNote: string
}

function AdminMarketing() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const { toast } = useToast()
  const [subs, setSubs] = useState<{ items: Subscriber[]; total: number; subscribedCount: number } | null>(null)
  const [emails, setEmails] = useState<OutboxEmail[] | null>(null)
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  const [bisGroups, setBisGroups] = useState<BisGroup[] | null>(null)

  useEffect(() => {
    apiGet<{ items: Subscriber[]; total: number; subscribedCount: number }>('/api/admin/newsletter')
      .then(setSubs).catch(() => setSubs({ items: [], total: 0, subscribedCount: 0 }))
    apiGet<{ items: OutboxEmail[] }>('/api/admin/emails')
      .then((r) => setEmails(r.items)).catch(() => setEmails([]))
    apiGet<{ variants: BisGroup[] }>('/api/admin/back-in-stock')
      .then((r) => setBisGroups(r.variants)).catch(() => setBisGroups([]))
  }, [])

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
        {emails.length === 0 ? (
          <EmptyState title={t.admin.outbox} body={t.admin.noEmails} />
        ) : (
          <ul className="space-y-2">
            {emails.map((em) => {
              const open = openEmail === em.id
              const isBis = em.kind === 'BACK_IN_STOCK'
              const isReset = em.kind === 'PASSWORD_RESET'
              return (
                <li key={em.id} className={cn('overflow-hidden rounded-lg border', isBis && openEmail !== em.id ? 'border-warning/30' : isReset && openEmail !== em.id ? 'border-brand/25' : 'border-line')}>
                  <button
                    type="button" onClick={() => setOpenEmail(open ? null : em.id)} aria-expanded={open}
                    className={cn('flex w-full flex-wrap items-center gap-2 px-4 py-3 text-start transition hover:bg-soft/60', open && 'bg-brand-soft/40')}
                  >
                    {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
                    {isBis ? (
                      <Badge tone="warning"><BellRing className="me-1 h-3 w-3" aria-hidden />{t.admin.outboxBis}</Badge>
                    ) : isReset ? (
                      <Badge tone="default"><KeyRound className="me-1 h-3 w-3" aria-hidden />{t.admin.outboxReset}</Badge>
                    ) : (
                      <Badge tone={em.kind === 'SHIPPING_NOTICE' ? 'brand' : 'success'}>{em.kind === 'SHIPPING_NOTICE' ? t.account.shipped : '✓'}</Badge>
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
                        </>
                      )}
                      <p className="mt-5 border-t border-line pt-3 text-[11px] text-ink-3">{em.footerNote}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Store settings (owner-only): gift wrap service toggle + price, with a live
 *  preview of the checkout card. Writes go through /api/admin/settings (audited). */
function AdminSettings() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [data, setData] = useState<{ enabled: boolean; priceMinor: number; updatedBy?: string | null; updatedAt?: string | null } | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [price, setPrice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  // ── Store identity + commerce state ──
  interface StoreRow {
    name: string; nameFa: string; legalName: string; email: string
    phone: string; address: string
    instagram?: string; x?: string; youtube?: string
    freeShippingThresholdMinor: number; vatRatePct?: number; vatIncluded?: boolean
    updatedBy?: string | null; updatedAt?: string | null
  }
  const [store, setStore] = useState<StoreRow | null>(null)
  const [stName, setStName] = useState('')
  const [stNameFa, setStNameFa] = useState('')
  const [stLegal, setStLegal] = useState('')
  const [stEmail, setStEmail] = useState('')
  const [stPhone, setStPhone] = useState('')
  const [stAddress, setStAddress] = useState('')
  const [stThreshold, setStThreshold] = useState('')
  const [stInstagram, setStInstagram] = useState('')
  const [stX, setStX] = useState('')
  const [stYoutube, setStYoutube] = useState('')
  const [storeDirty, setStoreDirty] = useState(false)
  const [storeBusy, setStoreBusy] = useState(false)

  useEffect(() => {
    let alive = true
    apiGet<{
      features: { giftWrap?: { enabled: boolean; priceMinor: number } }
      featuresMeta: { giftWrapUpdatedBy?: string; giftWrapUpdatedAt?: string }
      store: Record<string, unknown>
      storeMeta: { updatedBy?: string; updatedAt?: string }
    }>('/api/admin/settings')
      .then((r) => {
        if (!alive) return
        const gw = r.features.giftWrap ?? { enabled: true, priceMinor: 250 }
        setData({ enabled: gw.enabled, priceMinor: gw.priceMinor, updatedBy: r.featuresMeta.giftWrapUpdatedBy ?? null, updatedAt: r.featuresMeta.giftWrapUpdatedAt ?? null })
        setEnabled(gw.enabled)
        setPrice((gw.priceMinor / 100).toFixed(2))
        setDirty(false)
        const s = r.store as Partial<StoreRow>
        const row: StoreRow = {
          name: s.name ?? 'Persepix',
          nameFa: s.nameFa ?? 'پرس‌پیکس',
          legalName: s.legalName ?? '',
          email: s.email ?? '',
          phone: s.phone ?? '',
          address: s.address ?? '',
          freeShippingThresholdMinor: s.freeShippingThresholdMinor ?? 6000,
          vatRatePct: s.vatRatePct ?? 10,
          vatIncluded: s.vatIncluded ?? true,
          updatedBy: r.storeMeta?.updatedBy ?? null,
          updatedAt: r.storeMeta?.updatedAt ?? null,
        }
        setStore(row)
        setStName(row.name)
        setStNameFa(row.nameFa)
        setStLegal(row.legalName)
        setStEmail(row.email)
        setStPhone(row.phone)
        setStAddress(row.address)
        setStThreshold((row.freeShippingThresholdMinor / 100).toFixed(2))
        setStInstagram(s.instagram ?? '')
        setStX(s.x ?? '')
        setStYoutube(s.youtube ?? '')
        setStoreDirty(false)
      })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [])

  if (!data) return <Spinner label={t.common.loading} />

  const parsedPrice = Math.round(Number(price) * 100)
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice <= 5000
  const priceChanged = parsedPrice !== data.priceMinor
  const save = async () => {
    if (!priceValid) { toast({ title: t.admin.gwPrice + ': 0–50.00 €', variant: 'destructive' }); return }
    setBusy(true)
    try {
      const body: { giftWrap: { enabled: boolean; priceMinor?: number } } = { giftWrap: { enabled } }
      if (priceChanged) body.giftWrap.priceMinor = parsedPrice
      const r = await apiPatch<{ giftWrap: { enabled: boolean; priceMinor: number } }>('/api/admin/settings', body)
      setData({ enabled: r.giftWrap.enabled, priceMinor: r.giftWrap.priceMinor, updatedBy: data.updatedBy, updatedAt: new Date().toISOString() })
      setPrice((r.giftWrap.priceMinor / 100).toFixed(2))
      setDirty(false)
      toast({ title: t.admin.gwSaved })
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const enabledChanged = enabled !== data.enabled

  // ── Store dirty detection + save ──
  const stThresholdMinor = Math.round(Number(stThreshold) * 100)
  const storeValid =
    stName.trim().length >= 2 && stNameFa.trim().length >= 2 && stLegal.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stEmail.trim())
    && (stPhone.trim().length === 0 || stPhone.trim().length >= 6)
    && (stAddress.trim().length === 0 || stAddress.trim().length >= 6)
    && Number.isFinite(stThresholdMinor) && stThresholdMinor >= 0 && stThresholdMinor <= 200_000
  const saveStore = async () => {
    if (!store || !storeValid) return
    setStoreBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      if (stName !== store.name) patch.name = stName.trim()
      if (stNameFa !== store.nameFa) patch.nameFa = stNameFa.trim()
      if (stLegal !== store.legalName) patch.legalName = stLegal.trim()
      if (stEmail !== store.email) patch.email = stEmail.trim()
      if (stPhone.trim() !== store.phone) patch.phone = stPhone.trim()
      if (stAddress.trim() !== store.address) patch.address = stAddress.trim()
      if (stThresholdMinor !== store.freeShippingThresholdMinor) patch.freeShippingThresholdMinor = stThresholdMinor
      if (stInstagram.trim() !== (store.instagram ?? '')) patch.instagram = stInstagram.trim()
      if (stX.trim() !== (store.x ?? '')) patch.x = stX.trim()
      if (stYoutube.trim() !== (store.youtube ?? '')) patch.youtube = stYoutube.trim()
      if (Object.keys(patch).length === 0) return
      const r = await apiPatch<{ store: Record<string, unknown> }>('/api/admin/settings', { store: patch })
      const s = r.store as Partial<StoreRow>
      setStore((prev) => prev ? {
        ...prev,
        ...s,
        freeShippingThresholdMinor: s.freeShippingThresholdMinor ?? prev.freeShippingThresholdMinor,
        updatedBy: data.updatedBy,
        updatedAt: new Date().toISOString(),
      } : prev)
      setStThreshold(((s.freeShippingThresholdMinor ?? store.freeShippingThresholdMinor) / 100).toFixed(2))
      setStoreDirty(false)
      toast({ title: t.admin.storeSaved })
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? t.common.error, variant: 'destructive' })
    } finally { setStoreBusy(false) }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-ink">{t.admin.settingsTitle}</h2>
      <p className="mt-1 text-sm text-ink-3">{t.admin.settingsHint}</p>

      {/* Store identity card */}
      {store && (
        <section
          className={cn(
            'mt-5 rounded-lg border p-4 transition-colors',
            storeDirty ? 'border-brand/40 bg-brand-soft/30' : 'border-brand/20 bg-gradient-to-br from-brand-soft/50 to-transparent',
          )}
          aria-label={t.admin.storeCardTitle}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Store className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">{t.admin.storeCardTitle}</h3>
                <p className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-3">{t.admin.storeCardHint}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={cn('rounded-md border p-3', stName !== store.name ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-name" className="text-xs">{t.admin.storeName}</Label>
              <Input id="store-name" value={stName} onChange={(e) => { setStName(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={60} />
            </div>
            <div lang="fa" dir="rtl" className={cn('rounded-md border p-3', stNameFa !== store.nameFa ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-name-fa" className="text-xs">{t.admin.storeNameFa}</Label>
              <Input id="store-name-fa" value={stNameFa} onChange={(e) => { setStNameFa(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={60} />
            </div>
            <div className={cn('rounded-md border p-3', stLegal !== store.legalName ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-legal" className="text-xs">{t.admin.storeLegal}</Label>
              <Input id="store-legal" value={stLegal} onChange={(e) => { setStLegal(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={120} />
            </div>
            <div className={cn('rounded-md border p-3', stEmail !== store.email ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-email" className="text-xs">{t.admin.storeEmail}</Label>
              <Input id="store-email" type="email" dir="ltr" value={stEmail} onChange={(e) => { setStEmail(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9 font-mono text-[13px]" maxLength={120} />
            </div>
            <div className={cn('rounded-md border p-3', stPhone.trim() !== store.phone ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-phone" className="text-xs">{t.admin.storePhone}</Label>
              <div className="relative mt-1.5">
                <Input id="store-phone" type="tel" dir="ltr" value={stPhone} onChange={(e) => { setStPhone(e.target.value); setStoreDirty(true) }} className="h-9 ps-8 font-mono text-[13px]" maxLength={40} placeholder="+43 …" />
                <Phone className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-3" aria-hidden />
              </div>
            </div>
            <div className={cn('rounded-md border p-3 sm:col-span-2', stAddress.trim() !== store.address ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-address" className="text-xs">{t.admin.storeAddress}</Label>
              <div className="relative mt-1.5">
                <Input id="store-address" value={stAddress} onChange={(e) => { setStAddress(e.target.value); setStoreDirty(true) }} className="h-9 ps-8" maxLength={200} />
                <MapPin className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-3" aria-hidden />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{t.admin.storeCardHint}</p>
            </div>
          </div>

          {/* Social profiles (Task 50) — footer + contact page, hidden when empty */}
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <Share2 className="h-3 w-3" aria-hidden />{t.admin.socialTitle}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={cn('rounded-md border p-3', stInstagram.trim() !== (store.instagram ?? '') ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
                <Label htmlFor="store-instagram" className="flex items-center gap-1.5 text-xs"><Instagram className="h-3.5 w-3.5 text-ink-3" aria-hidden />Instagram</Label>
                <Input id="store-instagram" dir="ltr" value={stInstagram} onChange={(e) => { setStInstagram(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9 font-mono text-[13px]" maxLength={200} placeholder="https://instagram.com/persepix" />
              </div>
              <div className={cn('rounded-md border p-3', stX.trim() !== (store.x ?? '') ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
                <Label htmlFor="store-x" className="flex items-center gap-1.5 text-xs"><Twitter className="h-3.5 w-3.5 text-ink-3" aria-hidden />X (Twitter)</Label>
                <Input id="store-x" dir="ltr" value={stX} onChange={(e) => { setStX(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9 font-mono text-[13px]" maxLength={200} placeholder="https://x.com/persepix" />
              </div>
              <div className={cn('rounded-md border p-3', stYoutube.trim() !== (store.youtube ?? '') ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
                <Label htmlFor="store-youtube" className="flex items-center gap-1.5 text-xs"><Youtube className="h-3.5 w-3.5 text-ink-3" aria-hidden />YouTube</Label>
                <Input id="store-youtube" dir="ltr" value={stYoutube} onChange={(e) => { setStYoutube(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9 font-mono text-[13px]" maxLength={200} placeholder="https://youtube.com/@persepix" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">{t.admin.socialHint}</p>
          </div>

          {/* Header preview */}
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3"><Clock className="h-3 w-3" aria-hidden />{t.admin.storePreview}</p>
            <div className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white" aria-hidden>س</span>
              <span className="text-sm font-semibold tracking-tight text-ink">{isFa ? stNameFa : stName}</span>
              {stPhone.trim() && (
                <span className="hidden items-center gap-1 text-[11px] text-ink-3 sm:flex bdi" dir="ltr">
                  <Phone className="h-3 w-3" aria-hidden />{stPhone}
                </span>
              )}
              <span className="ms-auto hidden text-[11px] text-ink-3 sm:block bdi" dir="ltr">{stEmail}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-ink-3">
              {store.updatedBy ? tf(t.admin.gwUpdatedBy, { email: store.updatedBy, date: formatDateTime(store.updatedAt ?? new Date().toISOString(), locale) }) : null}
            </p>
            <Button size="sm" className="h-9" disabled={storeBusy || !storeDirty || !storeValid} onClick={saveStore}>
              {storeBusy ? t.common.saving : t.admin.storeSave}
            </Button>
          </div>
        </section>
      )}

      {/* Storefront commerce card */}
      {store && (
        <section
          className={cn(
            'mt-4 rounded-lg border p-4 transition-colors',
            storeDirty ? 'border-brand/40 bg-brand-soft/30' : 'border-line bg-gradient-to-br from-soft/70 to-transparent',
          )}
          aria-label={t.admin.commerceCardTitle}
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Truck className="h-4.5 w-4.5 mirror-rtl" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">{t.admin.commerceCardTitle}</h3>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-3">{t.admin.commerceCardHint}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={cn('rounded-md border p-3', stThresholdMinor !== store.freeShippingThresholdMinor ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-threshold" className="text-xs">{t.admin.commerceThreshold}</Label>
              <div className="relative mt-1.5">
                <Input
                  id="store-threshold" type="number" min={0} max={2000} step={1} dir="ltr"
                  value={stThreshold} onChange={(e) => { setStThreshold(e.target.value); setStoreDirty(true) }}
                  className="h-9 pe-8 font-mono"
                />
                <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-xs font-semibold text-ink-3">€</span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-3 bdi" dir="ltr">{formatMoney(Math.max(0, stThresholdMinor || 0), locale)}</p>
            </div>
            <div className="rounded-md border border-line bg-white/60 p-3">
              <Label className="text-xs">{t.admin.commerceVat}</Label>
              <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
                <Landmark className="h-4 w-4 text-ink-3" aria-hidden />
                <span className="bdi" dir="ltr">{tf(t.admin.commerceVatValue, { pct: isFa ? faDigits(store.vatRatePct ?? 10) : String(store.vatRatePct ?? 10) })}</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-3">{store.vatIncluded ? t.common.vatIncludedNote : null}</p>
            </div>
          </div>

          {/* Announcement bar preview */}
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3"><Clock className="h-3 w-3" aria-hidden />{t.admin.commercePreview}</p>
            <div className="flex items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-center text-xs font-medium text-white/95">
              {t.announce.freeShipping.replace('{amount}', formatMoney(Math.max(0, stThresholdMinor || 0), locale))}
            </div>
          </div>
        </section>
      )}

      {/* Gift wrap service card */}
      <section
        className={cn(
          'mt-5 rounded-lg border p-4 transition-colors',
          dirty ? 'border-brand/40 bg-brand-soft/30' : 'border-orange-accent/25 bg-gradient-to-br from-orange-accent/[0.06] to-transparent',
        )}
        aria-label={t.admin.gwTitle}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-accent/15 text-orange-dark">
              <Gift className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">{t.admin.gwTitle}</h3>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-3">{t.admin.gwHint}</p>
            </div>
          </div>
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            data.enabled ? 'border-success/30 bg-success/10 text-success' : 'border-line bg-soft text-ink-3',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', data.enabled ? 'bg-success' : 'bg-ink-3')} aria-hidden />
            {data.enabled ? t.admin.gwOnNow : t.admin.gwOffNow}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className={cn('rounded-md border p-3.5', enabledChanged ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="gw-enabled" className="text-sm font-medium text-ink">{t.admin.gwEnabled}</Label>
              <Switch
                id="gw-enabled"
                checked={enabled}
                onCheckedChange={(v) => { setEnabled(v); setDirty(true) }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-3">{enabled ? t.admin.gwOnNow : t.admin.gwOffNow}</p>
          </div>
          <div className={cn('rounded-md border p-3.5', priceChanged ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
            <Label htmlFor="gw-price" className="text-xs">{t.admin.gwPrice}</Label>
            <div className="relative mt-1.5">
              <Input
                id="gw-price" type="number" min={0} max={50} step={0.5} dir="ltr"
                value={price} onChange={(e) => { setPrice(e.target.value); setDirty(true) }}
                className="h-9 pe-8 font-mono" disabled={!enabled}
              />
              <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-xs font-semibold text-ink-3">€</span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-3 bdi" dir="ltr">{t.checkout.giftWrapRow}: {formatMoney(Math.max(0, parsedPrice || 0), locale)}</p>
          </div>
        </div>

        {/* Live preview of the customer-facing checkout card */}
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3"><Clock className="h-3 w-3" aria-hidden />{t.admin.gwPreview}</p>
          <div className={cn('rounded-md border border-dashed border-orange-accent/40 bg-orange-accent/5 p-3.5 transition-opacity', !enabled && 'pointer-events-none opacity-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-accent/15 text-orange-dark"><Gift className="h-3.5 w-3.5" aria-hidden /></span>
                {t.checkout.giftWrap}
              </p>
              <span className="rounded-full bg-orange-accent/15 px-2 py-0.5 text-xs font-bold text-orange-dark bdi" dir="ltr">+{formatMoney(Math.max(0, parsedPrice || 0), locale)}</span>
            </div>
            <p className="mt-1.5 ps-9 text-xs leading-relaxed text-ink-2">{t.checkout.giftWrapDesc}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-ink-3">
            {data.updatedBy ? tf(t.admin.gwUpdatedBy, { email: data.updatedBy, date: formatDateTime(data.updatedAt ?? new Date().toISOString(), locale) }) : null}
          </p>
          <Button size="sm" className="h-9" disabled={busy || !dirty || (enabled && !priceValid)} onClick={save}>
            {busy ? t.common.saving : t.admin.gwSave}
          </Button>
        </div>
      </section>
    </div>
  )
}
