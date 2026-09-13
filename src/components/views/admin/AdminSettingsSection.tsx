'use client'

import { useEffect, useState } from 'react'
import { Gift, Clock, Store, Truck, Landmark, Phone, MapPin, Instagram, Twitter, Youtube, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/storefront/bits'
import { cn } from '@/lib/utils'
import { apiGet, apiPatch } from '@/lib/api'
import { getDict, tf } from '@/lib/i18n'
import { formatMoney, formatDateTime, faDigits } from '@/lib/format'
import { useApp } from '@/store/store'
import { useToast } from '@/hooks/use-toast'

/** Store settings (owner-only): gift wrap service toggle + price, with a live
 *  preview of the checkout card. Writes go through /api/admin/settings (audited). */
export function AdminSettings() {
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
          name: s.name ?? 'PersePix',
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
  // Validation mirrors PATCH /api/admin/settings' zod schema EXACTLY and is
  // enforced ONLY for fields actually included in the patch (unchanged values
  // already live in the DB and pass). The previous UI hard-required legalName
  // (which the DB row does not even have) — the save button stayed silently
  // disabled forever and store info could not be updated (user bug report).
  const stThresholdMinor = Math.round(Number(stThreshold) * 100)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isHttpUrl = (v: string) => {
    try {
      const u = new URL(v)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }
  const buildStorePatch = (): { patch: Record<string, unknown>; errors: string[] } => {
    if (!store) return { patch: {}, errors: [] }
    const errors: string[] = []
    const patch: Record<string, unknown> = {}
    if (stName !== store.name) {
      if (stName.trim().length < 2) errors.push(t.admin.storeName)
      else patch.name = stName.trim()
    }
    if (stNameFa !== store.nameFa) {
      if (stNameFa.trim().length < 2) errors.push(t.admin.storeNameFa)
      else patch.nameFa = stNameFa.trim()
    }
    // legalName is OPTIONAL in the API — empty stays unsent (can never 400).
    if (stLegal !== store.legalName && stLegal.trim() !== '') {
      if (stLegal.trim().length < 2) errors.push(t.admin.storeLegal)
      else patch.legalName = stLegal.trim()
    }
    if (stEmail.trim() !== store.email) {
      if (stEmail.trim() === '' || !EMAIL_RE.test(stEmail.trim())) errors.push(t.admin.storeEmail)
      else patch.email = stEmail.trim()
    }
    if (stPhone.trim() !== store.phone) {
      // API enforces min(6) — a set phone can never be cleared to ''.
      if (stPhone.trim() === '' || stPhone.trim().length < 6) errors.push(t.admin.storePhone)
      else patch.phone = stPhone.trim()
    }
    if (stAddress.trim() !== store.address) {
      if (stAddress.trim() === '' || stAddress.trim().length < 6) errors.push(t.admin.storeAddress)
      else patch.address = stAddress.trim()
    }
    if (stThresholdMinor !== store.freeShippingThresholdMinor) {
      if (!Number.isFinite(stThresholdMinor) || stThresholdMinor < 0 || stThresholdMinor > 200_000) errors.push(t.admin.commerceThreshold)
      else patch.freeShippingThresholdMinor = stThresholdMinor
    }
    // Socials: '' always allowed (clears the link); non-empty must be an
    // absolute http(s) URL (SEC-012 rule mirrored client-side).
    if (stInstagram.trim() !== (store.instagram ?? '')) {
      if (stInstagram.trim() !== '' && !isHttpUrl(stInstagram.trim())) errors.push('Instagram')
      else patch.instagram = stInstagram.trim()
    }
    if (stX.trim() !== (store.x ?? '')) {
      if (stX.trim() !== '' && !isHttpUrl(stX.trim())) errors.push('X (Twitter)')
      else patch.x = stX.trim()
    }
    if (stYoutube.trim() !== (store.youtube ?? '')) {
      if (stYoutube.trim() !== '' && !isHttpUrl(stYoutube.trim())) errors.push('YouTube')
      else patch.youtube = stYoutube.trim()
    }
    return { patch, errors }
  }
  const { patch: storePatch, errors: storeErrors } = buildStorePatch()
  const fieldHasError = (label: string) => storeErrors.includes(label)
  const saveStore = async () => {
    if (!store || storeBusy) return
    if (storeErrors.length > 0) {
      toast({
        title: isFa ? 'ذخیره ممکن نیست — این موارد را اصلاح کنید:' : 'Cannot save — fix these fields:',
        description: storeErrors.join(isFa ? '، ' : ', '),
        variant: 'destructive',
      })
      return
    }
    if (Object.keys(storePatch).length === 0) {
      toast({ title: isFa ? 'تغییری برای ذخیره نیست' : 'No changes to save' })
      return
    }
    setStoreBusy(true)
    try {
      const r = await apiPatch<{ store: Record<string, unknown> }>('/api/admin/settings', { store: storePatch })
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
            <div className={cn('rounded-md border p-3', fieldHasError(t.admin.storeName) ? 'border-destructive' : stName !== store.name ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-name" className="text-xs">{t.admin.storeName}</Label>
              <Input id="store-name" value={stName} onChange={(e) => { setStName(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={60} aria-invalid={fieldHasError(t.admin.storeName) || undefined} />
            </div>
            <div lang="fa" dir="rtl" className={cn('rounded-md border p-3', fieldHasError(t.admin.storeNameFa) ? 'border-destructive' : stNameFa !== store.nameFa ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-name-fa" className="text-xs">{t.admin.storeNameFa}</Label>
              <Input id="store-name-fa" value={stNameFa} onChange={(e) => { setStNameFa(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={60} aria-invalid={fieldHasError(t.admin.storeNameFa) || undefined} />
            </div>
            <div className={cn('rounded-md border p-3', fieldHasError(t.admin.storeLegal) ? 'border-destructive' : stLegal !== store.legalName ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-legal" className="text-xs">{t.admin.storeLegal}</Label>
              <Input id="store-legal" value={stLegal} onChange={(e) => { setStLegal(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9" maxLength={120} aria-invalid={fieldHasError(t.admin.storeLegal) || undefined} />
            </div>
            <div className={cn('rounded-md border p-3', fieldHasError(t.admin.storeEmail) ? 'border-destructive' : stEmail !== store.email ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-email" className="text-xs">{t.admin.storeEmail}</Label>
              <Input id="store-email" type="email" dir="ltr" value={stEmail} onChange={(e) => { setStEmail(e.target.value); setStoreDirty(true) }} className="mt-1.5 h-9 font-mono text-[13px]" maxLength={120} aria-invalid={fieldHasError(t.admin.storeEmail) || undefined} />
            </div>
            <div className={cn('rounded-md border p-3', fieldHasError(t.admin.storePhone) ? 'border-destructive' : stPhone.trim() !== store.phone ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-phone" className="text-xs">{t.admin.storePhone}</Label>
              <div className="relative mt-1.5">
                <Input id="store-phone" type="tel" dir="ltr" value={stPhone} onChange={(e) => { setStPhone(e.target.value); setStoreDirty(true) }} className="h-9 ps-8 font-mono text-[13px]" maxLength={40} placeholder="+43 …" aria-invalid={fieldHasError(t.admin.storePhone) || undefined} />
                <Phone className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-3" aria-hidden />
              </div>
            </div>
            <div className={cn('rounded-md border p-3 sm:col-span-2', fieldHasError(t.admin.storeAddress) ? 'border-destructive' : stAddress.trim() !== store.address ? 'border-brand/40 bg-white' : 'border-line bg-white/60')}>
              <Label htmlFor="store-address" className="text-xs">{t.admin.storeAddress}</Label>
              <div className="relative mt-1.5">
                <Input id="store-address" value={stAddress} onChange={(e) => { setStAddress(e.target.value); setStoreDirty(true) }} className="h-9 ps-8" maxLength={200} aria-invalid={fieldHasError(t.admin.storeAddress) || undefined} />
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
            <Button size="sm" className="h-9" disabled={storeBusy || !storeDirty} onClick={saveStore}>
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
