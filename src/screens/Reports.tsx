import { Download, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { collectionsCsv, downloadText, loanBalancesCsv, transactionsCsv } from '../backup/csv'
import { addDays, cashBetween, cashByPeriod, computePortfolio, isValidISODate } from '../engine'
import { useI18n } from '../i18n'
import { Badge, Button, Card, Choice, Empty, Figure, PageTitle, SectionTitle, cx } from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, dateShort, money, monthName } from '../ui/format'

type Period = 'this_month' | 'last_month' | 'this_year' | 'all' | 'custom'
type LoanFilter = 'active' | 'closed' | 'all'

export function Reports() {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const [period, setPeriod] = useState<Period>('this_month')
  const [customFrom, setCustomFrom] = useState(addDays(today, -30))
  const [customTo, setCustomTo] = useState(today)
  const [unit, setUnit] = useState<'day' | 'month'>('day')
  const [filter, setFilter] = useState<LoanFilter>('active')

  const { from, to } = useMemo(() => {
    const ym = today.slice(0, 7)
    if (period === 'this_month') return { from: `${ym}-01`, to: today }
    if (period === 'last_month') {
      const lastDay = addDays(`${ym}-01`, -1)
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay }
    }
    if (period === 'this_year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
    if (period === 'all') {
      const first = data?.loans.reduce((m, l) => (l.startDate < m ? l.startDate : m), today) ?? today
      return { from: first, to: today }
    }
    const f = isValidISODate(customFrom) ? customFrom : today
    const tt = isValidISODate(customTo) && customTo <= today ? customTo : today
    return f <= tt ? { from: f, to: tt } : { from: tt, to: f }
  }, [period, customFrom, customTo, today, data])

  const p = useMemo(() => (data ? computePortfolio(data.loans, data.transactions, to) : undefined), [data, to])
  if (!data || !p) return null

  const cash = cashBetween(data.transactions, from, to)
  let accruedInPeriod = 0
  for (const s of p.states.values()) {
    if (s.status === 'cancelled') continue
    for (const d of s.days) if (d.date >= from) accruedInPeriod += d.interestCharged
  }
  const byPeriod = cashByPeriod(data.transactions, from, to, unit).reverse()
  const loans = data.loans
    .map((l) => ({ l, s: p.states.get(l.id), c: data.customerById.get(l.customerId) }))
    .filter((x) => x.s && x.s.status !== 'cancelled')
    .filter((x) => filter === 'all' || x.s!.status === filter)
    .sort((a, b) => b.s!.totalOutstanding - a.s!.totalOutstanding)

  const stamp = `${from}_to_${to}`

  if (data.loans.length === 0) {
    return (
      <>
        <PageTitle title={t('nav.reports')} />
        <Empty icon={<FileText size={28} />} title={t('reports.empty')} />
      </>
    )
  }

  return (
    <>
      <PageTitle title={t('nav.reports')} sub={`${fmtDate(from, lang)} – ${fmtDate(to, lang)}`} />
      <Choice<Period>
        columns={2}
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'this_month', label: t('period.month') },
          { value: 'last_month', label: t('period.last_month') },
          { value: 'this_year', label: t('period.year') },
          { value: 'all', label: t('period.all') },
        ]}
      />
      <button
        type="button"
        onClick={() => setPeriod('custom')}
        className={cx('mt-2 min-h-12 w-full rounded-2xl border-2 text-base font-semibold', period === 'custom' ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink')}
      >
        {t('period.custom')}
      </button>
      {period === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.from')}
            <input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.to')}
            <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
        </div>
      )}

      <SectionTitle>{t('reports.in_period')}</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          <Figure label={t('fig.interest_received')} value={money(cash.interest)} tone="paid" hint={t('fig.interest_received_hint')} />
          <Figure label={t('reports.interest_earned')} value={money(accruedInPeriod)} hint={t('fig.interest_accrued_hint')} />
          <Figure label={t('fig.principal_received')} value={money(cash.principal)} />
          <Figure label={t('reports.cash_total')} value={money(cash.total)} hint={t('reports.collections_count', { count: cash.count })} />
        </div>
      </Card>

      <SectionTitle>{t('reports.as_of', { date: dateShort(to, lang) })}</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          <Figure label={t('fig.principal_lent')} value={money(p.totals.principalLent)} />
          <Figure label={t('fig.principal_outstanding')} value={money(p.totals.principalOutstanding)} />
          <Figure label={t('fig.interest_accrued')} value={money(p.totals.interestAccrued)} hint={t('fig.interest_accrued_hint')} />
          <Figure label={t('fig.interest_received')} value={money(p.totals.interestReceived)} tone="paid" />
          <Figure label={t('fig.interest_pending')} value={money(p.totals.interestOutstanding)} tone="due" />
          <Figure label={t('fig.principal_repaid')} value={money(p.totals.principalRepaid)} />
          <Figure label={t('fig.active_loans')} value={String(p.activeLoans)} />
          <Figure label={t('fig.closed_loans')} value={String(p.closedLoans)} />
        </div>
      </Card>

      <SectionTitle
        right={
          <div className="flex rounded-xl bg-sunk p-1">
            {(['day', 'month'] as const).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u} className={cx('min-h-10 rounded-lg px-3 text-sm font-semibold', unit === u ? 'bg-surface text-ink shadow-sm' : 'text-ink2')}>
                {u === 'day' ? t('reports.by_day') : t('reports.by_month')}
              </button>
            ))}
          </div>
        }
      >
        {t('reports.cash_collections')}
      </SectionTitle>
      {byPeriod.length === 0 ? (
        <Empty icon={<FileText size={28} />} title={t('collections.no_entries')} />
      ) : (
        <Card className="p-0 sm:p-0">
          <table className="num w-full text-base">
            <thead>
              <tr className="border-b border-line text-left text-sm text-ink2">
                <th className="px-4 py-2.5 font-semibold">{unit === 'day' ? t('reports.col_date') : t('reports.col_month')}</th>
                <th className="px-2 py-2.5 text-right font-semibold">{t('reports.col_interest')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('reports.col_principal')}</th>
              </tr>
            </thead>
            <tbody>
              {byPeriod.map((r) => (
                <tr key={r.period} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-ink">{unit === 'day' ? dateShort(r.period, lang) : monthName(r.period, lang)}</td>
                  <td className="px-2 py-2.5 text-right text-paid">{money(r.interest)}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{money(r.principal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle>{t('reports.loan_balances')}</SectionTitle>
      <Choice<LoanFilter>
        columns={3}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t('loan.status_active') },
          { value: 'closed', label: t('loan.status_closed') },
          { value: 'all', label: t('period.all') },
        ]}
      />
      <ul className="mt-3 flex flex-col gap-2">
        {loans.length === 0 && <Empty icon={<FileText size={28} />} title={t('reports.no_loans')} />}
        {loans.map(({ l, s, c }) => (
          <li key={l.id}>
            <a href={`#/loans/${l.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 hover:bg-sunk">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-ink">{c?.name}</div>
                <div className="num text-sm text-ink2">
                  {l.code} · {t('fig.interest_pending')}: <span className="text-due">{money(s!.interestOutstanding)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="num text-lg font-bold text-ink">{money(s!.totalOutstanding)}</div>
                {s!.status === 'closed' && <Badge tone="paid">{t('loan.status_closed')}</Badge>}
              </div>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-sm text-ink3">{t('reports.statement_hint')}</p>

      <SectionTitle>{t('reports.export')}</SectionTitle>
      <Card>
        <p className="mb-3 text-base text-ink2">{t('reports.export_hint')}</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button icon={<Download size={20} />} onClick={() => downloadText(`InterestLedger-transactions-${stamp}.csv`, transactionsCsv(data.customers, data.loans, data.transactions, from, to), 'text/csv;charset=utf-8')}>
            {t('reports.export_tx')}
          </Button>
          <Button icon={<Download size={20} />} onClick={() => downloadText(`InterestLedger-loan-balances-${to}.csv`, loanBalancesCsv(data.customers, data.loans, p.states, to), 'text/csv;charset=utf-8')}>
            {t('reports.export_loans')}
          </Button>
          <Button icon={<Download size={20} />} onClick={() => downloadText(`InterestLedger-collections-${unit}-${stamp}.csv`, collectionsCsv(cashByPeriod(data.transactions, from, to, unit), unit, from, to), 'text/csv;charset=utf-8')}>
            {unit === 'day' ? t('reports.export_daily') : t('reports.export_monthly')}
          </Button>
        </div>
      </Card>
    </>
  )
}
