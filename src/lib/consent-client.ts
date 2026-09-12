'use client'

/** Client facade for the consent API (spec §8.1 `trackEvent`-style facade). */
import { apiGet, apiPut } from '@/lib/api'
import { useApp, type ConsentState } from '@/store/store'

export type OptionalCategories = {
  preferences: boolean
  analytics: boolean
  personalization: boolean
  marketing: boolean
}

type ConsentResponse = ConsentState & { currentPolicyVersion?: string }

/** Read the server-verified consent state and adopt it into the store. */
export async function fetchAndAdoptConsent(): Promise<ConsentState> {
  const r = await apiGet<ConsentResponse>('/api/privacy/consent')
  const state: ConsentState = {
    decided: r.decided,
    policyVersion: r.policyVersion,
    categories: r.categories,
  }
  useApp.getState().setConsent(state)
  return state
}

/** Save a decision server-side and adopt the returned verified state. */
export async function saveConsentDecision(
  action: 'accept_all' | 'reject_optional' | 'custom',
  categories: OptionalCategories,
  source: 'banner' | 'preference_center' | 'footer',
): Promise<ConsentState> {
  const locale = useApp.getState().locale
  const r = await apiPut<ConsentResponse>('/api/privacy/consent', {
    action,
    categories,
    locale,
    source,
  })
  const state: ConsentState = {
    decided: r.decided,
    policyVersion: r.policyVersion,
    categories: r.categories,
  }
  useApp.getState().setConsent(state)
  return state
}

export const REJECT_ALL_OPTIONAL: OptionalCategories = {
  preferences: false,
  analytics: false,
  personalization: false,
  marketing: false,
}

export const ACCEPT_ALL_OPTIONAL: OptionalCategories = {
  preferences: true,
  analytics: true,
  personalization: true,
  marketing: true,
}
