// Display formatting only. Money is formatted from integer paise using string
// arithmetic, never by dividing into a float.

import type { ISODate } from '../engine'
import type { Lang } from '../i18n'

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 5000000 -> "₹50,000"; 125050 -> "₹1,250.50". Lakh/crore grouping. */
export function money(paise: number, opts: { always2?: boolean } = {}): string {
  const neg = paise < 0
  const a = Math.abs(paise)
  const rupees = Math.floor(a / 100)
  const p = a % 100
  const whole = grouping.format(rupees)
  const s = p || opts.always2 ? `₹${whole}.${String(p).padStart(2, '0')}` : `₹${whole}`
  return neg ? `−${s}` : s
}

function utc(d: ISODate): Date {
  return new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))))
}

const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(lang: Lang, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = lang + JSON.stringify(o)
  let f = cache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', { timeZone: 'UTC', ...o })
    cache.set(k, f)
  }
  return f
}

/** "13 Oct 2026" */
export function date(d: ISODate, lang: Lang): string {
  // ICU's Kannada pattern prints "ಅಕ್ಟೋ 13,2026"; add the missing space
  return fmt(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(utc(d)).replace(/,(?=\d)/, ', ')
}

/** "Tue, 13 Oct" */
export function dateShort(d: ISODate, lang: Lang): string {
  return fmt(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(utc(d))
}

/** "Tuesday" */
export function weekdayName(d: ISODate, lang: Lang, style: 'long' | 'short' = 'long'): string {
  return fmt(lang, { weekday: style }).format(utc(d))
}

/** "October 2026" from "2026-10" */
export function monthName(ym: string, lang: Lang): string {
  return fmt(lang, { month: 'long', year: 'numeric' }).format(utc(`${ym}-01`))
}

export function time(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = [...(parts[0] ?? '?')][0] ?? '?'
  const second = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : ''
  return (first + second).toUpperCase()
}
