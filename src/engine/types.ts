import type { ISODate } from './dates'
import type { Paise } from './money'

export type InterestMethod =
  /** A fixed rupee amount for every chargeable day, e.g. ₹100/day. */
  | 'fixed_daily'
  /** A percentage of principal for every chargeable day. */
  | 'percent_daily'
  /** A percentage of principal per month, spread over days by a day-count rule. */
  | 'percent_monthly'

/** How a monthly rate becomes a daily amount. */
export type MonthlyDayCount =
  /** monthly amount ÷ 30, every month */
  | 'thirty'
  /** monthly amount ÷ actual days in that calendar month (28–31) */
  | 'actual_month'
  /** monthly amount × 12 ÷ 365, every day (also in leap years) */
  | 'annual_365'

/** What a fixed daily amount does when the principal changes. */
export type FixedAmountBasis =
  /** stays the same while any principal is outstanding */
  | 'unchanged'
  /** scales with principal: fixed × current principal ÷ original principal */
  | 'proportional'

export type RoundingPolicy =
  /**
   * Keep the exact running total for the loan and round it to the nearest
   * paisa (halves up). Each day's charge is today's rounded total minus
   * yesterday's, so the sum of the days always equals the rounded total.
   */
  | 'cumulative_half_up'
  /** Round each day's exact amount to the nearest paisa, halves up. */
  | 'daily_half_up'

export type AllocationPolicy =
  /** Pay outstanding interest first, the rest reduces principal. */
  | 'interest_first'
  /** The owner splits every collection between interest and principal. */
  | 'manual'

export interface LoanTerms {
  method: InterestMethod
  /** fixed_daily only */
  fixedDailyPaise?: Paise
  /** percent methods only: percent × 10^4 (2% = 20000) */
  rateE4?: number
  /** percent_monthly only */
  monthlyDayCount?: MonthlyDayCount
  /** fixed_daily only */
  fixedAmountBasis?: FixedAmountBasis
  /** Is interest charged for the day money is given (start date, or a top-up date)? */
  chargeDisbursementDay: boolean
  /** Is the repaid amount still charged for the day it is repaid (end date)? */
  chargeRepaymentDay: boolean
  /** Weekdays with no interest. 0 = Sunday ... 6 = Saturday. */
  nonChargeableWeekdays: number[]
  /** Specific dates with no interest (holidays). */
  nonChargeableDates: ISODate[]
  rounding: RoundingPolicy
  allocationPolicy: AllocationPolicy
}

export interface Customer {
  id: string
  /** Short human ID shown in the app, e.g. C-0007. */
  code: string
  name: string
  phone: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Loan {
  id: string
  /** Short human ID, e.g. L-0012. */
  code: string
  customerId: string
  startDate: ISODate
  terms: LoanTerms
  dueDate?: ISODate
  notes: string
  createdAt: string
}

export type TxType =
  /** Money given at loan start. */
  | 'disbursement'
  /** Extra money given later on the same loan. */
  | 'principal_increase'
  /** Cash received. Split into interest and principal. */
  | 'collection'
  /** Interest forgiven (no cash). */
  | 'interest_waiver'
  /** Principal forgiven (no cash). */
  | 'principal_waiver'
  /** Cancels another transaction. The original stays in history. */
  | 'reversal'

export interface Transaction {
  id: string
  /** Short human ID shown on receipts, e.g. T-000042. */
  code: string
  loanId: string
  type: TxType
  /** The date the money moved. */
  date: ISODate
  /** When it was entered (ISO timestamp). */
  createdAt: string
  amountPaise: Paise
  /** Part of amount that is interest (collection, interest_waiver). */
  interestPaise: Paise
  /** Part of amount that is principal (disbursement, increase, collection, principal_waiver). */
  principalPaise: Paise
  /** Always 'cash' for money that changes hands. */
  method?: 'cash'
  notes: string
  /** For type 'reversal': the transaction being cancelled. */
  reversesId?: string
  /** One per user action; posting the same requestId twice is refused. */
  requestId: string
}

export type DayStatus = 'collected' | 'partial' | 'pending' | 'no_charge'

export type NoChargeReason = 'weekday' | 'holiday' | 'no_principal' | 'start_day'
