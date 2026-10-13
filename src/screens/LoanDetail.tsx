import { ChevronDown, FileText, Gift, HandCoins, Pencil, PlusCircle, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { LedgerError, postIncrease, postReversal, postWaiver, updateLoanNotes } from '../db/repo'
import { computeLoanState, sortTransactions, type DayRow, type ErrorKey, type Loan, type Transaction } from '../engine'
import { useI18n } from '../i18n'
import {
  BackButton,
  Badge,
  Button,
  Card,
  Choice,
  DatePicker,
  Empty,
  Field,
  Figure,
  MoneyInput,
  Sheet,
  StatusChip,
  TextArea,
  TextInput,
  cx,
  moneyValue,
  useErrorText,
  useToast,
} from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, dateShort, money } from '../ui/format'
import { explainLine, nextCollectionDate, ruleDetails, ruleHeadline, txTypeKey } from '../ui/describe'
import { go } from '../ui/router'
import { TxRow } from './shared'

type Tab = 'days' | 'entries'
type Action = null | 'reverse' | 'increase' | 'waive' | 'edit'

export function LoanDetail({ id }: { id: string }) {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const [tab, setTab] = useState<Tab>('days')
  const [showRule, setShowRule] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(30)
  const [action, setAction] = useState<Action>(null)
  const [reverseTx, setReverseTx] = useState<Transaction | null>(null)
  if (!data) return null
  const loan = data.loanById.get(id)
  if (!loan) return <Empty icon={<ScrollText size={28} />} title={t('loan.not_found')} />
  const customer = data.customerById.get(loan.customerId)
  const s = computeLoanState(loan, data.transactions, today)
  const txs = sortTransactions(data.transactions.filter((x) => x.loanId === id)).reverse()
  const days = [...s.days].reverse()
  const next = s.status === 'active' ? nextCollectionDate(loan.terms, today) : undefined
  const txById = new Map(txs.map((x) => [x.id, x]))

  return (
    <>
      <BackButton fallback={`/customers/${loan.customerId}`} />
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={`#/customers/${loan.customerId}`} className="text-2xl leading-tight font-bold break-words text-ink hover:underline">
              {customer?.name}
            </a>
            <div className="text-base text-ink3">
              {t('loan.loan')} {loan.code} · {t('loan.started', { date: fmtDate(loan.startDate, lang) })}
            </div>
          </div>
          <Badge tone={s.status === 'active' ? 'brand' : s.status === 'closed' ? 'paid' : 'none'}>
            {t(s.status === 'active' ? 'loan.status_active' : s.status === 'closed' ? 'loan.status_closed' : 'loan.status_cancelled')}
          </Badge>
        </div>

        <button
          type="button"
          onClick={() => setShowRule(!showRule)}
          aria-expanded={showRule}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium text-brand">{t('loan.rule')}</span>
            <span className="block text-lg font-bold text-ink">{ruleHeadline(loan.terms, t)}</span>
          </span>
          <ChevronDown className={cx('shrink-0 text-brand transition', showRule && 'rotate-180')} aria-hidden />
        </button>
        {showRule && (
          <ul className="anim-fade mt-2 flex flex-col gap-1 rounded-2xl bg-sunk p-3.5 text-base text-ink">
            {ruleDetails(loan.terms, t, lang).map((l) => (
              <li key={l}>• {l}</li>
            ))}
            <li className="pt-1 text-sm text-ink3">{t('loan.terms_locked')}</li>
          </ul>
        )}

        <div className="mt-4 rounded-2xl border-2 border-ink/10 px-4 py-3">
          <div className="text-base font-semibold text-ink2">{t('fig.total_outstanding')}</div>
          <div className="num text-4xl font-bold tracking-tight text-ink">{money(s.totalOutstanding)}</div>
          {s.interestCredit > 0 && <div className="num text-sm font-semibold text-part">{t('loan.credit', { amount: money(s.interestCredit) })}</div>}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Figure label={t('fig.interest_pending')} value={money(s.interestOutstanding)} tone="due" />
          <Figure label={t('fig.principal_outstanding')} value={money(s.principalOutstanding)} />
          <Figure label={t('fig.interest_accrued')} value={money(s.interestAccrued)} hint={t('fig.interest_accrued_hint')} />
          <Figure label={t('fig.interest_received')} value={money(s.interestReceived)} tone="paid" hint={t('fig.interest_received_hint')} />
          <Figure label={t('fig.original_principal')} value={money(s.originalPrincipal)} hint={s.principalGiven !== s.originalPrincipal ? t('loan.total_given', { amount: money(s.principalGiven) }) : undefined} />
          <Figure label={t('fig.principal_repaid')} value={money(s.principalRepaid)} />
          {s.interestWaived + s.principalWaived > 0 && (
            <Figure label={t('fig.waived')} value={money(s.interestWaived + s.principalWaived)} />
          )}
        </div>

        {(next || loan.dueDate) && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base text-ink2">
            {next && <span>{t('loan.next_collection', { date: dateShort(next, lang) })}</span>}
            {loan.dueDate && <span>{t('loan.due_on', { date: fmtDate(loan.dueDate, lang) })}</span>}
          </div>
        )}
        {loan.notes && <p className="mt-2 text-base whitespace-pre-wrap text-ink2">{loan.notes}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {s.status === 'active' && (
            <Button variant="primary" size="lg" className="col-span-2" icon={<HandCoins size={22} />} onClick={() => go(`/collect?loan=${loan.id}`)}>
              {t('action.money_received')}
            </Button>
          )}
          {s.status !== 'cancelled' && (
            <Button icon={<PlusCircle size={20} />} onClick={() => setAction('increase')}>
              {t('loan.give_more')}
            </Button>
          )}
          {s.status === 'active' && (
            <Button icon={<Gift size={20} />} onClick={() => setAction('waive')}>
              {t('loan.waive')}
            </Button>
          )}
          <Button icon={<FileText size={20} />} onClick={() => go(`/loans/${loan.id}/statement`)}>
            {t('loan.statement')}
          </Button>
          <Button icon={<Pencil size={18} />} onClick={() => setAction('edit')}>
            {t('loan.edit_notes')}
          </Button>
        </div>
      </Card>

      {/* History */}
      <div className="mt-6 mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-sunk p-1" role="tablist">
        {(['days', 'entries'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx('min-h-12 rounded-xl text-base font-semibold', tab === k ? 'bg-surface text-ink shadow-sm' : 'text-ink2')}
          >
            {k === 'days' ? t('loan.tab_days') : t('loan.tab_entries', { count: txs.length })}
          </button>
        ))}
      </div>

      {tab === 'days' ? (
        <>
          <p className="mb-2 px-1 text-sm text-ink3">{t('loan.days_hint')}</p>
          <ul className="flex flex-col gap-2">
            {days.slice(0, limit).map((d) => (
              <DayItem key={d.date} d={d} loan={loan} original={s.originalPrincipal} open={open === d.date} onToggle={() => setOpen(open === d.date ? null : d.date)} txById={txById} />
            ))}
          </ul>
          {days.length > limit && (
            <Button block className="mt-3" onClick={() => setLimit(limit + 60)}>
              {t('common.show_more')}
            </Button>
          )}
        </>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {txs.map((x) => (
            <TxRow key={x.id} tx={x} allTxs={data.transactions} onReverse={(tx) => { setReverseTx(tx); setAction('reverse') }} />
          ))}
        </ul>
      )}

      <ReverseSheet tx={action === 'reverse' ? reverseTx : null} onClose={() => setAction(null)} today={today} />
      <IncreaseSheet open={action === 'increase'} loan={loan} onClose={() => setAction(null)} today={today} />
      <WaiveSheet open={action === 'waive'} loan={loan} onClose={() => setAction(null)} today={today} />
      <EditSheet open={action === 'edit'} loan={loan} onClose={() => setAction(null)} />
    </>
  )
}

function DayItem({
  d,
  loan,
  original,
  open,
  onToggle,
  txById,
}: {
  d: DayRow
  loan: Loan
  original: number
  open: boolean
  onToggle: () => void
  txById: Map<string, Transaction>
}) {
  const { t, lang } = useI18n()
  const got = d.interestReceived + d.principalReceived
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <div className="w-24 shrink-0">
          <div className="text-base font-bold text-ink">{dateShort(d.date, lang)}</div>
        </div>
        <div className="num min-w-0 flex-1 text-sm leading-snug">
          {d.interestCharged > 0 && <div className="text-ink2">{t('day.charged', { amount: money(d.interestCharged) })}</div>}
          {got > 0 && <div className="font-semibold text-paid">{t('day.got', { amount: money(got) })}</div>}
          {d.principalGiven > 0 && <div className="text-ink2">{t('day.given', { amount: money(d.principalGiven) })}</div>}
        </div>
        <StatusChip status={d.status} />
      </button>
      {open && (
        <div className="anim-fade border-t border-line px-3.5 py-3 text-base">
          <p className="text-ink">{explainLine(loan.terms, d, original, t)}</p>
          <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink2">{t('fig.interest_charged')}</dt>
            <dd className="text-right font-semibold text-ink">{money(d.interestCharged)}</dd>
            <dt className="text-ink2">{t('fig.interest_received')}</dt>
            <dd className="text-right font-semibold text-paid">{money(d.interestReceived)}</dd>
            <dt className="text-ink2">{t('fig.principal_received')}</dt>
            <dd className="text-right font-semibold text-ink">{money(d.principalReceived)}</dd>
            <dt className="text-ink2">{t('day.unpaid_after')}</dt>
            <dd className="text-right font-semibold text-due">{money(Math.max(d.interestBalanceAfter, 0))}</dd>
            <dt className="text-ink2">{t('day.principal_after')}</dt>
            <dd className="text-right font-semibold text-ink">{money(d.principalAfter)}</dd>
          </dl>
          {d.txIds.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink2">
              {d.txIds.map((id) => {
                const x = txById.get(id)
                return x ? (
                  <li key={id}>
                    <a href={`#/receipt/${id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                      {x.code}
                    </a>{' '}
                    · {t(txTypeKey[x.type])} · {money(x.amountPaise)} {x.type === 'collection' && `· ${t('common.cash')}`}
                    {x.notes && ` · “${x.notes}”`}
                  </li>
                ) : null
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function useSubmit() {
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ErrorKey[]>([])
  const run = async (f: () => Promise<unknown>, done: () => void) => {
    if (saving) return
    setSaving(true)
    setErrors([])
    try {
      await f()
      done()
    } catch (e) {
      setErrors(e instanceof LedgerError ? e.keys : ['err.unknown'])
    } finally {
      setSaving(false)
    }
  }
  return { saving, errors, run, reset: () => setErrors([]) }
}

function ErrorBox({ errors }: { errors: ErrorKey[] }) {
  const errorText = useErrorText()
  return errors.length ? (
    <p role="alert" className="rounded-2xl bg-due-soft p-3 text-base font-medium text-due">
      {errorText(errors)}
    </p>
  ) : null
}

function ReverseSheet({ tx, onClose, today }: { tx: Transaction | null; onClose: () => void; today: string }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { saving, errors, run } = useSubmit()
  const close = () => {
    setReason('')
    setRequestId(crypto.randomUUID())
    onClose()
  }
  return (
    <Sheet
      open={!!tx}
      onClose={close}
      title={t('reverse.title')}
      footer={
        <div className="grid gap-2">
          <Button variant="danger" size="lg" block disabled={saving || !reason.trim()} onClick={() => tx && run(() => postReversal(tx.id, reason, requestId, today), () => { toast(t('reverse.done')); close() })}>
            {t('reverse.confirm')}
          </Button>
          <Button size="lg" block onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      }
    >
      {tx && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-sunk p-3.5">
            <div className="text-base font-bold text-ink">
              {t(txTypeKey[tx.type])} · {money(tx.amountPaise)}
            </div>
            <div className="num text-sm text-ink2">
              {tx.code} · {fmtDate(tx.date, lang)}
            </div>
          </div>
          <p className="text-base text-ink2">{t('reverse.explain')}</p>
          <Field label={t('reverse.reason')} htmlFor="rr">
            <TextInput id="rr" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
          </Field>
          <ErrorBox errors={errors} />
        </div>
      )}
    </Sheet>
  )
}

function IncreaseSheet({ open, loan, onClose, today }: { open: boolean; loan: Loan; onClose: () => void; today: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { saving, errors, run } = useSubmit()
  const close = () => {
    setAmount('')
    setNote('')
    setRequestId(crypto.randomUUID())
    onClose()
  }
  const paise = moneyValue(amount)
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('loan.give_more')}
      footer={
        <Button variant="primary" size="lg" block disabled={saving || !paise} onClick={() => run(() => postIncrease(loan.id, { date, amountPaise: paise ?? 0 }, note, requestId, today), () => { toast(t('loan.saved_more')); close() })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink2">{t('loan.give_more_explain')}</p>
        <Field label={t('loan.how_much')} htmlFor="ia">
          <MoneyInput id="ia" big value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label={t('collect.date')}>
          <DatePicker value={date} onChange={setDate} today={today} min={loan.startDate} />
        </Field>
        <Field label={t('collect.note')} hint={t('common.optional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <ErrorBox errors={errors} />
      </div>
    </Sheet>
  )
}

function WaiveSheet({ open, loan, onClose, today }: { open: boolean; loan: Loan; onClose: () => void; today: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const [kind, setKind] = useState<'interest' | 'principal'>('interest')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [reason, setReason] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const { saving, errors, run } = useSubmit()
  const close = () => {
    setAmount('')
    setReason('')
    setRequestId(crypto.randomUUID())
    onClose()
  }
  const paise = moneyValue(amount)
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('loan.waive')}
      footer={
        <Button variant="primary" size="lg" block disabled={saving || !paise || !reason.trim()} onClick={() => run(() => postWaiver(loan.id, { date, amountPaise: paise ?? 0, kind }, reason, requestId, today), () => { toast(t('waive.done')); close() })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink2">{t('waive.explain')}</p>
        <Choice
          value={kind}
          onChange={setKind}
          options={[
            { value: 'interest', label: t('waive.interest') },
            { value: 'principal', label: t('waive.principal') },
          ]}
        />
        <Field label={t('waive.amount')} htmlFor="wa">
          <MoneyInput id="wa" value={amount} onChange={setAmount} />
        </Field>
        <Field label={t('collect.date')}>
          <DatePicker value={date} onChange={setDate} today={today} min={loan.startDate} />
        </Field>
        <Field label={t('reverse.reason')} htmlFor="wr">
          <TextInput id="wr" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
        <ErrorBox errors={errors} />
      </div>
    </Sheet>
  )
}

function EditSheet({ open, loan, onClose }: { open: boolean; loan: Loan; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [notes, setNotes] = useState<string | null>(null)
  const [due, setDue] = useState<string | null>(null)
  const { saving, errors, run } = useSubmit()
  const close = () => {
    setNotes(null)
    setDue(null)
    onClose()
  }
  const v = { notes: notes ?? loan.notes, due: due ?? loan.dueDate ?? '' }
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('loan.edit_notes')}
      footer={
        <Button variant="primary" size="lg" block disabled={saving} onClick={() => run(() => updateLoanNotes(loan.id, v.notes, v.due || undefined), () => { toast(t('common.saved')); close() })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink2">{t('loan.terms_locked')}</p>
        <Field label={t('loan.due_date')} hint={t('common.optional')}>
          <input type="date" value={v.due} min={loan.startDate} onChange={(e) => setDue(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
        </Field>
        <Field label={t('customers.notes')}>
          <TextArea value={v.notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <ErrorBox errors={errors} />
      </div>
    </Sheet>
  )
}
