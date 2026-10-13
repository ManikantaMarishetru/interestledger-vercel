import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  daysInMonth,
  fromDayNumber,
  isLeapYear,
  isValidISODate,
  parseRatePercent,
  parseRupees,
  paiseToRupeeString,
  rateE4ToString,
  roundHalfUp,
  frac,
  toDayNumber,
  weekday,
} from '../src/engine'

describe('dates', () => {
  it('round-trips every day from 1900 to 2100', () => {
    const start = toDayNumber('1900-01-01')
    const end = toDayNumber('2100-12-31')
    for (let n = start; n <= end; n++) expect(toDayNumber(fromDayNumber(n))).toBe(n)
  })

  it('handles leap years', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2023)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2025, 2)).toBe(28)
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01')
    expect(isValidISODate('2023-02-29')).toBe(false)
    expect(isValidISODate('2024-02-29')).toBe(true)
  })

  it('handles month and year changes', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2025-12-25', '2026-01-05')).toBe(11)
  })

  it('knows weekdays (DST and time zones cannot shift them)', () => {
    expect(weekday('1970-01-01')).toBe(4) // Thursday
    expect(weekday('2026-10-11')).toBe(0) // Sunday
    expect(weekday('2026-10-13')).toBe(2) // Tuesday
  })

  it('rejects malformed dates', () => {
    for (const s of ['2026-1-01', '2026-13-01', '2026-00-10', 'abc', '', '2026-04-31']) expect(isValidISODate(s)).toBe(false)
  })
})

describe('money', () => {
  it('parses rupees to integer paise without floating point', () => {
    expect(parseRupees('50000')).toBe(5_000_000)
    expect(parseRupees('1,250.5')).toBe(125_050)
    expect(parseRupees('₹ 0.10')).toBe(10)
    expect(parseRupees('0.29')).toBe(29) // 0.29 * 100 is 28.999... in floats
    expect(parseRupees('1.234')).toBeNull()
    expect(parseRupees('-5')).toBeNull()
    expect(parseRupees('')).toBeNull()
    expect(paiseToRupeeString(125_050)).toBe('1250.50')
    expect(paiseToRupeeString(-5)).toBe('-0.05')
  })

  it('parses rates exactly', () => {
    expect(parseRatePercent('2')).toBe(20000)
    expect(parseRatePercent('0.25')).toBe(2500)
    expect(parseRatePercent('1.0001')).toBe(10001)
    expect(parseRatePercent('1.00001')).toBeNull()
    expect(rateE4ToString(2500)).toBe('0.25')
    expect(rateE4ToString(20000)).toBe('2')
  })

  it('rounds halves up', () => {
    expect(roundHalfUp(frac(1, 2))).toBe(1)
    expect(roundHalfUp(frac(3, 2))).toBe(2)
    expect(roundHalfUp(frac(1, 3))).toBe(0)
    expect(roundHalfUp(frac(2, 3))).toBe(1)
  })
})
