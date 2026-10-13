import { AlertTriangle, ChevronRight, Undo2 } from 'lucide-react'
import { reversedIds, type Customer, type Loan, type LoanToday, type Transaction } from '../engine'
import { useI18n } from '../i18n'
import { Avatar, Badge, StatusChip, cx } from '../ui/components'
import { useMeta } from '../ui/data'
import { dateShort, money } from '../ui/format'
import { splitLine, txTypeKey } from '../ui/describe'
import { go } from '../ui/router'

const order = { pending: 0, partial: 1, collected: 2, no_charge: 3 } as const

export function sortDayRows(rows: LoanToday[]): LoanToday[] {
  return [...rows].sort((a, b) => order[a.status] - order[b.status] || b.interestOutstanding - a.interestOutstanding)
}

/** One customer-loan line in a day's collection list. Tap to collect. */
export function DayLoanRow({
  row,
  customer,
  loan,
  multipleLoans,
  date,
}: {
  row: LoanToday
  customer?: Customer
  loan?: Loan
  multipleLoans: boolean
  date: string
}) {
  const { t } = useI18n()
  const done = row.status === 'collected'
  return (
    <li>
      <button
        type="button"
        onClick={() => go(done ? `/loans/${row.loanId}` : `/collect?loan=${row.loanId}&date=${date}`)}
        className="flex w-full items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 text-left transition hover:bg-sunk active:scale-[0.99]"
      >
        <Avatar name={customer?.name ?? '?'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-bold text-ink">{customer?.name ?? '—'}</span>
            {multipleLoans && loan && <span className="shrink-0 text-sm text-ink3">{loan.code}</span>}
          </div>
          <div className="num mt-0.5 text-base text-ink2">
            {row.expected > 0 ? t('today.row_expected', { amount: money(row.expected) }) : t('status.no_charge')}
            {row.interestReceived + row.principalReceived > 0 && (
              <span className="text-paid"> · {t('today.row_got', { amount: money(row.interestReceived + row.principalReceived) })}</span>
            )}
          </div>
          {row.interestOutstanding > 0 && (
            <div className="num text-sm font-medium text-due">{t('today.row_unpaid', { amount: money(row.interestOutstanding) })}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusChip status={row.status} />
          {!done && <span className="text-sm font-semibold text-brand">{t('today.tap_collect')}</span>}
        </div>
      </button>
    </li>
  )
}

/** One ledger entry. */
export function TxRow({
  tx,
  allTxs,
  customer,
  loan,
  showWho,
  onReverse,
}: {
  tx: Transaction
  allTxs: Transaction[]
  customer?: Customer
  loan?: Loan
  showWho?: boolean
  onReverse?: (tx: Transaction) => void
}) {
  const { t, lang } = useI18n()
  const reversed = reversedIds(allTxs).has(tx.id)
  const target = tx.reversesId ? allTxs.find((x) => x.id === tx.reversesId) : undefined
  const sign = tx.type === 'collection' ? '+' : tx.type === 'disbursement' || tx.type === 'principal_increase' ? '−' : ''
  const tone =
    tx.type === 'collection'
      ? 'text-paid'
      : tx.type === 'disbursement' || tx.type === 'principal_increase'
        ? 'text-ink'
        : 'text-ink2'
  const canOpenReceipt = tx.type === 'collection' || tx.type === 'reversal' || tx.type === 'principal_increase'
  return (
    <li className={cx('rounded-3xl border border-line bg-surface p-3.5', reversed && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx('text-base font-bold text-ink', reversed && 'line-through')}>{t(txTypeKey[tx.type])}</span>
            {tx.type === 'collection' && <Badge>{t('common.cash')}</Badge>}
            {reversed && <Badge tone="due">{t('tx.reversed_badge')}</Badge>}
          </div>
          {showWho && customer && (
            <div className="mt-0.5 truncate text-base font-semibold text-ink2">
              {customer.name}
              {loan && <span className="font-normal text-ink3"> · {loan.code}</span>}
            </div>
          )}
          <div className="num mt-0.5 text-sm text-ink2">
            {dateShort(tx.date, lang)} · {tx.code}
            {target && ` · ${t('tx.cancels', { code: target.code })}`}
          </div>
          {splitLine(tx, t) && <div className="num mt-0.5 text-sm text-ink2">{splitLine(tx, t)}</div>}
          {tx.notes && <div className="mt-1 text-sm break-words text-ink3">“{tx.notes}”</div>}
        </div>
        <div className={cx('num shrink-0 text-right text-lg font-bold', tone, reversed && 'line-through')}>
          {sign}
          {money(tx.amountPaise)}
        </div>
      </div>
      {(onReverse || canOpenReceipt) && (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {canOpenReceipt && (
            <a href={`#/receipt/${tx.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand hover:bg-brand-soft">
              {t('tx.view_receipt')}
              <ChevronRight size={16} aria-hidden />
            </a>
          )}
          {onReverse && !reversed && tx.type !== 'reversal' && (
            <button
              type="button"
              onClick={() => onReverse(tx)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-due hover:bg-due-soft"
            >
              <Undo2 size={16} aria-hidden />
              {t('tx.reverse_button')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** Gentle reminder to save a backup. */
export function BackupReminder({ today, hasData }: { today: string; hasData: boolean }) {
  const { t, lang } = useI18n()
  const last = useMeta<string>('lastBackupDate')
  if (!hasData) return null
  const days = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : Infinity
  if (days < 7) return null
  return (
    <a href="#/backup" className="mb-4 flex items-center gap-3 rounded-3xl border border-part/30 bg-part-soft p-4 text-part">
      <AlertTriangle size={26} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">{t('backup.reminder_title')}</span>
        <span className="block text-sm">
          {last ? t('backup.reminder_last', { date: dateShort(last, lang) }) : t('backup.reminder_never')}
        </span>
      </span>
      <ChevronRight className="shrink-0" aria-hidden />
    </a>
  )
}
