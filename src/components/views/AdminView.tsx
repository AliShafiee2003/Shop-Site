'use client'

import { LayoutDashboard, BookOpen, Package, LayoutTemplate, Star, LifeBuoy, Users, BarChart3, History, Activity, Mail, TicketPercent, Shapes, BookUser, Megaphone, Settings2, FileText, Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner, EmptyState } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'
import { AdminArticles } from '@/components/views/admin/ArticlesAdmin'
import { AdminAnnouncements } from '@/components/views/admin/AnnouncementsEditor'
import { AdminLegal } from '@/components/views/admin/LegalEditor'
import { AdminCustomersTable } from '@/components/views/admin/CustomersTable'
import { AdminDashboard } from '@/components/views/admin/AdminDashboardSection'
import { AdminProducts } from '@/components/views/admin/AdminProductsSection'
import { AdminOrders } from '@/components/views/admin/AdminOrdersSection'
import { AdminDiscounts } from '@/components/views/admin/AdminDiscountsSection'
import { AdminCategories } from '@/components/views/admin/AdminCategoriesSection'
import { AdminPeople } from '@/components/views/admin/AdminPeopleSection'
import { AdminHomepage } from '@/components/views/admin/AdminHomepageSection'
import { AdminReviews } from '@/components/views/admin/AdminReviewsSection'
import { AdminTickets } from '@/components/views/admin/AdminTicketsSection'
import { AdminReports, AdminAudit } from '@/components/views/admin/AdminReportsSection'
import { AdminAnalytics } from '@/components/views/admin/AdminAnalyticsSection'
import { AdminMarketing } from '@/components/views/admin/AdminMarketingSection'
import { AdminSettings } from '@/components/views/admin/AdminSettingsSection'
import { ForbiddenSection } from '@/components/views/admin/ForbiddenSection'

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
