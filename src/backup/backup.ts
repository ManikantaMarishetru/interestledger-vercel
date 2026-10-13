// Versioned JSON backup. parseBackup() validates the whole file before
// anything is written; restoreBackup() replaces all data in one transaction
// and then reconciles the restored ledger.

import {
  computePortfolio,
  isPaise,
  isValidISODate,
  reconcile,
  todayISO,
  validateTerms,
  type Customer,
  type Loan,
  type ReconcileIssue,
  type Transaction,
} from '../engine'
import { db, type AuditEvent, type Meta } from '../db/db'

export const BACKUP_APP = 'InterestLedger'
export const BACKUP_VERSION = 1

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  counts: { customers: number; loans: number; transactions: number; audit: number }
  customers: Customer[]
  loans: Loan[]
  transactions: Transaction[]
  audit: AuditEvent[]
  meta: Meta[]
}

export type BackupProblem =
  | 'not_json'
  | 'not_backup'
  | 'newer_version'
  | 'bad_customer'
  | 'bad_loan'
  | 'bad_transaction'
  | 'bad_audit'
  | 'duplicate_id'
  | 'count_mismatch'
  | 'ledger_inconsistent'

export class BackupError extends Error {
  readonly problem: BackupProblem
  readonly detail?: string
  constructor(problem: BackupProblem, detail?: string) {
    super(`${problem}${detail ? `: ${detail}` : ''}`)
    this.problem = problem
    this.detail = detail
  }
}

export async function createBackup(): Promise<BackupFile> {
  return db.transaction('r', [db.customers, db.loans, db.transactions, db.audit, db.meta], async () => {
    const customers = await db.customers.toArray()
    const loans = await db.loans.toArray()
    const transactions = await db.transactions.toArray()
    const audit = await db.audit.toArray()
    const meta = await db.meta.toArray()
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      counts: { customers: customers.length, loans: loans.length, transactions: transactions.length, audit: audit.length },
      customers,
      loans,
      transactions,
      audit,
      meta,
    }
  })
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function checkCustomer(c: unknown): c is Customer {
  return isObj(c) && isStr(c.id) && isStr(c.code) && isStr(c.name) && c.name.trim() !== '' && isStr(c.phone) && isStr(c.notes) && isStr(c.createdAt) && isStr(c.updatedAt)
}

function checkLoan(l: unknown): l is Loan {
  return (
    isObj(l) &&
    isStr(l.id) &&
    isStr(l.code) &&
    isStr(l.customerId) &&
    isValidISODate(l.startDate) &&
    (l.dueDate === undefined || isValidISODate(l.dueDate)) &&
    isStr(l.notes) &&
    isStr(l.createdAt) &&
    isObj(l.terms) &&
    validateTerms(l.terms as unknown as Loan['terms']).length === 0
  )
}

const TX_TYPES = ['disbursement', 'principal_increase', 'collection', 'interest_waiver', 'principal_waiver', 'reversal']

function checkTx(t: unknown): t is Transaction {
  return (
    isObj(t) &&
    isStr(t.id) &&
    isStr(t.code) &&
    isStr(t.loanId) &&
    isStr(t.type) &&
    TX_TYPES.includes(t.type) &&
    isValidISODate(t.date) &&
    isStr(t.createdAt) &&
    isPaise(t.amountPaise) &&
    t.amountPaise > 0 &&
    isPaise(t.interestPaise) &&
    t.interestPaise >= 0 &&
    isPaise(t.principalPaise) &&
    t.principalPaise >= 0 &&
    (t.method === undefined || t.method === 'cash') &&
    isStr(t.notes) &&
    isStr(t.requestId) &&
    (t.type !== 'reversal' || isStr(t.reversesId))
  )
}

function checkAudit(a: unknown): a is AuditEvent {
  return isObj(a) && isStr(a.id) && isStr(a.at) && isStr(a.entity) && isStr(a.entityId) && isStr(a.action)
}

function uniqueBy<T>(items: T[], key: (t: T) => string, label: string): void {
  const seen = new Set<string>()
  for (const i of items) {
    const k = key(i)
    if (seen.has(k)) throw new BackupError('duplicate_id', `${label} ${k}`)
    seen.add(k)
  }
}

export interface ParsedBackup {
  file: BackupFile
  issues: ReconcileIssue[]
}

/** Validate a backup completely. Throws BackupError; writes nothing. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('not_json')
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || typeof raw.version !== 'number') throw new BackupError('not_backup')
  if (raw.version > BACKUP_VERSION) throw new BackupError('newer_version', String(raw.version))
  const { customers, loans, transactions, audit = [], meta = [], counts } = raw as Record<string, unknown>
  if (!Array.isArray(customers) || !Array.isArray(loans) || !Array.isArray(transactions) || !Array.isArray(audit) || !Array.isArray(meta))
    throw new BackupError('not_backup')

  customers.forEach((c, i) => {
    if (!checkCustomer(c)) throw new BackupError('bad_customer', String(i))
  })
  loans.forEach((l, i) => {
    if (!checkLoan(l)) throw new BackupError('bad_loan', String(i))
  })
  transactions.forEach((t, i) => {
    if (!checkTx(t)) throw new BackupError('bad_transaction', String(i))
  })
  audit.forEach((a, i) => {
    if (!checkAudit(a)) throw new BackupError('bad_audit', String(i))
  })
  const cs = customers as Customer[]
  const ls = loans as Loan[]
  const ts = transactions as Transaction[]
  uniqueBy(cs, (c) => c.id, 'customer')
  uniqueBy(cs, (c) => c.code, 'customer code')
  uniqueBy(ls, (l) => l.id, 'loan')
  uniqueBy(ls, (l) => l.code, 'loan code')
  uniqueBy(ts, (t) => t.id, 'transaction')
  uniqueBy(ts, (t) => t.code, 'transaction code')
  uniqueBy(ts, (t) => t.requestId, 'request')
  uniqueBy(audit as AuditEvent[], (a) => a.id, 'audit')

  if (isObj(counts)) {
    if (counts.customers !== cs.length || counts.loans !== ls.length || counts.transactions !== ts.length)
      throw new BackupError('count_mismatch')
  }

  // Structural problems (orphans, broken reversals, bad allocations) block the restore.
  const asOf = todayISO()
  const portfolio = computePortfolio(ls, ts, asOf)
  const issues = reconcile(cs, ls, ts, portfolio)
  const blocking = issues.filter((i) => i.code !== 'loan_issue')
  if (blocking.length) throw new BackupError('ledger_inconsistent', blocking.map((i) => i.code).join(', '))

  const file: BackupFile = {
    app: BACKUP_APP,
    version: raw.version,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    counts: { customers: cs.length, loans: ls.length, transactions: ts.length, audit: audit.length },
    customers: cs,
    loans: ls,
    transactions: ts,
    audit: audit as AuditEvent[],
    meta: (meta as unknown[]).filter((m): m is Meta => isObj(m) && isStr(m.key)),
  }
  return { file, issues }
}

export interface RestoreComparison {
  current: { customers: number; loans: number; transactions: number }
  /** Records in the file whose ID already exists here. */
  sameIds: number
  /** Records here that are not in the file (would be removed by a restore). */
  onlyHere: number
}

export async function compareWithCurrent(file: BackupFile): Promise<RestoreComparison> {
  const [customers, loans, transactions] = await Promise.all([
    db.customers.toCollection().primaryKeys(),
    db.loans.toCollection().primaryKeys(),
    db.transactions.toCollection().primaryKeys(),
  ])
  const here = new Set([...customers, ...loans, ...transactions])
  const there = new Set([...file.customers, ...file.loans, ...file.transactions].map((r) => r.id))
  let sameIds = 0
  for (const id of there) if (here.has(id)) sameIds++
  let onlyHere = 0
  for (const id of here) if (!there.has(id)) onlyHere++
  return { current: { customers: customers.length, loans: loans.length, transactions: transactions.length }, sameIds, onlyHere }
}

/** Replace everything with the backup in one transaction. IDs and history are kept. */
export async function restoreBackup(file: BackupFile): Promise<void> {
  await db.transaction('rw', [db.customers, db.loans, db.transactions, db.audit, db.meta], async () => {
    await Promise.all([db.customers.clear(), db.loans.clear(), db.transactions.clear(), db.audit.clear(), db.meta.clear()])
    await db.customers.bulkAdd(file.customers)
    await db.loans.bulkAdd(file.loans)
    await db.transactions.bulkAdd(file.transactions)
    await db.audit.bulkAdd(file.audit)
    await db.meta.bulkPut(file.meta)
    await db.audit.add({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      entity: 'data',
      entityId: 'all',
      action: 'restore',
      changes: { exportedAt: { from: null, to: file.exportedAt } },
    })
  })
}

export function backupFileName(date = todayISO()): string {
  return `InterestLedger-backup-${date}.json`
}
