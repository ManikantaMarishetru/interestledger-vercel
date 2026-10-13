// CSV exports. Amounts are written in rupees with two decimals (column
// headers say "(INR)"), dates as YYYY-MM-DD. Column headers stay in English
// so files open the same way in any spreadsheet regardless of app language.

import {
  computeLoanState,
  paiseToRupeeString,
  reversedIds,
  sortTransactions,
  type Customer,
  type ISODate,
  type Loan,
  type LoanState,
  type Transaction,
} from '../engine'

function cell(v: string | number): string {
  const s = String(v)
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(header: string[], rows: (string | number)[][], preface: string[] = []): string {
  const lines = [...preface.map((p) => cell(p)), header.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  // BOM so Excel reads UTF-8 (Kannada names) correctly
  return '﻿' + lines.join('\r\n') + '\r\n'
}

const rs = paiseToRupeeString

export function transactionsCsv(
  customers: Customer[],
  loans: Loan[],
  txs: Transaction[],
  from: ISODate,
  to: ISODate,
): string {
  const cust = new Map(customers.map((c) => [c.id, c]))
  const loan = new Map(loans.map((l) => [l.id, l]))
  const rev = reversedIds(txs)
  const rows = sortTransactions(txs)
    .filter((t) => t.date >= from && t.date <= to)
    .map((t) => {
      const l = loan.get(t.loanId)
      const c = l ? cust.get(l.customerId) : undefined
      return [
        t.code,
        t.date,
        t.createdAt,
        c?.name ?? '',
        c?.code ?? '',
        l?.code ?? '',
        t.type,
        t.method === 'cash' ? 'Cash' : '',
        rs(t.amountPaise),
        rs(t.interestPaise),
        rs(t.principalPaise),
        t.reversesId ? (txs.find((x) => x.id === t.reversesId)?.code ?? '') : '',
        rev.has(t.id) ? 'yes' : 'no',
        t.notes,
      ]
    })
  return toCsv(
    [
      'Transaction ID',
      'Date',
      'Entered at (UTC)',
      'Customer',
      'Customer ID',
      'Loan ID',
      'Type',
      'Payment method',
      'Amount (INR)',
      'Interest part (INR)',
      'Principal part (INR)',
      'Reverses',
      'Reversed',
      'Notes',
    ],
    rows,
    [`InterestLedger transactions, ${from} to ${to}, amounts in INR`],
  )
}

export function loanBalancesCsv(customers: Customer[], loans: Loan[], states: Map<string, LoanState>, asOf: ISODate): string {
  const cust = new Map(customers.map((c) => [c.id, c]))
  const rows = loans
    .map((l) => ({ l, s: states.get(l.id) }))
    .filter((x): x is { l: Loan; s: LoanState } => !!x.s)
    .map(({ l, s }) => [
      l.code,
      cust.get(l.customerId)?.name ?? '',
      cust.get(l.customerId)?.code ?? '',
      l.startDate,
      s.status,
      rs(s.principalGiven),
      rs(s.principalRepaid),
      rs(s.principalWaived),
      rs(s.principalOutstanding),
      rs(s.interestAccrued),
      rs(s.interestReceived),
      rs(s.interestWaived),
      rs(s.interestOutstanding),
      rs(s.totalOutstanding),
    ])
  return toCsv(
    [
      'Loan ID',
      'Customer',
      'Customer ID',
      'Start date',
      'Status',
      'Principal given (INR)',
      'Principal repaid (INR)',
      'Principal waived (INR)',
      'Principal outstanding (INR)',
      'Interest accrued (INR)',
      'Interest received (INR)',
      'Interest waived (INR)',
      'Interest pending (INR)',
      'Total outstanding (INR)',
    ],
    rows,
    [`InterestLedger loan balances as of ${asOf}, amounts in INR`],
  )
}

export function collectionsCsv(
  rows: { period: string; interest: number; principal: number; total: number; count: number }[],
  unit: 'day' | 'month',
  from: ISODate,
  to: ISODate,
): string {
  return toCsv(
    [unit === 'day' ? 'Date' : 'Month', 'Collections', 'Interest received (INR)', 'Principal received (INR)', 'Total cash (INR)'],
    rows.map((r) => [r.period, r.count, rs(r.interest), rs(r.principal), rs(r.total)]),
    [`InterestLedger cash collections by ${unit}, ${from} to ${to}, amounts in INR`],
  )
}

export function statementCsv(customer: Customer, loan: Loan, txs: Transaction[], from: ISODate, to: ISODate): string {
  const s = computeLoanState(loan, txs, to)
  const rows = s.days
    .filter((d) => d.date >= from)
    .map((d) => [
      d.date,
      rs(d.principalBase),
      rs(d.interestCharged),
      rs(d.interestReceived),
      rs(d.principalReceived),
      rs(Math.max(d.interestBalanceAfter, 0)),
      rs(d.principalAfter),
      d.status,
    ])
  return toCsv(
    [
      'Date',
      'Principal charged on (INR)',
      'Interest charged (INR)',
      'Interest received (INR)',
      'Principal received (INR)',
      'Unpaid interest after (INR)',
      'Principal after (INR)',
      'Status',
    ],
    rows,
    [`InterestLedger statement: ${customer.name} (${customer.code}), loan ${loan.code}, ${from} to ${to}, amounts in INR, payment method Cash`],
  )
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
