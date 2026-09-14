'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Lock, PackageCheck, Tag, X, BadgePercent, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { apiGet, apiPost, normalizeCart } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, compactOrderNumber } from '@/lib/format'
import { Spinner, EmptyState, Breadcrumbs } from '@/components/storefront/bits'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'
import { track } from '@/lib/analytics'
import type { CartDTO, DiscountPublic, QuoteDTO, ShippingMethodDTO, StoreSettings, AddressDTO } from '@/lib/types'

const COUNTRIES = [
  { code: 'AT', en: 'Austria', fa: 'اتریش' }, { code: 'DE', en: 'Germany', fa: 'آلمان' },
  { code: 'FR', en: 'France', fa: 'فرانسه' }, { code: 'IT', en: 'Italy', fa: 'ایتالیا' },
  { code: 'NL', en: 'Netherlands', fa: 'هلند' }, { code: 'ES', en: 'Spain', fa: 'اسپانیا' },
  { code: 'SE', en: 'Sweden', fa: 'سوئد' }, { code: 'DK', en: 'Denmark', fa: 'دانمارک' },
  { code: 'PL', en: 'Poland', fa: 'لهستان' }, { code: 'CZ', en: 'Czechia', fa: 'چک' },
  { code: 'HU', en: 'Hungary', fa: 'مجارستان' }, { code: 'GR', en: 'Greece', fa: 'یونان' },
  { code: 'PT', en: 'Portugal', fa: 'پرتغال' }, { code: 'IE', en: 'Ireland', fa: 'ایرلند' },
  { code: 'US', en: 'United States', fa: 'ایالات متحده' }, { code: 'CA', en: 'Canada', fa: 'کانادا' },
  { code: 'GB', en: 'United Kingdom', fa: 'بریتانیا' }, { code: 'CH', en: 'Switzerland', fa: 'سوئیس' },
  { code: 'IR', en: 'Iran', fa: 'ایران' }, { code: 'TR', en: 'Türkiye', fa: 'ترکیه' },
]

interface AddressForm {
  recipient: string; line1: string; line2: string; city: string; region: string; postalCode: string; countryCode: string; phone: string
}

const EMPTY_ADDRESS: AddressForm = { recipient: '', line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: 'AT', phone: '' }

export function CheckoutView({ mode }: { mode?: 'success' | 'cancelled' }) {
  const route = useRoute()
  const locale = route.locale
  const t = getDict(locale)
  const isFa = locale === 'fa'
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const userLoaded = useApp((s) => s.userLoaded)
  const setCartSummary = useApp((s) => s.setCartSummary)

  const [cart, setCart] = useState<CartDTO | null>(null)
  const [cartLoaded, setCartLoaded] = useState(false)
  const [quote, setQuote] = useState<QuoteDTO | null>(null)
  const [, setSettings] = useState<StoreSettings | null>(null)

  const [email, setEmail] = useState('')
  const [ship, setShip] = useState<AddressForm>(EMPTY_ADDRESS)
  const [billingSame, setBillingSame] = useState(true)
  const [bill, setBill] = useState<AddressForm>(EMPTY_ADDRESS)
  const [methodId, setMethodId] = useState<string | null>(null)
  const [card, setCard] = useState({ number: '', holder: '', expiry: '', cvc: '' })
  const [consents, setConsents] = useState(false)
  const [step, setStep] = useState(0)
  const [placing, setPlacing] = useState(false)
  // Idempotency key for the in-flight checkout attempt (backend dedupes too).
  const idemKeyRef = useRef<string | null>(null)
  const [orderResult, setOrderResult] = useState<{ orderNumber: string; email: string } | null>(null)
  const publicRefRef = useRef<string | null>(null)
  const [failedReason, setFailedReason] = useState<string | null>(null)
  // Promo code state
  const [promoInput, setPromoInput] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [discount, setDiscount] = useState<DiscountPublic | null>(null)
  // Gift wrap state (server-authoritative fee; config comes from /api/settings)
  const [giftWrap, setGiftWrap] = useState(false)
  const [giftMessage, setGiftMessage] = useState('')
  const [giftCfg, setGiftCfg] = useState<{ enabled: boolean; priceMinor: number } | null>(null)
  const giftEnabled = giftCfg?.enabled ?? false
  const giftWrapMinor = giftEnabled && giftWrap ? (giftCfg?.priceMinor ?? 0) : 0

  useEffect(() => {
    apiGet<CartDTO>('/api/cart').then((c) => { const n = normalizeCart(c); setCart(n); setCartSummary(n.count, n.subtotalMinor); setCartLoaded(true) }).catch(() => { setCartLoaded(true) })
    apiGet<{ store: StoreSettings; giftWrap?: { enabled: boolean; priceMinor: number } | null }>('/api/settings')
      .then((r) => { setSettings(r.store); setGiftCfg(r.giftWrap ?? { enabled: false, priceMinor: 0 }) })
      .catch(() => setSettings(null))
    if (user) setEmail(user.email)
  }, [user, setCartSummary])

  useEffect(() => {
    if (user) {
      setEmail(user.email)
      apiGet<{ addresses: AddressDTO[] }>('/api/account/addresses').then((r) => {
        const def = r.addresses.find((a) => a.isDefaultShipping) ?? r.addresses[0]
        if (def) setShip({
          recipient: def.recipient, line1: def.line1, line2: def.line2 ?? '', city: def.city,
          region: def.region ?? '', postalCode: def.postalCode, countryCode: def.countryCode, phone: def.phone ?? '',
        })
      }).catch(() => {})
    }
  }, [user])

  const refreshQuote = useCallback(async (country: string, code: string | null, wrap: boolean) => {
    try {
      const q = await apiPost<QuoteDTO>('/api/checkout/quote', { shippingCountry: country, discountCode: code, giftWrap: wrap })
      setQuote(q)
      setMethodId((prev) => prev && q.methods.some((m) => m.id === prev) ? prev : (q.methods[0]?.id ?? null))
    } catch { setQuote(null) }
  }, [])

  useEffect(() => {
    if (ship.countryCode && cart && cart.items.length > 0) refreshQuote(ship.countryCode, discount?.code ?? null, giftWrap)
  }, [ship.countryCode, cart, discount, giftWrap, refreshQuote])

  const method: ShippingMethodDTO | null = useMemo(() => quote?.methods.find((m) => m.id === methodId) ?? null, [quote, methodId])
  const shippingMinor = method ? method.effectivePriceMinor : 0
  // Sitewide promotion (applied automatically to cart prices, no code needed)
  const promotion = quote?.promotion ?? null
  // The applied discount from the validate endpoint is authoritative for display;
  // the server re-validates at order time.
  const discountMinor = discount?.discountMinor ?? 0
  const totalMinor = Math.max(0, (cart?.subtotalMinor ?? 0) - discountMinor) + giftWrapMinor + shippingMinor

  const applyPromo = async () => {
    const code = promoInput.trim()
    if (!code) return
    setPromoBusy(true); setPromoError(null)
    try {
      const r = await apiPost<{ valid: boolean; discount: DiscountPublic }>('/api/discount/validate', { code })
      setDiscount(r.discount)
      setPromoInput('')
      toast({ title: tf(t.promo.applied, { code: r.discount.code }) })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setPromoError(
        err.code === 'DISCOUNT_MIN_SUBTOTAL'
          ? t.promo.minSubtotal
          : err.code === 'DISCOUNT_NO_ELIGIBLE_ITEMS'
            ? t.promo.notEligible
            : (err.message ?? t.promo.invalid),
      )
    } finally { setPromoBusy(false) }
  }

  const removePromo = () => { setDiscount(null); setPromoError(null) }

  // Funnel: fire begin_checkout once per checkout session when the payment step is reached.
  const beginFired = useRef(false)
  useEffect(() => {
    if (step === 3 && !beginFired.current && cart && cart.items.length > 0) {
      beginFired.current = true
      track('begin_checkout', { valueMinor: totalMinor })
    }
    if (step !== 3) beginFired.current = false
  }, [step, cart, totalMinor])

  if (mode === 'success' && orderResult) {
    return <SuccessPanel locale={locale} orderNumber={orderResult.orderNumber} email={orderResult.email} refCode={publicRefRef.current} />
  }

  if (!cartLoaded)
    return (
      // SEO-405: the Shell does NOT wrap this view in <main> (it renders its
      // own landmark), so the first paint — the pre-bootstrap loading state —
      // used to be a bare spinner with no <main> and no <h1> in the raw HTML.
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t.checkout.title}</h1>
        <Spinner label={t.common.loading} />
      </main>
    )

  if (!cart || cart.items.length === 0) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 py-20">
        {/* SEO-405: keep ONE <h1> in every checkout state. */}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t.checkout.title}</h1>
        <div className="mt-8">
          <EmptyState title={t.checkout.emptyCart} action={<Button onClick={() => navigate('/books')}>{t.checkout.emptyCartCta}</Button>} />
        </div>
      </main>
    )
  }

  const validContact = /.+@.+\..+/.test(email)
  const validShip = ship.recipient.trim() && ship.line1.trim() && ship.city.trim() && ship.postalCode.trim()
  const validCard = card.number.replace(/\s/g, '').length >= 15 && card.holder.trim() && card.expiry.length >= 4 && card.cvc.length >= 3

  const placeOrder = async () => {
    setPlacing(true)
    setFailedReason(null)
    // Idempotency: one key per logical checkout attempt — a network retry /
    // double-click replays the SAME response instead of minting a second order.
    if (!idemKeyRef.current) idemKeyRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    try {
      const res = await apiPost<{ orderNumber: string; publicRef?: string; status: string }>('/api/checkout', {
        idempotencyKey: idemKeyRef.current,
        email,
        shippingAddress: { recipient: ship.recipient, line1: ship.line1, line2: ship.line2 || undefined, city: ship.city, region: ship.region || undefined, postalCode: ship.postalCode, countryCode: ship.countryCode, phone: ship.phone || undefined },
        billingSame,
        billingAddress: billingSame ? undefined : { recipient: bill.recipient, line1: bill.line1, city: bill.city, postalCode: bill.postalCode, countryCode: bill.countryCode },
        shippingMethodId: methodId,
        discountCode: discount?.code ?? undefined,
        locale,
        giftWrap: giftEnabled && giftWrap,
        giftMessage: giftEnabled && giftWrap && giftMessage.trim() ? giftMessage.trim() : undefined,
        consents: { terms: true },
        card,
      })
      setOrderResult({ orderNumber: res.orderNumber, email })
      publicRefRef.current = res.publicRef ?? null
      setCartSummary(0, 0)
      track('purchase', { valueMinor: totalMinor })
      idemKeyRef.current = null // order placed — the next attempt is a NEW order
      const refQ = res.publicRef ? `&ref=${encodeURIComponent(res.publicRef)}` : ''
      navigate(`/checkout/success?order=${res.orderNumber}${refQ}&email=${encodeURIComponent(email)}`, { replace: true })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'CARD_DECLINED') {
        setFailedReason('CARD_DECLINED')
        setStep(3)
      } else if (err.code === 'OUT_OF_STOCK') {
        setFailedReason('OUT_OF_STOCK')
        toast({ title: t.checkout.outOfStock, variant: 'destructive' })
        navigate('/cart')
      } else {
        setFailedReason('GENERAL')
        toast({ title: err.message ?? t.common.error, variant: 'destructive' })
      }
    } finally { setPlacing(false) }
  }

  const stepTitles = [t.checkout.step1, t.checkout.step2, t.checkout.step3, t.checkout.step4]

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs locale={locale} items={[{ label: t.nav.home, href: `/${locale}` }, { label: t.cart.title, href: '/cart' }, { label: t.checkout.title }]} />
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t.checkout.title}</h1>

      {failedReason === 'CARD_DECLINED' && (
        <div role="alert" className="mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{t.checkout.cardDeclined}</div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          {/* Stepper */}
          <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
            {stepTitles.map((title, i) => (
              <li key={title} className="flex flex-1 items-center gap-2">
                <button
                  type="button" onClick={() => setStep(i)}
                  aria-current={step === i ? 'step' : undefined}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition',
                    i < step ? 'border-success bg-success text-white' : i === step ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-3'
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </button>
                <span className={cn('hidden truncate text-xs font-medium sm:block', i === step ? 'text-ink' : 'text-ink-3')}>{title}</span>
                {i < stepTitles.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-success' : 'bg-line')} aria-hidden />}
              </li>
            ))}
          </ol>

          {/* Step 0: Contact */}
          {step === 0 && (
            <section aria-label={t.checkout.contactTitle} className="space-y-4">
              <h2 className="text-lg font-semibold text-ink">{t.checkout.contactTitle}</h2>
              <div>
                <Label htmlFor="co-email" className="mb-1.5">{t.checkout.email}</Label>
                <Input id="co-email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {!validContact && email.length > 0 && <p className="mt-1 text-xs text-error">{t.common.required}</p>}
              </div>
              {!user && userLoaded && (
                <p className="text-sm text-ink-3">
                  {t.checkout.signInPrompt}{' '}
                  <button type="button" onClick={() => navigate('/login')} className="font-medium text-brand hover:underline">{t.auth.login}</button>
                  {' · '}
                  <span className="text-xs">{t.common.newsletterNote}</span>
                </p>
              )}
              <Button size="lg" className="h-12 w-full sm:w-auto sm:px-10" disabled={!validContact} onClick={() => setStep(1)}>
                {t.common.next}
              </Button>
            </section>
          )}

          {/* Step 1: Address */}
          {step === 1 && (
            <section aria-label={t.checkout.step2} className="space-y-4">
              <h2 className="text-lg font-semibold text-ink">{t.checkout.step2}</h2>
              <AddressFields value={ship} onChange={setShip} isFa={isFa} t={t} />
              <div className="flex items-center gap-2">
                <Checkbox id="bill-same" checked={billingSame} onCheckedChange={(v) => setBillingSame(v === true)} />
                <Label htmlFor="bill-same" className="text-sm">{t.checkout.sameAsShipping}</Label>
              </div>
              {!billingSame && <AddressFields value={bill} onChange={setBill} isFa={isFa} t={t} prefix="bill-" />}
              <div className="flex gap-2">
                <Button variant="outline" size="lg" className="h-12" onClick={() => setStep(0)}>{t.common.back}</Button>
                <Button size="lg" className="h-12 flex-1 sm:flex-none sm:px-10" disabled={!validShip || (!billingSame && !(bill.recipient && bill.line1 && bill.city && bill.postalCode))} onClick={() => setStep(2)}>
                  {t.common.next}
                </Button>
              </div>
            </section>
          )}

          {/* Step 2: Delivery */}
          {step === 2 && (
            <section aria-label={t.checkout.deliveryTitle} className="space-y-4">
              <h2 className="text-lg font-semibold text-ink">{t.checkout.deliveryTitle}</h2>
              {!quote ? (
                <Spinner label={t.common.loading} />
              ) : (
                <RadioGroup value={methodId ?? ''} onValueChange={setMethodId} className="gap-3">
                  {quote.methods.map((m) => (
                    <Label key={m.id} htmlFor={m.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft">
                      <RadioGroupItem id={m.id} value={m.id} className="mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink">{m.label}</p>
                        {m.desc && <p className="text-xs text-ink-3">{m.desc}</p>}
                        <p className="mt-1 text-xs text-ink-3">{tf(t.common.deliveryEstimate, { min: m.etaDays.min, max: m.etaDays.max })}</p>
                      </div>
                      <span className="text-sm font-semibold text-ink bdi">
                        {m.effectivePriceMinor === 0 ? t.common.free : formatMoney(m.effectivePriceMinor, locale)}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
              {/* Gift wrap service */}
              {giftEnabled && (
                <div className={cn('rounded-lg border border-dashed p-4 transition', giftWrap ? 'border-orange-accent/50 bg-orange-accent/5' : 'border-line bg-white hover:border-brand/30')}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="gift-wrap"
                      checked={giftWrap}
                      onCheckedChange={(v) => setGiftWrap(v === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="gift-wrap" className="flex-1 cursor-pointer">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition', giftWrap ? 'bg-orange-accent text-white' : 'bg-soft text-ink-3')} aria-hidden>
                          <Gift className="h-4 w-4 mirror-rtl" />
                        </span>
                        <span className="whitespace-nowrap">{t.checkout.giftWrap}</span>
                        <span className="ms-auto shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-ink bdi">{formatMoney(giftCfg?.priceMinor ?? 0, locale)}</span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-3">{t.checkout.giftWrapDesc}</span>
                    </Label>
                  </div>
                  {giftWrap && (
                    <div className="mt-3 border-t border-dashed border-orange-accent/30 pt-3">
                      <Label htmlFor="gift-message" className="mb-1.5 text-xs font-medium text-ink-2">{t.checkout.giftMessage}</Label>
                      <textarea
                        id="gift-message"
                        value={giftMessage}
                        maxLength={300}
                        rows={2}
                        placeholder={t.checkout.giftMessagePlaceholder}
                        onChange={(e) => setGiftMessage(e.target.value)}
                        className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                      />
                      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-success" aria-hidden />{t.checkout.giftMessageNote}</span>
                        <span className="tabular-nums bdi">{giftMessage.length}/300</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="lg" className="h-12" onClick={() => setStep(1)}>{t.common.back}</Button>
                <Button size="lg" className="h-12 flex-1 sm:flex-none sm:px-10" disabled={!methodId} onClick={() => setStep(3)}>{t.common.next}</Button>
              </div>
            </section>
          )}

          {/* Step 3: Payment + review */}
          {step === 3 && (
            <section aria-label={t.checkout.paymentTitle} className="space-y-5">
              <h2 className="text-lg font-semibold text-ink">{t.checkout.paymentTitle}</h2>
              <div className="rounded-lg border border-line bg-soft px-4 py-3 text-xs leading-relaxed text-ink-2" role="note">
                <Lock className="me-1.5 inline h-3.5 w-3.5 text-success" aria-hidden />
                {t.checkout.sandboxNote}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="cc-number" className="mb-1.5">{t.checkout.cardNumber}</Label>
                  <Input id="cc-number" inputMode="numeric" autoComplete="cc-number" dir="ltr" placeholder="4242 4242 4242 4242" value={card.number}
                    onChange={(e) => setCard((c) => ({ ...c, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) }))} />
                </div>
                <div>
                  <Label htmlFor="cc-holder" className="mb-1.5">{t.checkout.cardHolder}</Label>
                  <Input id="cc-holder" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard((c) => ({ ...c, holder: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cc-exp" className="mb-1.5">{t.checkout.expiry}</Label>
                    <Input id="cc-exp" inputMode="numeric" autoComplete="cc-exp" dir="ltr" placeholder="12/27" value={card.expiry}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                        setCard((c) => ({ ...c, expiry: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v }))
                      }} />
                  </div>
                  <div>
                    <Label htmlFor="cc-cvc" className="mb-1.5">{t.checkout.cvc}</Label>
                    <Input id="cc-cvc" inputMode="numeric" autoComplete="cc-csc" dir="ltr" placeholder="123" value={card.cvc}
                      onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                  </div>
                </div>
              </div>

              <Separator />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">{t.checkout.step5}</h3>
                <div className="rounded-lg border border-line px-4 py-3 text-sm text-ink-2">
                  <p className="font-medium text-ink">{ship.recipient}</p>
                  <p className="bdi">{ship.line1}{ship.line2 ? `, ${ship.line2}` : ''}, {ship.postalCode} {ship.city}, {ship.countryCode}</p>
                  <p className="mt-1 text-xs text-ink-3">{method?.label} · {tf(t.common.deliveryEstimate, { min: method?.etaDays.min ?? 2, max: method?.etaDays.max ?? 5 })}</p>
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <Checkbox id="consent-terms" checked={consents} onCheckedChange={(v) => setConsents(v === true)} />
                  <Label htmlFor="consent-terms" className="text-xs leading-relaxed text-ink-2">
                    {t.checkout.accepting}{' '}
                    <button type="button" className="text-brand underline" onClick={() => navigate('/legal/terms')}>{t.checkout.terms}</button>{' '}
                    {t.checkout.and}{' '}
                    <button type="button" className="text-brand underline" onClick={() => navigate('/legal/privacy')}>{t.checkout.privacy}</button>
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="lg" className="h-12" onClick={() => setStep(2)} disabled={placing}>{t.common.back}</Button>
                <Button size="lg" className="h-12 flex-1" disabled={!validCard || !consents || placing} onClick={placeOrder}>
                  {placing ? <><Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />{t.common.submitting}</> : tf(t.checkout.payNow, { amount: formatMoney(totalMinor, locale) })}
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Summary rail */}
        <aside className="h-fit rounded-lg border border-line bg-soft p-5 lg:sticky lg:top-28" aria-label={t.checkout.orderSummary}>
          <h2 className="text-base font-semibold text-ink">{t.checkout.orderSummary}</h2>
          <ul className="mt-4 space-y-3">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="relative shrink-0">
                  { }
                  <img src={item.coverUrl ?? ''} alt="" className="h-14 w-10 rounded-sm border border-line object-cover" />
                  <span className="absolute -end-1.5 -top-1.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{item.quantity}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{item.title}</span>
                <span className="text-sm font-medium text-ink bdi">{formatMoney(item.lineTotalMinor, locale)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-ink-2">{t.common.subtotal}</dt><dd className="bdi">{formatMoney(cart.subtotalMinor, locale)}</dd></div>
            {promotion && promotion.savedMinor > 0 && (
              <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-success">
                <dt className="flex items-center gap-1"><BadgePercent className="h-3.5 w-3.5" aria-hidden /><span className="bdi">{locale === 'fa' ? promotion.noteFa ?? promotion.name : promotion.noteEn ?? promotion.name}</span></dt>
                <dd className="bdi">−{formatMoney(promotion.savedMinor, locale)}</dd>
              </div>
            )}
            {discount && (
              <div className="flex justify-between text-success">
                <dt className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" aria-hidden />{t.promo.discount}</dt>
                <dd className="bdi">−{formatMoney(discount.discountMinor, locale)}</dd>
              </div>
            )}
            {giftWrap && (
              <div className="flex justify-between">
                <dt className="flex items-center gap-1 text-ink-2"><Gift className="h-3.5 w-3.5 text-orange-accent mirror-rtl" aria-hidden />{t.checkout.giftWrapRow}</dt>
                <dd className="bdi">{formatMoney(giftWrapMinor, locale)}</dd>
              </div>
            )}
            <div className="flex justify-between"><dt className="text-ink-2">{t.common.shipping}</dt><dd className="bdi">{method ? (method.effectivePriceMinor === 0 ? t.common.free : formatMoney(method.effectivePriceMinor, locale)) : '—'}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{t.common.total}</dt><dd className="bdi">{formatMoney(totalMinor, locale)}</dd></div>
          </dl>

          {/* Promo code */}
          <div className="mt-4 border-t border-line pt-4">
            {discount ? (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2" data-testid="applied-promo">
                <BadgePercent className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-bold tracking-wide text-ink bdi" dir="ltr">{discount.code}</p>
                  <p className="truncate text-[11px] text-ink-3">{locale === 'fa' && discount.noteFa ? discount.noteFa : discount.noteEn ?? (discount.type === 'PERCENT' ? `${discount.value}%` : formatMoney(discount.value, locale))}</p>
                </div>
                <button type="button" onClick={removePromo} aria-label={t.promo.remove} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-white hover:text-error">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="promo-code" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                  <Tag className="h-3.5 w-3.5 mirror-rtl" aria-hidden />{t.promo.label}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="promo-code" placeholder={t.promo.placeholder} value={promoInput} dir="ltr"
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyPromo() } }}
                    className="h-9 flex-1 font-mono text-xs uppercase tracking-wide" autoComplete="off"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9" disabled={promoBusy || promoInput.trim().length < 2} onClick={applyPromo}>
                    {promoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : t.promo.apply}
                  </Button>
                </div>
                {promoError && <p role="alert" className="mt-1.5 text-xs text-error">{promoError}</p>}
              </>
            )}
          </div>

          <p className="mt-3 text-xs text-ink-3">{t.common.tax}</p>
        </aside>
      </div>
    </main>
  )
}

function AddressFields({ value, onChange, isFa, t, prefix = 'ship-' }: {
  value: AddressForm; onChange: (v: AddressForm) => void; isFa: boolean
  t: ReturnType<typeof getDict>; prefix?: string
}) {
  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${prefix}recipient`} className="mb-1.5">{t.checkout.recipient}</Label>
        <Input id={`${prefix}recipient`} autoComplete="name" value={value.recipient} onChange={set('recipient')} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${prefix}line1`} className="mb-1.5">{t.checkout.address1}</Label>
        <Input id={`${prefix}line1`} autoComplete="address-line1" value={value.line1} onChange={set('line1')} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${prefix}line2`} className="mb-1.5">{t.checkout.address2}</Label>
        <Input id={`${prefix}line2`} autoComplete="address-line2" value={value.line2} onChange={set('line2')} />
      </div>
      <div>
        <Label htmlFor={`${prefix}city`} className="mb-1.5">{t.checkout.city}</Label>
        <Input id={`${prefix}city`} autoComplete="address-level2" value={value.city} onChange={set('city')} />
      </div>
      <div>
        <Label htmlFor={`${prefix}postal`} className="mb-1.5">{t.checkout.postalCode}</Label>
        <Input id={`${prefix}postal`} autoComplete="postal-code" dir="ltr" value={value.postalCode} onChange={set('postalCode')} />
      </div>
      <div>
        <Label htmlFor={`${prefix}country`} className="mb-1.5">{t.checkout.country}</Label>
        <select
          id={`${prefix}country`}
          value={value.countryCode}
          onChange={(e) => onChange({ ...value, countryCode: e.target.value })}
          className="flex h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
        >
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{isFa ? c.fa : c.en}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor={`${prefix}phone`} className="mb-1.5">{t.checkout.phone}</Label>
        <Input id={`${prefix}phone`} type="tel" autoComplete="tel" dir="ltr" value={value.phone} onChange={set('phone')} />
      </div>
    </div>
  )
}

function SuccessPanel({ locale, orderNumber, email, refCode }: { locale: 'en' | 'fa'; orderNumber: string; email?: string; refCode?: string | null }) {
  const t = getDict(locale)
  const isFa = locale === 'fa'
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-lg border border-success/30 bg-success/10 p-8 text-center fade-up">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">{t.checkout.successTitle}</h1>
        {email ? <p className="mt-2 text-sm text-ink-2">{tf(t.checkout.successBody, { email })}</p> : null}
        <p className="mt-4 text-sm text-ink-3">
          {t.checkout.orderNumber}: <span className="font-mono font-bold text-ink bdi" dir="ltr">{compactOrderNumber(orderNumber)}</span>
        </p>
        {refCode ? (
          <p className="mt-1.5 text-xs text-ink-3">
            {isFa ? 'کد پیگیری بدون ایمیل: ' : 'Email-free tracking ref: '}
            <span className="font-mono font-bold text-ink bdi" dir="ltr">{refCode}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => navigate('/account/orders')}>{t.checkout.viewOrder}</Button>
          <Button variant="outline" onClick={() => navigate(refCode ? `/track?ref=${encodeURIComponent(refCode)}` : `/track?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email ?? '')}`)}>
            <PackageCheck className="me-1.5 h-4 w-4" aria-hidden />{t.track.title}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/books')}>{t.common.continueShopping}</Button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-ink-3">
        {isFa ? 'این یک پرداخت آزمایشی است؛ هیچ مبلغی کسر نشده است.' : 'This was a sandbox payment — no real charge was made.'}
      </p>
    </main>
  )
}

export { SuccessPanel }
