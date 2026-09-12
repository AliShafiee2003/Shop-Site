// Shipping settings helpers (parsed from the 'shipping' Settings row).
import { getSetting } from './utils'

export type ShippingMethod = {
  id: string
  zone: string
  labelEn?: string
  labelFa?: string
  descEn?: string
  descFa?: string
  priceMinor: number
  freeOverMinor?: number | null
  minDays?: number
  maxDays?: number
  countries: string[]
}

export type ShippingSettingsShape = {
  customsNote?: string
  customsNoteFa?: string
  methods: ShippingMethod[]
}

export async function loadShippingSettings(): Promise<ShippingSettingsShape> {
  const s = await getSetting<Partial<ShippingSettingsShape>>('shipping', {})
  return { customsNote: s.customsNote, customsNoteFa: s.customsNoteFa, methods: Array.isArray(s.methods) ? s.methods : [] }
}

/** True if the method serves the given country (explicit list or '*'). */
export function methodServesCountry(method: ShippingMethod, countryCode: string): boolean {
  const countries = Array.isArray(method.countries) ? method.countries : []
  return countries.includes(countryCode) || countries.includes('*')
}
