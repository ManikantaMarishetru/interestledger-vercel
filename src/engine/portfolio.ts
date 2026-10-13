// Dashboard, collections and report figures. Every number here is a sum of
// per-loan states from computeLoanState, and reconcile() re-derives the same
// totals straight from the raw transactions to prove they agree.

import { computeLoanState, dayOf, type LoanState } from './accrual'
import { type ISODate } from './dates'
import { effectiveTransactions, reversedIds } from './ledger'
import type { Customer, Loan, Transaction } from './types'

export type TodayStatus = 'collected' | 'partial' | 'pending' | 'no_charge'

export interface LoanToday {
  loanId: string
  customerId: string
  /** Interest charged for the day. */
  expected: number
  interestReceived: number
  principalReceived: number
  /** Unpaid interest at the end of the day (all days, not just this one). */
  interestOutstanding: number
  status: TodayStatus
}

export interface Totals {
  principalLent: number
  principalRepaid: number
  principalWaived: number
  principalOutstanding: number
  interestAccrued: number
  interestReceived: number
  interestWaived: number
  interestOutstanding: number
  interestCredit: number
  totalOutstanding: number
}

export interface Portfolio {
  asOf: ISODate
  states: Map<string, LoanState>
  totals: Totals
  activeLoans: number
  closedLoans: number
  activeCustomers: number
  day: LoanToday[]
  dayTotals: { expected: number; interestReceived: number; principalReceived: number; cash: number }
  customerDayStatus: Map<string, TodayStatus>
  customerStatusCounts: Record<TodayStatus, number>
}

export function emptyTotals(): Totals {
  return {
    principalLent: 0,
    principalRepaid: 0,
    principalWaived: 0,
    principalOutstanding: 0,
    interestAccrued: 0,
    interestReceived: 0,
    interestWaived: 0,
    interestOutstanding: 0,
    interestCredit: 0,
    totalOutstanding: 0,
  }
}

function addState(t: Totals, s: LoanState): void {
  t.principalLent += s.principalGiven
  t.principalRepaid += s.principalRepaid
  t.principalWaived += s.principalWaived
  t.principalOutstanding += s.principalOutstanding
  t.interestAccrued += s.interestAccrued
  t.interestReceived += s.interestReceived
  t.interestWaived += s.interestWaived
  t.interestOutstanding += s.interestOutstanding
  t.interestCredit += s.interestCredit
  t.totalOutstanding += s.totalOutstanding
}

/** Status of one day judged by cash received that day against that day's charge. */
export function dayCashStatus(expected: number, received: number): TodayStatus {
  if (expected <= 0) return received > 0 ? 'collected' : 'no_charge'
  if (received >= expected) return 'collected'
  return received > 0 ? 'partial' : 'pending'
}

function combine(a: TodayStatus | undefined, b: TodayStatus): TodayStatus {
  if (!a || a === 'no_charge') return b
  if (b === 'no_charge' || a === b) return a
  return 'partial'
}

/** Figures for every loan as of `asOf`, plus that day's collection picture. */
export function computePortfolio(loans: readonly Loan[], txs: readonly Transaction[], asOf: ISODate): Portfolio {
  const states = new Map<string, LoanState>()
  const totals = emptyTotals()
  const day: LoanToday[] = []
  const dayTotals = { expected: 0, interestReceived: 0, principalReceived: 0, cash: 0 }
  const customerDayStatus = new Map<string, TodayStatus>()
  const activeCustomerIds = new Set<string>()
  let activeLoans = 0
  let closedLoans = 0

  for (const loan of loans) {
    if (loan.startDate > asOf) continue
    const s = computeLoanState(loan, txs, asOf)
    states.set(loan.id, s)
    if (s.status === 'cancelled') continue
    addState(totals, s)
    if (s.status === 'closed') closedLoans++
    else {
      activeLoans++
      activeCustomerIds.add(loan.customerId)
    }
    const row = dayOf(s, asOf)
    if (!row) continue
    const expected = row.interestCharged
    const status = dayCashStatus(expected, row.interestReceived)
    if (s.status === 'active' || row.interestReceived + row.principalReceived > 0) {
      day.push({
        loanId: loan.id,
        customerId: loan.customerId,
        expected,
        interestReceived: row.interestReceived,
        principalReceived: row.principalReceived,
        interestOutstanding: Math.max(row.interestBalanceAfter, 0),
        status,
      })
      dayTotals.expected += expected
      dayTotals.interestReceived += row.interestReceived
      dayTotals.principalReceived += row.principalReceived
      dayTotals.cash += row.interestReceived + row.principalReceived
      customerDayStatus.set(loan.customerId, combine(customerDayStatus.get(loan.customerId), status))
    }
  }

  const customerStatusCounts: Record<TodayStatus, number> = { collected: 0, partial: 0, pending: 0, no_charge: 0 }
  for (const st of customerDayStatus.values()) customerStatusCounts[st]++

  return {
    asOf,
    states,
    totals,
    activeLoans,
    closedLoans,
    activeCustomers: activeCustomerIds.size,
    day,
    dayTotals,
    customerDayStatus,
    customerStatusCounts,
  }
}

// ---- cash in a period -------------------------------------------------------

export interface CashSummary {
  interest: number
  principal: number
  total: number
  count: number
}

/** Cash collections (effective, i.e. not reversed) dated within [from, to]. */
export function cashBetween(txs: readonly Transaction[], from: ISODate, to: ISODate, loanIds?: Set<string>): CashSummary {
  const s: CashSummary = { interest: 0, principal: 0, total: 0, count: 0 }
  for (const t of effectiveTransactions(txs)) {
    if (t.type !== 'collection' || t.date < from || t.date > to) continue
    if (loanIds && !loanIds.has(t.loanId)) continue
    s.interest += t.interestPaise
    s.principal += t.principalPaise
    s.total += t.amountPaise
    s.count++
  }
  return s
}

/** Cash collections grouped by day or by month ("YYYY-MM"), oldest first. */
export function cashByPeriod(
  txs: readonly Transaction[],
  from: ISODate,
  to: ISODate,
  unit: 'day' | 'month',
): { period: string; interest: number; principal: number; total: number; count: number }[] {
  const m = new Map<string, CashSummary>()
  for (const t of effectiveTransactions(txs)) {
    if (t.type !== 'collection' || t.date < from || t.date > to) continue
    const key = unit === 'day' ? t.date : t.date.slice(0, 7)
    const s = m.get(key) ?? { interest: 0, principal: 0, total: 0, count: 0 }
    s.interest += t.interestPaise
    s.principal += t.principalPaise
    s.total += t.amountPaise
    s.count++
    m.set(key, s)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, s]) => ({ period, ...s }))
}

// ---- reconciliation ---------------------------------------------------------

export type ReconcileIssue =
  | { code: 'allocation_mismatch'; txId: string }
  | { code: 'orphan_reversal'; txId: string }
  | { code: 'double_reversal'; txId: string }
  | { code: 'duplicate_request'; txId: string }
  | { code: 'orphan_loan'; loanId: string }
  | { code: 'orphan_transaction'; txId: string }
  | { code: 'total_mismatch'; field: keyof Totals; expected: number; actual: number }
  | { code: 'loan_issue'; loanId: string; issue: string; date: ISODate }

/**
 * Re-derive portfolio totals directly from the raw transactions (a separate
 * path from computeLoanState) and check structural integrity.
 */
export function reconcile(
  customers: readonly Customer[],
  loans: readonly Loan[],
  txs: readonly Transaction[],
  portfolio: Portfolio,
): ReconcileIssue[] {
  const issues: ReconcileIssue[] = []
  const customerIds = new Set(customers.map((c) => c.id))
  const loanIds = new Set(loans.map((l) => l.id))
  const txIds = new Set(txs.map((t) => t.id))

  for (const l of loans) if (!customerIds.has(l.customerId)) issues.push({ code: 'orphan_loan', loanId: l.id })

  const seenReq = new Set<string>()
  const reversalCount = new Map<string, number>()
  for (const t of txs) {
    if (!loanIds.has(t.loanId)) issues.push({ code: 'orphan_transaction', txId: t.id })
    if (seenReq.has(t.requestId)) issues.push({ code: 'duplicate_request', txId: t.id })
    seenReq.add(t.requestId)
    if (t.type === 'collection' && t.interestPaise + t.principalPaise !== t.amountPaise)
      issues.push({ code: 'allocation_mismatch', txId: t.id })
    if (t.type === 'reversal') {
      if (!t.reversesId || !txIds.has(t.reversesId)) issues.push({ code: 'orphan_reversal', txId: t.id })
      else reversalCount.set(t.reversesId, (reversalCount.get(t.reversesId) ?? 0) + 1)
    }
  }
  for (const [id, n] of reversalCount) if (n > 1) issues.push({ code: 'double_reversal', txId: id })

  // Independent sums from raw transactions (only loans included in the portfolio).
  const included = new Set(
    [...portfolio.states.values()].filter((s) => s.status !== 'cancelled').map((s) => s.loanId),
  )
  const rev = reversedIds(txs)
  const raw = { principalLent: 0, principalRepaid: 0, principalWaived: 0, interestReceived: 0, interestWaived: 0 }
  for (const t of txs) {
    if (!included.has(t.loanId) || t.type === 'reversal' || rev.has(t.id) || t.date > portfolio.asOf) continue
    if (t.type === 'disbursement' || t.type === 'principal_increase') raw.principalLent += t.principalPaise
    if (t.type === 'collection') {
      raw.principalRepaid += t.principalPaise
      raw.interestReceived += t.interestPaise
    }
    if (t.type === 'principal_waiver') raw.principalWaived += t.principalPaise
    if (t.type === 'interest_waiver') raw.interestWaived += t.interestPaise
  }
  const expected: Partial<Totals> = {
    ...raw,
    principalOutstanding: raw.principalLent - raw.principalRepaid - raw.principalWaived,
  }
  let accrued = 0
  for (const s of portfolio.states.values()) {
    if (s.status === 'cancelled') continue
    accrued += s.days.reduce((a, d) => a + d.interestCharged, 0)
    for (const i of s.issues) issues.push({ code: 'loan_issue', loanId: s.loanId, issue: i.code, date: i.date })
  }
  expected.interestAccrued = accrued
  expected.interestOutstanding = undefined
  const t = portfolio.totals
  const balance = accrued - raw.interestReceived - raw.interestWaived
  if (t.interestOutstanding - t.interestCredit !== balance)
    issues.push({ code: 'total_mismatch', field: 'interestOutstanding', expected: balance, actual: t.interestOutstanding - t.interestCredit })
  if (t.totalOutstanding !== t.principalOutstanding + t.interestOutstanding)
    issues.push({
      code: 'total_mismatch',
      field: 'totalOutstanding',
      expected: t.principalOutstanding + t.interestOutstanding,
      actual: t.totalOutstanding,
    })
  for (const [k, v] of Object.entries(expected) as [keyof Totals, number | undefined][]) {
    if (v !== undefined && t[k] !== v) issues.push({ code: 'total_mismatch', field: k, expected: v, actual: t[k] })
  }
  return issues
}
