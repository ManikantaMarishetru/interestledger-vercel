import { BarChart3, HandCoins, Home as HomeIcon, Menu, Users, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useI18n, useT, type MessageKey } from './i18n'
import { Collect } from './screens/Collect'
import { Collections } from './screens/Collections'
import { CustomerDetail, CustomerForm, Customers } from './screens/Customers'
import { Home } from './screens/Home'
import { LanguagePick } from './screens/LanguagePick'
import { LoanDetail } from './screens/LoanDetail'
import { LoanForm } from './screens/LoanForm'
import { MenuSheet } from './screens/MenuSheet'
import { Receipt } from './screens/Receipt'
import { Reports } from './screens/Reports'
import { Settings } from './screens/Settings'
import { Statement } from './screens/Statement'
import { BackupScreen } from './screens/Backup'
import { cx } from './ui/components'
import { go, useRoute, type Route } from './ui/router'

const NAV: { path: string; key: MessageKey; icon: LucideIcon }[] = [
  { path: '/', key: 'nav.home', icon: HomeIcon },
  { path: '/customers', key: 'nav.customers', icon: Users },
  { path: '/collections', key: 'nav.collections', icon: HandCoins },
  { path: '/reports', key: 'nav.reports', icon: BarChart3 },
]

function screenFor(r: Route): { node: ReactNode; tab?: string; fab?: boolean } {
  const [a, b, c] = r.segments
  if (!a) return { node: <Home />, tab: '/', fab: true }
  if (a === 'customers') {
    if (!b) return { node: <Customers />, tab: '/customers', fab: true }
    if (b === 'new') return { node: <CustomerForm />, tab: '/customers' }
    if (c === 'edit') return { node: <CustomerForm id={b} />, tab: '/customers' }
    return { node: <CustomerDetail id={b} />, tab: '/customers', fab: true }
  }
  if (a === 'loans') {
    if (b === 'new') return { node: <LoanForm customerId={r.query.get('customer') ?? undefined} />, tab: '/customers' }
    if (b && c === 'statement') return { node: <Statement loanId={b} />, tab: '/reports' }
    if (b) return { node: <LoanDetail id={b} />, tab: '/customers' }
  }
  if (a === 'collect')
    return {
      node: <Collect key={r.query.toString()} loanId={r.query.get('loan') ?? undefined} customerId={r.query.get('customer') ?? undefined} />,
      tab: '/collections',
    }
  if (a === 'receipt' && b) return { node: <Receipt txId={b} /> }
  if (a === 'collections') return { node: <Collections />, tab: '/collections', fab: true }
  if (a === 'reports') return { node: <Reports />, tab: '/reports', fab: true }
  if (a === 'settings') return { node: <Settings /> }
  if (a === 'backup') return { node: <BackupScreen /> }
  return { node: <Home />, tab: '/', fab: true }
}

export default function App() {
  const { chosen } = useI18n()
  const t = useT()
  const route = useRoute()
  const [menu, setMenu] = useState(false)
  if (!chosen) return <LanguagePick />
  const { node, tab, fab } = screenFor(route)

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop side rail */}
      <aside className="no-print sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Brand />
        <button
          type="button"
          onClick={() => go('/collect')}
          className="mt-6 flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-brand px-4 text-lg font-bold text-brand-ink shadow-[0_8px_24px_-10px] shadow-brand/70 transition hover:brightness-105 active:scale-[0.98]"
        >
          <HandCoins size={26} aria-hidden />
          {t('action.money_received')}
        </button>
        <nav className="mt-6 flex flex-col gap-1" aria-label={t('nav.label')}>
          {NAV.map((n) => (
            <a
              key={n.path}
              href={`#${n.path}`}
              aria-current={tab === n.path ? 'page' : undefined}
              className={cx(
                'flex min-h-13 items-center gap-3.5 rounded-2xl px-4 text-lg font-semibold transition',
                tab === n.path ? 'bg-brand-soft text-brand' : 'text-ink2 hover:bg-sunk',
              )}
            >
              <n.icon size={24} aria-hidden />
              {t(n.key)}
            </a>
          ))}
        </nav>
        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex min-h-13 w-full items-center gap-3.5 rounded-2xl px-4 text-lg font-semibold text-ink2 hover:bg-sunk"
          >
            <Menu size={24} aria-hidden />
            {t('nav.more')}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <Brand compact />
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={t('nav.more')}
            className="-mr-2 flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-semibold text-ink2 hover:bg-sunk"
          >
            <Menu size={26} aria-hidden />
            <span className="max-sm:sr-only">{t('nav.more')}</span>
          </button>
        </header>

        <main className="print-plain mx-auto w-full max-w-3xl px-4 pt-4 pb-44 sm:px-6 lg:pt-8 lg:pb-16">{node}</main>
      </div>

      {/* Mobile: big "money received" button above the tab bar */}
      {fab && (
        <button
          type="button"
          onClick={() => go('/collect')}
          className="no-print fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex min-h-16 items-center gap-2.5 rounded-full bg-brand pr-6 pl-5 text-lg font-bold text-brand-ink shadow-[0_10px_30px_-8px] shadow-brand/70 transition active:scale-[0.97] lg:hidden"
        >
          <HandCoins size={26} aria-hidden />
          {t('action.money_received')}
        </button>
      )}

      {/* Mobile tab bar */}
      <nav
        aria-label={t('nav.label')}
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map((n) => {
          const on = tab === n.path
          return (
            <a
              key={n.path}
              href={`#${n.path}`}
              aria-current={on ? 'page' : undefined}
              className={cx('flex min-h-[4.25rem] flex-col items-center justify-center gap-1 px-1', on ? 'text-brand' : 'text-ink3')}
            >
              <span className={cx('grid h-8 w-14 place-items-center rounded-full transition', on && 'bg-brand-soft')}>
                <n.icon size={24} strokeWidth={on ? 2.4 : 2} aria-hidden />
              </span>
              <span className={cx('text-center text-[0.8rem] leading-tight', on ? 'font-bold' : 'font-medium')}>{t(n.key)}</span>
            </a>
          )
        })}
      </nav>

      <MenuSheet open={menu} onClose={() => setMenu(false)} />
    </div>
  )
}

function Brand({ compact }: { compact?: boolean }) {
  const t = useT()
  return (
    <a href="#/" className="flex min-h-14 items-center gap-2.5">
      <img src="icon.svg" alt="" className={compact ? 'size-9' : 'size-10'} />
      <span className={cx('font-bold tracking-tight text-ink', compact ? 'text-lg' : 'text-xl')}>{t('app.name')}</span>
    </a>
  )
}
