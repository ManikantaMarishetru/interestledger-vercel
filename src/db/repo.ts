// All writes go through here. Every financial write happens inside one
// IndexedDB transaction that re-reads the loan's history, re-validates with
// the engine, then writes the entry and its audit event together — so a
// balance can never be half-updated and a double tap can never post twice.

import {
  checkDuplicate,
  validateCollection,
  validateIncrease,
  validateNewLoan,
  validateReversal,
  validateWaiver,
  type CollectionInput,
  type Customer,
  type ErrorKey,
  type ISODate,
  type Loan,
  type LoanTerms,
  type Paise,
  type Transaction,
  type TxType,
} from '../engine'
import { db, type AuditEvent } from './db'

export class LedgerError extends Error {
  readonly keys: ErrorKey[]
  constructor(keys: ErrorKey[]) {
    super(keys.join(', '))
    this.keys = keys
  }
}

const uid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

async function nextCode(prefix: 'C' | 'L' | 'T', width: number): Promise<string> {
  const key = `seq.${prefix}`
  const row = await db.meta.get(key)
  const n = (typeof row?.value === 'number' ? row.value : 0) + 1
  await db.meta.put({ key, value: n })
  return `${prefix}-${String(n).padStart(width, '0')}`
}

function audit(e: Omit<AuditEvent, 'id' | 'at'>, at = nowIso()): AuditEvent {
  return { id: uid(), at, ...e }
}

function diff<T extends object>(before: T, after: T, fields: (keyof T)[]): AuditEvent['changes'] {
  const c: NonNullable<AuditEvent['changes']> = {}
  for (const f of fields) if (before[f] !== after[f]) c[String(f)] = { from: before[f], to: after[f] }
  return Object.keys(c).length ? c : undefined
}

// ---- customers ---------------------------------------------------------------

export interface CustomerInput {
  name: string
  phone: string
  notes: string
}

function cleanCustomer(input: CustomerInput): CustomerInput {
  return { name: input.name.trim().replace(/\s+/g, ' '), phone: input.phone.trim(), notes: input.notes.trim() }
}

function validateCustomer(c: CustomerInput): ErrorKey[] {
  const e: ErrorKey[] = []
  if (!c.name) e.push('err.name_required')
  if (c.name.length > 80) e.push('err.name_too_long')
  if (c.phone && !/^[+\d][\d\s-]{5,19}$/.test(c.phone)) e.push('err.phone_invalid')
  return e
}

export async function addCustomer(input: CustomerInput): Promise<Customer> {
  const c = cleanCustomer(input)
  const errors = validateCustomer(c)
  if (errors.length) throw new LedgerError(errors)
  return db.transaction('rw', db.customers, db.meta, db.audit, async () => {
    const at = nowIso()
    const customer: Customer = { id: uid(), code: await nextCode('C', 4), ...c, createdAt: at, updatedAt: at }
    await db.customers.add(customer)
    await db.audit.add(audit({ entity: 'customer', entityId: customer.id, action: 'create' }, at))
    return customer
  })
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const c = cleanCustomer(input)
  const errors = validateCustomer(c)
  if (errors.length) throw new LedgerError(errors)
  return db.transaction('rw', db.customers, db.audit, async () => {
    const before = await db.customers.get(id)
    if (!before) throw new LedgerError(['err.customer_not_found'])
    const after: Customer = { ...before, ...c, updatedAt: nowIso() }
    const changes = diff(before, after, ['name', 'phone', 'notes'])
    if (!changes) return before
    await db.customers.put(after)
    await db.audit.add(audit({ entity: 'customer', entityId: id, action: 'update', changes }))
    return after
  })
}

// ---- loans -------------------------------------------------------------------

export interface NewLoan {
  customerId: string
  startDate: ISODate
  principalPaise: Paise
  terms: LoanTerms
  dueDate?: ISODate
  notes: string
  requestId: string
}

export async function createLoan(input: NewLoan, today: ISODate): Promise<Loan> {
  const dueDate = input.dueDate || undefined
  const errors = validateNewLoan({ ...input, dueDate }, today)
  if (errors.length) throw new LedgerError(errors)
  return db.transaction('rw', [db.customers, db.loans, db.transactions, db.meta, db.audit], async () => {
    if (!(await db.customers.get(input.customerId))) throw new LedgerError(['err.customer_not_found'])
    if (await db.transactions.where('requestId').equals(input.requestId).count()) throw new LedgerError(['err.duplicate'])
    const at = nowIso()
    const loan: Loan = {
      id: uid(),
      code: await nextCode('L', 4),
      customerId: input.customerId,
      startDate: input.startDate,
      // terms are copied and frozen; nothing in the app edits them afterwards
      terms: structuredClone(input.terms),
      dueDate,
      notes: input.notes.trim(),
      createdAt: at,
    }
    const tx: Transaction = {
      id: uid(),
      code: await nextCode('T', 6),
      loanId: loan.id,
      type: 'disbursement',
      date: input.startDate,
      createdAt: at,
      amountPaise: input.principalPaise,
      interestPaise: 0,
      principalPaise: input.principalPaise,
      method: 'cash',
      notes: '',
      requestId: input.requestId,
    }
    await db.loans.add(loan)
    await db.transactions.add(tx)
    await db.audit.bulkAdd([
      audit({ entity: 'loan', entityId: loan.id, action: 'create' }, at),
      audit({ entity: 'transaction', entityId: tx.id, action: 'post' }, at),
    ])
    return loan
  })
}

/** Only notes and due date can change. Terms never change after creation. */
export async function updateLoanNotes(id: string, notes: string, dueDate: ISODate | undefined): Promise<Loan> {
  return db.transaction('rw', db.loans, db.audit, async () => {
    const before = await db.loans.get(id)
    if (!before) throw new LedgerError(['err.loan_not_found'])
    const after: Loan = { ...before, notes: notes.trim(), dueDate: dueDate || undefined }
    if (after.dueDate && after.dueDate < after.startDate) throw new LedgerError(['err.due_before_start'])
    const changes = diff(before, after, ['notes', 'dueDate'])
    if (!changes) return before
    await db.loans.put(after)
    await db.audit.add(audit({ entity: 'loan', entityId: id, action: 'update', changes }))
    return after
  })
}

// ---- transactions ------------------------------------------------------------

async function postTx(
  loanId: string,
  requestId: string,
  build: (loan: Loan, txs: Transaction[]) => { errors: ErrorKey[]; tx?: Omit<Transaction, 'id' | 'code' | 'createdAt' | 'loanId' | 'requestId'> },
  action: AuditEvent['action'] = 'post',
): Promise<Transaction> {
  return db.transaction('rw', [db.loans, db.transactions, db.meta, db.audit], async () => {
    const loan = await db.loans.get(loanId)
    if (!loan) throw new LedgerError(['err.loan_not_found'])
    const txs = await db.transactions.where('loanId').equals(loanId).toArray()
    const dup = checkDuplicate(await db.transactions.where('requestId').equals(requestId).toArray(), requestId)
    if (dup.length) throw new LedgerError(dup)
    const { errors, tx } = build(loan, txs)
    if (errors.length || !tx) throw new LedgerError(errors.length ? errors : ['err.unknown'])
    const at = nowIso()
    const full: Transaction = { ...tx, id: uid(), code: await nextCode('T', 6), loanId, createdAt: at, requestId }
    await db.transactions.add(full)
    await db.audit.add(audit({ entity: 'transaction', entityId: full.id, action }, at))
    return full
  })
}

export function postCollection(
  loanId: string,
  input: CollectionInput,
  notes: string,
  requestId: string,
  today: ISODate,
): Promise<Transaction> {
  return postTx(loanId, requestId, (loan, txs) => {
    const { errors } = validateCollection(loan, txs, input, today)
    return {
      errors,
      tx: {
        type: 'collection',
        date: input.date,
        amountPaise: input.amountPaise,
        interestPaise: input.interestPaise,
        principalPaise: input.principalPaise,
        method: 'cash',
        notes: notes.trim(),
      },
    }
  })
}

export function postIncrease(
  loanId: string,
  input: { date: ISODate; amountPaise: Paise },
  notes: string,
  requestId: string,
  today: ISODate,
): Promise<Transaction> {
  return postTx(loanId, requestId, (loan, txs) => ({
    errors: validateIncrease(loan, txs, input, today),
    tx: {
      type: 'principal_increase',
      date: input.date,
      amountPaise: input.amountPaise,
      interestPaise: 0,
      principalPaise: input.amountPaise,
      method: 'cash',
      notes: notes.trim(),
    },
  }))
}

export function postWaiver(
  loanId: string,
  input: { date: ISODate; amountPaise: Paise; kind: 'interest' | 'principal' },
  notes: string,
  requestId: string,
  today: ISODate,
): Promise<Transaction> {
  const type: TxType = input.kind === 'interest' ? 'interest_waiver' : 'principal_waiver'
  return postTx(loanId, requestId, (loan, txs) => ({
    errors: [...validateWaiver(loan, txs, input, today), ...(notes.trim() ? [] : (['err.reason_required'] as ErrorKey[]))],
    tx: {
      type,
      date: input.date,
      amountPaise: input.amountPaise,
      interestPaise: input.kind === 'interest' ? input.amountPaise : 0,
      principalPaise: input.kind === 'principal' ? input.amountPaise : 0,
      notes: notes.trim(),
    },
  }))
}

/** Cancel a posted transaction. The original is kept; a reversal entry is added. */
export async function postReversal(txId: string, reason: string, requestId: string, today: ISODate): Promise<Transaction> {
  const target = await db.transactions.get(txId)
  if (!target) throw new LedgerError(['err.tx_not_found'])
  return postTx(
    target.loanId,
    requestId,
    (loan, txs) => ({
      errors: [...validateReversal(loan, txs, txId, today), ...(reason.trim() ? [] : (['err.reason_required'] as ErrorKey[]))],
      tx: {
        type: 'reversal',
        date: today,
        amountPaise: target.amountPaise,
        interestPaise: target.interestPaise,
        principalPaise: target.principalPaise,
        notes: reason.trim(),
        reversesId: txId,
      },
    }),
    'reverse',
  )
}

// ---- reads -------------------------------------------------------------------

export interface Snapshot {
  customers: Customer[]
  loans: Loan[]
  transactions: Transaction[]
}

export async function loadSnapshot(): Promise<Snapshot> {
  return db.transaction('r', db.customers, db.loans, db.transactions, async () => ({
    customers: await db.customers.toArray(),
    loans: await db.loans.toArray(),
    transactions: await db.transactions.toArray(),
  }))
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
