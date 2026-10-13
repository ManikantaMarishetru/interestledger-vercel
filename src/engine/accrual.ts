// Interest accrual. Nothing here is stored: every balance is recomputed from
// the loan terms and the transaction history, so a backdated entry or a
// reversal automatically corrects everything after it.
//
// Rules (all per loan, see LoanTerms):
// - Simple interest only. Interest is charged on principal, never on unpaid
//   interest, so unpaid interest carries forward without compounding.
// - Day d is chargeable unless it is a non-chargeable weekday or holiday, or
//   no principal counts for it.
// - Principal that counts for day d ("base") = principal after all events
//   before d, plus money given on d if chargeDisbursementDay, minus money
//   repaid/forgiven on d unless chargeRepaymentDay.
// - The exact daily amount is a fraction; the rounding policy turns it into
//   whole paise.

import { daysInMonth, monthOf, toDayNumber, fromDayNumber, weekday, type ISODate } from './dates'
import { ZERO, addFrac, frac, roundHalfUp, type Fraction, type Paise } from './money'
import { effectiveTransactions, principalDelta } from './ledger'
import type { DayStatus, Loan, LoanTerms, NoChargeReason, Transaction } from './types'

export interface DayRow {
  date: ISODate
  chargeable: boolean
  noChargeReason?: NoChargeReason
  /** Principal that interest is charged on for this day. */
  principalBase: Paise
  /** Exact (unrounded) interest for the day. */
  exact: Fraction
  /** Interest charged (accrued) for the day, after rounding. */
  interestCharged: Paise
  /** Cash received on this day, interest part. */
  interestReceived: Paise
  /** Cash received on this day, principal part. */
  principalReceived: Paise
  interestWaived: Paise
  principalWaived: Paise
  principalGiven: Paise
  /** How much of this day's charge has been paid (oldest days are paid first). */
  chargePaid: Paise
  status: DayStatus
  /** Accrued − received − waived interest at the end of the day (negative = paid ahead). */
  interestBalanceAfter: Paise
  principalAfter: Paise
  /** Effective transactions dated this day. */
  txIds: string[]
}

export type LoanIssueCode = 'principal_negative' | 'interest_overpaid'

export interface LoanIssue {
  code: LoanIssueCode
  date: ISODate
}

export interface LoanState {
  loanId: string
  asOf: ISODate
  days: DayRow[]
  originalPrincipal: Paise
  principalGiven: Paise
  principalRepaid: Paise
  principalWaived: Paise
  principalOutstanding: Paise
  interestAccrued: Paise
  interestReceived: Paise
  interestWaived: Paise
  /** Accrued − received − waived. Negative means interest was paid ahead. */
  interestBalance: Paise
  /** max(interestBalance, 0) */
  interestOutstanding: Paise
  /** max(−interestBalance, 0) */
  interestCredit: Paise
  /** principal outstanding + interest outstanding (no other charges exist). */
  totalOutstanding: Paise
  status: 'active' | 'closed' | 'cancelled'
  issues: LoanIssue[]
}

const MILLION = 1_000_000n

/** Exact interest for one chargeable day on `base` principal. */
export function dailyExactInterest(terms: LoanTerms, base: Paise, originalPrincipal: Paise, date: ISODate): Fraction {
  if (base <= 0) return ZERO
  const P = BigInt(base)
  switch (terms.method) {
    case 'fixed_daily': {
      const F = BigInt(terms.fixedDailyPaise ?? 0)
      if (terms.fixedAmountBasis === 'proportional' && originalPrincipal > 0) {
        return frac(F * P, BigInt(originalPrincipal))
      }
      return frac(F)
    }
    case 'percent_daily':
      // P × rate% ÷ 100, rate stored ×10^4
      return frac(P * BigInt(terms.rateE4 ?? 0), MILLION)
    case 'percent_monthly': {
      const monthly = P * BigInt(terms.rateE4 ?? 0)
      switch (terms.monthlyDayCount) {
        case 'actual_month': {
          const { year, month } = monthOf(date)
          return frac(monthly, MILLION * BigInt(daysInMonth(year, month)))
        }
        case 'annual_365':
          return frac(monthly * 12n, MILLION * 365n)
        case 'thirty':
        default:
          return frac(monthly, MILLION * 30n)
      }
    }
  }
}

function noChargeReasonFor(terms: LoanTerms, date: ISODate): NoChargeReason | undefined {
  if (terms.nonChargeableDates.includes(date)) return 'holiday'
  if (terms.nonChargeableWeekdays.includes(weekday(date))) return 'weekday'
  return undefined
}

/**
 * Compute everything about a loan as of `asOf` (inclusive). Transactions
 * dated after `asOf` are ignored.
 */
export function computeLoanState(loan: Loan, allTxs: readonly Transaction[], asOf: ISODate): LoanState {
  const terms = loan.terms
  const txs = effectiveTransactions(allTxs.filter((t) => t.loanId === loan.id)).filter((t) => t.date <= asOf)

  const byDate = new Map<ISODate, Transaction[]>()
  for (const t of txs) {
    const list = byDate.get(t.date)
    if (list) list.push(t)
    else byDate.set(t.date, [t])
  }

  const firstDisbursement = txs.find((t) => t.type === 'disbursement')
  const originalPrincipal = firstDisbursement?.principalPaise ?? 0

  const days: DayRow[] = []
  const issues: LoanIssue[] = []
  let principal = 0
  let cumExact: Fraction = ZERO
  let cumRounded = 0
  let interestBalance = 0
  let totals = {
    principalGiven: 0,
    principalRepaid: 0,
    principalWaived: 0,
    interestAccrued: 0,
    interestReceived: 0,
    interestWaived: 0,
  }

  // Events dated before the start (should not exist after validation) are
  // folded into the opening balance so nothing is silently dropped.
  const startDay = toDayNumber(loan.startDate)
  for (const t of txs) {
    if (toDayNumber(t.date) < startDay) {
      principal += principalDelta(t)
      totals = accumulate(totals, t)
      interestBalance -= t.type === 'collection' || t.type === 'interest_waiver' ? t.interestPaise : 0
    }
  }

  const endDay = toDayNumber(asOf)
  for (let dn = startDay; dn <= endDay; dn++) {
    const date = fromDayNumber(dn)
    const todays = byDate.get(date) ?? []

    let given = 0
    let reduced = 0
    let iRecv = 0
    let pRecv = 0
    let iWaive = 0
    let pWaive = 0
    for (const t of todays) {
      const d = principalDelta(t)
      if (d > 0) given += d
      else reduced += -d
      if (t.type === 'collection') {
        iRecv += t.interestPaise
        pRecv += t.principalPaise
      } else if (t.type === 'interest_waiver') {
        iWaive += t.interestPaise
      } else if (t.type === 'principal_waiver') {
        pWaive += t.principalPaise
      }
      totals = accumulate(totals, t)
    }

    const base = Math.max(
      0,
      principal + (terms.chargeDisbursementDay ? given : 0) - (terms.chargeRepaymentDay ? 0 : reduced),
    )
    principal = principal + given - reduced
    if (principal < 0) issues.push({ code: 'principal_negative', date })

    let reason = noChargeReasonFor(terms, date)
    if (!reason && base <= 0) reason = dn === startDay && given > 0 ? 'start_day' : 'no_principal'

    let exact: Fraction = ZERO
    let charged = 0
    if (!reason) {
      exact = dailyExactInterest(terms, base, originalPrincipal, date)
      if (terms.rounding === 'daily_half_up') {
        charged = roundHalfUp(exact)
      } else {
        cumExact = addFrac(cumExact, exact)
        const r = roundHalfUp(cumExact)
        charged = r - cumRounded
        cumRounded = r
      }
    }
    totals.interestAccrued += charged
    interestBalance += charged - iRecv - iWaive

    days.push({
      date,
      chargeable: !reason,
      noChargeReason: reason,
      principalBase: base,
      exact,
      interestCharged: charged,
      interestReceived: iRecv,
      principalReceived: pRecv,
      interestWaived: iWaive,
      principalWaived: pWaive,
      principalGiven: given,
      chargePaid: 0,
      status: 'no_charge',
      interestBalanceAfter: interestBalance,
      principalAfter: principal,
      txIds: todays.map((t) => t.id),
    })
  }

  // Oldest unpaid days are paid first. This only decides the per-day status
  // label; it never changes any balance.
  let pool = totals.interestReceived + totals.interestWaived
  for (const d of days) {
    if (d.interestCharged <= 0) continue
    const paid = Math.min(d.interestCharged, Math.max(pool, 0))
    pool -= paid
    d.chargePaid = paid
    d.status = paid >= d.interestCharged ? 'collected' : paid > 0 ? 'partial' : 'pending'
  }
  if (interestBalance < 0) issues.push({ code: 'interest_overpaid', date: asOf })

  const interestOutstanding = Math.max(interestBalance, 0)
  const status: LoanState['status'] =
    totals.principalGiven === 0 ? 'cancelled' : principal <= 0 && interestBalance <= 0 ? 'closed' : 'active'

  return {
    loanId: loan.id,
    asOf,
    days,
    originalPrincipal,
    principalGiven: totals.principalGiven,
    principalRepaid: totals.principalRepaid,
    principalWaived: totals.principalWaived,
    principalOutstanding: principal,
    interestAccrued: totals.interestAccrued,
    interestReceived: totals.interestReceived,
    interestWaived: totals.interestWaived,
    interestBalance,
    interestOutstanding,
    interestCredit: Math.max(-interestBalance, 0),
    totalOutstanding: Math.max(principal, 0) + interestOutstanding,
    status,
    issues,
  }
}

function accumulate<
  T extends {
    principalGiven: number
    principalRepaid: number
    principalWaived: number
    interestReceived: number
    interestWaived: number
  },
>(acc: T, t: Transaction): T {
  const a = { ...acc }
  switch (t.type) {
    case 'disbursement':
    case 'principal_increase':
      a.principalGiven += t.principalPaise
      break
    case 'collection':
      a.principalRepaid += t.principalPaise
      a.interestReceived += t.interestPaise
      break
    case 'interest_waiver':
      a.interestWaived += t.interestPaise
      break
    case 'principal_waiver':
      a.principalWaived += t.principalPaise
      break
  }
  return a
}

/** The day row for `date`, if the state covers it. */
export function dayOf(state: LoanState, date: ISODate): DayRow | undefined {
  const i = toDayNumber(date) - (state.days.length ? toDayNumber(state.days[0].date) : 0)
  return state.days[i]?.date === date ? state.days[i] : undefined
}
