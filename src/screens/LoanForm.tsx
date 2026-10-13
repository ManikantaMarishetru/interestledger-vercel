import { CalendarX2, Check, ChevronDown, Plus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LedgerError, createLoan } from '../db/repo'
import {
  addDays,
  isValidISODate,
  parseRatePercent,
  validateNewLoan,
  weekday,
  type AllocationPolicy,
  type ErrorKey,
  type FixedAmountBasis,
  type InterestMethod,
  type LoanTerms,
  type MonthlyDayCount,
  type RoundingPolicy,
} from '../engine'
import { useI18n } from '../i18n'
import {
  BackButton,
  Button,
  Choice,
  DatePicker,
  Empty,
  Field,
  MoneyInput,
  PageTitle,
  Sheet,
  TextArea,
  Toggle,
  cx,
  moneyValue,
  useErrorText,
  useToast,
} from '../ui/components'
import { useData, useToday } from '../ui/data'
import { date as fmtDate, money } from '../ui/format'
import { dayInterestPreview, ruleDetails, weekdayLabel } from '../ui/describe'
import { go, useRoute } from '../ui/router'

export function LoanForm({ customerId: initialCustomer }: { customerId?: string }) {
  const { t, lang } = useI18n()
  const today = useToday()
  const data = useData()
  const toast = useToast()
  const errorText = useErrorText()
  const first = useRoute().query.get('first') === '1'

  const [customerId, setCustomerId] = useState(initialCustomer ?? '')
  const [principalText, setPrincipalText] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [method, setMethod] = useState<InterestMethod>('fixed_daily')
  const [fixedText, setFixedText] = useState('')
  const [rateText, setRateText] = useState('')
  const [dayCount, setDayCount] = useState<MonthlyDayCount | undefined>(undefined)
  const [basis, setBasis] = useState<FixedAmountBasis>('unchanged')
  const [daysOff, setDaysOff] = useState<number[]>([])
  const [holidays, setHolidays] = useState<string[]>([])
  const [holidayInput, setHolidayInput] = useState('')
  const [chargeStart, setChargeStart] = useState(false)
  const [chargeRepay, setChargeRepay] = useState(false)
  const [rounding, setRounding] = useState<RoundingPolicy>('cumulative_half_up')
  const [allocation, setAllocation] = useState<AllocationPolicy>('interest_first')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [more, setMore] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<ErrorKey[]>([])
  const [requestId] = useState(() => crypto.randomUUID())

  const principal = moneyValue(principalText)
  const terms: LoanTerms = useMemo(
    () => ({
      method,
      fixedDailyPaise: method === 'fixed_daily' ? (moneyValue(fixedText) ?? undefined) : undefined,
      fixedAmountBasis: method === 'fixed_daily' ? basis : undefined,
      rateE4: method !== 'fixed_daily' ? (parseRatePercent(rateText) ?? undefined) : undefined,
      monthlyDayCount: method === 'percent_monthly' ? dayCount : undefined,
      chargeDisbursementDay: chargeStart,
      chargeRepaymentDay: chargeRepay,
      nonChargeableWeekdays: [...daysOff].sort(),
      nonChargeableDates: [...holidays].sort(),
      rounding,
      allocationPolicy: allocation,
    }),
    [method, fixedText, basis, rateText, dayCount, chargeStart, chargeRepay, daysOff, holidays, rounding, allocation],
  )
  const errors = validateNewLoan({ startDate, principalPaise: principal ?? 0, terms, dueDate: dueDate || undefined }, today)
  const customerErr: ErrorKey[] = customerId ? [] : ['err.customer_required']
  const allErrors = [...customerErr, ...errors]

  if (!data) return null
  if (data.customers.length === 0)
    return (
      <Empty
        icon={<Users size={28} />}
        title={t('customers.empty_title')}
        action={<Button variant="primary" onClick={() => go('/customers/new')}>{t('customers.add')}</Button>}
      />
    )
  const customer = data.customerById.get(customerId)

  const pick = (...keys: string[]) => {
    if (!showErrors) return undefined
    const e = allErrors.filter((k) => keys.includes(k))
    return e.length ? errorText(e) : undefined
  }

  // Preview of one day's interest on the whole principal
  const previewDate = (() => {
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDate, i)
      if (!daysOff.includes(weekday(d))) return d
    }
    return startDate
  })()
  const termsOk = errors.length === 0 && principal !== null && principal > 0
  const perDay = termsOk ? dayInterestPreview(terms, principal!, previewDate) : null

  function submit() {
    setShowErrors(true)
    if (allErrors.length === 0) setConfirm(true)
  }

  async function save() {
    if (saving || principal === null) return
    setSaving(true)
    setSaveErrors([])
    try {
      const loan = await createLoan(
        { customerId, startDate, principalPaise: principal, terms, dueDate: dueDate || undefined, notes, requestId },
        today,
      )
      toast(t('loan.saved'))
      go(`/loans/${loan.id}`, { replace: true })
    } catch (e) {
      setSaveErrors(e instanceof LedgerError ? e.keys : ['err.unknown'])
      setSaving(false)
      setConfirm(false)
    }
  }

  const toggleDay = (d: number) => setDaysOff((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))

  return (
    <>
      <BackButton fallback="/customers" />
      <PageTitle title={t('loan.new_title')} sub={customer ? customer.name : undefined} />

      <div className="flex flex-col gap-6">
        {!initialCustomer && (
          <Field label={t('loan.customer')} htmlFor="lc" error={pick('err.customer_required')}>
            <select
              id="lc"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-lg text-ink"
            >
              <option value="">{t('loan.customer_pick')}</option>
              {[...data.customers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
            </select>
          </Field>
        )}

        <Field label={t('loan.how_much')} htmlFor="lp" error={pick('err.amount_required', 'err.amount_too_large')}>
          <MoneyInput id="lp" big value={principalText} onChange={setPrincipalText} autoFocus={!!initialCustomer} invalid={!!pick('err.amount_required', 'err.amount_too_large')} />
        </Field>

        <Field label={t('loan.when')} htmlFor="ld" error={pick('err.date_invalid', 'err.date_in_future')}>
          <DatePicker id="ld" value={startDate} onChange={setStartDate} today={today} />
        </Field>

        <div className="flex flex-col gap-2.5">
          <span className="px-1 text-base font-semibold text-ink">{t('loan.how_interest')}</span>
          <Choice<InterestMethod>
            columns={1}
            value={method}
            onChange={setMethod}
            label={t('loan.how_interest')}
            options={[
              { value: 'fixed_daily', label: t('method.fixed_daily'), sub: t('method.fixed_daily_eg') },
              { value: 'percent_daily', label: t('method.percent_daily'), sub: t('method.percent_daily_eg') },
              { value: 'percent_monthly', label: t('method.percent_monthly'), sub: t('method.percent_monthly_eg') },
            ]}
          />
        </div>

        {method === 'fixed_daily' ? (
          <Field label={t('loan.fixed_amount')} htmlFor="lf" error={pick('err.fixed_amount_required')}>
            <MoneyInput id="lf" value={fixedText} onChange={setFixedText} invalid={!!pick('err.fixed_amount_required')} />
          </Field>
        ) : (
          <Field
            label={method === 'percent_daily' ? t('loan.rate_daily') : t('loan.rate_monthly')}
            htmlFor="lr"
            error={pick('err.rate_required', 'err.rate_too_high')}
            hint={rateText && parseRatePercent(rateText) === null ? t('err.rate_format') : undefined}
          >
            <div className="flex min-h-14 items-center rounded-2xl border border-line bg-surface px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
              <input
                id="lr"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value.replace(/[^\d.]/g, ''))}
                className="num w-full min-w-0 bg-transparent text-xl font-bold text-ink focus:outline-none"
                placeholder="0"
              />
              <span className="text-xl font-semibold text-ink3">%</span>
              <span className="ml-2 shrink-0 text-base text-ink2">{method === 'percent_daily' ? t('loan.per_day') : t('loan.per_month')}</span>
            </div>
          </Field>
        )}

        {method === 'percent_monthly' && (
          <div className="flex flex-col gap-2.5">
            <span className="px-1 text-base font-semibold text-ink">{t('loan.daycount_q')}</span>
            <Choice<MonthlyDayCount>
              columns={1}
              value={dayCount}
              onChange={setDayCount}
              label={t('loan.daycount_q')}
              options={[
                { value: 'thirty', label: t('daycount.thirty'), sub: t('daycount.thirty_sub') },
                { value: 'actual_month', label: t('daycount.actual'), sub: t('daycount.actual_sub') },
                { value: 'annual_365', label: t('daycount.365'), sub: t('daycount.365_sub') },
              ]}
            />
            {pick('err.day_count_required') && <p className="px-1 text-base font-medium text-due">{pick('err.day_count_required')}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <span className="px-1 text-base font-semibold text-ink">{t('loan.days_off')}</span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const off = daysOff.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={off}
                  onClick={() => toggleDay(d)}
                  className={cx(
                    'min-h-12 rounded-2xl border-2 px-1 text-sm font-semibold',
                    off ? 'border-due bg-due-soft text-due' : 'border-line bg-surface text-ink2',
                  )}
                >
                  {weekdayLabel(d, lang, 'short')}
                </button>
              )
            })}
          </div>
          <p className="px-1 text-sm text-ink3">{t('loan.days_off_hint')}</p>
          {pick('err.no_chargeable_days') && <p className="px-1 text-base font-medium text-due">{pick('err.no_chargeable_days')}</p>}
        </div>

        {/* Preview */}
        {perDay !== null && (
          <div className="rounded-3xl border-2 border-brand/25 bg-brand-soft/60 p-4">
            <div className="text-base text-ink2">{t('loan.preview_day')}</div>
            <div className="num text-3xl font-bold text-brand">{money(perDay)}</div>
            <div className="num mt-1 text-base text-ink2">{t('loan.preview_30', { amount: money(perDay * 30) })}</div>
          </div>
        )}

        {/* More options */}
        <div className="rounded-3xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => setMore(!more)}
            aria-expanded={more}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold text-ink"
          >
            {t('loan.more_options')}
            <ChevronDown className={cx('text-ink3 transition', more && 'rotate-180')} aria-hidden />
          </button>
          {more && (
            <div className="flex flex-col gap-4 border-t border-line p-4">
              <Toggle checked={chargeStart} onChange={setChargeStart} label={t('loan.charge_start')} sub={t(chargeStart ? 'rule.start_same_day' : 'rule.start_next_day')} />
              <Toggle checked={chargeRepay} onChange={setChargeRepay} label={t('loan.charge_repay')} sub={t(chargeRepay ? 'rule.repay_day_charged' : 'rule.repay_day_free')} />
              {method === 'fixed_daily' && (
                <Field label={t('loan.basis_q')}>
                  <Choice<FixedAmountBasis>
                    columns={1}
                    value={basis}
                    onChange={setBasis}
                    options={[
                      { value: 'unchanged', label: t('basis.unchanged'), sub: t('basis.unchanged_sub') },
                      { value: 'proportional', label: t('basis.proportional'), sub: t('basis.proportional_sub') },
                    ]}
                  />
                </Field>
              )}
              <Field label={t('loan.alloc_q')}>
                <Choice<AllocationPolicy>
                  columns={1}
                  value={allocation}
                  onChange={setAllocation}
                  options={[
                    { value: 'interest_first', label: t('alloc.interest_first'), sub: t('rule.alloc_interest_first') },
                    { value: 'manual', label: t('alloc.manual'), sub: t('rule.alloc_manual') },
                  ]}
                />
              </Field>
              <Field label={t('loan.holidays')} hint={t('loan.holidays_hint')}>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={holidayInput}
                    min={startDate}
                    onChange={(e) => setHolidayInput(e.target.value)}
                    aria-label={t('loan.holidays')}
                    className="num min-h-12 flex-1 rounded-2xl border border-line bg-surface px-3 text-base text-ink"
                  />
                  <Button
                    icon={<Plus size={18} />}
                    disabled={!isValidISODate(holidayInput) || holidays.includes(holidayInput)}
                    onClick={() => {
                      setHolidays((h) => [...h, holidayInput].sort())
                      setHolidayInput('')
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
                {holidays.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {holidays.map((h) => (
                      <li key={h} className="inline-flex items-center gap-1 rounded-full bg-sunk py-1 pr-1 pl-3 text-sm font-semibold text-ink">
                        <CalendarX2 size={14} aria-hidden />
                        {fmtDate(h, lang)}
                        <button type="button" aria-label={t('common.remove')} onClick={() => setHolidays((x) => x.filter((y) => y !== h))} className="grid size-8 place-items-center rounded-full hover:bg-line">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label={t('loan.rounding_q')}>
                <Choice<RoundingPolicy>
                  columns={1}
                  value={rounding}
                  onChange={setRounding}
                  options={[
                    { value: 'cumulative_half_up', label: t('round.cumulative'), sub: t('rule.round_cumulative') },
                    { value: 'daily_half_up', label: t('round.daily'), sub: t('rule.round_daily') },
                  ]}
                />
              </Field>
              <Field label={t('loan.due_date')} hint={t('common.optional')} error={pick('err.due_date_invalid', 'err.due_before_start')}>
                <input
                  type="date"
                  value={dueDate}
                  min={startDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="num min-h-12 rounded-2xl border border-line bg-surface px-3 text-base text-ink"
                />
              </Field>
              <Field label={t('customers.notes')} hint={t('common.optional')}>
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </Field>
            </div>
          )}
        </div>

        {showErrors && allErrors.length > 0 && (
          <p role="alert" className="rounded-2xl bg-due-soft p-3 text-base font-medium text-due">
            {t('loan.fix_errors')}
          </p>
        )}
        {saveErrors.length > 0 && (
          <p role="alert" className="rounded-2xl bg-due-soft p-3 text-base font-medium text-due">
            {errorText(saveErrors)}
          </p>
        )}

        <Button variant="primary" size="xl" block onClick={submit} icon={<Check size={26} />}>
          {t('loan.review')}
        </Button>
        {first && (
          <Button variant="ghost" size="lg" block onClick={() => go(`/customers/${customerId}`, { replace: true })}>
            {t('loan.skip_for_now')}
          </Button>
        )}
      </div>

      <Sheet
        open={confirm}
        onClose={() => !saving && setConfirm(false)}
        title={t('loan.confirm_title')}
        footer={
          <div className="grid gap-2">
            <Button variant="primary" size="xl" block disabled={saving} onClick={save} icon={<Check size={26} />}>
              {saving ? t('common.saving') : t('loan.confirm_yes')}
            </Button>
            <Button size="lg" block disabled={saving} onClick={() => setConfirm(false)}>
              {t('collect.confirm_no')}
            </Button>
          </div>
        }
      >
        {principal !== null && (
          <div>
            <div className="text-center">
              <div className="num text-4xl font-bold tracking-tight text-ink">{money(principal)}</div>
              <div className="mt-1 text-lg font-semibold text-ink">{t('loan.confirm_to', { name: customer?.name ?? '' })}</div>
              <div className="text-base text-ink2">{fmtDate(startDate, lang)}</div>
            </div>
            <ul className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-sunk p-3.5">
              {ruleDetails(terms, t, lang).map((line) => (
                <li key={line} className="flex gap-2 text-base text-ink">
                  <Check size={18} className="mt-1 shrink-0 text-brand" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-2xl bg-part-soft p-3 text-base font-medium text-part">{t('loan.terms_locked')}</p>
          </div>
        )}
      </Sheet>
    </>
  )
}
