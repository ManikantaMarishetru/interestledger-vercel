import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { computePortfolio, todayISO, type Customer, type Loan, type Portfolio, type Transaction } from '../engine'

export interface Data {
  customers: Customer[]
  loans: Loan[]
  transactions: Transaction[]
  customerById: Map<string, Customer>
  loanById: Map<string, Loan>
}

/** Live view of everything in the database. undefined while loading. */
export function useData(): Data | undefined {
  const raw = useLiveQuery(async () => {
    const [customers, loans, transactions] = await Promise.all([
      db.customers.toArray(),
      db.loans.toArray(),
      db.transactions.toArray(),
    ])
    return { customers, loans, transactions }
  })
  return useMemo(() => {
    if (!raw) return undefined
    return {
      ...raw,
      customerById: new Map(raw.customers.map((c) => [c.id, c])),
      loanById: new Map(raw.loans.map((l) => [l.id, l])),
    }
  }, [raw])
}

/** Today's date, refreshed when the device clock passes midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO())
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayISO()
      setToday((prev) => (prev === t ? prev : t))
    }, 30_000)
    const onVis = () => setToday(todayISO())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return today
}

export function usePortfolio(data: Data | undefined, asOf: string): Portfolio | undefined {
  return useMemo(() => (data ? computePortfolio(data.loans, data.transactions, asOf) : undefined), [data, asOf])
}

export function useMeta<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await db.meta.get(key))?.value as T | undefined, [key])
}
