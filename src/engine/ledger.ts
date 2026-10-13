import type { Transaction } from './types'

/** Stable order: by money date, then by entry time, then id. */
export function sortTransactions(txs: readonly Transaction[]): Transaction[] {
  return [...txs].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

/** IDs of transactions that have been cancelled by a reversal. */
export function reversedIds(txs: readonly Transaction[]): Set<string> {
  const s = new Set<string>()
  for (const t of txs) if (t.type === 'reversal' && t.reversesId) s.add(t.reversesId)
  return s
}

/**
 * The transactions that count towards balances: everything except reversal
 * entries and the entries they cancel. A reversal cancels the original as if
 * it never happened (on the original's date), while both stay in history.
 */
export function effectiveTransactions(txs: readonly Transaction[]): Transaction[] {
  const rev = reversedIds(txs)
  return sortTransactions(txs.filter((t) => t.type !== 'reversal' && !rev.has(t.id)))
}

export function isDuplicateRequest(txs: readonly Transaction[], requestId: string): boolean {
  return txs.some((t) => t.requestId === requestId)
}

/** Signed change to principal outstanding. */
export function principalDelta(t: Transaction): number {
  switch (t.type) {
    case 'disbursement':
    case 'principal_increase':
      return t.principalPaise
    case 'collection':
    case 'principal_waiver':
      return -t.principalPaise
    default:
      return 0
  }
}
