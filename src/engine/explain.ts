// Structured explanations. The UI turns these into sentences in the chosen
// language; the engine never produces display text.

import type { DayRow } from './accrual'
import { daysInMonth, monthOf } from './dates'
import { fracToString } from './money'
import type { LoanTerms } from './types'

export interface DayExplanation {
  /** Translation key for the formula. */
  key:
    | 'explain.fixed'
    | 'explain.fixed_proportional'
    | 'explain.percent_daily'
    | 'explain.monthly_thirty'
    | 'explain.monthly_actual'
    | 'explain.monthly_365'
    | 'explain.no_charge'
  principal: number
  fixedPaise?: number
  originalPrincipal?: number
  rateE4?: number
  /** Days the monthly amount is spread over. */
  divisor?: number
  /** Exact amount in paise as "n" or "n/d". */
  exactPaise: string
  charged: number
  rounding: LoanTerms['rounding']
}

export function explainDay(terms: LoanTerms, row: DayRow, originalPrincipal: number): DayExplanation {
  const base = {
    principal: row.principalBase,
    exactPaise: fracToString(row.exact),
    charged: row.interestCharged,
    rounding: terms.rounding,
  }
  if (!row.chargeable) return { key: 'explain.no_charge', ...base }
  switch (terms.method) {
    case 'fixed_daily':
      return terms.fixedAmountBasis === 'proportional'
        ? { key: 'explain.fixed_proportional', fixedPaise: terms.fixedDailyPaise, originalPrincipal, ...base }
        : { key: 'explain.fixed', fixedPaise: terms.fixedDailyPaise, ...base }
    case 'percent_daily':
      return { key: 'explain.percent_daily', rateE4: terms.rateE4, ...base }
    case 'percent_monthly': {
      if (terms.monthlyDayCount === 'actual_month') {
        const { year, month } = monthOf(row.date)
        return { key: 'explain.monthly_actual', rateE4: terms.rateE4, divisor: daysInMonth(year, month), ...base }
      }
      if (terms.monthlyDayCount === 'annual_365')
        return { key: 'explain.monthly_365', rateE4: terms.rateE4, divisor: 365, ...base }
      return { key: 'explain.monthly_thirty', rateE4: terms.rateE4, divisor: 30, ...base }
    }
  }
}
