import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LedgerDB, db, setDatabase } from '../src/db/db'
import {
  LedgerError,
  addCustomer,
  createLoan,
  loadSnapshot,
  postCollection,
  postReversal,
  updateCustomer,
} from '../src/db/repo'
import { BackupError, compareWithCurrent, createBackup, parseBackup, restoreBackup } from '../src/backup/backup'
import { transactionsCsv } from '../src/backup/csv'
import { computeLoanState, computePortfolio, reconcile } from '../src/engine'
import { R, terms } from './helpers'

const TODAY = '2026-01-10'
let n = 0

beforeEach(async () => {
  setDatabase(new LedgerDB(`test-${++n}`))
  await db.open()
})

async function seed() {
  const c = await addCustomer({ name: '  Ramesh   Gowda ', phone: '98450 12345', notes: '' })
  const loan = await createLoan(
    { customerId: c.id, startDate: '2026-01-01', principalPaise: R(50_000), terms: terms(), notes: '', requestId: 'r-loan' },
    TODAY,
  )
  return { c, loan }
}

describe('customers', () => {
  it('cleans and validates input, keeps an audit of edits', async () => {
    const { c } = await seed()
    expect(c.name).toBe('Ramesh Gowda')
    expect(c.code).toBe('C-0001')
    await expect(addCustomer({ name: ' ', phone: '', notes: '' })).rejects.toThrow(LedgerError)
    await updateCustomer(c.id, { name: 'Ramesh G', phone: '', notes: 'shop' })
    const ev = await db.audit.where('entityId').equals(c.id).toArray()
    expect(ev.map((e) => e.action).sort()).toEqual(['create', 'update'])
    expect(ev.find((e) => e.action === 'update')?.changes?.name).toEqual({ from: 'Ramesh Gowda', to: 'Ramesh G' })
  })
})

describe('posting', () => {
  it('runs the worked example through the database', async () => {
    const { loan } = await seed()
    await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(300), interestPaise: R(300), principalPaise: 0 }, '', 'r1', TODAY)
    await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(200), interestPaise: R(200), principalPaise: 0 }, '', 'r2', TODAY)
    await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(5_000), interestPaise: 0, principalPaise: R(5_000) }, '', 'r3', TODAY)
    const snap = await loadSnapshot()
    const s = computeLoanState(snap.loans[0], snap.transactions, '2026-01-05')
    expect(s.interestOutstanding).toBe(0)
    expect(s.principalOutstanding).toBe(4_500_000)
    expect(s.totalOutstanding).toBe(4_500_000)
  })

  it('refuses a duplicate submission (double tap)', async () => {
    const { loan } = await seed()
    const input = { date: '2026-01-05', amountPaise: R(100), interestPaise: R(100), principalPaise: 0 }
    const results = await Promise.allSettled([
      postCollection(loan.id, input, '', 'same', TODAY),
      postCollection(loan.id, input, '', 'same', TODAY),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.transactions.where('type').equals('collection').count()).toBe(1)
  })

  it('refuses invalid allocations and writes nothing', async () => {
    const { loan } = await seed()
    await expect(
      postCollection(loan.id, { date: '2026-01-05', amountPaise: R(900), interestPaise: R(900), principalPaise: 0 }, '', 'x', TODAY),
    ).rejects.toMatchObject({ keys: ['err.interest_exceeds_due'] })
    expect(await db.transactions.count()).toBe(1)
  })

  it('reverses without deleting', async () => {
    const { loan } = await seed()
    const t = await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(300), interestPaise: R(300), principalPaise: 0 }, '', 'r1', TODAY)
    await expect(postReversal(t.id, '', 'rv0', TODAY)).rejects.toMatchObject({ keys: ['err.reason_required'] })
    await postReversal(t.id, 'typed wrong amount', 'rv1', TODAY)
    await expect(postReversal(t.id, 'again', 'rv2', TODAY)).rejects.toMatchObject({ keys: ['err.already_reversed'] })
    const snap = await loadSnapshot()
    expect(snap.transactions).toHaveLength(3)
    expect(computeLoanState(snap.loans[0], snap.transactions, TODAY).interestReceived).toBe(0)
  })
})

describe('backup and restore', () => {
  it('round-trips everything, keeps IDs and history, and reconciles', async () => {
    const { loan } = await seed()
    const t = await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(300), interestPaise: R(300), principalPaise: 0 }, '', 'r1', TODAY)
    await postReversal(t.id, 'mistake', 'rv1', TODAY)
    await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(250), interestPaise: R(250), principalPaise: 0 }, '', 'r2', TODAY)
    const before = await loadSnapshot()
    const text = JSON.stringify(await createBackup())

    // restore into an empty database
    setDatabase(new LedgerDB(`test-${++n}`))
    await db.open()
    const parsed = parseBackup(text)
    expect(await compareWithCurrent(parsed.file)).toMatchObject({ sameIds: 0, onlyHere: 0 })
    await restoreBackup(parsed.file)
    const after = await loadSnapshot()

    const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id))
    expect(byId(after.customers)).toEqual(byId(before.customers))
    expect(byId(after.loans)).toEqual(byId(before.loans))
    expect(byId(after.transactions)).toEqual(byId(before.transactions))
    expect((await db.audit.toArray()).filter((e) => e.action === 'reverse')).toHaveLength(1)

    const p = computePortfolio(after.loans, after.transactions, TODAY)
    expect(reconcile(after.customers, after.loans, after.transactions, p)).toEqual([])
    expect(p.totals.interestReceived).toBe(R(250))

    // codes keep counting from where they were
    const c2 = await addCustomer({ name: 'Second', phone: '', notes: '' })
    expect(c2.code).toBe('C-0002')
  })

  it('detects the same data already present', async () => {
    await seed()
    const file = parseBackup(JSON.stringify(await createBackup())).file
    expect((await compareWithCurrent(file)).sameIds).toBe(3)
  })

  it('rejects broken files before writing anything', async () => {
    await seed()
    const good = await createBackup()
    const bad = (mut: (f: any) => void) => {
      const f = structuredClone(good) as any
      mut(f)
      return JSON.stringify(f)
    }
    const problem = (text: string) => {
      try {
        parseBackup(text)
        return 'ok'
      } catch (e) {
        return (e as BackupError).problem
      }
    }
    expect(problem('{nope')).toBe('not_json')
    expect(problem('{"app":"Other"}')).toBe('not_backup')
    expect(problem(bad((f) => (f.version = 99)))).toBe('newer_version')
    expect(problem(bad((f) => (f.transactions[0].amountPaise = 1.5)))).toBe('bad_transaction')
    expect(problem(bad((f) => f.transactions.push({ ...f.transactions[0] })))).toBe('duplicate_id')
    expect(problem(bad((f) => (f.loans[0].terms.method = 'compound')))).toBe('bad_loan')
    expect(problem(bad((f) => (f.counts.transactions = 7)))).toBe('count_mismatch')
    expect(problem(bad((f) => (f.loans[0].customerId = 'ghost')))).toBe('ledger_inconsistent')
    expect(await db.customers.count()).toBe(1)
  })
})

describe('csv', () => {
  it('labels currency and neutralises formulas', async () => {
    const { loan } = await seed()
    await updateCustomer((await db.customers.toArray())[0].id, { name: '=HYPERLINK("x")', phone: '', notes: '' })
    await postCollection(loan.id, { date: '2026-01-05', amountPaise: R(300), interestPaise: R(300), principalPaise: 0 }, 'ok', 'r1', TODAY)
    const s = await loadSnapshot()
    const csv = transactionsCsv(s.customers, s.loans, s.transactions, '2026-01-01', TODAY)
    expect(csv).toContain('Amount (INR)')
    expect(csv).toContain('300.00')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('Cash')
  })
})
