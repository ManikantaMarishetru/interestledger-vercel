import { describe, expect, it } from 'vitest'
import {
  checkDuplicate,
  computeLoanState,
  computePortfolio,
  cashBetween,
  cashByPeriod,
  reconcile,
  suggestAllocation,
  validateCollection,
  validateNewLoan,
  validateReversal,
  validateTerms,
  type Customer,
} from '../src/engine'
import { R, collect, disburse, loan, terms, tx } from './helpers'

const TODAY = '2026-01-10'

describe('collection validation', () => {
  const l = loan('2026-01-01')
  const txs = [disburse('2026-01-01', R(50_000))]

  it('accepts interest-only, principal-only and split payments', () => {
    for (const [i, p] of [
      [R(300), 0],
      [0, R(5_000)],
      [R(200), R(1_000)],
    ]) {
      const c = validateCollection(l, txs, { date: '2026-01-05', amountPaise: i + p, interestPaise: i, principalPaise: p }, TODAY)
      expect(c.errors).toEqual([])
      expect(c.after!.interestOutstanding).toBe(c.before!.interestOutstanding - i)
      expect(c.after!.principalOutstanding).toBe(c.before!.principalOutstanding - p)
    }
  })

  it('rejects allocations that do not add up', () => {
    const c = validateCollection(l, txs, { date: '2026-01-05', amountPaise: R(500), interestPaise: R(300), principalPaise: R(100) }, TODAY)
    expect(c.errors).toContain('err.allocation_sum')
  })

  it('rejects more interest than is due on that date', () => {
    const c = validateCollection(l, txs, { date: '2026-01-05', amountPaise: R(600), interestPaise: R(600), principalPaise: 0 }, TODAY)
    expect(c.errors).toContain('err.interest_exceeds_due')
  })

  it('rejects more principal than is outstanding', () => {
    const c = validateCollection(l, txs, { date: '2026-01-05', amountPaise: R(60_000), interestPaise: 0, principalPaise: R(60_000) }, TODAY)
    expect(c.errors).toContain('err.principal_exceeds_due')
  })

  it('rejects bad dates and amounts', () => {
    const bad = (date: string, amount: number) =>
      validateCollection(l, txs, { date, amountPaise: amount, interestPaise: amount, principalPaise: 0 }, TODAY).errors
    expect(bad('2026-01-11', R(100))).toContain('err.date_in_future')
    expect(bad('2025-12-31', R(100))).toContain('err.date_before_loan')
    expect(bad('2026-02-30', R(100))).toContain('err.date_invalid')
    expect(bad('2026-01-05', 0)).toContain('err.amount_required')
    expect(bad('2026-01-05', 1.5)).toContain('err.amount_required')
  })

  it('rejects a backdated payment that would overpay later days', () => {
    // ₹500 accrued by the 5th and already paid in full on the 5th
    const paid = [...txs, collect('2026-01-05', R(500), 0)]
    // now try to record ₹200 interest on the 2nd (only ₹200 was due then)
    const c = validateCollection(l, paid, { date: '2026-01-02', amountPaise: R(200), interestPaise: R(200), principalPaise: 0 }, TODAY)
    expect(c.errors).toContain('err.breaks_later_balance')
  })

  it('suggests interest first', () => {
    const st = computeLoanState(l, txs, '2026-01-05')
    expect(suggestAllocation(st, R(800))).toEqual({ interestPaise: R(500), principalPaise: R(300) })
    expect(suggestAllocation(st, R(200))).toEqual({ interestPaise: R(200), principalPaise: 0 })
  })
})

describe('duplicate prevention', () => {
  it('refuses a request id that was already posted', () => {
    const d = disburse('2026-01-01', R(1_000))
    expect(checkDuplicate([d], d.requestId)).toEqual(['err.duplicate'])
    expect(checkDuplicate([d], 'new')).toEqual([])
  })
})

describe('reversal validation', () => {
  const l = loan('2026-01-01')
  it('blocks double reversal, reversing a reversal, and reversing the loan with entries', () => {
    const d = disburse('2026-01-01', R(1_000))
    const c = collect('2026-01-02', R(100), 0)
    const r = tx('reversal', '2026-01-03', R(100), { interest: R(100) }, { reversesId: c.id })
    expect(validateReversal(l, [d, c], c.id, TODAY)).toEqual([])
    expect(validateReversal(l, [d, c, r], c.id, TODAY)).toEqual(['err.already_reversed'])
    expect(validateReversal(l, [d, c, r], r.id, TODAY)).toEqual(['err.cannot_reverse_reversal'])
    expect(validateReversal(l, [d, c], d.id, TODAY)).toEqual(['err.reverse_others_first'])
    expect(validateReversal(l, [d, c], 'nope', TODAY)).toEqual(['err.tx_not_found'])
  })

  it('blocks reversing a top-up that later repayments depend on', () => {
    const d = disburse('2026-01-01', R(1_000))
    const inc = tx('principal_increase', '2026-01-02', R(1_000))
    const c = collect('2026-01-03', 0, R(1_500))
    expect(validateReversal(l, [d, inc, c], inc.id, TODAY)).toEqual(['err.breaks_later_balance'])
  })
})

describe('terms and new loan validation', () => {
  it('never guesses a rate unit or method', () => {
    expect(validateTerms(terms({ method: 'percent_daily', rateE4: undefined }))).toContain('err.rate_required')
    expect(validateTerms(terms({ method: 'percent_monthly', rateE4: 20000, monthlyDayCount: undefined }))).toContain(
      'err.day_count_required',
    )
    expect(validateTerms(terms({ method: 'percent_daily', rateE4: 200000 }))).toContain('err.rate_too_high')
    expect(validateTerms(terms({ fixedDailyPaise: 0 }))).toContain('err.fixed_amount_required')
    expect(validateTerms(terms({ nonChargeableWeekdays: [0, 1, 2, 3, 4, 5, 6] }))).toContain('err.no_chargeable_days')
    expect(validateTerms(terms())).toEqual([])
  })

  it('checks loan dates and amounts', () => {
    const v = (o: object) => validateNewLoan({ startDate: '2026-01-01', principalPaise: R(1_000), terms: terms(), ...o }, TODAY)
    expect(v({})).toEqual([])
    expect(v({ startDate: '2026-02-01' })).toContain('err.date_in_future')
    expect(v({ principalPaise: -1 })).toContain('err.amount_required')
    expect(v({ dueDate: '2025-12-01' })).toContain('err.due_before_start')
  })
})

describe('dashboard reconciles with the ledgers', () => {
  const customers: Customer[] = ['C1', 'C2'].map((id) => ({
    id,
    code: id,
    name: id,
    phone: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
  }))
  const l1 = loan('2026-01-01', {}, 'L1')
  const l2 = { ...loan('2026-01-03', { method: 'percent_daily', rateE4: 10000 }, 'L2'), customerId: 'C2' }
  const l3 = { ...loan('2026-01-02', {}, 'L3'), customerId: 'C2' }
  const d3 = disburse('2026-01-02', R(5_000), 'L3')
  const txs = [
    disburse('2026-01-01', R(50_000), 'L1'),
    disburse('2026-01-03', R(20_000), 'L2'),
    collect('2026-01-05', R(300), 0, 'L1'),
    collect('2026-01-10', R(100), 0, 'L1'),
    collect('2026-01-10', R(200), R(1_000), 'L2'),
    d3,
    { ...tx('reversal', '2026-01-02', R(5_000), { principal: R(5_000) }), loanId: 'L3', reversesId: d3.id },
  ]

  it('totals equal the sum of loan states and the raw ledger', () => {
    const p = computePortfolio([l1, l2, l3], txs, TODAY)
    const s1 = p.states.get('L1')!
    const s2 = p.states.get('L2')!
    expect(p.totals.principalLent).toBe(R(70_000))
    expect(p.totals.principalOutstanding).toBe(s1.principalOutstanding + s2.principalOutstanding)
    expect(p.totals.interestAccrued).toBe(s1.interestAccrued + s2.interestAccrued)
    expect(p.totals.interestReceived).toBe(R(600))
    expect(p.totals.interestOutstanding).toBe(p.totals.interestAccrued - p.totals.interestReceived)
    expect(p.activeLoans).toBe(2)
    expect(p.activeCustomers).toBe(2)
    expect(reconcile(customers, [l1, l2, l3], txs, p)).toEqual([])
  })

  it('never confuses accrued with received', () => {
    const p = computePortfolio([l1, l2, l3], txs, TODAY)
    expect(p.totals.interestAccrued).not.toBe(p.totals.interestReceived)
    expect(cashBetween(txs, TODAY, TODAY).interest).toBe(R(300))
    expect(cashBetween(txs, '2026-01-01', TODAY)).toEqual({ interest: R(600), principal: R(1_000), total: R(1_600), count: 3 })
  })

  it("today's collection picture", () => {
    const p = computePortfolio([l1, l2, l3], txs, TODAY)
    expect(p.dayTotals.expected).toBe(R(100) + R(190)) // L2 repaid ₹1,000 that day
    expect(p.dayTotals.interestReceived).toBe(R(300))
    expect(p.customerDayStatus.get('C1')).toBe('collected')
    expect(p.customerDayStatus.get('C2')).toBe('collected')
  })

  it('groups cash by day and month', () => {
    expect(cashByPeriod(txs, '2026-01-01', TODAY, 'month')).toEqual([
      { period: '2026-01', interest: R(600), principal: R(1_000), total: R(1_600), count: 3 },
    ])
    expect(cashByPeriod(txs, '2026-01-01', TODAY, 'day').map((r) => r.period)).toEqual(['2026-01-05', '2026-01-10'])
  })

  it('detects a tampered ledger', () => {
    const bad = [...txs, { ...collect('2026-01-06', R(100), 0, 'L1'), amountPaise: R(150) }]
    const p = computePortfolio([l1, l2, l3], bad, TODAY)
    expect(reconcile(customers, [l1, l2, l3], bad, p).map((i) => i.code)).toContain('allocation_mismatch')
  })
})
