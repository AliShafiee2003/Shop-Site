'use client'

/**
 * Admin → Legal pages editor (Task 27-c).
 * Self-contained section: pick one of the 6 legal pages + EN/FA, edit title/body,
 * save publishes a NEW version (previous versions stay archived; audit trail via LEGAL_UPDATE).
 * Mounted by AdminView as <AdminLegal />.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, History, Info, Loader2, Save, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge, EmptyState, Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { apiGet, apiPut } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

const LEGAL_TYPES = ['PRIVACY', 'TERMS', 'WITHDRAWAL', 'IMPRINT', 'ACCESSIBILITY', 'COOKIES'] as const
type LegalType = (typeof LEGAL_TYPES)[number]
type DocLocale = 'en' | 'fa'

interface LegalDoc {
  id: string
  type: string
  locale: string
  version: string
  title: string
  body: string
  effectiveAt: string
  isCurrent: boolean
  updatedBy: string | null
  createdAt: string
}

interface TypeSummary {
  type: string
  en: { version: string; title: string; effectiveAt: string } | null
  fa: { version: string; title: string; effectiveAt: string } | null
}

const TYPE_NAMES: Record<LegalType, { en: string; fa: string }> = {
  PRIVACY: { en: 'Privacy notice', fa: 'حریم خصوصی' },
  TERMS: { en: 'Terms of sale', fa: 'شرایط استفاده' },
  WITHDRAWAL: { en: 'Withdrawal / returns', fa: 'انصراف از خرید/بازگشت کالا' },
  IMPRINT: { en: 'Imprint (legal notice)', fa: 'نشانی حقوقی (ایمپرینت)' },
  ACCESSIBILITY: { en: 'Accessibility', fa: 'دسترس‌پذیری' },
  COOKIES: { en: 'Cookies', fa: 'کوکی‌ها' },
}

export function AdminLegal() {
  const appLocale = useApp((s) => s.locale)
  const isFa = appLocale === 'fa'
  const { toast } = useToast()

  const [docs, setDocs] = useState<LegalDoc[] | null>(null)
  const [types, setTypes] = useState<TypeSummary[]>([])
  const [loadError, setLoadError] = useState(false)
  const [selType, setSelType] = useState<LegalType>('PRIVACY')
  const [selLocale, setSelLocale] = useState<DocLocale>(isFa ? 'fa' : 'en')
  const localeTouched = useRef(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const L = useMemo(
    () =>
      isFa
        ? {
            loading: 'در حال بارگذاری…',
            title: 'ویرایشگر صفحه‌های حقوقی',
            hint: 'شش صفحهٔ حقوقی فروشگاه در دو زبان — هر ذخیره یک «نسخهٔ جدید» منتشر می‌کند و نسخهٔ پیشین در تاریخچه بایگانی می‌شود.',
            pagesLabel: 'صفحهٔ حقوقی',
            localeLabel: 'زبان سند',
            notAuthoredFa:
              'هنوز برای این صفحه نگارش فارسی ثبت نشده است — فروشگاه فعلاً نسخهٔ انگلیسی را نشان می‌دهد. نخستین نسخه را در همین ویرایشگر بنویسید؛ به‌محض ذخیره جایگزین می‌شود.',
            notAuthoredEn:
              'This page has not been authored yet — the English fallback is live on the storefront. Draft the first version below; it replaces the fallback as soon as you save.',
            noDoc: 'بی‌نسخه',
            titleLabel: 'عنوان',
            titlePlaceholder: 'مثلاً: بیانیهٔ حریم خصوصی',
            bodyLabel: 'متن',
            bodyPlaceholder: 'متن صفحه… (## برای تیتر بخش‌ها)',
            chars: 'نویسه',
            formatHint: 'سطر خالی = پاراگراف تازه؛ «## » در آغاز سطر = تیتر بخش.',
            effective: 'تاریخ اجرا',
            dirty: 'تغییرات ذخیره‌نشده',
            save: 'ذخیره و انتشار نسخهٔ جدید',
            saving: 'در حال ذخیره…',
            discard: 'بی‌خیال تغییرها',
            confirm:
              'یک «نسخهٔ جدید» از این صفحه منتشر می‌شود: نسخهٔ فعلی در تاریخچه بایگانی و تغییر در گزارش ممیزی ثبت خواهد شد. ادامه می‌دهید؟',
            savedToast: 'نسخهٔ جدید ذخیره و منتشر شد',
            errorToast: 'خطا',
            preview: 'پیش‌نمایش در فروشگاه',
            historyTitle: 'تاریخچهٔ نسخه‌ها',
            historyHint: '۵ نسخهٔ آخر — فقط خواندنی',
            noHistory: 'هنوز نسخه‌ای ثبت نشده است.',
            current: 'فعلی',
            info: 'این متن‌ها در صفحه‌های حقوقی فروشگاه (پیش‌نمایش: /legal) به‌محض ذخیره منتشر می‌شوند.',
            loadFailedTitle: 'بارگذاری اسناد حقوقی ناموفق بود',
            loadFailedBody: 'اتصال را بررسی کنید و دوباره تلاش کنید.',
            retry: 'تلاش دوباره',
          }
        : {
            loading: 'Loading…',
            title: 'Legal pages editor',
            hint: 'Six storefront legal pages in two languages — every save publishes a new version; the previous one stays archived in the history.',
            pagesLabel: 'Legal page',
            localeLabel: 'Document language',
            notAuthoredFa:
              'No Persian version has been authored for this page yet — the storefront is showing the English fallback. Draft the first version below; it replaces the fallback as soon as you save.',
            notAuthoredEn:
              'Not yet authored — draft the first version below; it goes live on the storefront as soon as you save.',
            noDoc: 'No version',
            titleLabel: 'Title',
            titlePlaceholder: 'e.g. Privacy Notice',
            bodyLabel: 'Body',
            bodyPlaceholder: 'Page body… (use ## for section headings)',
            chars: 'characters',
            formatHint: "Blank line = new paragraph; a line starting with '## ' becomes a section heading.",
            effective: 'Effective',
            dirty: 'Unsaved changes',
            save: 'Save & publish new version',
            saving: 'Saving…',
            discard: 'Discard changes',
            confirm:
              'A NEW VERSION of this page will be published: the current version is archived in the history and the change is recorded in the audit trail. Continue?',
            savedToast: 'New version saved and published',
            errorToast: 'Error',
            preview: 'Preview on storefront',
            historyTitle: 'Version history',
            historyHint: 'Last 5 — read-only',
            noHistory: 'No versions recorded yet.',
            current: 'Current',
            info: 'Saved versions go live immediately on the storefront legal pages.',
            loadFailedTitle: 'Could not load legal documents',
            loadFailedBody: 'Check the connection and try again.',
            retry: 'Retry',
          },
    [isFa],
  )

  const load = useCallback(() => {
    apiGet<{ docs: LegalDoc[]; types: TypeSummary[] }>('/api/admin/legal')
      .then((r) => {
        setDocs(r.docs)
        setTypes(r.types ?? [])
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // Follow the admin session locale until the editor user picks a document language explicitly.
  useEffect(() => {
    if (!localeTouched.current) setSelLocale(isFa ? 'fa' : 'en')
  }, [isFa])

  const current = useMemo(
    () => docs?.find((d) => d.type === selType && d.locale === selLocale && d.isCurrent) ?? null,
    [docs, selType, selLocale],
  )
  const history = useMemo(
    () => (docs ?? []).filter((d) => d.type === selType && d.locale === selLocale).slice(0, 5),
    [docs, selType, selLocale],
  )

  // Reset the editor whenever the loaded doc changes (selection switch or post-save reload).
  useEffect(() => {
    setTitle(current?.title ?? '')
    setBody(current?.body ?? '')
  }, [current])

  const dirty = title !== (current?.title ?? '') || body !== (current?.body ?? '')

  const discard = () => {
    setTitle(current?.title ?? '')
    setBody(current?.body ?? '')
  }

  const save = async () => {
    if (!dirty || saving) return
    if (!window.confirm(L.confirm)) return
    setSaving(true)
    try {
      await apiPut<{ doc: LegalDoc }>('/api/admin/legal', {
        type: selType,
        locale: selLocale,
        title: title.trim(),
        body,
      })
      toast({ title: L.savedToast })
      load()
    } catch (e) {
      toast({ title: (e as { message?: string }).message ?? L.errorToast, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const availability = (t: LegalType): { en: boolean; fa: boolean } => {
    const s = types.find((x) => x.type === t)
    return { en: !!s?.en, fa: !!s?.fa }
  }

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ScrollText className="h-5 w-5 text-brand" aria-hidden />
            {L.title}
          </h2>
          <p className="text-xs text-ink-3">{L.hint}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => navigate(`/${selLocale}/legal/${selType.toLowerCase()}`)}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          {L.preview}
        </Button>
      </div>

      {/* Selectors: 6 type chips + EN/FA toggle */}
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{L.pagesLabel}</p>
            <div className="flex flex-wrap gap-2">
              {LEGAL_TYPES.map((t) => {
                const a = availability(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelType(t)}
                    aria-pressed={selType === t}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                      selType === t
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-line bg-white text-ink-2 hover:border-brand/40 hover:text-brand',
                    )}
                  >
                    {isFa ? TYPE_NAMES[t].fa : TYPE_NAMES[t].en}
                    <span className="ms-2 inline-flex gap-1 align-middle">
                      <span
                        className={cn(
                          'rounded border px-1 text-[10px] font-semibold leading-4',
                          a.en ? 'border-success/30 bg-success/10 text-success' : 'border-line bg-soft text-ink-3/60',
                        )}
                        title={a.en ? undefined : L.noDoc}
                      >
                        EN
                      </span>
                      <span
                        className={cn(
                          'rounded border px-1 text-[10px] font-semibold leading-4',
                          a.fa ? 'border-success/30 bg-success/10 text-success' : 'border-line bg-soft text-ink-3/60',
                        )}
                        title={a.fa ? undefined : L.noDoc}
                      >
                        FA
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{L.localeLabel}</p>
            <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={L.localeLabel}>
              {(['en', 'fa'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    localeTouched.current = true
                    setSelLocale(l)
                  }}
                  aria-pressed={selLocale === l}
                  className={cn(
                    'px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                    selLocale === l ? 'bg-brand text-white shadow-sm' : 'bg-white text-ink-3 hover:text-ink',
                  )}
                >
                  {l === 'en' ? 'EN' : 'فا'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      {!docs ? (
        loadError ? (
          <EmptyState
            title={L.loadFailedTitle}
            body={L.loadFailedBody}
            action={
              <Button size="sm" variant="outline" onClick={load}>
                {L.retry}
              </Button>
            }
          />
        ) : (
          <Spinner label={L.loading} />
        )
      ) : (
        <div className={cn('rounded-lg border bg-white p-4 sm:p-6', dirty ? 'border-brand/40' : 'border-line')}>
          {/* Meta row */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="text-[15px] font-semibold text-ink">{isFa ? TYPE_NAMES[selType].fa : TYPE_NAMES[selType].en}</h3>
            {current ? (
              <>
                <Badge tone="brand">v{current.version}</Badge>
                <span className="text-xs text-ink-3">
                  {L.effective}: {formatDate(current.effectiveAt, appLocale)}
                </span>
                {current.updatedBy && (
                  <span className="text-xs text-ink-3 bdi" dir="ltr">
                    {current.updatedBy}
                  </span>
                )}
              </>
            ) : (
              <Badge tone="warning">{L.noDoc}</Badge>
            )}
            {dirty && <Badge tone="orange">{L.dirty}</Badge>}
          </div>

          {!current && (
            <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] leading-relaxed text-warning">
              {selLocale === 'fa' ? L.notAuthoredFa : L.notAuthoredEn}
            </p>
          )}

          <div className="grid gap-4">
            <div>
              <Label htmlFor="legal-title" className="mb-1.5 text-xs">
                {L.titleLabel}
              </Label>
              <Input
                id="legal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                dir={selLocale === 'fa' ? 'rtl' : 'ltr'}
                placeholder={L.titlePlaceholder}
                className="h-10"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <Label htmlFor="legal-body" className="text-xs">
                  {L.bodyLabel}
                </Label>
                <span className="text-[11px] tabular-nums text-ink-3" dir="ltr">
                  {body.length.toLocaleString('en')} / 100,000 {L.chars}
                </span>
              </div>
              <Textarea
                id="legal-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                spellCheck={false}
                maxLength={100_000}
                dir={selLocale === 'fa' ? 'rtl' : 'ltr'}
                placeholder={L.bodyPlaceholder}
                className="font-mono text-[13px] leading-relaxed"
              />
              <p className="mt-1.5 text-[11px] text-ink-3">{L.formatHint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-10 gap-1.5" onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {saving ? L.saving : L.save}
              </Button>
              {dirty && (
                <Button variant="outline" className="h-10" onClick={discard} disabled={saving}>
                  {L.discard}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version history (read-only) */}
      {docs && (
        <div className="rounded-lg border border-line bg-white">
          <h3 className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            <History className="h-4 w-4 text-brand" aria-hidden />
            {L.historyTitle}
            <span className="text-xs font-normal text-ink-3">{L.historyHint}</span>
          </h3>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-3">{L.noHistory}</p>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs font-semibold text-brand bdi" dir="ltr">
                    v{h.version}
                  </span>
                  <span className="text-ink-2">{formatDate(h.effectiveAt, appLocale)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3 bdi" dir="ltr">
                    {h.updatedBy ?? '—'}
                  </span>
                  {h.isCurrent && <Badge tone="success">{L.current}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Info line */}
      <p className="flex items-start gap-2 rounded-lg border border-line bg-soft px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        {L.info}
      </p>
    </div>
  )
}
