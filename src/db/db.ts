import Dexie, { type EntityTable } from 'dexie'
import type { Customer, Loan, Transaction } from '../engine'

/** A non-financial change worth remembering (customer edits, notes, restores). */
export interface AuditEvent {
  id: string
  at: string
  entity: 'customer' | 'loan' | 'transaction' | 'data'
  entityId: string
  action: 'create' | 'update' | 'post' | 'reverse' | 'restore'
  /** Field names that changed, with old and new values. */
  changes?: Record<string, { from: unknown; to: unknown }>
}

export interface Meta {
  key: string
  value: unknown
}

export class LedgerDB extends Dexie {
  customers!: EntityTable<Customer, 'id'>
  loans!: EntityTable<Loan, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  audit!: EntityTable<AuditEvent, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'interest-ledger') {
    super(name)
    this.version(1).stores({
      customers: 'id, &code, name',
      loans: 'id, &code, customerId, startDate',
      // &requestId: the database itself refuses a second post of the same action
      transactions: 'id, &code, loanId, date, type, &requestId, reversesId',
      audit: 'id, at, entity, entityId',
      meta: 'key',
    })
  }
}

export let db = new LedgerDB()

/** Tests use a fresh database per run. */
export function setDatabase(next: LedgerDB): void {
  db = next
}
