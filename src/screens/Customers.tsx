import { ChevronRight, HandCoins, Pencil, Phone, Plus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { LedgerError, addCustomer, updateCustomer } from '../db/repo'
import type { ErrorKey } from '../engine'
import { useI18n } from '../i18n'
import {
  Avatar,
  BackButton,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  PageTitle,
  SearchBox,
  SectionTitle,
  StatusChip,
  TextArea,
  TextInput,
  useErrorText,
  useToast,
} from '../ui/components'
import { useData, usePortfolio, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'
import { ruleHeadline } from '../ui/describe'
import { go } from '../ui/router'

export function Customers() {
  const { t } = useI18n()
  const today = useToday()
  const data = useData()
  const p = usePortfolio(data, today)
  const [q, setQ] = useState('')
  if (!data || !p) return null

  const query = q.trim().toLowerCase()
  const list = data.customers
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.phone.replace(/\s/g, '').includes(query.replace(/\s/g, '')) || c.code.toLowerCase().includes(query))
    .map((c) => {
      const loans = data.loans.filter((l) => l.customerId === c.id)
      const states = loans.map((l) => p.states.get(l.id)).filter((s) => s && s.status !== 'cancelled')
      return {
        c,
        active: states.filter((s) => s!.status === 'active').length,
        due: states.reduce((a, s) => a + s!.totalOutstanding, 0),
        interestDue: states.reduce((a, s) => a + s!.interestOutstanding, 0),
      }
    })
    .sort((a, b) => b.active - a.active || a.c.name.localeCompare(b.c.name))

  return (
    <>
      <PageTitle
        title={t('nav.customers')}
        sub={t('customers.count', { count: data.customers.length })}
        right={
          <Button variant="primary" icon={<UserPlus size={20} />} onClick={() => go('/customers/new')}>
            <span className="max-sm:sr-only">{t('customers.add_short')}</span>
          </Button>
        }
      />
      {data.customers.length > 0 && (
        <div className="mb-3">
          <SearchBox value={q} onChange={setQ} placeholder={t('customers.search')} />
        </div>
      )}
      {data.customers.length === 0 ? (
        <Empty
          icon={<Users size={28} />}
          title={t('customers.empty_title')}
          body={t('customers.empty_body')}
          action={
            <Button variant="primary" size="lg" icon={<UserPlus size={22} />} onClick={() => go('/customers/new')}>
              {t('customers.add')}
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <Empty icon={<Users size={28} />} title={t('customers.none_found')} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.map(({ c, active, due, interestDue }) => (
            <li key={c.id}>
              <a href={`#/customers/${c.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 hover:bg-sunk">
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold text-ink">{c.name}</div>
                  <div className="num text-base text-ink2">
                    {active > 0 ? t('customers.total_due', { amount: money(due) }) : t('customers.no_active')}
                  </div>
                  {interestDue > 0 && <div className="num text-sm font-medium text-due">{t('today.row_unpaid', { amount: money(interestDue) })}</div>}
                </div>
                {p.customerDayStatus.get(c.id) && p.customerDayStatus.get(c.id) !== 'no_charge' && (
                  <StatusChip status={p.customerDayStatus.get(c.id)!} className="max-sm:hidden" />
                )}
                <ChevronRight className="shrink-0 text-ink3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function CustomerDetail({ id }: { id: string }) {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const p = usePortfolio(data, today)
  if (!data || !p) return null
  const c = data.customerById.get(id)
  if (!c) return <Empty icon={<Users size={28} />} title={t('customers.not_found')} />
  const loans = data.loans
    .filter((l) => l.customerId === id)
    .map((l) => ({ l, s: p.states.get(l.id) }))
    .sort((a, b) => (a.s?.status === 'active' ? 0 : 1) - (b.s?.status === 'active' ? 0 : 1) || b.l.startDate.localeCompare(a.l.startDate))
  const hasActive = loans.some((x) => x.s?.status === 'active')

  return (
    <>
      <BackButton fallback="/customers" />
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={c.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-bold break-words text-ink">{c.name}</h1>
            <div className="text-base text-ink3">{c.code}</div>
          </div>
        </div>
        {c.phone && (
          <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-sunk px-4 text-lg font-semibold text-ink">
            <Phone size={20} aria-hidden />
            <span className="num">{c.phone}</span>
          </a>
        )}
        {c.notes && <p className="mt-3 text-base whitespace-pre-wrap text-ink2">{c.notes}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {hasActive && (
            <Button variant="primary" size="lg" icon={<HandCoins size={22} />} onClick={() => go(`/collect?customer=${c.id}`)} className="col-span-2">
              {t('action.money_received')}
            </Button>
          )}
          <Button icon={<Plus size={20} />} onClick={() => go(`/loans/new?customer=${c.id}`)}>
            {t('loan.give_new')}
          </Button>
          <Button icon={<Pencil size={18} />} onClick={() => go(`/customers/${c.id}/edit`)}>
            {t('common.edit')}
          </Button>
        </div>
      </Card>

      <SectionTitle>{t('customers.loans')}</SectionTitle>
      {loans.length === 0 ? (
        <Empty
          icon={<HandCoins size={28} />}
          title={t('customers.no_loans')}
          action={
            <Button variant="primary" icon={<Plus size={20} />} onClick={() => go(`/loans/new?customer=${c.id}`)}>
              {t('loan.give_new')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {loans.map(({ l, s }) => (
            <li key={l.id}>
              <a href={`#/loans/${l.id}`} className="block rounded-3xl border border-line bg-surface p-4 hover:bg-sunk">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="num text-lg font-bold text-ink">
                      {money(s?.originalPrincipal ?? 0)} <span className="text-base font-normal text-ink3">· {l.code}</span>
                    </div>
                    <div className="text-base text-ink2">{ruleHeadline(l.terms, t)}</div>
                    <div className="text-sm text-ink3">{t('loan.started', { date: fmtDate(l.startDate, lang) })}</div>
                  </div>
                  {s && (
                    <Badge tone={s.status === 'active' ? 'brand' : s.status === 'closed' ? 'paid' : 'none'}>
                      {t(s.status === 'active' ? 'loan.status_active' : s.status === 'closed' ? 'loan.status_closed' : 'loan.status_cancelled')}
                    </Badge>
                  )}
                </div>
                {s && s.status === 'active' && (
                  <div className="num mt-3 grid grid-cols-2 gap-2 text-base">
                    <div className="rounded-2xl bg-sunk px-3 py-2">
                      <div className="text-sm text-ink2">{t('fig.interest_pending')}</div>
                      <div className="font-bold text-due">{money(s.interestOutstanding)}</div>
                    </div>
                    <div className="rounded-2xl bg-sunk px-3 py-2">
                      <div className="text-sm text-ink2">{t('fig.total_outstanding')}</div>
                      <div className="font-bold text-ink">{money(s.totalOutstanding)}</div>
                    </div>
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function CustomerForm({ id }: { id?: string }) {
  const { t } = useI18n()
  const data = useData()
  const toast = useToast()
  const errorText = useErrorText()
  const existing = id ? data?.customerById.get(id) : undefined
  const [name, setName] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [errors, setErrors] = useState<ErrorKey[]>([])
  const [saving, setSaving] = useState(false)
  if (!data) return null
  if (id && !existing) return <Empty icon={<Users size={28} />} title={t('customers.not_found')} />

  const v = {
    name: name ?? existing?.name ?? '',
    phone: phone ?? existing?.phone ?? '',
    notes: notes ?? existing?.notes ?? '',
  }
  const nameErr = errors.filter((e) => e.startsWith('err.name'))
  const phoneErr = errors.filter((e) => e.startsWith('err.phone'))
  const sameName = !id && v.name.trim() && data.customers.find((c) => c.name.toLowerCase() === v.name.trim().toLowerCase())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const c = id ? await updateCustomer(id, v) : await addCustomer(v)
      toast(t(id ? 'customers.updated' : 'customers.added', { name: c.name }))
      if (id) go(`/customers/${c.id}`, { replace: true })
      else go(`/loans/new?customer=${c.id}&first=1`, { replace: true })
    } catch (err) {
      setErrors(err instanceof LedgerError ? err.keys : ['err.unknown'])
      setSaving(false)
    }
  }

  return (
    <>
      <BackButton fallback="/customers" />
      <PageTitle title={id ? t('customers.edit') : t('customers.add')} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t('customers.name')} htmlFor="cn" error={nameErr.length ? errorText(nameErr) : undefined} hint={sameName ? t('customers.same_name_hint') : undefined}>
          <TextInput id="cn" value={v.name} onChange={(e) => setName(e.target.value)} autoFocus={!id} autoComplete="off" maxLength={80} invalid={nameErr.length > 0} />
        </Field>
        <Field label={t('customers.phone')} htmlFor="cp" hint={t('common.optional')} error={phoneErr.length ? errorText(phoneErr) : undefined}>
          <TextInput id="cp" value={v.phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" type="tel" autoComplete="off" maxLength={20} invalid={phoneErr.length > 0} />
        </Field>
        <Field label={t('customers.notes')} htmlFor="cno" hint={t('customers.notes_hint')}>
          <TextArea id="cno" value={v.notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        {errors.some((e) => !e.startsWith('err.name') && !e.startsWith('err.phone')) && (
          <p role="alert" className="rounded-2xl bg-due-soft p-3 text-base font-medium text-due">
            {errorText(errors)}
          </p>
        )}
        <Button type="submit" variant="primary" size="xl" block disabled={saving}>
          {id ? t('common.save') : t('customers.save_and_loan')}
        </Button>
      </form>
    </>
  )
}
