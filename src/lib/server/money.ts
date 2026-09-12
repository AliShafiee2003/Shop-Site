// Money helpers — all amounts are integers in minor units (EUR cents).
// VAT model: Austrian reduced rate for books, 10%, INCLUDED in prices.
export const VAT_RATE_PCT = 10

/** VAT contained in a VAT-inclusive total: round(total * 10 / 110). */
export function computeTax(totalMinor: number): number {
  return Math.round((totalMinor * VAT_RATE_PCT) / (100 + VAT_RATE_PCT))
}

/** EUR major units (e.g. 12.5 from query params) → minor units (1250). */
export function toMinor(eurMajor: number): number {
  return Math.round(eurMajor * 100)
}

/** Format minor units for human display (logs/tests mostly). */
export function formatMinor(minor: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : `${currency} `
  return `${symbol}${(minor / 100).toFixed(2)}`
}
