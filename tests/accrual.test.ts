import { describe, expect, it } from 'vitest'
import { computeLoanState, dayOf, explainDay } from '../src/engine'
import { R, collect, disburse, loan, tx } from './helpers'

describe('MANDATORY worked test: ₹50,000, ₹100/day, five chargeable days', () => {
  const l = loan('2026-01-01') // start day is chargeable: 1st..5th = 5 days
  const base = [disburse('2026-01-01', R(50_000))]

  it('accrues ₹500 over five days', () => {
    const s = computeLoanState(l, base, '2026-01-05')
    expect(s.days.filter((d) => d.chargeable)).toHaveLength(5)
    expect(s.interestAccrued).toBe(50_000) // paise
    expect(s.interestReceived).toBe(0)
    expect(s.interestOutstanding).toBe(50_000)
    expect(s.principalOutstanding).toBe(5_000_000)
  })

  it('collect ₹300 as interest', () => {
    const txs = [...base, collect('2026-01-05', R(300), 0)]
    const s = computeLoanState(l, txs, '2026-01-05')
    expect(s.interestReceived).toBe(30_000)
    expect(s.interestOutstanding).toBe(20_000)
    expect(s.principalOutstanding).toBe(5_000_000)
  })

  it('then ₹200 interest and a separate ₹5,000 principal repayment', () => {
    const txs = [
      ...base,
      collect('2026-01-05', R(300), 0),
      collect('2026-01-05', R(200), 0),
      collect('2026-01-05', 0, R(5_000)),
    ]
    const s = computeLoanState(l, txs, '2026-01-05')
    expect(s.interestAccrued).toBe(50_000)
    expect(s.interestReceived).toBe(50_000)
    expect(s.interestOutstanding).toBe(0)
    expect(s.principalRepaid).toBe(500_000)
    expect(s.principalOutstanding).toBe(4_500_000)
    expect(s.totalOutstanding).toBe(4_500_000)
    expect(s.days.every((d) => d.status === 'collected')).toBe(true)
  })
})

describe('fixed daily amount', () => {
  it('excludes the start day when chargeDisbursementDay is false', () => {
    const l = loan('2026-03-01', { chargeDisbursementDay: false })
    const s = computeLoanState(l, [disburse('2026-03-01', R(10_000))], '2026-03-10')
    expect(s.days[0].noChargeReason).toBe('start_day')
    expect(s.interestAccrued).toBe(R(900))
  })

  it('keeps the amount unchanged after a part repayment', () => {
    const l = loan('2026-03-01')
    const txs = [disburse('2026-03-01', R(10_000)), collect('2026-03-03', 0, R(5_000))]
    const s = computeLoanState(l, txs, '2026-03-05')
    expect(s.interestAccrued).toBe(R(500))
  })

  it('scales with principal when proportional', () => {
    const l = loan('2026-03-01', { fixedAmountBasis: 'proportional' })
    const txs = [disburse('2026-03-01', R(10_000)), collect('2026-03-03', 0, R(5_000))]
    const s = computeLoanState(l, txs, '2026-03-05')
    // 1st, 2nd at ₹100; 3rd onward (repaid on 3rd, repayment day not charged) at ₹50
    expect(s.days.map((d) => d.interestCharged)).toEqual([R(100), R(100), R(50), R(50), R(50)])
  })

  it('stops when principal is fully repaid', () => {
    const l = loan('2026-03-01')
    const txs = [disburse('2026-03-01', R(1_000)), collect('2026-03-03', R(200), R(1_000))]
    const s = computeLoanState(l, txs, '2026-03-10')
    // 1st and 2nd charged; 3rd is the repayment day and is not charged by default
    expect(s.interestAccrued).toBe(R(200))
    expect(s.days[2].noChargeReason).toBe('no_principal')
    expect(s.status).toBe('closed')
  })
})

describe('end date convention', () => {
  it('charges the repayment day when chargeRepaymentDay is true', () => {
    const l = loan('2026-03-01', { chargeRepaymentDay: true })
    const txs = [disburse('2026-03-01', R(1_000)), collect('2026-03-03', R(300), R(1_000))]
    const s = computeLoanState(l, txs, '2026-03-10')
    expect(s.interestAccrued).toBe(R(300))
    expect(s.interestOutstanding).toBe(0)
    expect(s.principalOutstanding).toBe(0)
    expect(s.status).toBe('closed')
  })
})

describe('percentage per day', () => {
  it('charges rate × principal each day', () => {
    const l = loan('2026-05-01', { method: 'percent_daily', rateE4: 5000 }) // 0.5%/day
    const s = computeLoanState(l, [disburse('2026-05-01', R(10_000))], '2026-05-10')
    expect(s.days.every((d) => d.interestCharged === R(50))).toBe(true)
    expect(s.interestAccrued).toBe(R(500))
  })

  it('carries unpaid interest forward without compounding', () => {
    const l = loan('2026-05-01', { method: 'percent_daily', rateE4: 10000 }) // 1%/day
    const s = computeLoanState(l, [disburse('2026-05-01', R(10_000))], '2026-06-29') // 60 days, nothing paid
    expect(s.days.every((d) => d.principalBase === R(10_000))).toBe(true)
    expect(s.interestAccrued).toBe(R(6_000)) // 60 × ₹100; compounding would be far more
    expect(s.interestOutstanding).toBe(R(6_000))
    expect(s.days.every((d) => d.status === 'pending')).toBe(true)
  })

  it('a principal repayment lowers future interest only', () => {
    const l = loan('2026-05-01', { method: 'percent_daily', rateE4: 10000 })
    const txs = [disburse('2026-05-01', R(10_000)), collect('2026-05-04', 0, R(4_000))]
    const s = computeLoanState(l, txs, '2026-05-06')
    // 1,2,3 on 10,000 (₹100); 4 is repayment day (not charged on repaid part): 6,000 (₹60); 5,6 ₹60
    expect(s.days.map((d) => d.interestCharged)).toEqual([R(100), R(100), R(100), R(60), R(60), R(60)])
  })

  it('a top-up raises interest from its date', () => {
    const l = loan('2026-05-01', { method: 'percent_daily', rateE4: 10000 })
    const txs = [disburse('2026-05-01', R(10_000)), tx('principal_increase', '2026-05-03', R(5_000))]
    const s = computeLoanState(l, txs, '2026-05-04')
    expect(s.days.map((d) => d.interestCharged)).toEqual([R(100), R(100), R(150), R(150)])
    expect(s.principalGiven).toBe(R(15_000))
  })
})

describe('monthly rate with day-count', () => {
  const t = { method: 'percent_monthly' as const, rateE4: 30000 } // 3% / month

  it('thirty: monthly ÷ 30 every day (31-day month gives 31 days of charge)', () => {
    const l = loan('2026-01-01', { ...t, monthlyDayCount: 'thirty' })
    const s = computeLoanState(l, [disburse('2026-01-01', R(100_000))], '2026-01-31')
    expect(s.days[0].interestCharged).toBe(R(100))
    expect(s.interestAccrued).toBe(R(3_100))
  })

  it('actual_month: exactly the monthly amount over each calendar month', () => {
    const l = loan('2024-01-01', { ...t, monthlyDayCount: 'actual_month' })
    const txs = [disburse('2024-01-01', R(100_000))]
    expect(computeLoanState(l, txs, '2024-01-31').interestAccrued).toBe(R(3_000))
    // leap February: 29 days
    const feb = computeLoanState(l, txs, '2024-02-29')
    expect(feb.interestAccrued).toBe(R(6_000))
    expect(feb.days.find((d) => d.date === '2024-02-29')?.chargeable).toBe(true)
  })

  it('actual_month across a year change', () => {
    const l = loan('2025-12-01', { ...t, monthlyDayCount: 'actual_month' })
    const s = computeLoanState(l, [disburse('2025-12-01', R(100_000))], '2026-01-31')
    expect(s.interestAccrued).toBe(R(6_000))
  })

  it('annual_365: monthly × 12 ÷ 365 every day', () => {
    const l = loan('2026-01-01', { method: 'percent_monthly', rateE4: 20000, monthlyDayCount: 'annual_365' })
    const s = computeLoanState(l, [disburse('2026-01-01', R(36_500))], '2026-01-10')
    expect(s.days[0].interestCharged).toBe(R(24)) // 730 × 12 / 365
    expect(s.interestAccrued).toBe(R(240))
  })
})

describe('rounding', () => {
  // 1%/month on ₹100 over 30 = 3.333… paise per day
  const t = { method: 'percent_monthly' as const, rateE4: 10000, monthlyDayCount: 'thirty' as const }

  it('cumulative rounding never drifts', () => {
    const l = loan('2026-01-01', t)
    const s = computeLoanState(l, [disburse('2026-01-01', R(100))], '2026-01-30')
    expect(s.days.slice(0, 3).map((d) => d.interestCharged)).toEqual([3, 4, 3])
    expect(s.interestAccrued).toBe(100) // exactly ₹1 for 30 days
  })

  it('daily rounding rounds each day', () => {
    const l = loan('2026-01-01', { ...t, rounding: 'daily_half_up' })
    const s = computeLoanState(l, [disburse('2026-01-01', R(100))], '2026-01-30')
    expect(s.interestAccrued).toBe(90) // 30 × 3
  })

  it('explains each day', () => {
    const l = loan('2026-01-01', t)
    const s = computeLoanState(l, [disburse('2026-01-01', R(100))], '2026-01-02')
    const e = explainDay(l.terms, s.days[0], s.originalPrincipal)
    expect(e.key).toBe('explain.monthly_thirty')
    expect(e.exactPaise).toBe('10/3')
    expect(e.divisor).toBe(30)
  })
})

describe('non-chargeable days', () => {
  it('skips weekdays and holidays', () => {
    // 2026-10-05 is a Monday; 11th is Sunday; holiday on 7th
    const l = loan('2026-10-05', { nonChargeableWeekdays: [0], nonChargeableDates: ['2026-10-07'] })
    const s = computeLoanState(l, [disburse('2026-10-05', R(10_000))], '2026-10-12')
    expect(dayOf(s, '2026-10-07')?.noChargeReason).toBe('holiday')
    expect(dayOf(s, '2026-10-11')?.noChargeReason).toBe('weekday')
    expect(s.days.filter((d) => d.chargeable)).toHaveLength(6)
    expect(s.interestAccrued).toBe(R(600))
  })

  it('a collection on a non-chargeable day still counts', () => {
    const l = loan('2026-10-05', { nonChargeableWeekdays: [0] })
    const txs = [disburse('2026-10-05', R(10_000)), collect('2026-10-11', R(300), 0)]
    const s = computeLoanState(l, txs, '2026-10-11')
    expect(dayOf(s, '2026-10-11')?.status).toBe('no_charge')
    expect(dayOf(s, '2026-10-11')?.interestReceived).toBe(R(300))
    expect(s.interestOutstanding).toBe(R(300)) // 6 days × 100 − 300
  })
})

describe('partial and full collection status', () => {
  it('pays oldest days first', () => {
    const l = loan('2026-01-01')
    const txs = [disburse('2026-01-01', R(10_000)), collect('2026-01-04', R(250), 0)]
    const s = computeLoanState(l, txs, '2026-01-04')
    expect(s.days.map((d) => d.status)).toEqual(['collected', 'collected', 'partial', 'pending'])
    expect(s.days[2].chargePaid).toBe(R(50))
    expect(s.interestOutstanding).toBe(R(150))
  })
})

describe('backdated entries and reversals', () => {
  const l = loan('2026-02-01', { method: 'percent_daily', rateE4: 10000 })

  it('a backdated principal repayment recalculates later interest', () => {
    const before = [disburse('2026-02-01', R(10_000))]
    expect(computeLoanState(l, before, '2026-02-10').interestAccrued).toBe(R(1_000))
    // entered later, dated the 5th
    const after = [...before, tx('collection', '2026-02-05', R(5_000), { principal: R(5_000) }, { createdAt: '2026-02-11T09:00:00.000Z' })]
    const s = computeLoanState(l, after, '2026-02-10')
    // 1–4 at ₹100, 5–10 at ₹50
    expect(s.interestAccrued).toBe(R(400 + 300))
  })

  it('a reversal cancels the original but keeps both in history', () => {
    const c = collect('2026-02-03', R(200), 0)
    const r = tx('reversal', '2026-02-04', R(200), { interest: R(200) }, { reversesId: c.id })
    const txs = [disburse('2026-02-01', R(10_000)), c, r]
    const s = computeLoanState(l, txs, '2026-02-04')
    expect(s.interestReceived).toBe(0)
    expect(s.interestOutstanding).toBe(R(400))
    expect(txs).toHaveLength(3)
  })

  it('a correction is reversal + replacement', () => {
    const wrong = collect('2026-02-03', R(300), 0)
    const rev = tx('reversal', '2026-02-03', R(300), { interest: R(300) }, { reversesId: wrong.id })
    const right = collect('2026-02-03', R(200), R(100))
    const s = computeLoanState(l, [disburse('2026-02-01', R(10_000)), wrong, rev, right], '2026-02-03')
    expect(s.interestReceived).toBe(R(200))
    expect(s.principalRepaid).toBe(R(100))
  })

  it('reversing the disbursement cancels the loan', () => {
    const d = disburse('2026-02-01', R(10_000))
    const r = tx('reversal', '2026-02-01', R(10_000), { principal: R(10_000) }, { reversesId: d.id })
    const s = computeLoanState(l, [d, r], '2026-02-05')
    expect(s.status).toBe('cancelled')
    expect(s.interestAccrued).toBe(0)
  })

  it('waivers reduce balances without cash', () => {
    const txs = [disburse('2026-02-01', R(10_000)), tx('interest_waiver', '2026-02-03', R(100)), tx('principal_waiver', '2026-02-03', R(1_000))]
    const s = computeLoanState(l, txs, '2026-02-03')
    expect(s.interestWaived).toBe(R(100))
    expect(s.interestReceived).toBe(0)
    expect(s.principalWaived).toBe(R(1_000))
    expect(s.principalOutstanding).toBe(R(9_000))
  })
})
