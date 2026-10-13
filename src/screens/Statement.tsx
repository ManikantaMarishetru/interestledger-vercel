import { Download, Printer, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { downloadText, statementCsv } from '../backup/csv'
import { computeLoanState, isValidISODate } from '../engine'
import { useI18n, type MessageKey } from '../i18n'
import { BackButton, Button, Empty } from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'
import { ruleDetails } from '../ui/describe'

/** Printable customer statement for one loan. */
export function Statement({ loanId }: { loanId: string }) {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const loan = data?.loanById.get(loanId)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState(today)
  if (!data) return null
  if (!loan) return <Empty icon={<ScrollText size={28} />} title={t('loan.not_found')} />
  const customer = data.customerById.get(loan.customerId)!
  const f = from && isValidISODate(from) ? from : loan.startDate
  const end = isValidISODate(to) && to <= today ? to : today
  const s = computeLoanState(loan, data.transactions, end)
  const rows = s.days.filter((d) => d.date >= f && (d.interestCharged > 0 || d.txIds.length > 0 || d.principalGiven > 0))
  const statusKey: Record<string, MessageKey> = {
    collected: 'status.collected',
    partial: 'status.partial',
    pending: 'status.pending',
    no_charge: 'status.no_charge',
  }

  return (
    <>
      <div className="no-print">
        <BackButton fallback={`/loans/${loanId}`} />
        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.from')}
            <input type="date" value={f} min={loan.startDate} max={end} onChange={(e) => setFrom(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.to')}
            <input type="date" value={end} min={loan.startDate} max={today} onChange={(e) => setTo(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          <Button variant="primary" size="lg" icon={<Printer size={22} />} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          <Button size="lg" icon={<Download size={22} />} onClick={() => downloadText(`InterestLedger-statement-${loan.code}-${f}_to_${end}.csv`, statementCsv(customer, loan, data.transactions, f, end), 'text/csv;charset=utf-8')}>
            CSV
          </Button>
        </div>
      </div>

      <article className="print-plain rounded-3xl border border-line bg-surface p-5">
        <header className="border-b border-line pb-3">
          <div className="text-sm font-semibold tracking-wide text-ink3 uppercase">{t('app.name')}</div>
          <h1 className="text-2xl font-bold text-ink">{t('statement.title')}</h1>
          <div className="mt-1 text-base text-ink">
            <strong>{customer.name}</strong> ({customer.code}) · {t('loan.loan')} {loan.code}
          </div>
          <div className="num text-sm text-ink2">
            {fmtDate(f, lang)} – {fmtDate(end, lang)} · {t('statement.cash_only')}
          </div>
        </header>

        <ul className="mt-3 text-sm text-ink2">
          {ruleDetails(loan.terms, t, lang).map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>

        <dl className="num mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-base sm:grid-cols-3">
          {(
            [
              ['fig.original_principal', s.originalPrincipal],
              ['fig.principal_repaid', s.principalRepaid],
              ['fig.principal_outstanding', s.principalOutstanding],
              ['fig.interest_accrued', s.interestAccrued],
              ['fig.interest_received', s.interestReceived],
              ['fig.interest_pending', s.interestOutstanding],
            ] as [MessageKey, number][]
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-ink2">{t(k)}</dt>
              <dd className="font-bold text-ink">{money(v, { always2: true })}</dd>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-sm text-ink2">{t('fig.total_outstanding')}</dt>
            <dd className="text-xl font-bold text-ink">{money(s.totalOutstanding, { always2: true })}</dd>
          </div>
        </dl>

        <div className="mt-5 -mx-5 overflow-x-auto px-5">
          <table className="num w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left text-ink2">
                <th className="py-2 pr-2 font-semibold">{t('reports.col_date')}</th>
                <th className="px-2 py-2 text-right font-semibold">{t('statement.col_charged')}</th>
                <th className="px-2 py-2 text-right font-semibold">{t('statement.col_int_recv')}</th>
                <th className="px-2 py-2 text-right font-semibold">{t('statement.col_prin_recv')}</th>
                <th className="px-2 py-2 text-right font-semibold">{t('statement.col_unpaid')}</th>
                <th className="py-2 pl-2 font-semibold">{t('statement.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-ink">{fmtDate(d.date, lang)}</td>
                  <td className="px-2 py-1.5 text-right">{money(d.interestCharged)}</td>
                  <td className="px-2 py-1.5 text-right">{money(d.interestReceived)}</td>
                  <td className="px-2 py-1.5 text-right">{d.principalGiven ? `−${money(d.principalGiven)}` : money(d.principalReceived)}</td>
                  <td className="px-2 py-1.5 text-right">{money(Math.max(d.interestBalanceAfter, 0))}</td>
                  <td className="py-1.5 pl-2 whitespace-nowrap">{t(statusKey[d.status])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="mt-4 text-xs text-ink3">{t('statement.footer', { date: fmtDate(today, lang) })}</footer>
      </article>
    </>
  )
}
