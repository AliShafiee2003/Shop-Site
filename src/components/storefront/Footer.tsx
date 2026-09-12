'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Instagram, Mail, MapPin, Phone, ShieldCheck, Send, CheckCircle2, Cookie, Youtube } from 'lucide-react'
import { navigate, useLocaleSwitch, useRoute, localePath } from '@/lib/router'
import { getDict } from '@/lib/i18n'
import { apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/store'
import type { Locale } from '@/lib/types'

export type FooterSettings = {
  email: string; phone: string; address: string; name: string; nameFa: string
  instagram?: string; x?: string; youtube?: string
} | null

/** X (Twitter) glyph — lucide's bird is outdated; draw the X mark inline. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/** Task 50 — social profile row; entries with an empty URL are NEVER rendered. */
export function SocialRow({ settings, className }: { settings?: { instagram?: string; x?: string; youtube?: string } | null; className?: string }) {
  const t = getDict(useRoute().locale)
  const profiles = [
    { key: 'instagram', url: settings?.instagram?.trim(), label: 'Instagram', icon: <Instagram className="h-4 w-4" aria-hidden /> },
    { key: 'x', url: settings?.x?.trim(), label: 'X', icon: <XIcon className="h-3.5 w-3.5" /> },
    { key: 'youtube', url: settings?.youtube?.trim(), label: 'YouTube', icon: <Youtube className="h-4 w-4" aria-hidden /> },
  ].filter((p) => !!p.url)
  if (profiles.length === 0) return null
  return (
    <ul className={cn('flex items-center gap-2', className)} aria-label={t.footer.social}>
      {profiles.map((p) => (
        <li key={p.key}>
          <a
            href={p.url!}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={p.label}
            title={p.label}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-ink-2 transition hover:border-brand/40 hover:bg-brand-soft/50 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {p.icon}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Footer({ settings }: { settings?: FooterSettings }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const switchLocale = useLocaleSwitch()

  const [nlEmail, setNlEmail] = useState('')
  const [nlState, setNlState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/.+@.+\..+/.test(nlEmail.trim())) { setNlState('error'); return }
    setNlState('busy')
    try {
      await apiPost('/api/newsletter', { email: nlEmail.trim(), locale, source: 'footer' })
      setNlState('done')
      setNlEmail('')
    } catch {
      setNlState('error')
    }
  }

  const go = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(href) }

  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: t.footer.shop,
      links: [
        { label: t.nav.books, href: '/books' },
        { label: t.authors.title, href: '/authors' },
        { label: t.articles.title, href: '/articles' },
        { label: t.nav.faq, href: '/faq' },
      ],
    },
    {
      title: t.footer.house,
      links: [
        { label: t.nav.about, href: '/about' },
        { label: t.nav.contact, href: '/contact' },
        { label: t.nav.shipping, href: '/shipping-returns' },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { label: locale === 'en' ? 'Privacy notice' : 'حریم خصوصی', href: '/legal/privacy' },
        { label: locale === 'en' ? 'Terms of sale' : 'شرایط فروش', href: '/legal/terms' },
        { label: locale === 'en' ? 'Right of withdrawal' : 'حق انصراف', href: '/legal/withdrawal' },
        { label: locale === 'en' ? 'Imprint' : 'اطلاعات ناشر', href: '/legal/imprint' },
        { label: locale === 'en' ? 'Accessibility' : 'دسترس‌پذیری', href: '/legal/accessibility' },
        { label: locale === 'en' ? 'Cookies' : 'کوکی‌ها', href: '/legal/cookies' },
      ],
    },
  ]

  return (
    <footer className="mt-auto border-t border-line bg-soft">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 2C9.6 5.4 6 6.4 6 10.6c0 2.5 1.5 4.4 3.4 5.5-.3-1.8.2-3.5 1.4-4.7 1.6-1.6 4-2 4.7-4.6.5 1.2.2 2.6-.6 3.6 1.8-.4 3.1-1.9 3.1-3.9 0-.5-.1-1-.3-1.5 1.5 1.5 2.3 3.4 2.3 5.5 0 4.4-3.6 8-8 8-2.9 0-5.4-1.5-6.8-3.8C4.4 17.6 7.9 21 12 21c5 0 9-4 9-9 0-4.5-3.6-8.4-9-10z" />
                </svg>
              </span>
              <span className="text-[15px] font-bold text-ink">{locale === 'fa' ? settings?.nameFa ?? t.brand.name : settings?.name ?? t.brand.name}</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">{t.footer.about}</p>

            {/* Newsletter signup (PRD 21) */}
            <div className="mt-6 max-w-sm rounded-lg border border-line bg-white p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Mail className="h-4 w-4 text-brand" aria-hidden />{t.newsletter.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{t.newsletter.body}</p>
              {nlState === 'done' ? (
                <p className="mt-3 flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success" role="status">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />{t.newsletter.subscribed}
                </p>
              ) : (
                <form onSubmit={subscribe} className="mt-3 flex gap-2" noValidate>
                  <label htmlFor="footer-newsletter" className="sr-only">{t.newsletter.placeholder}</label>
                  <input
                    id="footer-newsletter"
                    type="email"
                    required
                    dir="ltr"
                    value={nlEmail}
                    onChange={(e) => { setNlEmail(e.target.value); if (nlState === 'error') setNlState('idle') }}
                    placeholder={t.newsletter.placeholder}
                    className={cn(
                      'h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2',
                      nlState === 'error' ? 'border-error focus:ring-error/30' : 'border-line focus:ring-brand/30',
                    )}
                  />
                  <button
                    type="submit"
                    disabled={nlState === 'busy'}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-white transition hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                  >
                    {nlState === 'busy' ? '…' : <Send className="h-3.5 w-3.5 mirror-rtl" aria-hidden />}
                    {t.newsletter.cta}
                  </button>
                </form>
              )}
              {nlState === 'error' && <p className="mt-2 text-xs text-error" role="alert">{t.newsletter.invalid}</p>}
            </div>

            <ul className="mt-6 space-y-2 text-sm text-ink-2">
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden /><span className="bdi">{settings?.address}</span></li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><a href={`mailto:${settings?.email}`} className="bdi hover:text-brand hover:underline">{settings?.email}</a></li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><a href={`tel:${settings?.phone}`} className="bdi hover:text-brand hover:underline">{settings?.phone}</a></li>
            </ul>
            <SocialRow settings={settings} className="mt-4" />
          </div>
          {cols.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="mb-3 text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={localePath(locale, l.href)} onClick={go(l.href)} className="text-sm text-ink-2 hover:text-brand hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden /> Visa
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden /> Mastercard
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden /> Apple&nbsp;Pay
            </span>
            <span className="hidden text-xs text-ink-3 sm:inline">{t.footer.paymentNote}</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="footer-lang" className="text-xs font-medium text-ink-3">{t.footer.language}</label>
            <select
              id="footer-lang"
              value={locale}
              onChange={(e) => switchLocale(e.target.value as Locale)}
              className="h-9 rounded-md border border-line bg-white px-2 text-sm text-ink-2"
            >
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            © {new Date().getFullYear()} {locale === 'fa' ? settings?.nameFa ?? t.brand.name : settings?.name ?? t.brand.name}. {t.footer.rights}
          </p>
          <button
            type="button"
            onClick={() => useApp.getState().setCookiePrefsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-ink-3 transition hover:bg-soft hover:text-ink"
          >
            <Cookie className="h-3.5 w-3.5" aria-hidden /> {t.cookie.title}
          </button>
        </div>
      </div>
    </footer>
  )
}
