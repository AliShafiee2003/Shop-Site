'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Landmark, Languages, HeartHandshake, Mail, Package, RotateCcw, Globe2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPost } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney } from '@/lib/format'
import { Breadcrumbs, ProseBlocks, LegalPlaceholder, Spinner } from '@/components/storefront/bits'
import { SocialRow } from '@/components/storefront/Footer'
import { useSettings } from '@/lib/use-settings'
import { useToast } from '@/hooks/use-toast'
import type { Block, Locale, StoreSettings } from '@/lib/types'

 

export function AboutView({ settings }: { settings?: StoreSettings | null }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'

  useEffect(() => { document.title = `${t.static.aboutTitle} — Persepix` }, [locale, t])

  const values = isFa ? [
    { icon: Languages, title: 'دوزبانه از روز نخست', body: 'هر عنوان از ابتدا برای دو زبان طراحی می‌شود؛ ترجمه پس از اصل نیست، همزاد است.' },
    { icon: BookOpen, title: 'کاتالوگ کوچک، وسواس بزرگ', body: 'سالانه فقط چند عنوان منتشر می‌کنیم — اما هر یک را تا آخرین نقطهٔ ویرایشی می‌بریم.' },
    { icon: Landmark, title: 'وین و تهران', body: 'ویرایش در تهران، تولید و ارسال از وین؛ کتاب ما همیشه دو خانه دارد.' },
    { icon: HeartHandshake, title: 'با نویسنده، در اتاق', body: 'هر ترجمه با حضور نویسنده آماده می‌شود؛ هیچ کتابی بدون تأیید او چاپ نمی‌شود.' },
  ] : [
    { icon: Languages, title: 'Bilingual from day one', body: 'Every title is designed for two languages at once — translation is not an afterthought, it is a twin.' },
    { icon: BookOpen, title: 'Small catalogue, deep care', body: 'We publish only a handful of titles a year — and take each one to its last editorial stop.' },
    { icon: Landmark, title: 'Vienna & Tehran', body: 'Editing in Tehran, production and shipping from Vienna. Our books have two homes.' },
    { icon: HeartHandshake, title: 'With the author, in the room', body: 'Every translation is prepared with the author present. No book prints without their sign-off.' },
  ]

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.static.aboutTitle }]} />
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-4xl">{t.static.aboutTitle}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          {isFa
            ? 'پرس‌پیکس در سال ۲۰۲۱ در وین بنیان گذاشته شد تا ادبیات معاصر ایران را — به انگلیسی و در نسخه‌های دوزبانه — به دست خوانندگان اروپا برساند. ما باور داریم یک کتاب خوب باید در دو زبان به‌یک‌اندازه خوش‌بیاید.'
            : 'Founded in Vienna in 2021, Persepix brings contemporary Iranian literature to European readers — in English and in bilingual editions. We believe a good book should feel at home in two languages at once.'}
        </p>
      </header>
      <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-lg border border-line">
        <img src="/images/about-studio.png" alt={isFa ? 'دفتر پرس‌پیکس' : 'The Persepix office'} className="aspect-[7/4] w-full object-cover" />
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2">
        {values.map((v) => (
          <div key={v.title} className="rounded-lg border border-line p-5">
            <v.icon className="h-6 w-6 text-brand" aria-hidden />
            <h2 className="mt-3 text-[15px] font-semibold text-ink">{v.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{v.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-line bg-soft p-6 text-center">
        <p className="text-sm text-ink-2">
          {isFa ? 'پرسشی دارید؟ خوشحال می‌شویم بشنویم.' : 'Have a question? We would love to hear from you.'}
        </p>
        <Button className="mt-3" onClick={() => navigate('/contact')}>{t.nav.contact}</Button>
      </div>
      <address className="sr-only">{settings?.address}</address>
    </main>
  )
}

export function FAQView() {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const settings = useSettings()
  const freeShipAmount = formatMoney(settings?.store?.freeShippingThresholdMinor ?? 6000, locale)

  useEffect(() => { document.title = `${t.static.faqTitle} — Persepix` }, [locale, t])

  const items = isFa ? [
    { q: 'کتاب‌ها از کجا ارسال می‌شوند؟', a: 'همهٔ سفارش‌ها از وین، اتریش ارسال می‌شود. ارسال در اتریش ۲ تا ۴ روز کاری و در اتحادیهٔ اروپا ۳ تا ۷ روز کاری طول می‌کشد. ارسال بین‌المللی ۵ تا ۱۴ روز.' },
    { q: 'هزینهٔ ارسال چقدر است؟', a: `اتریش ۴.۹۰ یورو؛ اتحادیهٔ اروپا ۷.۹۰ یورو (برای خرید بالای ${freeShipAmount} رایگان)؛ مقصدهای بین‌المللی ۱۴.۹۰ یورو.` },
    { q: 'آیا می‌توانم سفارشم را مرجوع کنم؟', a: 'بله، مصرف‌کنندگان در اتحادیهٔ اروپا ۱۴ روز فرصت انصراف دارند. کتاب باید دست‌نخورده باشد. از صفحهٔ سفارش‌ها در حساب کاربری درخواست مرجوعی ثبت کنید.' },
    { q: 'نسخه‌های دوزبانه چگونه کار می‌کنند؟', a: 'در نسخه‌های دوزبانه، متن اصلی فارسی و ترجمهٔ انگلیسی در صفحات روبه‌رو چاپ می‌شوند؛ با یادداشت‌های مترجم و شاعر.' },
    { q: 'چگونه کتاب من منتشر می‌شود؟', a: 'در حال حاضر ما فقط از طریق پیشنهاد مستقیم نویسندگان و متصدیان حق نشر کار می‌کنیم. برای حقوق ترجمه به صفحهٔ تماس بنویسید.' },
    { q: 'آیا کتاب‌ها به ایران ارسال می‌شوند؟', a: 'ارسال بین‌المللی به اکثر کشورها انجام می‌شود؛ اما ممکن است محدودیت‌های پرداخت و گمرکی وجود داشته باشد. پیش از سفارش با ما تماس بگیرید.' },
  ] : [
    { q: 'Where do the books ship from?', a: 'All orders ship from Vienna, Austria. Delivery takes 2–4 business days in Austria, 3–7 days across the EU, and 5–14 days internationally.' },
    { q: 'How much is shipping?', a: `Austria €4.90; EU €7.90 (free over ${freeShipAmount}); worldwide destinations €14.90. All shipments are tracked.` },
    { q: 'Can I return my order?', a: 'Yes — EU consumers have a 14-day right of withdrawal. Books should be unused. Request a return from the orders page in your account.' },
    { q: 'How do bilingual editions work?', a: 'Bilingual editions print the Persian original and the English translation on facing pages, with notes by the translator and the author.' },
    { q: 'How do I submit a manuscript?', a: 'We currently work through direct author and rights-holder proposals only. For translation rights, write to us via the contact page.' },
    { q: 'Do you ship to Iran?', a: 'International shipping covers most countries, but payment and customs limitations may apply. Please contact us before ordering.' },
  ]

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.static.faqTitle }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.static.faqTitle}</h1>
      <Accordion type="single" collapsible className="mt-6">
        {items.map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-start text-[15px] font-medium">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-ink-2">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </main>
  )
}

export function ShippingView({ settings, shipping }: { settings?: StoreSettings | null; shipping?: { customsNote: string; customsNoteFa: string; methods: { id: string; labelEn: string; labelFa: string; descEn: string; descFa: string; priceMinor: number; minDays: number; maxDays: number; countries: string[] }[] } | null }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'

  useEffect(() => { document.title = `${t.static.shippingTitle} — Persepix` }, [locale, t])

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.static.shippingTitle }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.static.shippingTitle}</h1>

      <section className="mt-8" aria-labelledby="ship-methods">
        <h2 id="ship-methods" className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink"><Package className="h-5 w-5 text-brand" aria-hidden />{isFa ? 'روش‌های ارسال' : 'Shipping methods'}</h2>
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {(shipping?.methods ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3.5 odd:bg-soft/60">
              <div>
                <p className="text-sm font-semibold text-ink">{isFa ? m.labelFa : m.labelEn}</p>
                <p className="text-xs text-ink-3">{tf(t.common.deliveryEstimate, { min: m.minDays, max: m.maxDays })} · {m.countries.includes('*') ? (isFa ? 'سراسر جهان' : 'Worldwide') : `${m.countries.length} ${isFa ? 'کشور' : 'countries'}`}</p>
              </div>
              <p className="text-sm font-semibold text-ink bdi">{m.priceMinor === 0 ? t.common.free : `€${(m.priceMinor / 100).toFixed(2)}`}</p>
            </div>
          ))}
        </div>
        {settings && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <Globe2 className="me-1.5 inline h-4 w-4" aria-hidden />
            <strong>{t.static.customsNote}: </strong>{isFa ? shipping?.customsNoteFa : shipping?.customsNote}
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="returns">
        <h2 id="returns" className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink"><RotateCcw className="h-5 w-5 text-brand" aria-hidden />{isFa ? 'مرجوعی‌ها' : 'Returns'}</h2>
        <ProseBlocks measure={false} locale={locale} blocks={(isFa ? [
          { type: 'p', text: 'مصرف‌کنندگان در اتحادیهٔ اروپا می‌توانند تا ۱۴ روز پس از دریافت کالا، بدون ذکر دلیل از خرید انصراف دهند.' },
          { type: 'p', text: 'برای ثبت مرجوعی، از صفحهٔ «سفارش‌ها» در حساب کاربری خود درخواست دهید. کتاب باید دست‌نخورده باشد؛ هزینهٔ ارسال مرجوعی در صورت عیب و نقص بر عهدهٔ ماست.' },
          { type: 'callout', title: 'پیش‌نویس حقوقی', text: 'متن نهایی سیاست مرجوعی پیش از انتشار باید توسط مشاور حقوقی تأیید شود.' },
        ] : [
          { type: 'p', text: 'EU consumers may withdraw from the purchase within 14 days of receiving the goods, without giving a reason.' },
          { type: 'p', text: 'To request a return, use the "Request return" action on the order in your account. Books should be unused; return shipping is on us for faulty items.' },
          { type: 'callout', title: 'Legal placeholder', text: 'The final returns policy must be reviewed by qualified counsel before publication.' },
        ]) as Block[]} />
      </section>
    </main>
  )
}

export function ContactView({ settings }: { settings?: StoreSettings | null }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', orderNumber: '' })
  const [busy, setBusy] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)

  useEffect(() => { document.title = `${t.static.contactTitle} — Persepix` }, [locale, t])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await apiPost<{ ticketNumber: string }>('/api/contact', {
        name: form.name, email: form.email, subject: form.subject, message: form.message,
        orderNumber: form.orderNumber || undefined,
      })
      setTicket(res.ticketNumber)
      toast({ title: t.common.sent })
    } catch {
      toast({ title: t.common.error, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const valid = form.name.trim() && /.+@.+\..+/.test(form.email) && form.subject.trim() && form.message.trim().length >= 10

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.static.contactTitle }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.static.contactTitle}</h1>
      <p className="mt-2 text-sm text-ink-2">{t.static.contactIntro}</p>

      <div className="mt-6 grid gap-8 sm:grid-cols-[1fr_240px]">
        {ticket ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-success" aria-hidden />
            <p className="mt-3 text-sm font-medium text-ink">{tf(t.static.messageSent, { n: ticket })}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <Label htmlFor="ct-name" className="mb-1.5">{t.auth.name}</Label>
                <Input id="ct-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ct-email" className="mb-1.5">{t.auth.email}</Label>
                <Input id="ct-email" type="email" required dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="ct-subject" className="mb-1.5">{t.static.subject}</Label>
              <Input id="ct-subject" required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ct-order" className="mb-1.5">{t.static.orderNumberOptional}</Label>
              <Input id="ct-order" dir="ltr" placeholder="SP-2025-…" value={form.orderNumber} onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ct-msg" className="mb-1.5">{t.static.yourMessage}</Label>
              <Textarea id="ct-msg" required minLength={10} rows={5} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full sm:w-auto sm:px-10" disabled={!valid || busy}>
              {busy ? t.common.submitting : t.static.sendMessage}
            </Button>
          </form>
        )}
        <aside className="h-fit space-y-4 rounded-lg border border-line bg-soft p-5 text-sm text-ink-2">
          <div>
            <p className="font-semibold text-ink">{t.brand.name}</p>
            <p className="mt-1 bdi">{settings?.address}</p>
          </div>
          <p className="bdi">{settings?.email}</p>
          <p className="bdi">{settings?.phone}</p>
          <SocialRow settings={settings} />
          <p className="flex items-center gap-1.5 text-xs text-ink-3"><ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />{isFa ? 'پاسخ در یک روز کاری' : 'We reply within one business day'}</p>
        </aside>
      </div>
    </main>
  )
}

export function LegalView({ type }: { type: string }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const [state, setState] = useState<{ key: string; doc?: { title: string; body: string; version: string }; failed?: boolean } | null>(null)
  const key = `${locale}|${type}`
  const doc = state && state.key === key ? (state.doc ?? null) : null
  const failed = state?.key === key && !!state.failed

  useEffect(() => {
    let alive = true
    apiGet<{ title: string; body: string; version: string }>(`/api/legal/${encodeURIComponent(type)}?locale=${locale}`)
      .then((r) => { if (alive) setState({ key, doc: r }) })
      .catch(() => { if (alive) setState({ key, failed: true }) })
    return () => { alive = false }
     
  }, [key])

  const titles: Record<string, string> = {
    privacy: locale === 'fa' ? 'حریم خصوصی' : 'Privacy notice',
    terms: locale === 'fa' ? 'شرایط فروش' : 'Terms of sale',
    withdrawal: locale === 'fa' ? 'حق انصراف' : 'Right of withdrawal',
    imprint: locale === 'fa' ? 'اطلاعات ناشر' : 'Imprint',
    accessibility: locale === 'fa' ? 'دسترس‌پذیری' : 'Accessibility statement',
    cookies: locale === 'fa' ? 'کوکی‌ها' : 'Cookie notice',
  }
  useEffect(() => { document.title = `${titles[type] ?? t.static.legalTitle} — Persepix` }, [locale, type])  

  if (failed) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-20">
        <p className="text-center text-sm text-ink-3">{t.common.error}</p>
      </main>
    )
  }
  if (!doc) return <Spinner label={t.common.loading} />

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: titles[type] ?? t.static.legalTitle }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{doc.title}</h1>
      <p className="mt-1 text-xs text-ink-3 bdi">v{doc.version}</p>
      <div className="mt-6">
        <LegalPlaceholder locale={locale} />
        <ProseBlocks locale={locale} blocks={doc.body.split('\n\n').map((p): Block => p.startsWith('## ') ? { type: 'h2', text: p.slice(3) } : { type: 'p', text: p })} />
      </div>
    </main>
  )
}
