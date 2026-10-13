// Validation returns translation keys (never sentences) so the engine stays
// independent of the UI language.

import { computeLoanState, type LoanState } from './accrual'
import { isValidISODate, type ISODate } from './dates'
import { isPaise, isPositivePaise, type Paise } from './money'
import { effectiveTransactions, isDuplicateRequest, reversedIds } from './ledger'
import type { Loan, LoanTerms, Transaction } from './types'

export type ErrorKey = `err.${string}`

/** Upper limits that catch typing mistakes (e.g. 20 instead of 2.0). */
export const LIMITS = {
  maxPercentDailyE4: 50_000, // 5% per day
  maxPercentMonthlyE4: 1_000_000, // 100% per month
  maxAmountPaise: 100_000_000_00, // ₹10 crore
}

export function validateTerms(terms: LoanTerms): ErrorKey[] {
  const e: ErrorKey[] = []
  switch (terms.method) {
    case 'fixed_daily':
      if (!isPositivePaise(terms.fixedDailyPaise)) e.push('err.fixed_amount_required')
      if (terms.fixedAmountBasis !== 'unchanged' && terms.fixedAmountBasis !== 'proportional')
        e.push('err.fixed_basis_required')
      break
    case 'percent_daily':
      if (!isPositivePaise(terms.rateE4)) e.push('err.rate_required')
      else if (terms.rateE4 > LIMITS.maxPercentDailyE4) e.push('err.rate_too_high')
      break
    case 'percent_monthly':
      if (!isPositivePaise(terms.rateE4)) e.push('err.rate_required')
      else if (terms.rateE4 > LIMITS.maxPercentMonthlyE4) e.push('err.rate_too_high')
      if (!['thirty', 'actual_month', 'annual_365'].includes(terms.monthlyDayCount ?? ''))
        e.push('err.day_count_required')
      break
    default:
      e.push('err.method_required')
  }
  const wd = terms.nonChargeableWeekdays
  if (!Array.isArray(wd) || wd.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(wd).size !== wd.length)
    e.push('err.weekdays_invalid')
  else if (wd.length >= 7) e.push('err.no_chargeable_days')
  if (!Array.isArray(terms.nonChargeableDates) || !terms.nonChargeableDates.every(isValidISODate))
    e.push('err.holidays_invalid')
  if (!['cumulative_half_up', 'daily_half_up'].includes(terms.rounding)) e.push('err.rounding_required')
  if (!['interest_first', 'manual'].includes(terms.allocationPolicy)) e.push('err.allocation_policy_required')
  if (typeof terms.chargeDisbursementDay !== 'boolean' || typeof terms.chargeRepaymentDay !== 'boolean')
    e.push('err.date_convention_required')
  return e
}

export interface NewLoanInput {
  startDate: ISODate
  principalPaise: Paise
  terms: LoanTerms
  dueDate?: ISODate
}

export function validateNewLoan(input: NewLoanInput, today: ISODate): ErrorKey[] {
  const e: ErrorKey[] = []
  if (!isValidISODate(input.startDate)) e.push('err.date_invalid')
  else if (input.startDate > today) e.push('err.date_in_future')
  if (!isPositivePaise(input.principalPaise)) e.push('err.amount_required')
  else if (input.principalPaise > LIMITS.maxAmountPaise) e.push('err.amount_too_large')
  if (input.dueDate !== undefined && input.dueDate !== '') {
    if (!isValidISODate(input.dueDate)) e.push('err.due_date_invalid')
    else if (isValidISODate(input.startDate) && input.dueDate < input.startDate) e.push('err.due_before_start')
  }
  return [...e, ...validateTerms(input.terms)]
}

export interface CollectionInput {
  date: ISODate
  amountPaise: Paise
  interestPaise: Paise
  principalPaise: Paise
}

/**
 * Split a cash amount by the loan's policy. interest_first pays interest due
 * on that date first; the rest goes to principal (capped at principal due —
 * anything above both is not allowed and is reported by validateCollection).
 */
export function suggestAllocation(
  stateAtDate: LoanState,
  amountPaise: Paise,
): { interestPaise: Paise; principalPaise: Paise } {
  const interest = Math.min(amountPaise, stateAtDate.interestOutstanding)
  return { interestPaise: interest, principalPaise: amountPaise - interest }
}

export interface CollectionCheck {
  errors: ErrorKey[]
  /** Loan as of the collection date, before the collection. */
  before?: LoanState
  /** Loan as of the collection date, after the collection. */
  after?: LoanState
}

/** Build the transaction a collection would create (without id/code/timestamps). */
function candidate(loan: Loan, input: CollectionInput): Transaction {
  return {
    id: '__candidate__',
    code: '',
    loanId: loan.id,
    type: 'collection',
    date: input.date,
    createdAt: '9999-12-31T23:59:59.999Z',
    amountPaise: input.amountPaise,
    interestPaise: input.interestPaise,
    principalPaise: input.principalPaise,
    method: 'cash',
    notes: '',
    requestId: '__candidate__',
  }
}

export function validateCollection(
  loan: Loan,
  txs: readonly Transaction[],
  input: CollectionInput,
  today: ISODate,
): CollectionCheck {
  const e: ErrorKey[] = []
  if (!isValidISODate(input.date)) return { errors: ['err.date_invalid'] }
  if (input.date < loan.startDate) e.push('err.date_before_loan')
  if (input.date > today) e.push('err.date_in_future')
  if (!isPositivePaise(input.amountPaise)) e.push('err.amount_required')
  if (!isPaise(input.interestPaise) || input.interestPaise < 0 || !isPaise(input.principalPaise) || input.principalPaise < 0)
    e.push('err.allocation_invalid')
  else if (input.interestPaise + input.principalPaise !== input.amountPaise) e.push('err.allocation_sum')
  if (e.length) return { errors: e }

  const before = computeLoanState(loan, txs, input.date)
  if (before.status !== 'active') return { errors: ['err.loan_not_active'], before }
  if (input.interestPaise > before.interestOutstanding) e.push('err.interest_exceeds_due')
  if (input.principalPaise > before.principalOutstanding) e.push('err.principal_exceeds_due')

  const withCand = [...txs, candidate(loan, input)]
  const after = computeLoanState(loan, withCand, input.date)
  // A backdated collection must not leave any later day overpaid.
  if (!e.length) {
    const horizon = computeLoanState(loan, withCand, maxDate(today, lastDate(txs)))
    const laterTrouble = horizon.issues.length > 0 || horizon.days.some((d) => d.date >= input.date && d.interestBalanceAfter < 0)
    if (laterTrouble) e.push('err.breaks_later_balance')
  }
  return { errors: e, before, after }
}

export function validateReversal(
  loan: Loan,
  txs: readonly Transaction[],
  targetId: string,
  today: ISODate,
): ErrorKey[] {
  const target = txs.find((t) => t.id === targetId && t.loanId === loan.id)
  if (!target) return ['err.tx_not_found']
  if (target.type === 'reversal') return ['err.cannot_reverse_reversal']
  if (reversedIds(txs).has(targetId)) return ['err.already_reversed']
  const remaining = effectiveTransactions(txs).filter((t) => t.loanId === loan.id && t.id !== targetId)
  if (target.type === 'disbursement' && remaining.length > 0) return ['err.reverse_others_first']
  if (target.type === 'disbursement') return []
  const fake: Transaction = { ...target, id: '__rev__', type: 'reversal', reversesId: targetId, requestId: '__rev__' }
  const horizon = computeLoanState(loan, [...txs, fake], maxDate(today, lastDate(txs)))
  if (horizon.issues.length > 0) return ['err.breaks_later_balance']
  return []
}

export interface WaiverInput {
  date: ISODate
  amountPaise: Paise
  kind: 'interest' | 'principal'
}

export function validateWaiver(loan: Loan, txs: readonly Transaction[], input: WaiverInput, today: ISODate): ErrorKey[] {
  if (!isValidISODate(input.date)) return ['err.date_invalid']
  const e: ErrorKey[] = []
  if (input.date < loan.startDate) e.push('err.date_before_loan')
  if (input.date > today) e.push('err.date_in_future')
  if (!isPositivePaise(input.amountPaise)) e.push('err.amount_required')
  if (e.length) return e
  const st = computeLoanState(loan, txs, input.date)
  if (input.kind === 'interest' && input.amountPaise > st.interestOutstanding) e.push('err.interest_exceeds_due')
  if (input.kind === 'principal' && input.amountPaise > st.principalOutstanding) e.push('err.principal_exceeds_due')
  return e
}

export interface IncreaseInput {
  date: ISODate
  amountPaise: Paise
}

export function validateIncrease(loan: Loan, txs: readonly Transaction[], input: IncreaseInput, today: ISODate): ErrorKey[] {
  if (!isValidISODate(input.date)) return ['err.date_invalid']
  const e: ErrorKey[] = []
  if (input.date < loan.startDate) e.push('err.date_before_loan')
  if (input.date > today) e.push('err.date_in_future')
  if (!isPositivePaise(input.amountPaise)) e.push('err.amount_required')
  else if (input.amountPaise > LIMITS.maxAmountPaise) e.push('err.amount_too_large')
  if (!e.length && computeLoanState(loan, txs, input.date).status === 'cancelled') e.push('err.loan_not_active')
  return e
}

export function checkDuplicate(txs: readonly Transaction[], requestId: string): ErrorKey[] {
  return isDuplicateRequest(txs, requestId) ? ['err.duplicate'] : []
}

function lastDate(txs: readonly Transaction[]): ISODate {
  let m = '0000-01-01'
  for (const t of txs) if (t.date > m) m = t.date
  return m
}

function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}
