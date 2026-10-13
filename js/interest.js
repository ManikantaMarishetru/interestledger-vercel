/**
 * InterestLedger deterministic daily-interest engine.
 * Plain JS, zero dependencies. All money = integer paise.
 * All dates = ISO YYYY-MM-DD parsed as UTC (Date.UTC).
 */
import { formatINR } from "./money.js";

export function isValidISO(s) {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function parseISODate(s) {
  if (!isValidISO(s)) throw new Error(`Invalid date "${s}". Use YYYY-MM-DD.`);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime()))
    throw new Error("Invalid Date.");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso, n) {
  if (!isValidISO(iso)) throw new Error(`Invalid date "${iso}". Use YYYY-MM-DD.`);
  if (!Number.isInteger(n)) throw new Error("Days must be an integer.");
  const dt = parseISODate(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISODate(dt);
}

export function diffDaysISO(a, b) {
  const da = parseISODate(a);
  const db = parseISODate(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function daysInMonthISO(iso) {
  if (!isValidISO(iso)) throw new Error(`Invalid date "${iso}". Use YYYY-MM-DD.`);
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)); // 1-12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dateRangeISO(fromISO, toISO) {
  if (!isValidISO(fromISO) || !isValidISO(toISO))
    throw new Error("Invalid date range. Use YYYY-MM-DD.");
  const n = diffDaysISO(fromISO, toISO);
  if (n < 0) return [];
  const out = [];
  for (let i = 0; i <= n; i++) out.push(addDaysISO(fromISO, i));
  return out;
}

function effectiveStartISO(loan) {
  if (!loan || typeof loan !== "object") return null;
  if (typeof loan.interestStartDate === "string" && isValidISO(loan.interestStartDate))
    return loan.interestStartDate;
  if (typeof loan.startDate === "string" && isValidISO(loan.startDate))
    return loan.startDate;
  return null;
}

export function isChargeable(loan, dateISO) {
  if (!loan || typeof loan !== "object") return false;
  if (!isValidISO(dateISO)) return false;
  const start = effectiveStartISO(loan);
  if (!start) return false;
  if (dateISO < start) return false;
  if (
    typeof loan.interestEndDate === "string" &&
    loan.interestEndDate !== "" &&
    isValidISO(loan.interestEndDate)
  ) {
    if (dateISO > loan.interestEndDate) return false;
  }
  const skips = Array.isArray(loan.skipWeekdays) ? loan.skipWeekdays : [];
  if (skips.length > 0) {
    const wd = parseISODate(dateISO).getUTCDay();
    if (skips.includes(wd)) return false;
  }
  const hols = Array.isArray(loan.holidays) ? loan.holidays : [];
  for (const h of hols) {
    if (typeof h === "string" && h.slice(0, 10) === dateISO) return false;
  }
  return true;
}

function normalizeRounding(rounding) {
  if (rounding == null || rounding === "") return "paise";
  if (rounding === "per_day" || rounding === "per-day") return "paise";
  return rounding;
}

function applyRounding(raw, rounding) {
  const r = normalizeRounding(rounding);
  if (r === "rupee") return Math.round(raw / 100) * 100;
  if (r === "floor") return Math.floor(raw);
  if (r === "paise") return Math.round(raw);
  throw new Error(`Unknown rounding "${rounding}". Use paise, rupee or floor.`);
}

function annualRateOf(loan) {
  if (typeof loan.annualRatePct === "number" && Number.isFinite(loan.annualRatePct)) return loan.annualRatePct;
  if (typeof loan.annualRate === "number" && Number.isFinite(loan.annualRate)) return loan.annualRate;
  return undefined;
}

function assertLoanConfigForCharge(loan) {
  if (!loan || typeof loan !== "object") throw new Error("Invalid loan.");
  const methods = ["fixed_daily", "pct_daily", "pct_monthly", "daily_simple"];
  if (!methods.includes(loan.method))
    throw new Error(`Unknown method "${loan.method}".`);
  const rounding = normalizeRounding(loan.rounding);
  if (!["paise", "rupee", "floor"].includes(rounding))
    throw new Error(`Unknown rounding "${loan.rounding}".`);
  if (loan.method === "fixed_daily") {
    if (!Number.isInteger(loan.fixedDailyPaise) || loan.fixedDailyPaise <= 0)
      throw new Error("fixedDailyPaise must be a positive integer paise.");
  } else if (loan.method === "pct_daily") {
    if (
      typeof loan.dailyRatePct !== "number" ||
      !Number.isFinite(loan.dailyRatePct) ||
      loan.dailyRatePct <= 0 ||
      loan.dailyRatePct > 100
    )
      throw new Error("dailyRatePct must be more than 0 and at most 100.");
  } else if (loan.method === "pct_monthly") {
    if (
      typeof loan.monthlyRatePct !== "number" ||
      !Number.isFinite(loan.monthlyRatePct) ||
      loan.monthlyRatePct <= 0 ||
      loan.monthlyRatePct > 100
    )
      throw new Error("monthlyRatePct must be more than 0 and at most 100.");
    if (!["actual", "thirty_360"].includes(loan.dayCount))
      throw new Error('dayCount is required. Use actual or thirty_360.');
  } else if (loan.method === "daily_simple") {
    const a = annualRateOf(loan);
    if (typeof a !== "number" || !Number.isFinite(a) || a <= 0 || a > 100)
      throw new Error("annualRatePct must be more than 0 and at most 100 when method is daily_simple.");
  }
}

export function dailyChargePaise(loan, dateISO, principalPaise) {
  assertLoanConfigForCharge(loan);
  if (!isValidISO(dateISO)) throw new Error(`Invalid date "${dateISO}". Use YYYY-MM-DD.`);
  if (!Number.isInteger(principalPaise) || principalPaise < 0)
    throw new Error("principalPaise must be a non-negative integer.");
  if (principalPaise === 0) return 0;
  const rounding = normalizeRounding(loan.rounding);
  if (loan.method === "fixed_daily") {
    return loan.fixedDailyPaise;
  }
  if (loan.method === "pct_daily") {
    const raw = (principalPaise * loan.dailyRatePct) / 100;
    const v = applyRounding(raw, rounding);
    return v < 0 ? 0 : v;
  }
  if (loan.method === "daily_simple") {
    const a = annualRateOf(loan);
    const raw = (principalPaise * a) / 100 / 365;
    const v = applyRounding(raw, rounding);
    return v < 0 ? 0 : v;
  }
  // pct_monthly
  const divisor =
    loan.dayCount === "thirty_360" ? 30 : daysInMonthISO(dateISO);
  const raw = (principalPaise * loan.monthlyRatePct) / 100 / divisor;
  const v = applyRounding(raw, rounding);
  return v < 0 ? 0 : v;
}

// ---- transaction helpers ----
function txnDateISO(t) {
  if (!t || typeof t.date !== "string") return null;
  const s = t.date.slice(0, 10);
  return isValidISO(s) ? s : null;
}

function buildIdMap(transactions) {
  const m = new Map();
  for (const t of transactions) {
    if (t && typeof t.id === "string") m.set(t.id, t);
  }
  return m;
}

function isRepaymentTx(t, byId) {
  if (!t || t.void) return false;
  if (t.type === "collection") return true;
  if (t.type === "reversal") {
    const orig = t.reversesId ? byId.get(t.reversesId) : null;
    if (!orig) return true; // unknown reversal: treat as repayment (negative allocs net off)
    return orig.type === "collection";
  }
  return false;
}

function isAdjustmentTx(t, byId) {
  if (!t || t.void) return false;
  if (t.type === "adjustment") return true;
  if (t.type === "reversal") {
    const orig = t.reversesId ? byId.get(t.reversesId) : null;
    if (!orig) return false;
    return orig.type === "adjustment" || orig.type === "disbursement";
  }
  return false;
}

function repaymentPrincipalOf(t) {
  if (!t || typeof t !== "object") return 0;
  for (const k of ["principalAllocPaise", "principalAlloc", "principal_alloc"]) {
    if (Number.isInteger(t[k])) return t[k];
  }
  return 0;
}

function repaymentInterestOf(t) {
  if (!t || typeof t !== "object") return 0;
  for (const k of ["interestAllocPaise", "interestAlloc", "interest_alloc"]) {
    if (Number.isInteger(t[k])) return t[k];
  }
  return 0;
}

function adjustmentDeltaOf(t) {
  if (!t || typeof t !== "object") return 0;
  for (const k of ["principalAllocPaise", "principalAlloc", "principal_alloc"]) {
    if (Number.isInteger(t[k])) return t[k];
  }
  if (Number.isInteger(t.amountPaise)) return t.amountPaise;
  if (Number.isInteger(t.amount)) return t.amount;
  return 0;
}

function matchesLoan(loan, t) {
  if (!loan || !loan.id) return true;
  if (!t || !t.loanId) return true;
  return t.loanId === loan.id;
}

export function accrualSchedule(loan, transactions, fromISO, toISO) {
  if (!loan || typeof loan !== "object") throw new Error("Invalid loan.");
  const effStart = effectiveStartISO(loan);
  if (!effStart) throw new Error("Loan start date is invalid.");
  // Validate config early so bad loans throw deterministically.
  assertLoanConfigForCharge(loan);
  const timing = loan.principalTiming == null || loan.principalTiming === "" ? "next_day" : loan.principalTiming;
  if (!["next_day", "same_day"].includes(timing))
    throw new Error(`Unknown principalTiming "${loan.principalTiming}".`);

  // Calling conventions:
  // - 4-arg with both dates valid: inclusive range [from, to] (deterministic engine contract).
  // - 3-arg with only fromISO valid (toISO missing): treat fromISO as asOf exclusive,
  //   i.e. range [effStart, fromISO) for ledger rollups (interest accrues up to day before asOf).
  // - neither valid: [effStart, today) exclusive.
  let dates;
  const fromValid = isValidISO(fromISO);
  const toValid = isValidISO(toISO);
  if (fromValid && toValid) {
    if (fromISO > toISO) return [];
    dates = dateRangeISO(fromISO, toISO);
  } else if (fromValid && !toValid) {
    const asOf = fromISO;
    if (asOf <= effStart) return [];
    const endIncl = addDaysISO(asOf, -1);
    if (endIncl < effStart) return [];
    dates = dateRangeISO(effStart, endIncl);
  } else if (!fromValid && toValid) {
    // Only to provided: [effStart, to) exclusive if to > effStart, else [effStart, to] inclusive fallback.
    // Prefer exclusive to match ledger asOf semantics.
    if (toISO <= effStart) return [];
    const endIncl = addDaysISO(toISO, -1);
    if (endIncl < effStart) return [];
    dates = dateRangeISO(effStart, endIncl);
  } else {
    const today = todayUTCISO();
    if (today <= effStart) return [];
    dates = dateRangeISO(effStart, addDaysISO(today, -1));
  }

  const list = Array.isArray(transactions) ? transactions.filter((t) => t && !t.void && matchesLoan(loan, t)) : [];
  const byId = buildIdMap(Array.isArray(transactions) ? transactions : []);

  const basePrincipal = Number.isInteger(loan.principalPaise) ? loan.principalPaise : 0;

  // Pre-extract dated adjustment / repayment entries for O(N*M) scan (N days small in tests).
  const rows = [];
  let cumCharged = 0;
  let cumInterestReceivedExact = 0;

  for (const D of dates) {
    let adjSum = 0;
    let repayBeforeOrOn = 0; // depends on timing
    // For outstandingPrincipal (end-of-day) we also need repay on D.
    let repayOnDay = 0;
    let interestOnDay = 0;
    let principalOnDay = 0;

    for (const t of list) {
      const td = txnDateISO(t);
      if (!td) continue;
      if (isAdjustmentTx(t, byId)) {
        if (td <= D) adjSum += adjustmentDeltaOf(t);
      } else if (isRepaymentTx(t, byId)) {
        const p = repaymentPrincipalOf(t);
        const iv = repaymentInterestOf(t);
        if (timing === "same_day") {
          if (td <= D) repayBeforeOrOn += p;
        } else {
          if (td < D) repayBeforeOrOn += p;
        }
        if (td === D) {
          repayOnDay += 0; // computed below via principalOnDay; keep for clarity
          interestOnDay += iv;
          principalOnDay += p;
        }
      }
    }
    // repayOnDay tracking: principalOnDay already holds sum for exactly D
    void repayOnDay;

    let rawForDay = basePrincipal + adjSum - repayBeforeOrOn;
    // Clamp negative principal (overpay rejected upstream) to 0 for display+math.
    let principalForDay = rawForDay < 0 ? 0 : rawForDay;
    if (!Number.isSafeInteger(principalForDay)) principalForDay = Math.max(0, Math.trunc(principalForDay));

    const chargeable = isChargeable(loan, D);
    const charged = chargeable ? dailyChargePaise(loan, D, principalForDay) : 0;

    cumCharged += charged;
    cumInterestReceivedExact += interestOnDay;
    const exactOutstanding = cumCharged - cumInterestReceivedExact;
    const outstandingInterest = exactOutstanding < 0 ? 0 : exactOutstanding;

    let outstandingPrincipal;
    if (timing === "same_day") {
      outstandingPrincipal = principalForDay;
    } else {
      outstandingPrincipal = principalForDay - principalOnDay;
    }
    if (outstandingPrincipal < 0) outstandingPrincipal = 0;

    let status;
    if (!chargeable && interestOnDay === 0 && principalOnDay === 0) {
      status = "no_charge";
    } else if (charged > 0 && interestOnDay >= charged) {
      status = "collected";
    } else if (charged > 0 && interestOnDay > 0 && interestOnDay < charged) {
      status = "partial";
    } else if (charged > 0 && interestOnDay === 0) {
      status = "pending";
    } else if (charged === 0 && interestOnDay === 0) {
      status = "no_charge";
    } else if (charged === 0 && interestOnDay > 0) {
      status = "collected";
    } else {
      status = "no_charge";
    }

    rows.push({
      date: D,
      principalForDay,
      charged,
      interestForDay: charged,
      interestReceived: interestOnDay,
      principalReceived: principalOnDay,
      outstandingInterest,
      outstandingPrincipal,
      status,
    });
  }
  return rows;
}

function todayUTCISO() {
  return toISODate(new Date());
}

export function summarizeLoan(loan, transactions, asOfISO) {
  if (!loan || typeof loan !== "object") throw new Error("Invalid loan.");
  const effStart = effectiveStartISO(loan);
  if (!effStart) throw new Error("Loan start date is invalid.");
  const asOf = isValidISO(asOfISO) ? asOfISO : todayUTCISO();

  // Inclusive day count: interest accrues on [effStart, asOf] (both ends inclusive).
  // Collections dated exactly asOf are included (end-of-day view), matching perDay.
  let perDay = [];
  if (asOf >= effStart) {
    perDay = accrualSchedule(loan, transactions, effStart, asOf);
  }

  const list = Array.isArray(transactions) ? transactions.filter((t) => t && !t.void && matchesLoan(loan, t)) : [];
  const byId = buildIdMap(Array.isArray(transactions) ? transactions : []);
  const basePrincipal = Number.isInteger(loan.principalPaise) ? loan.principalPaise : 0;

  let adjSum = 0;
  let repaySum = 0;
  let interestReceivedTotal = 0;
  for (const t of list) {
    const td = txnDateISO(t);
    if (!td) continue;
    if (td > asOf) continue;
    if (isAdjustmentTx(t, byId)) {
      adjSum += adjustmentDeltaOf(t);
    } else if (isRepaymentTx(t, byId)) {
      repaySum += repaymentPrincipalOf(t);
      interestReceivedTotal += repaymentInterestOf(t);
    }
  }

  let interestAccrued = 0;
  for (const r of perDay) {
    interestAccrued += r.charged;
  }
  const interestReceived = interestReceivedTotal;

  const principalDisbursed = basePrincipal + adjSum;
  const principalRepaid = repaySum;
  let principalOutstanding = principalDisbursed - principalRepaid;
  if (principalOutstanding < 0) principalOutstanding = 0;
  let interestOutstanding = interestAccrued - interestReceived;
  if (interestOutstanding < 0) interestOutstanding = 0;
  const totalOutstanding = principalOutstanding + interestOutstanding;

  return {
    principalDisbursed,
    principalLent: principalDisbursed,
    principalRepaid,
    principalOutstanding,
    interestAccrued,
    interestReceived,
    interestCollected: interestReceived,
    interestOutstanding,
    totalOutstanding,
    perDay,
  };
}

export function validateLoan(input) {
  const errors = [];
  const l = input && typeof input === "object" ? input : {};

  if (!l.customerId || String(l.customerId).trim() === "") {
    errors.push("Customer is required.");
  }

  if (!Number.isInteger(l.principalPaise) || l.principalPaise <= 0) {
    errors.push("Principal must be a positive integer paise greater than zero.");
  }

  if (!isValidISO(l.startDate)) {
    errors.push("Start date is invalid. Use YYYY-MM-DD.");
  } else {
    try {
      const today = todayUTCISO();
      const diff = diffDaysISO(today, l.startDate);
      if (diff > 30) {
        errors.push("Start date is too far in the future (more than 30 days ahead).");
      }
    } catch {
      errors.push("Start date is invalid. Use YYYY-MM-DD.");
    }
  }

  const methods = ["fixed_daily", "pct_daily", "pct_monthly", "daily_simple"];
  if (!methods.includes(l.method)) {
    errors.push(`Unknown method "${l.method}". Use fixed_daily, pct_daily, pct_monthly or daily_simple.`);
  } else {
    if (l.method === "fixed_daily") {
      if (!Number.isInteger(l.fixedDailyPaise) || l.fixedDailyPaise <= 0) {
        errors.push("fixedDailyPaise must be a positive integer paise when method is fixed_daily.");
      }
    }
    if (l.method === "pct_daily") {
      if (
        typeof l.dailyRatePct !== "number" ||
        !Number.isFinite(l.dailyRatePct) ||
        l.dailyRatePct <= 0 ||
        l.dailyRatePct > 100
      ) {
        errors.push("dailyRatePct must be more than 0 and at most 100 when method is pct_daily.");
      }
    }
    if (l.method === "pct_monthly") {
      if (
        typeof l.monthlyRatePct !== "number" ||
        !Number.isFinite(l.monthlyRatePct) ||
        l.monthlyRatePct <= 0 ||
        l.monthlyRatePct > 100
      ) {
        errors.push("monthlyRatePct must be more than 0 and at most 100 when method is pct_monthly.");
      }
      if (!["actual", "thirty_360"].includes(l.dayCount)) {
        errors.push("dayCount is required when method is pct_monthly. Use actual or thirty_360.");
      }
    }
    if (l.method === "daily_simple") {
      const a = typeof l.annualRatePct === "number" ? l.annualRatePct : l.annualRate;
      if (typeof a !== "number" || !Number.isFinite(a) || a <= 0 || a > 100) {
        errors.push("annualRatePct must be more than 0 and at most 100 when method is daily_simple.");
      }
    }
  }

  if (
    l.method !== "pct_monthly" &&
    l.dayCount !== undefined &&
    l.dayCount !== null &&
    l.dayCount !== "" &&
    !["actual", "thirty_360"].includes(l.dayCount)
  ) {
    errors.push('dayCount must be actual or thirty_360.');
  }

  if (
    l.rounding !== undefined &&
    l.rounding !== null &&
    l.rounding !== "" &&
    !["paise", "per_day", "rupee", "floor"].includes(l.rounding)
  ) {
    errors.push(`Unknown rounding "${l.rounding}". Use paise, rupee or floor.`);
  }

  if (
    l.principalTiming !== undefined &&
    l.principalTiming !== null &&
    l.principalTiming !== "" &&
    !["next_day", "same_day"].includes(l.principalTiming)
  ) {
    errors.push(`Unknown principalTiming "${l.principalTiming}". Use next_day or same_day.`);
  }

  if (
    l.allocationPolicy !== undefined &&
    l.allocationPolicy !== null &&
    l.allocationPolicy !== "" &&
    !["interest_first", "principal_first", "pro_rata"].includes(l.allocationPolicy)
  ) {
    errors.push(`Unknown allocationPolicy "${l.allocationPolicy}". Use interest_first, principal_first or pro_rata.`);
  }

  if (
    l.interestStartDate !== undefined &&
    l.interestStartDate !== null &&
    l.interestStartDate !== "" &&
    !isValidISO(l.interestStartDate)
  ) {
    errors.push("Interest start date is invalid. Use YYYY-MM-DD.");
  }
  if (
    l.interestEndDate !== undefined &&
    l.interestEndDate !== null &&
    l.interestEndDate !== "" &&
    !isValidISO(l.interestEndDate)
  ) {
    errors.push("Interest end date is invalid. Use YYYY-MM-DD.");
  }

  let effStart = null;
  if (isValidISO(l.interestStartDate)) effStart = l.interestStartDate;
  else if (isValidISO(l.startDate)) effStart = l.startDate;
  if (isValidISO(l.interestEndDate) && effStart && l.interestEndDate < effStart) {
    errors.push("Interest end date cannot be before interest start date.");
  }

  if (
    l.dueDate !== undefined &&
    l.dueDate !== null &&
    l.dueDate !== "" &&
    !isValidISO(l.dueDate)
  ) {
    errors.push("Due date is invalid. Use YYYY-MM-DD.");
  }

  if (l.skipWeekdays !== undefined && l.skipWeekdays !== null) {
    if (
      !Array.isArray(l.skipWeekdays) ||
      l.skipWeekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)
    ) {
      errors.push("skipWeekdays must be an array of weekdays 0-6.");
    }
  }

  if (l.holidays !== undefined && l.holidays !== null) {
    if (
      !Array.isArray(l.holidays) ||
      l.holidays.some((h) => typeof h !== "string" || !isValidISO(h.slice(0, 10)))
    ) {
      errors.push("holidays must be an array of YYYY-MM-DD dates.");
    }
  }

  return errors;
}

export function describeLoan(loan) {
  const l = loan && typeof loan === "object" ? loan : {};
  const principalStr = Number.isInteger(l.principalPaise) ? formatINR(l.principalPaise) : "—";
  let terms = "";
  if (l.method === "fixed_daily" && Number.isInteger(l.fixedDailyPaise)) {
    terms = `${principalStr} at ${formatINR(l.fixedDailyPaise)} per chargeable day`;
  } else if (l.method === "pct_daily" && typeof l.dailyRatePct === "number") {
    terms = `${principalStr} at ${l.dailyRatePct}% per day`;
  } else if (l.method === "pct_monthly" && typeof l.monthlyRatePct === "number") {
    const dc = l.dayCount === "thirty_360" ? "30-day month" : "actual days in month";
    terms = `${principalStr} at ${l.monthlyRatePct}% per month (${dc})`;
  } else if (l.method === "daily_simple" && typeof (l.annualRatePct ?? l.annualRate) === "number") {
    const a = l.annualRatePct ?? l.annualRate;
    terms = `${principalStr} at ${a}% per year (simple daily)`;
  } else {
    terms = `${principalStr} loan`;
  }
  const timingNote =
    (l.principalTiming || "next_day") === "same_day"
      ? "Principal repayments reduce interest from the same day."
      : "Principal repayments reduce interest from the next day.";
  const lines = [
    `${terms}.`,
    `Interest accrues only on chargeable days. ${timingNote}`,
    `Unpaid interest carries forward without compounding.`,
  ];
  return lines.join(" ");
}
