// Calendar dates are plain "YYYY-MM-DD" strings. All arithmetic is done on
// integer day numbers (days since 1970-01-01) so time zones and DST can never
// shift a date by one. The JS Date object is only used to read "today".

export type ISODate = string

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  const table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return table[m - 1]
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false
  const m = ISO_RE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return y >= 1900 && y <= 9999 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

function parts(s: ISODate): [number, number, number] {
  if (!isValidISODate(s)) throw new Error(`Invalid date: ${s}`)
  return [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))]
}

// Howard Hinnant's days_from_civil.
export function toDayNumber(s: ISODate): number {
  let [y, m, d] = parts(s)
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

// Howard Hinnant's civil_from_days.
export function fromDayNumber(n: number): ISODate {
  const z = n + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromDayNumber(toDayNumber(s) + n)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a)
}

/** 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(s: ISODate): number {
  return (((toDayNumber(s) + 4) % 7) + 7) % 7
}

export function monthOf(s: ISODate): { year: number; month: number } {
  const [y, m] = parts(s)
  return { year: y, month: m }
}

/** Device-local calendar date. Only the UI should call this. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
