import type { Loan, LoanTerms, Transaction, TxType } from '../src/engine'

export const R = (rupees: number) => Math.round(rupees * 100) // test-only: literal rupees -> paise

export function terms(over: Partial<LoanTerms> = {}): LoanTerms {
  return {
    method: 'fixed_daily',
    fixedDailyPaise: R(100),
    fixedAmountBasis: 'unchanged',
    chargeDisbursementDay: true,
    chargeRepaymentDay: false,
    nonChargeableWeekdays: [],
    nonChargeableDates: [],
    rounding: 'cumulative_half_up',
    allocationPolicy: 'interest_first',
    ...over,
  }
}

let seq = 0

export function loan(startDate: string, t: Partial<LoanTerms> = {}, id = 'L1'): Loan {
  return { id, code: id, customerId: 'C1', startDate, terms: terms(t), notes: '', createdAt: `${startDate}T00:00:00.000Z` }
}

export function tx(
  type: TxType,
  date: string,
  amount: number,
  alloc: { interest?: number; principal?: number } = {},
  extra: Partial<Transaction> = {},
): Transaction {
  seq++
  const principal =
    alloc.principal ?? (type === 'disbursement' || type === 'principal_increase' || type === 'principal_waiver' ? amount : 0)
  const interest = alloc.interest ?? (type === 'interest_waiver' ? amount : 0)
  return {
    id: `T${seq}`,
    code: `T${seq}`,
    loanId: 'L1',
    type,
    date,
    createdAt: `${date}T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0').slice(-3)}Z`,
    amountPaise: amount,
    interestPaise: interest,
    principalPaise: principal,
    method: type === 'collection' ? 'cash' : undefined,
    notes: '',
    requestId: `req-${seq}`,
    ...extra,
  }
}

export const disburse = (date: string, amount: number, loanId = 'L1') => tx('disbursement', date, amount, {}, { loanId })
export const collect = (date: string, interest: number, principal: number, loanId = 'L1') =>
  tx('collection', date, interest + principal, { interest, principal }, { loanId })
