import { Download, FileText, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { creditsDebits } from '../backup/ledger'
import { downloadText, transactionsCsv } from '../backup/csv'
import { isValidISODate } from '../engine'
import { useI18n } from '../i18n'
import { BackButton, Button, Empty, PageTitle } from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'

/** Printable credits & debits ledger for a date range. Print it -> Save as PDF. */
export function Ledger() {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo] = useState(today)

  const f = isValidISODate(from) ? from : today.slice(0, 7) + '-01'
  const end = isValidISODate(to) && to <= today ? to : today
  const range = f <= end ? { from: f, to: end } : { from: end, to: f }

  const report = useMemo(
    () => (data ? creditsDebits(data.customers, data.loans, data.transactions, range.from, range.to) : undefined),
    [data, range.from, range.to],
  )
  if (!data || !report) return null

  const stamp = `${range.from}_to_${range.to}`

  return (
    <>
      <div className="no-print">
        <BackButton fallback="/reports" />
        <PageTitle title={t('ledger.title')} sub={`${fmtDate(range.from, lang)} – ${fmtDate(range.to, lang)}`} />
        <p className="mb-3 text-base text-ink2">{t('ledger.hint')}</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.from')}
            <input type="date" value={range.from} max={today} onChange={(e) => setFrom(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
            {t('period.to')}
            <input type="date" value={range.to} max={today} onChange={(e) => setTo(e.target.value)} className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink" />
          </label>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          <Button variant="primary" size="lg" icon={<Printer size={22} />} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          <Button
            size="lg"
            icon={<Download size={22} />}
            onClick={() => downloadText(`InterestLedger-credits-debits-${stamp}.csv`, transactionsCsv(data.customers, data.loans, data.transactions, range.from, range.to), 'text/csv;charset=utf-8')}
          >
            CSV
          </Button>
        </div>
      </div>

      <article className="print-plain rounded-3xl border border-line bg-surface p-5">
        <header className="border-b border-line pb-3">
          <div className="text-sm font-semibold tracking-wide text-ink3 uppercase">{t('app.name')}</div>
          <h1 className="text-2xl font-bold text-ink">{t('ledger.title')}</h1>
          <div className="num text-sm text-ink2">
            {fmtDate(range.from, lang)} – {fmtDate(range.to, lang)} · {t('statement.cash_only')}
          </div>
        </header>

        {report.rows.length === 0 ? (
          <div className="mt-4">
            <Empty icon={<FileText size={28} />} title={t('ledger.empty')} />
          </div>
        ) : (
          <div className="mt-3 -mx-5 overflow-x-auto px-5">
            <table className="num w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b-2 border-line text-left text-ink2">
                  <th className="py-2 pr-2 font-semibold">{t('reports.col_date')}</th>
                  <th className="px-2 py-2 font-semibold">{t('nav.customers')}</th>
                  <th className="px-2 py-2 font-semibold">{t('loan.loan')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t('ledger.col_credit')}</th>
                  <th className="py-2 pl-2 text-right font-semibold">{t('ledger.col_debit')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink">{fmtDate(r.date, lang)}</td>
                    <td className="px-2 py-1.5 text-ink">
                      {r.customerName || '—'}
                      <span className="block text-xs text-ink3">
                        {r.type}
                        {r.reversed ? ` · ${t('ledger.reversed')}` : ''}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink2">{r.loanCode}</td>
                    <td className="px-2 py-1.5 text-right">{r.creditPaise ? money(r.creditPaise, { always2: true }) : '—'}</td>
                    <td className="py-1.5 pl-2 text-right">{r.debitPaise ? money(r.debitPaise, { always2: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-bold text-ink">
                  <td colSpan={3} className="py-2 pr-2">{t('ledger.total')}</td>
                  <td className="px-2 py-2 text-right">{money(report.totalCredit, { always2: true })}</td>
                  <td className="py-2 pl-2 text-right">{money(report.totalDebit, { always2: true })}</td>
                </tr>
                <tr className="font-bold text-ink">
                  <td colSpan={3} className="py-1 pr-2">{t('ledger.balance')}</td>
                  <td colSpan={2} className="py-1 pl-2 text-right">{money(report.balance, { always2: true })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <footer className="mt-4 text-xs text-ink3">{t('ledger.footer', { date: fmtDate(today, lang) })}</footer>
      </article>
    </>
  )
}
