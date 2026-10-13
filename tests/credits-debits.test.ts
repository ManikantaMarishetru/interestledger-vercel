import { describe, expect, it } from 'vitest'
import { creditsDebits } from '../src/backup/ledger'
import type { Customer, Loan } from '../src/engine'
import { collect, disburse, loan, R, tx } from './helpers'

const cust: Customer = {
  id: 'C1',
  code: 'C-0001',
  name: 'Ravi',
  phone: '',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const ln: Loan = { ...loan('2026-01-05'), id: 'L1', code: 'L-0001', customerId: 'C1' }

describe('credits & debits ledger', () => {
  it('puts money given in credit and money received in debit', () => {
    const txs = [disburse('2026-01-05', R(50000)), collect('2026-01-10', R(500), R(1000))]
    const r = creditsDebits([cust], [ln], txs, '2026-01-01', '2026-01-31')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].creditPaise).toBe(R(50000))
    expect(r.rows[0].debitPaise).toBe(0)
    expect(r.rows[1].creditPaise).toBe(0)
    expect(r.rows[1].debitPaise).toBe(R(1500))
    expect(r.totalCredit).toBe(R(50000))
    expect(r.totalDebit).toBe(R(1500))
    expect(r.balance).toBe(R(48500))
  })

  it('lists waivers as adjustments without counting them', () => {
    const txs = [disburse('2026-01-05', R(10000)), tx('interest_waiver', '2026-01-10', R(200))]
    const r = creditsDebits([cust], [ln], txs, '2026-01-01', '2026-01-31')
    expect(r.rows).toHaveLength(2)
    const w = r.rows.find((x) => x.type === 'interest_waiver')!
    expect(w.creditPaise).toBe(0)
    expect(w.debitPaise).toBe(0)
    expect(r.totalCredit).toBe(R(10000))
    expect(r.totalDebit).toBe(0)
  })

  it('lists cancelled entries but excludes them from the totals', () => {
    const c = collect('2026-01-10', R(500), R(1000))
    const reversal = tx('reversal', '2026-01-11', R(1500), {}, { reversesId: c.id })
    const txs = [disburse('2026-01-05', R(10000)), c, reversal]
    const r = creditsDebits([cust], [ln], txs, '2026-01-01', '2026-01-31')
    expect(r.rows).toHaveLength(3)
    expect(r.rows.filter((x) => x.reversed)).toHaveLength(2)
    expect(r.totalCredit).toBe(R(10000))
    expect(r.totalDebit).toBe(0)
    expect(r.balance).toBe(R(10000))
  })

  it('keeps only the date range', () => {
    const txs = [disburse('2026-01-05', R(10000)), collect('2026-02-10', R(100), R(100))]
    const r = creditsDebits([cust], [ln], txs, '2026-01-01', '2026-01-31')
    expect(r.rows).toHaveLength(1)
    expect(r.totalCredit).toBe(R(10000))
    expect(r.totalDebit).toBe(0)
  })
})
