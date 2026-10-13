import { HandCoins, Plus, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addDays, cashBetween, sortTransactions } from '../engine'
import { useI18n } from '../i18n'
import { Button, Card, Choice, Empty, Figure, SectionTitle } from '../ui/components'
import { useData, usePortfolio, useToday } from '../ui/data'
import { money, weekdayName, date as fmtDate } from '../ui/format'
import { go } from '../ui/router'
import { BackupReminder, DayLoanRow, TxRow, sortDayRows } from './shared'

type Period = 'week' | 'month' | 'all'

export function Home() {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const p = usePortfolio(data, today)
  const [period, setPeriod] = useState<Period>('month')

  const loansPerCustomer = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of data?.loans ?? []) m.set(l.customerId, (m.get(l.customerId) ?? 0) + 1)
    return m
  }, [data])

  if (!data || !p) return null

  const from = period === 'week' ? addDays(today, -6) : period === 'month' ? `${today.slice(0, 7)}-01` : '1900-01-01'
  const periodCash = cashBetween(data.transactions, from, today)
  const recent = sortTransactions(data.transactions).reverse().slice(0, 5)
  const rows = sortDayRows(p.day.filter((r) => r.expected > 0 || r.interestReceived + r.principalReceived > 0))
  const left = Math.max(p.dayTotals.expected - p.dayTotals.interestReceived, 0)
  const pct = p.dayTotals.expected > 0 ? Math.min(100, Math.round((p.dayTotals.interestReceived / p.dayTotals.expected) * 100)) : 0
  const counts = p.customerStatusCounts

  if (data.customers.length === 0) {
    return (
      <>
        <Greeting today={today} />
        <Empty
          icon={<Users size={28} />}
          title={t('home.welcome_title')}
          body={t('home.welcome_body')}
          action={
            <Button variant="primary" size="lg" icon={<UserPlus size={22} />} onClick={() => go('/customers/new')}>
              {t('customers.add')}
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <Greeting today={today} />
      <BackupReminder today={today} hasData={data.transactions.length > 0} />

      {/* Today */}
      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t('home.today_title')}</h2>
          <span className="text-sm text-ink3">{weekdayName(today, lang)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Figure label={t('home.today_expected')} value={money(p.dayTotals.expected)} big />
          <Figure label={t('home.today_got')} value={money(p.dayTotals.interestReceived)} tone="paid" big />
        </div>
        {p.dayTotals.expected > 0 && (
          <div className="mt-3">
            <div
              className="h-3 overflow-hidden rounded-full bg-sunk"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('home.today_progress')}
            >
              <div className="h-full rounded-full bg-paid transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="num mt-1.5 flex justify-between text-sm text-ink2">
              <span>{t('home.today_left', { amount: money(left) })}</span>
              {p.dayTotals.principalReceived > 0 && <span>{t('home.today_principal', { amount: money(p.dayTotals.principalReceived) })}</span>}
            </div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Count n={counts.collected} label={t('status.collected')} cls="bg-paid-soft text-paid" />
          <Count n={counts.partial} label={t('status.partial')} cls="bg-part-soft text-part" />
          <Count n={counts.pending} label={t('status.pending')} cls="bg-due-soft text-due" />
        </div>
        <Button variant="primary" size="xl" block className="mt-4 hidden sm:flex lg:hidden" icon={<HandCoins size={26} />} onClick={() => go('/collect')}>
          {t('action.money_received')}
        </Button>
      </Card>

      <SectionTitle>{t('home.list_title')}</SectionTitle>
      {rows.length === 0 ? (
        <Empty
          icon={<HandCoins size={28} />}
          title={t('home.no_loans_title')}
          body={t('home.no_loans_body')}
          action={
            <Button variant="primary" icon={<Plus size={20} />} onClick={() => go('/customers')}>
              {t('loan.give_new')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <DayLoanRow
              key={r.loanId}
              row={r}
              date={today}
              customer={data.customerById.get(r.customerId)}
              loan={data.loanById.get(r.loanId)}
              multipleLoans={(loansPerCustomer.get(r.customerId) ?? 0) > 1}
            />
          ))}
        </ul>
      )}

      {/* Overall */}
      <SectionTitle>{t('home.overall_title')}</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          <Figure label={t('fig.principal_outstanding')} value={money(p.totals.principalOutstanding)} />
          <Figure label={t('fig.interest_pending')} value={money(p.totals.interestOutstanding)} tone="due" />
          <Figure label={t('fig.principal_lent')} value={money(p.totals.principalLent)} />
          <Figure label={t('fig.interest_accrued')} value={money(p.totals.interestAccrued)} hint={t('fig.interest_accrued_hint')} />
          <Figure label={t('fig.active_customers')} value={String(p.activeCustomers)} />
          <Figure label={t('fig.active_loans')} value={String(p.activeLoans)} />
        </div>
        <div className="mt-4 rounded-2xl border border-line p-3">
          <div className="mb-2.5 text-base font-semibold text-ink">{t('home.received_in_period')}</div>
          <Choice<Period>
            columns={3}
            value={period}
            onChange={setPeriod}
            label={t('home.received_in_period')}
            options={[
              { value: 'week', label: t('period.week') },
              { value: 'month', label: t('period.month') },
              { value: 'all', label: t('period.all') },
            ]}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Figure label={t('fig.interest_received')} value={money(periodCash.interest)} tone="paid" />
            <Figure label={t('fig.principal_received')} value={money(periodCash.principal)} />
          </div>
        </div>
      </Card>

      {recent.length > 0 && (
        <>
          <SectionTitle right={<a href="#/collections" className="text-base font-semibold text-brand">{t('common.see_all')}</a>}>
            {t('home.recent')}
          </SectionTitle>
          <ul className="flex flex-col gap-2.5">
            {recent.map((tx) => {
              const loan = data.loanById.get(tx.loanId)
              return (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  allTxs={data.transactions}
                  loan={loan}
                  customer={loan ? data.customerById.get(loan.customerId) : undefined}
                  showWho
                />
              )
            })}
          </ul>
        </>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Button size="lg" icon={<UserPlus size={22} />} onClick={() => go('/customers/new')}>
          {t('customers.add_short')}
        </Button>
        <Button size="lg" icon={<Plus size={22} />} onClick={() => go('/loans/new')}>
          {t('loan.give_new')}
        </Button>
      </div>
    </>
  )
}

function Greeting({ today }: { today: string }) {
  const { t, lang } = useI18n()
  return (
    <div className="mb-4">
      <p className="text-base text-ink2">{fmtDate(today, lang)}</p>
      <h1 className="text-[1.6rem] leading-tight font-bold tracking-tight text-ink">{t('home.title')}</h1>
    </div>
  )
}

function Count({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`rounded-2xl px-2 py-2.5 ${cls}`}>
      <div className="num text-2xl font-bold">{n}</div>
      <div className="text-sm leading-tight font-semibold">{label}</div>
    </div>
  )
}
