import { ArrowRight, Check, HandCoins, Pencil, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { LedgerError, postCollection } from '../db/repo'
import {
  computeLoanState,
  dayOf,
  isValidISODate,
  suggestAllocation,
  validateCollection,
  type ErrorKey,
  type Loan,
} from '../engine'
import { useI18n } from '../i18n'
import {
  Avatar,
  BackButton,
  Button,
  Card,
  DatePicker,
  Empty,
  Field,
  MoneyInput,
  PageTitle,
  SearchBox,
  Sheet,
  TextInput,
  cx,
  moneyValue,
  paiseToInput,
  useErrorText,
} from '../ui/components'
import { useData, usePortfolio, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'
import { ruleHeadline } from '../ui/describe'
import { go, useRoute } from '../ui/router'

export function Collect({ loanId: initialLoan, customerId: initialCustomer }: { loanId?: string; customerId?: string }) {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const p = usePortfolio(data, today)
  const route = useRoute()
  const errorText = useErrorText()

  const [customerId, setCustomerId] = useState(initialCustomer)
  const [loanId, setLoanId] = useState(initialLoan)
  const qDate = route.query.get('date')
  const [date, setDate] = useState(qDate && isValidISODate(qDate) && qDate <= today ? qDate : today)
  const [amountText, setAmountText] = useState('')
  const [manual, setManual] = useState(false)
  const [interestText, setInterestText] = useState('')
  const [principalText, setPrincipalText] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<ErrorKey[]>([])

  const loan = loanId ? data?.loanById.get(loanId) : undefined
  const effectiveCustomerId = loan?.customerId ?? customerId
  const customer = effectiveCustomerId ? data?.customerById.get(effectiveCustomerId) : undefined

  const activeLoansOf = (cid: string): Loan[] =>
    (data?.loans ?? []).filter((l) => l.customerId === cid && p?.states.get(l.id)?.status === 'active')

  // ---- derived money figures ------------------------------------------------
  const calc = useMemo(() => {
    if (!data || !loan) return undefined
    const txs = data.transactions
    const before = computeLoanState(loan, txs, date)
    const amount = moneyValue(amountText)
    const manualPolicy = loan.terms.allocationPolicy === 'manual'
    const useManual = manual || manualPolicy
    let interest: number | null = null
    let principal: number | null = null
    if (amount !== null && amount > 0) {
      if (useManual) {
        interest = moneyValue(interestText) ?? (interestText.trim() === '' ? 0 : null)
        principal = moneyValue(principalText) ?? (principalText.trim() === '' ? 0 : null)
      } else {
        const s = suggestAllocation(before, amount)
        interest = s.interestPaise
        principal = s.principalPaise
      }
    }
    const check =
      amount !== null && interest !== null && principal !== null
        ? validateCollection(loan, txs, { date, amountPaise: amount, interestPaise: interest, principalPaise: principal }, today)
        : undefined
    return { before, amount, interest, principal, check, useManual, manualPolicy, dayCharge: dayOf(before, date)?.interestCharged ?? 0 }
  }, [data, loan, date, amountText, manual, interestText, principalText, today])

  if (!data || !p) return null

  // ---- step 1: who paid? ----------------------------------------------------
  if (!loan) {
    if (customer) {
      const loans = activeLoansOf(customer.id)
      if (loans.length === 1) {
        setLoanId(loans[0].id)
        return null
      }
      return (
        <>
          <BackButton />
          <PageTitle title={customer.name} sub={t('collect.pick_loan')} />
          {loans.length === 0 ? (
            <Empty icon={<HandCoins size={28} />} title={t('collect.no_active_loans')} />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {loans.map((l) => {
                const s = p.states.get(l.id)!
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setLoanId(l.id)}
                      className="flex w-full items-center gap-3 rounded-3xl border border-line bg-surface p-4 text-left hover:bg-sunk"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-bold text-ink">
                          {l.code} · {money(s.originalPrincipal)}
                        </div>
                        <div className="text-base text-ink2">{ruleHeadline(l.terms, t)}</div>
                        <div className="num text-sm font-medium text-due">{t('today.row_unpaid', { amount: money(s.interestOutstanding) })}</div>
                      </div>
                      <ArrowRight className="text-ink3" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )
    }

    const q = search.trim().toLowerCase()
    const people = data.customers
      .filter((c) => activeLoansOf(c.id).length > 0)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.code.toLowerCase().includes(q))
      .map((c) => ({ c, status: p.customerDayStatus.get(c.id) }))
      .sort((a, b) => {
        const rank = (s?: string) => (s === 'pending' ? 0 : s === 'partial' ? 1 : s === 'collected' ? 3 : 2)
        return rank(a.status) - rank(b.status) || a.c.name.localeCompare(b.c.name)
      })
    return (
      <>
        <BackButton />
        <PageTitle title={t('collect.title')} sub={t('collect.who_paid')} />
        <div className="mb-3">
          <SearchBox value={search} onChange={setSearch} placeholder={t('customers.search')} />
        </div>
        {people.length === 0 ? (
          <Empty
            icon={<Users size={28} />}
            title={q ? t('customers.none_found') : t('collect.no_active_loans')}
            action={!q && <Button variant="primary" onClick={() => go('/customers')}>{t('nav.customers')}</Button>}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {people.map(({ c }) => {
              const due = activeLoansOf(c.id).reduce((a, l) => a + (p.states.get(l.id)?.interestOutstanding ?? 0), 0)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setCustomerId(c.id)}
                    className="flex w-full items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 text-left hover:bg-sunk active:scale-[0.99]"
                  >
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold text-ink">{c.name}</div>
                      <div className="num text-base text-ink2">{t('today.row_unpaid', { amount: money(due) })}</div>
                    </div>
                    <ArrowRight className="text-ink3" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </>
    )
  }

  if (!calc || !customer) return null
  const { before, amount, interest, principal, check, useManual, manualPolicy, dayCharge } = calc
  const ready = !!check && check.errors.length === 0 && amount !== null && amount > 0
  const after = check?.after
  const liveErrors = amountText.trim() && amount === null ? (['err.amount_invalid'] as ErrorKey[]) : (check?.errors ?? [])

  const quick: { label: string; paise: number }[] = []
  if (dayCharge > 0) quick.push({ label: t('collect.quick_today', { amount: money(dayCharge) }), paise: dayCharge })
  if (before.interestOutstanding > 0 && before.interestOutstanding !== dayCharge)
    quick.push({ label: t('collect.quick_all_interest', { amount: money(before.interestOutstanding) }), paise: before.interestOutstanding })

  const setAmountPaise = (pz: number) => setAmountText(paiseToInput(pz))

  async function save() {
    if (!ready || amount === null || interest === null || principal === null || saving) return
    setSaving(true)
    setSaveErrors([])
    try {
      const tx = await postCollection(loan!.id, { date, amountPaise: amount, interestPaise: interest, principalPaise: principal }, note, requestId, today)
      go(`/receipt/${tx.id}?new=1`, { replace: true })
    } catch (e) {
      if (e instanceof LedgerError && e.keys.includes('err.duplicate')) {
        const existing = await db.transactions.where('requestId').equals(requestId).first()
        if (existing) return go(`/receipt/${existing.id}?new=1`, { replace: true })
      }
      setSaveErrors(e instanceof LedgerError ? e.keys : ['err.unknown'])
      setSaving(false)
      setConfirm(false)
    }
  }

  return (
    <>
      <BackButton />
      <PageTitle title={t('collect.title')} />

      {/* Who */}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold text-ink">{customer.name}</div>
            <div className="text-base text-ink2">
              {loan.code} · {ruleHeadline(loan.terms, t)}
            </div>
          </div>
          {!initialLoan && (
            <button
              type="button"
              onClick={() => {
                setLoanId(undefined)
                setCustomerId(undefined)
              }}
              className="min-h-11 shrink-0 rounded-xl px-3 text-base font-semibold text-brand hover:bg-brand-soft"
            >
              {t('common.change')}
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-due-soft px-3.5 py-2.5">
            <div className="text-sm font-medium text-due">{t('fig.interest_pending')}</div>
            <div className="num text-xl font-bold text-due">{money(before.interestOutstanding)}</div>
          </div>
          <div className="rounded-2xl bg-sunk px-3.5 py-2.5">
            <div className="text-sm font-medium text-ink2">{t('fig.principal_outstanding')}</div>
            <div className="num text-xl font-bold text-ink">{money(before.principalOutstanding)}</div>
          </div>
        </div>
        {date !== today && <p className="mt-2 text-sm text-ink3">{t('collect.as_of', { date: fmtDate(date, lang) })}</p>}
      </Card>

      <div className="flex flex-col gap-5">
        <Field label={t('collect.how_much')} htmlFor="amount" error={amountText.trim() ? errorText(liveErrors) || undefined : undefined}>
          <MoneyInput id="amount" big value={amountText} onChange={setAmountText} autoFocus invalid={!!amountText.trim() && liveErrors.length > 0} />
          {quick.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setAmountPaise(q.paise)}
                  className="num min-h-12 rounded-2xl border-2 border-brand/30 bg-brand-soft px-4 text-base font-semibold text-brand active:scale-[0.98]"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label={t('collect.date')} htmlFor="cdate">
          <DatePicker id="cdate" value={date} onChange={setDate} today={today} min={loan.startDate} />
        </Field>

        {/* Split */}
        <div className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-ink">{t('collect.split_title')}</div>
              <div className="text-sm text-ink2">{t(manualPolicy ? 'rule.alloc_manual' : 'rule.alloc_interest_first')}</div>
            </div>
            {!manualPolicy && (
              <button
                type="button"
                onClick={() => {
                  if (!manual && interest !== null && principal !== null) {
                    setInterestText(paiseToInput(interest))
                    setPrincipalText(paiseToInput(principal))
                  }
                  setManual(!manual)
                }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-base font-semibold text-brand hover:bg-brand-soft"
              >
                <Pencil size={16} aria-hidden />
                {manual ? t('collect.split_auto') : t('collect.split_change')}
              </button>
            )}
          </div>
          {useManual ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t('collect.to_interest')} htmlFor="si">
                <MoneyInput id="si" value={interestText} onChange={setInterestText} />
              </Field>
              <Field label={t('collect.to_principal')} htmlFor="sp">
                <MoneyInput id="sp" value={principalText} onChange={setPrincipalText} />
              </Field>
              {amount !== null && amount > 0 && (
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="button" className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-ink2" onClick={() => { setInterestText(amountText); setPrincipalText('') }}>
                    {t('collect.all_interest')}
                  </button>
                  <button type="button" className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-ink2" onClick={() => { setPrincipalText(amountText); setInterestText('') }}>
                    {t('collect.all_principal')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <SplitBox label={t('collect.to_interest')} value={interest} />
              <SplitBox label={t('collect.to_principal')} value={principal} />
            </div>
          )}
        </div>

        <Field label={t('collect.note')} htmlFor="note" hint={t('common.optional')}>
          <TextInput id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>

        {/* Preview */}
        {ready && after && (
          <div className="rounded-3xl border-2 border-brand/25 bg-brand-soft/50 p-4">
            <div className="mb-2 text-base font-bold text-ink">{t('collect.after_title')}</div>
            <Change label={t('fig.interest_pending')} from={before.interestOutstanding} to={after.interestOutstanding} />
            <Change label={t('fig.principal_outstanding')} from={before.principalOutstanding} to={after.principalOutstanding} />
            <Change label={t('fig.total_outstanding')} from={before.totalOutstanding} to={after.totalOutstanding} strong />
          </div>
        )}

        {saveErrors.length > 0 && (
          <p role="alert" className="rounded-2xl bg-due-soft p-3 text-base font-medium text-due">
            {errorText(saveErrors)}
          </p>
        )}

        <Button variant="primary" size="xl" block disabled={!ready} onClick={() => setConfirm(true)} icon={<Check size={26} />}>
          {t('collect.save')}
        </Button>
        <p className="-mt-2 text-center text-sm text-ink3">{t('collect.cash_only')}</p>
      </div>

      <Sheet
        open={confirm}
        onClose={() => !saving && setConfirm(false)}
        title={t('collect.confirm_title')}
        footer={
          <div className="grid gap-2">
            <Button variant="primary" size="xl" block disabled={saving} onClick={save} icon={<Check size={26} />}>
              {saving ? t('common.saving') : t('collect.confirm_yes')}
            </Button>
            <Button size="lg" block disabled={saving} onClick={() => setConfirm(false)}>
              {t('collect.confirm_no')}
            </Button>
          </div>
        }
      >
        {amount !== null && interest !== null && principal !== null && (
          <div className="text-center">
            <div className="num text-5xl font-bold tracking-tight text-brand">{money(amount)}</div>
            <div className="mt-1 text-lg font-semibold text-ink">{t('collect.confirm_cash_from', { name: customer.name })}</div>
            <div className="text-base text-ink2">{fmtDate(date, lang)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-left">
              <SplitBox label={t('collect.to_interest')} value={interest} />
              <SplitBox label={t('collect.to_principal')} value={principal} />
            </div>
            {after && (
              <p className="num mt-4 text-base text-ink2">
                {t('collect.confirm_left', { amount: money(after.totalOutstanding) })}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

function SplitBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl bg-sunk px-3.5 py-2.5">
      <div className="text-sm font-medium text-ink2">{label}</div>
      <div className="num text-xl font-bold text-ink">{value === null ? '—' : money(value)}</div>
    </div>
  )
}

function Change({ label, from, to, strong }: { label: string; from: number; to: number; strong?: boolean }) {
  return (
    <div className={cx('num flex items-center justify-between gap-3 py-1.5', strong && 'border-t border-line pt-2.5')}>
      <span className={cx('text-base', strong ? 'font-bold text-ink' : 'text-ink2')}>{label}</span>
      <span className="flex items-center gap-2 text-base">
        <span className="text-ink3 line-through">{money(from)}</span>
        <ArrowRight size={16} className="text-ink3" aria-hidden />
        <span className={cx('font-bold', strong ? 'text-lg text-brand' : 'text-ink')}>{money(to)}</span>
      </span>
    </div>
  )
}
