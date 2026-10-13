import { CheckCircle2, HandCoins, Home, Printer } from 'lucide-react'
import { computeLoanState } from '../engine'
import { useI18n } from '../i18n'
import { BackButton, Button, Empty } from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, money, time } from '../ui/format'
import { txTypeKey } from '../ui/describe'
import { go, useRoute } from '../ui/router'

export function Receipt({ txId }: { txId: string }) {
  const { t, lang } = useI18n()
  const data = useData()
  const today = useToday()
  const isNew = useRoute().query.get('new') === '1'
  if (!data) return null
  const tx = data.transactions.find((x) => x.id === txId)
  if (!tx) return <Empty icon={<HandCoins size={28} />} title={t('receipt.not_found')} />
  const loan = data.loanById.get(tx.loanId)!
  const customer = data.customerById.get(loan.customerId)!
  const now = computeLoanState(loan, data.transactions, today > tx.date ? today : tx.date)
  const target = tx.reversesId ? data.transactions.find((x) => x.id === tx.reversesId) : undefined

  const row = (label: string, value: string, strong?: boolean) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2.5 last:border-0">
      <span className="text-base text-ink2">{label}</span>
      <span className={`num text-right ${strong ? 'text-lg font-bold text-ink' : 'text-base font-semibold text-ink'}`}>{value}</span>
    </div>
  )

  return (
    <>
      <div className="no-print">{!isNew && <BackButton />}</div>
      {isNew && (
        <div className="no-print anim-pop mb-5 flex flex-col items-center text-center">
          <CheckCircle2 size={64} className="text-paid" aria-hidden />
          <h1 className="mt-2 text-2xl font-bold text-ink">{t('receipt.saved')}</h1>
        </div>
      )}

      <article className="print-plain mx-auto max-w-md rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <header className="mb-3 text-center">
          <div className="text-sm font-semibold tracking-wide text-ink3 uppercase">{t('app.name')}</div>
          <h2 className="text-xl font-bold text-ink">{t('receipt.title')}</h2>
          <div className="num text-sm text-ink2">
            {tx.code} · {fmtDate(tx.date, lang)}
          </div>
        </header>
        <div className="my-4 text-center">
          <div className="text-base text-ink2">{t(txTypeKey[tx.type])}</div>
          <div className="num text-4xl font-bold tracking-tight text-ink">{money(tx.amountPaise, { always2: true })}</div>
          {(tx.type === 'collection' || tx.type === 'principal_increase') && (
            <div className="text-base font-semibold text-ink2">{t('common.cash')}</div>
          )}
        </div>
        {row(t('receipt.customer'), `${customer.name} (${customer.code})`)}
        {row(t('receipt.loan'), loan.code)}
        {tx.type === 'collection' && row(t('collect.to_interest'), money(tx.interestPaise, { always2: true }))}
        {tx.type === 'collection' && row(t('collect.to_principal'), money(tx.principalPaise, { always2: true }))}
        {target && row(t('receipt.cancels'), `${target.code} · ${fmtDate(target.date, lang)}`)}
        {tx.notes && row(t('collect.note'), tx.notes)}
        <div className="mt-3 rounded-2xl bg-sunk p-3">
          <div className="mb-1 text-sm font-semibold text-ink2">{t('receipt.balance_now', { date: fmtDate(now.asOf, lang) })}</div>
          {row(t('fig.interest_pending'), money(now.interestOutstanding, { always2: true }))}
          {row(t('fig.principal_outstanding'), money(now.principalOutstanding, { always2: true }))}
          {row(t('fig.total_outstanding'), money(now.totalOutstanding, { always2: true }), true)}
        </div>
        <footer className="mt-3 text-center text-xs text-ink3">
          {t('receipt.entered_at', { time: `${fmtDate(tx.createdAt.slice(0, 10), lang)} ${time(tx.createdAt, lang)}` })}
        </footer>
      </article>

      <div className="no-print mx-auto mt-5 grid max-w-md gap-2.5">
        {isNew && (
          <Button variant="primary" size="xl" block icon={<HandCoins size={24} />} onClick={() => go('/collect')}>
            {t('receipt.another')}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Button size="lg" icon={<Printer size={22} />} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          <Button size="lg" icon={<Home size={22} />} onClick={() => go('/')}>
            {t('nav.home')}
          </Button>
        </div>
      </div>
    </>
  )
}
