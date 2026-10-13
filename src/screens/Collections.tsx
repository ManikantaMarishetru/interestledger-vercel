import { HandCoins, ReceiptText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addDays, computePortfolio, sortTransactions } from '../engine'
import { useI18n } from '../i18n'
import { Card, Choice, DatePicker, Empty, Figure, PageTitle, SearchBox, SectionTitle } from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'
import { DayLoanRow, TxRow, sortDayRows } from './shared'

type Range = 'day' | 'week' | 'month'

export function Collections() {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const [date, setDate] = useState(today)
  const [q, setQ] = useState('')
  const [range, setRange] = useState<Range>('day')
  const p = useMemo(() => (data ? computePortfolio(data.loans, data.transactions, date) : undefined), [data, date])
  if (!data || !p) return null

  const query = q.trim().toLowerCase()
  const match = (customerId: string) => {
    if (!query) return true
    const c = data.customerById.get(customerId)
    return !!c && (c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query) || c.phone.includes(query))
  }
  const rows = sortDayRows(p.day.filter((r) => (r.expected > 0 || r.interestReceived + r.principalReceived > 0) && match(r.customerId)))
  const sum = rows.reduce(
    (a, r) => {
      a.expected += r.expected
      a.got += r.interestReceived
      a.principal += r.principalReceived
      if (r.status === 'partial') {
        a.partialCount++
        a.partialLeft += r.expected - r.interestReceived
      }
      if (r.status === 'pending') {
        a.pendingCount++
        a.pendingLeft += r.expected
      }
      return a
    },
    { expected: 0, got: 0, principal: 0, partialCount: 0, partialLeft: 0, pendingCount: 0, pendingLeft: 0 },
  )

  const from = range === 'day' ? date : range === 'week' ? addDays(date, -6) : `${date.slice(0, 7)}-01`
  const history = sortTransactions(data.transactions)
    .reverse()
    .filter((x) => x.date >= from && x.date <= date && x.type !== 'disbursement')
    .filter((x) => {
      const l = data.loanById.get(x.loanId)
      return l ? match(l.customerId) : false
    })

  return (
    <>
      <PageTitle title={t('nav.collections')} sub={fmtDate(date, lang)} />
      <div className="flex flex-col gap-3">
        <DatePicker value={date} onChange={setDate} today={today} />
        <SearchBox value={q} onChange={setQ} placeholder={t('collections.filter_customer')} />
      </div>

      <Card className="mt-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Figure label={t('collections.expected')} value={money(sum.expected)} />
          <Figure label={t('collections.interest_got')} value={money(sum.got)} tone="paid" />
          <Figure label={t('collections.partial', { count: sum.partialCount })} value={money(sum.partialLeft)} tone="part" hint={t('collections.left_to_get')} />
          <Figure label={t('collections.pending', { count: sum.pendingCount })} value={money(sum.pendingLeft)} tone="due" hint={t('collections.left_to_get')} />
        </div>
        {sum.principal > 0 && <p className="num mt-3 text-base text-ink2">{t('home.today_principal', { amount: money(sum.principal) })}</p>}
        <p className="num mt-2 text-base font-semibold text-ink">{t('collections.cash_total', { amount: money(sum.got + sum.principal) })}</p>
      </Card>

      <SectionTitle>{t('collections.list')}</SectionTitle>
      {rows.length === 0 ? (
        <Empty icon={<HandCoins size={28} />} title={t('collections.none')} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <DayLoanRow
              key={r.loanId}
              row={r}
              date={date}
              customer={data.customerById.get(r.customerId)}
              loan={data.loanById.get(r.loanId)}
              multipleLoans={data.loans.filter((l) => l.customerId === r.customerId).length > 1}
            />
          ))}
        </ul>
      )}

      <SectionTitle>{t('collections.history')}</SectionTitle>
      <div className="mb-3">
        <Choice<Range>
          columns={3}
          value={range}
          onChange={setRange}
          options={[
            { value: 'day', label: t('period.this_day') },
            { value: 'week', label: t('period.week_to') },
            { value: 'month', label: t('period.month') },
          ]}
        />
      </div>
      {history.length === 0 ? (
        <Empty icon={<ReceiptText size={28} />} title={t('collections.no_entries')} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {history.map((x) => {
            const l = data.loanById.get(x.loanId)
            return <TxRow key={x.id} tx={x} allTxs={data.transactions} loan={l} customer={l ? data.customerById.get(l.customerId) : undefined} showWho />
          })}
        </ul>
      )}
    </>
  )
}
