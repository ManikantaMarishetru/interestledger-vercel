import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { kn } from '../src/i18n/kn'
import { translate } from '../src/i18n'
import { computeLoanState, type Loan, type Transaction } from '../src/engine'
import { R, collect, disburse, loan } from './helpers'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(f) ? [p] : []
  })
}

describe('translations', () => {
  it('Kannada has every English key, nothing extra, nothing empty', () => {
    expect(Object.keys(kn).sort()).toEqual(Object.keys(en).sort())
    for (const [k, v] of Object.entries(kn)) expect(v.trim(), k).not.toBe('')
  })

  it('placeholders match in both languages', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(placeholders(kn[k]), k).toEqual(placeholders(en[k]))
  })

  it('Kannada text is really Kannada script', () => {
    const skip = new Set(['app.name', 'explain.fixed_proportional'])
    for (const [k, v] of Object.entries(kn)) {
      if (skip.has(k)) continue
      expect(/[ಀ-೿]/.test(v), `${k}: ${v}`).toBe(true)
    }
  })

  it('every key used in the source exists', () => {
    const used = new Set<string>()
    for (const f of sourceFiles(join(__dirname, '..', 'src'))) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/['`]((?:nav|action|common|status|fig|home|today|period|customers|loan|method|daycount|basis|alloc|round|rule|collect|receipt|tx|split|day|explain|reason|reverse|waive|collections|reports|statement|settings|backup|err)\.[a-z0-9_]+)['`]/g))
        used.add(m[1])
    }
    // keys built at runtime
    for (const p of ['not_json', 'not_backup', 'newer_version', 'bad_customer', 'bad_loan', 'bad_transaction', 'bad_audit', 'duplicate_id', 'count_mismatch', 'ledger_inconsistent'])
      used.add(`backup.problem_${p}`)
    const missing = [...used].filter((k) => !(k in en) && !k.startsWith('err.name') && !k.startsWith('err.phone') && k !== 'err.' )
    expect(missing).toEqual([])
  })

  it('every engine error key has text', async () => {
    const src = sourceFiles(join(__dirname, '..', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')
    const errs = new Set([...src.matchAll(/'(err\.[a-z_]+)'/g)].map((m) => m[1]))
    for (const e of errs) if (e !== 'err.name' && e !== 'err.phone') expect(e in en, e).toBe(true) // those two are prefixes
  })

  it('fills placeholders', () => {
    expect(translate('kn', 'home.today_left', { amount: '₹100' })).toBe('ಇಂದು ಇನ್ನೂ ₹100 ಬರಬೇಕು')
    expect(translate('en', 'home.today_left', { amount: '₹100' })).toBe('₹100 still to collect today')
  })
})

describe('switching language never touches financial data', () => {
  it('identical balances, names and IDs before and after rendering text in both languages', () => {
    const l: Loan = { ...loan('2026-01-01'), notes: 'ರಮೇಶ್ ಅಂಗಡಿ' }
    const txs: Transaction[] = [disburse('2026-01-01', R(50_000)), collect('2026-01-05', R(300), 0)]
    const snapshot = JSON.stringify({ l, txs })
    const before = computeLoanState(l, txs, '2026-01-05')
    for (const lang of ['en', 'kn', 'en'] as const) {
      translate(lang, 'fig.interest_pending')
      translate(lang, 'rule.fixed', { amount: '₹100' })
    }
    const after = computeLoanState(l, txs, '2026-01-05')
    expect(after).toEqual(before)
    expect(JSON.stringify({ l, txs })).toBe(snapshot)
  })
})
