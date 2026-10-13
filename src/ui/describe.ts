// Plain-language descriptions of rules, entries and calculations.

import {
  addDays,
  dailyExactInterest,
  explainDay,
  rateE4ToString,
  roundHalfUp,
  weekday,
  type DayRow,
  type ISODate,
  type LoanTerms,
  type Transaction,
  type TxType,
} from '../engine'
import type { Lang, MessageKey, TFn } from '../i18n'
import { money, weekdayName } from './format'

export function weekdayLabel(d: number, lang: Lang, style: 'long' | 'short' = 'long'): string {
  // 2026-10-11 was a Sunday
  return weekdayName(addDays('2026-10-11', d), lang, style)
}

/** The headline rule: "₹100 every day". */
export function ruleHeadline(terms: LoanTerms, t: TFn): string {
  switch (terms.method) {
    case 'fixed_daily':
      return t(terms.fixedAmountBasis === 'proportional' ? 'rule.fixed_prop' : 'rule.fixed', {
        amount: money(terms.fixedDailyPaise ?? 0),
      })
    case 'percent_daily':
      return t('rule.percent_daily', { rate: rateE4ToString(terms.rateE4 ?? 0) })
    case 'percent_monthly':
      return t('rule.percent_monthly', { rate: rateE4ToString(terms.rateE4 ?? 0) })
  }
}

/** Every detail of the rule, one line each. */
export function ruleDetails(terms: LoanTerms, t: TFn, lang: Lang): string[] {
  const lines: string[] = [ruleHeadline(terms, t)]
  if (terms.method === 'percent_monthly') {
    lines.push(
      t(
        terms.monthlyDayCount === 'actual_month'
          ? 'rule.daycount_actual'
          : terms.monthlyDayCount === 'annual_365'
            ? 'rule.daycount_365'
            : 'rule.daycount_30',
      ),
    )
  }
  if (terms.method === 'fixed_daily' && terms.fixedAmountBasis === 'proportional') lines.push(t('rule.fixed_prop_detail'))
  lines.push(t(terms.chargeDisbursementDay ? 'rule.start_same_day' : 'rule.start_next_day'))
  lines.push(t(terms.chargeRepaymentDay ? 'rule.repay_day_charged' : 'rule.repay_day_free'))
  if (terms.nonChargeableWeekdays.length) {
    const names = [...terms.nonChargeableWeekdays].sort().map((d) => weekdayLabel(d, lang))
    lines.push(t('rule.days_off', { days: names.join(', ') }))
  }
  if (terms.nonChargeableDates.length) lines.push(t('rule.holidays', { count: terms.nonChargeableDates.length }))
  lines.push(t(terms.allocationPolicy === 'interest_first' ? 'rule.alloc_interest_first' : 'rule.alloc_manual'))
  lines.push(t(terms.rounding === 'daily_half_up' ? 'rule.round_daily' : 'rule.round_cumulative'))
  lines.push(t('rule.simple_only'))
  return lines
}

/** Interest for one full chargeable day on `principal` (rounded, for previews). */
export function dayInterestPreview(terms: LoanTerms, principal: number, date: ISODate, original = principal): number {
  return roundHalfUp(dailyExactInterest(terms, principal, original, date))
}

export function nextCollectionDate(terms: LoanTerms, from: ISODate): ISODate | undefined {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(from, i)
    if (!terms.nonChargeableWeekdays.includes(weekday(d)) && !terms.nonChargeableDates.includes(d)) return d
  }
  return undefined
}

export const txTypeKey: Record<TxType, MessageKey> = {
  disbursement: 'tx.disbursement',
  principal_increase: 'tx.principal_increase',
  collection: 'tx.collection',
  interest_waiver: 'tx.interest_waiver',
  principal_waiver: 'tx.principal_waiver',
  reversal: 'tx.reversal',
}

/** "Interest ₹300 · Principal ₹0" style split line for a collection. */
export function splitLine(tx: Transaction, t: TFn): string {
  if (tx.type !== 'collection' && tx.type !== 'reversal') return ''
  const parts: string[] = []
  if (tx.interestPaise) parts.push(t('split.interest', { amount: money(tx.interestPaise) }))
  if (tx.principalPaise) parts.push(t('split.principal', { amount: money(tx.principalPaise) }))
  return parts.join(' · ')
}

/** How a day's interest was worked out, in words. */
export function explainLine(terms: LoanTerms, row: DayRow, originalPrincipal: number, t: TFn): string {
  const e = explainDay(terms, row, originalPrincipal)
  if (e.key === 'explain.no_charge') {
    const reason: MessageKey =
      row.noChargeReason === 'weekday'
        ? 'reason.weekday'
        : row.noChargeReason === 'holiday'
          ? 'reason.holiday'
          : row.noChargeReason === 'start_day'
            ? 'reason.start_day'
            : 'reason.no_principal'
    return t(reason)
  }
  const params = {
    principal: money(e.principal),
    fixed: money(e.fixedPaise ?? 0),
    original: money(e.originalPrincipal ?? 0),
    rate: rateE4ToString(e.rateE4 ?? 0),
    divisor: e.divisor ?? 0,
    exact: exactRupees(e.exactPaise),
    charged: money(e.charged),
  }
  const main = t(e.key as MessageKey, params)
  const exactIsWhole = !e.exactPaise.includes('/')
  return exactIsWhole ? main : `${main} ${t('explain.rounded', params)}`
}

/** "1000/3" paise -> "₹3.3333…" (display only). */
function exactRupees(f: string): string {
  const [n, d = '1'] = f.split('/')
  const num = BigInt(n)
  const den = BigInt(d)
  const scaled = (num * 10000n) / den // 4 decimals of paise -> 6 of rupees; show 4
  const rupees = scaled / 1000000n
  const rest = String(scaled % 1000000n).padStart(6, '0').slice(0, 4)
  return `₹${rupees}.${rest}${num * 10000n % den === 0n ? '' : '…'}`
}
