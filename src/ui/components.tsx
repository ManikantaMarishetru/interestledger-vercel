import { ArrowLeft, Check, Circle, CircleDot, Minus, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { addDays, paiseToRupeeString, parseRupees, type DayStatus, type ISODate } from '../engine'
import { useI18n, useT, type MessageKey } from '../i18n'
import { initials } from './format'
import { back } from './router'

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

// ---- buttons -----------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'md' | 'lg' | 'xl'
  icon?: ReactNode
  block?: boolean
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2.5 rounded-2xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        size === 'xl' && 'min-h-16 px-6 text-xl',
        variant === 'primary' && 'bg-brand text-brand-ink shadow-[0_6px_18px_-8px] shadow-brand/60 hover:brightness-105',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-sunk',
        variant === 'ghost' && 'text-ink2 hover:bg-sunk',
        variant === 'danger' && 'bg-due text-white hover:brightness-105 dark:text-[#2a0b08]',
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => back(fallback)}
      className="-ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-base font-medium text-ink2 hover:bg-sunk"
    >
      <ArrowLeft size={22} aria-hidden />
      {t('common.back')}
    </button>
  )
}

// ---- layout ------------------------------------------------------------------

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' }) {
  return <As className={cx('rounded-3xl border border-line bg-surface p-4 sm:p-5', className)}>{children}</As>
}

export function PageTitle({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] leading-tight font-bold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-base text-ink2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-center justify-between gap-3 px-1">
      <h2 className="text-lg font-bold text-ink">{children}</h2>
      {right}
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <p className="text-lg font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-base text-ink2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <div
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center rounded-2xl bg-brand-soft font-bold text-brand',
        size === 'md' ? 'size-12 text-base' : 'size-16 text-xl',
      )}
    >
      {initials(name)}
    </div>
  )
}

/** Label + big value. */
export function Figure({
  label,
  value,
  tone,
  hint,
  big,
}: {
  label: string
  value: string
  tone?: 'brand' | 'due' | 'paid' | 'part'
  hint?: string
  big?: boolean
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-sunk px-3.5 py-3">
      <div className="text-sm leading-snug font-medium text-ink2">{label}</div>
      <div
        className={cx(
          'num mt-0.5 font-bold tracking-tight break-words',
          big ? 'text-2xl' : 'text-xl',
          tone === 'brand' && 'text-brand',
          tone === 'due' && 'text-due',
          tone === 'paid' && 'text-paid',
          tone === 'part' && 'text-part',
          !tone && 'text-ink',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-sm text-ink3">{hint}</div>}
    </div>
  )
}

// ---- status ------------------------------------------------------------------

const statusStyle: Record<DayStatus, { cls: string; icon: ReactNode; key: MessageKey }> = {
  collected: { cls: 'bg-paid-soft text-paid', icon: <Check size={16} strokeWidth={3} />, key: 'status.collected' },
  partial: { cls: 'bg-part-soft text-part', icon: <CircleDot size={16} strokeWidth={2.5} />, key: 'status.partial' },
  pending: { cls: 'bg-due-soft text-due', icon: <Circle size={16} strokeWidth={2.5} />, key: 'status.pending' },
  no_charge: { cls: 'bg-none-soft text-none', icon: <Minus size={16} strokeWidth={3} />, key: 'status.no_charge' },
}

export function StatusChip({ status, className }: { status: DayStatus; className?: string }) {
  const t = useT()
  const s = statusStyle[status]
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap', s.cls, className)}>
      {s.icon}
      {t(s.key)}
    </span>
  )
}

export function Badge({ children, tone = 'none' }: { children: ReactNode; tone?: 'none' | 'brand' | 'due' | 'part' | 'paid' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap',
        tone === 'none' && 'bg-none-soft text-none',
        tone === 'brand' && 'bg-brand-soft text-brand',
        tone === 'due' && 'bg-due-soft text-due',
        tone === 'part' && 'bg-part-soft text-part',
        tone === 'paid' && 'bg-paid-soft text-paid',
      )}
    >
      {children}
    </span>
  )
}

// ---- form fields -------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="px-1 text-base font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="px-1 text-sm text-ink3">{hint}</p>}
      {error && (
        <p role="alert" className="px-1 text-base font-medium text-due">
          {error}
        </p>
      )}
    </div>
  )
}

const inputCls =
  'w-full min-h-14 rounded-2xl border border-line bg-surface px-4 text-lg text-ink placeholder:text-ink3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15'

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={cx(inputCls, invalid && 'border-due', className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={cx(inputCls, 'py-3', props.className)} />
}

/** Rupee input. `value` is the typed text; parse with parseRupees. */
export function MoneyInput({
  value,
  onChange,
  invalid,
  big,
  id,
  autoFocus,
  placeholder = '0',
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  big?: boolean
  id?: string
  autoFocus?: boolean
  placeholder?: string
  ariaLabel?: string
}) {
  return (
    <div
      className={cx(
        'flex items-center rounded-2xl border bg-surface px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15',
        invalid ? 'border-due' : 'border-line',
        big ? 'min-h-20' : 'min-h-14',
      )}
    >
      <span className={cx('font-semibold text-ink3', big ? 'text-3xl' : 'text-xl')} aria-hidden>
        ₹
      </span>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, '')
          onChange(v)
        }}
        className={cx(
          'num w-full min-w-0 bg-transparent pl-2 font-bold text-ink placeholder:text-ink3/60 focus:outline-none',
          big ? 'text-4xl' : 'text-xl',
        )}
      />
    </div>
  )
}

/** Paise -> text for a MoneyInput ("500", "12.50"). */
export function paiseToInput(p: number): string {
  return p ? paiseToRupeeString(p).replace(/\.00$/, '') : ''
}

export function moneyValue(text: string): number | null {
  return text.trim() === '' ? null : parseRupees(text)
}

/** Big choice buttons. */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
  label,
}: {
  value: T | undefined
  onChange: (v: T) => void
  options: { value: T; label: string; sub?: string; icon?: ReactNode }[]
  columns?: 1 | 2 | 3 | 4
  label?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('grid gap-2', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3', columns === 4 && 'grid-cols-2 sm:grid-cols-4')}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 px-3.5 py-2.5 text-left transition',
              on ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-sunk',
            )}
          >
            <span className={cx('flex items-center gap-2 text-base leading-snug font-semibold', on ? 'text-brand' : 'text-ink')}>
              {o.icon}
              {o.label}
            </span>
            {o.sub && <span className="text-sm leading-snug text-ink2">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="min-w-0">
        <span className="block text-base font-semibold text-ink">{label}</span>
        {sub && <span className="block text-sm text-ink2">{sub}</span>}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-8 w-14 shrink-0 rounded-full bg-line transition peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30 after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-6"
      />
    </label>
  )
}

/** Today / Yesterday / pick a date. */
export function DatePicker({
  value,
  onChange,
  today,
  min,
  id,
}: {
  value: ISODate
  onChange: (d: ISODate) => void
  today: ISODate
  min?: ISODate
  id?: string
}) {
  const t = useT()
  const yesterday = addDays(today, -1)
  const showYesterday = !min || yesterday >= min
  const chip = (d: ISODate, label: string) => (
    <button
      type="button"
      onClick={() => onChange(d)}
      aria-pressed={value === d}
      className={cx(
        'min-h-12 rounded-2xl border-2 px-4 text-base font-semibold transition',
        value === d ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink hover:bg-sunk',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip(today, t('common.today'))}
      {showYesterday && chip(yesterday, t('common.yesterday'))}
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label={t('common.pick_date')}
        className={cx(
          'num min-h-12 flex-1 rounded-2xl border-2 bg-surface px-3 text-base font-semibold text-ink',
          value !== today && value !== yesterday ? 'border-brand' : 'border-line',
        )}
      />
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useT()
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(inputCls, 'pr-12')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
          className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-ink3 hover:bg-sunk"
        >
          <X size={20} />
        </button>
      )}
    </div>
  )
}

// ---- sheet (modal) -----------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="anim-pop flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] bg-surface shadow-2xl outline-none sm:rounded-[1.75rem]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-11 place-items-center rounded-xl text-ink2 hover:bg-sunk">
            <X size={24} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

// ---- toast -------------------------------------------------------------------

interface ToastMsg {
  id: number
  text: string
  tone: 'ok' | 'error'
}
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([])
  const show = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={cx(
              'anim-pop pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-base font-semibold shadow-xl',
              i.tone === 'ok' ? 'bg-ink text-bg' : 'bg-due text-white',
            )}
          >
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/** Show engine/db error keys as text. */
export function useErrorText() {
  const { t } = useI18n()
  return (keys: string[]) => keys.map((k) => t(k as MessageKey)).join(' ')
}

export { initials }
