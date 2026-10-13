// Credits & debits ledger: every cash movement in a date range, split into
// money given (credit: disbursement, principal_increase) and money received
// (debit: collection).
//
// Waivers and reversals are non-cash adjustments: they are listed so the
// audit trail is complete, but they never enter the cash totals. Cancelled
// entries (a reversed original and its reversal post) are listed and marked,
// but excluded from the totals through effectiveTransactions().

import {
  effectiveTransactions,
  reversedIds,
  sortTransactions,
  type Customer,
  type ISODate,
  type Loan,
  type Transaction,
} from '../engine'

export interface LedgerRow {
  code: string
  date: ISODate
  customerName: string
  customerCode: string
  loanCode: string
  type: Transaction['type']
  /** Cash given out (disbursement, top-up). 0 for everything else. */
  creditPaise: number
  /** Cash received (collection). 0 for everything else. */
  debitPaise: number
  reversed: boolean
  notes: string
}

export interface LedgerReport {
  rows: LedgerRow[]
  /** Effective cash given (cancelled entries excluded). */
  totalCredit: number
  /** Effective cash received (cancelled entries excluded). */
  totalDebit: number
  /** Cash still with customers in this range: credit minus debit. */
  balance: number
}

export function creditsDebits(
  customers: Customer[],
  loans: Loan[],
  txs: Transaction[],
  from: ISODate,
  to: ISODate,
): LedgerReport {
  const cust = new Map(customers.map((c) => [c.id, c]))
  const loan = new Map(loans.map((l) => [l.id, l]))
  const rev = reversedIds(txs)
  const effective = new Set(effectiveTransactions(txs).map((t) => t.id))

  let totalCredit = 0
  let totalDebit = 0
  const rows = sortTransactions(txs)
    .filter((t) => t.date >= from && t.date <= to)
    .map((t): LedgerRow => {
      const l = loan.get(t.loanId)
      const c = l ? cust.get(l.customerId) : undefined
      const counted = effective.has(t.id)
      const credit = t.type === 'disbursement' || t.type === 'principal_increase' ? t.amountPaise : 0
      const debit = t.type === 'collection' ? t.amountPaise : 0
      if (counted) {
        totalCredit += credit
        totalDebit += debit
      }
      return {
        code: t.code,
        date: t.date,
        customerName: c?.name ?? '',
        customerCode: c?.code ?? '',
        loanCode: l?.code ?? '',
        type: t.type,
        creditPaise: credit,
        debitPaise: debit,
        reversed: rev.has(t.id) || t.type === 'reversal',
        notes: t.notes,
      }
    })
  return { rows, totalCredit, totalDebit, balance: totalCredit - totalDebit }
}
