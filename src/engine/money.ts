// Money is always an integer number of paise (1 rupee = 100 paise).
// Exact interest is kept as a BigInt fraction and only rounded once, by the
// rounding policy in accrual.ts. No floating point touches money.

export type Paise = number

export function isPaise(n: unknown): n is Paise {
  return typeof n === 'number' && Number.isSafeInteger(n)
}

export function isPositivePaise(n: unknown): n is Paise {
  return isPaise(n) && n > 0
}

/**
 * Parse a rupee amount typed by a person ("50000", "1,250.5", "₹99.99")
 * into paise. Returns null for anything that is not a plain non-negative
 * amount with at most two decimal places.
 */
export function parseRupees(input: string): Paise | null {
  const s = input.replace(/[₹,\s]/g, '')
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const whole = Number(m[1])
  const frac = Number((m[2] ?? '').padEnd(2, '0'))
  const p = whole * 100 + frac
  return Number.isSafeInteger(p) ? p : null
}

/** "123456" paise -> "1234.56" (plain, for CSV and inputs). */
export function paiseToRupeeString(p: Paise): string {
  const neg = p < 0
  const a = Math.abs(p)
  const s = `${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
  return neg ? `-${s}` : s
}

// Rates are stored as integers scaled by 10^4 so that up to four decimal
// places of a percentage are exact: 2% -> 20000, 0.25% -> 2500.
export const RATE_SCALE = 10_000

export function parseRatePercent(input: string): number | null {
  const s = input.replace(/[%\s]/g, '')
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(s)
  if (!m) return null
  return Number(m[1]) * RATE_SCALE + Number((m[2] ?? '').padEnd(4, '0'))
}

export function rateE4ToString(rateE4: number): string {
  const whole = Math.floor(rateE4 / RATE_SCALE)
  const frac = String(rateE4 % RATE_SCALE).padStart(4, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : String(whole)
}

// ---- exact fractions -------------------------------------------------------

export interface Fraction {
  n: bigint
  d: bigint
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}

export function frac(n: bigint | number, d: bigint | number = 1n): Fraction {
  let nn = BigInt(n)
  let dd = BigInt(d)
  if (dd === 0n) throw new Error('Zero denominator')
  if (dd < 0n) {
    nn = -nn
    dd = -dd
  }
  const g = gcd(nn, dd) || 1n
  return { n: nn / g, d: dd / g }
}

export const ZERO: Fraction = { n: 0n, d: 1n }

export function addFrac(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d)
}

/** Round a non-negative fraction to the nearest integer, halves go up. */
export function roundHalfUp(f: Fraction): number {
  if (f.n < 0n) throw new Error('roundHalfUp expects a non-negative value')
  return Number((2n * f.n + f.d) / (2n * f.d))
}

export function fracToString(f: Fraction): string {
  return f.d === 1n ? String(f.n) : `${f.n}/${f.d}`
}
