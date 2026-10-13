import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidISO,
  parseISODate,
  toISODate,
  addDaysISO,
  diffDaysISO,
  daysInMonthISO,
  dateRangeISO,
  isChargeable,
  dailyChargePaise,
  accrualSchedule,
  summarizeLoan,
  validateLoan,
  describeLoan,
} from "../js/interest.js";

function fixedLoan(over = {}) {
  return {
    id: "L1",
    customerId: "C1",
    principalPaise: 5000000,
    startDate: "2024-01-01",
    method: "fixed_daily",
    fixedDailyPaise: 10000,
    rounding: "paise",
    principalTiming: "next_day",
    skipWeekdays: [],
    holidays: [],
    ...over,
  };
}

// ---------- date helpers / UTC correctness ----------
test("date helpers use UTC and handle boundaries", () => {
  assert.equal(isValidISO("2024-02-29"), true);
  assert.equal(isValidISO("2023-02-29"), false);
  assert.equal(isValidISO("2024-13-01"), false);
  assert.equal(isValidISO("not-a-date"), false);
  assert.equal(addDaysISO("2024-01-31", 1), "2024-02-01");
  assert.equal(addDaysISO("2024-02-28", 1), "2024-02-29"); // leap
  assert.equal(addDaysISO("2023-02-28", 1), "2023-03-01");
  assert.equal(addDaysISO("2023-12-31", 1), "2024-01-01"); // year change
  assert.equal(diffDaysISO("2024-01-01", "2024-01-02"), 1);
  assert.equal(diffDaysISO("2024-02-28", "2024-02-29"), 1);
  assert.equal(daysInMonthISO("2024-02-15"), 29);
  assert.equal(daysInMonthISO("2023-02-15"), 28);
  assert.equal(daysInMonthISO("2024-01-10"), 31);
  assert.deepEqual(dateRangeISO("2024-01-01", "2024-01-03"), ["2024-01-01", "2024-01-02", "2024-01-03"]);
  assert.equal(toISODate(parseISODate("2024-02-29")), "2024-02-29");
});

// ---------- fixed daily ----------
test("fixed daily charge", () => {
  const loan = fixedLoan();
  assert.equal(dailyChargePaise(loan, "2024-01-01", 5000000), 10000);
  assert.equal(isChargeable(loan, "2024-01-01"), true);
  const rows = accrualSchedule(loan, [], "2024-01-01", "2024-01-05");
  assert.equal(rows.length, 5);
  for (const r of rows) assert.equal(r.charged, 10000);
  // summarizeLoan uses inclusive [start, asOf]: asOf 05 => 5 days 01..05
  const s = summarizeLoan(loan, [], "2024-01-05");
  assert.equal(s.interestAccrued, 50000);
  assert.equal(s.interestOutstanding, 50000);
  assert.equal(s.principalOutstanding, 5000000);
});

// ---------- pct daily ----------
test("pct daily charge", () => {
  const loan = fixedLoan({
    method: "pct_daily",
    dailyRatePct: 0.5,
    fixedDailyPaise: undefined,
  });
  // 1000000 * 0.5% = 5000
  assert.equal(dailyChargePaise(loan, "2024-01-01", 1000000), 5000);
  // 5000000 * 0.5% = 25000
  assert.equal(dailyChargePaise(loan, "2024-01-01", 5000000), 25000);
  const rows = accrualSchedule({ ...loan, principalPaise: 1000000 }, [], "2024-01-01", "2024-01-02");
  assert.equal(rows[0].charged, 5000);
  assert.equal(rows[1].charged, 5000);
});

// ---------- monthly both day counts ----------
test("pct monthly with thirty_360 vs actual", () => {
  const base = {
    id: "L1",
    customerId: "C1",
    principalPaise: 3000000,
    startDate: "2024-01-01",
    method: "pct_monthly",
    monthlyRatePct: 3,
    rounding: "paise",
    principalTiming: "next_day",
    skipWeekdays: [],
    holidays: [],
  };
  const loan30 = { ...base, dayCount: "thirty_360" };
  const loanActual = { ...base, dayCount: "actual" };
  // 3000000*3%/30 = 3000
  assert.equal(dailyChargePaise(loan30, "2024-01-15", 3000000), 3000);
  // Jan has 31 days: 3000000*3%/31 = 2903.225.. -> 2903
  assert.equal(dailyChargePaise(loanActual, "2024-01-15", 3000000), 2903);
  // Feb 2024 leap has 29 days: 3000000*3%/29 = 3103.44.. -> 3103
  assert.equal(dailyChargePaise(loanActual, "2024-02-15", 3000000), 3103);
  // Feb 2023 has 28 days: 3000000*3%/28 = 3214.28.. -> 3214
  assert.equal(dailyChargePaise(loanActual, "2023-02-15", 3000000), 3214);
});

// ---------- start/end boundaries ----------
test("start/end boundaries", () => {
  const loan = fixedLoan({
    startDate: "2024-03-01",
    interestStartDate: "2024-03-05",
    interestEndDate: "2024-03-07",
  });
  assert.equal(isChargeable(loan, "2024-03-04"), false);
  assert.equal(isChargeable(loan, "2024-03-05"), true);
  assert.equal(isChargeable(loan, "2024-03-07"), true);
  assert.equal(isChargeable(loan, "2024-03-08"), false);
  const rows = accrualSchedule(loan, [], "2024-03-04", "2024-03-08");
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  assert.equal(byDate["2024-03-04"].charged, 0);
  assert.equal(byDate["2024-03-05"].charged, 10000);
  assert.equal(byDate["2024-03-07"].charged, 10000);
  assert.equal(byDate["2024-03-08"].charged, 0);
});

// ---------- leap year / month / year change ----------
test("leap year, month change, year change accrue correctly", () => {
  const loan = fixedLoan({ startDate: "2024-02-28" });
  const leap = accrualSchedule(loan, [], "2024-02-28", "2024-02-29");
  assert.equal(leap.length, 2);
  assert.equal(leap[0].date, "2024-02-28");
  assert.equal(leap[1].date, "2024-02-29");
  assert.equal(leap[0].charged, 10000);
  assert.equal(leap[1].charged, 10000);

  const month = accrualSchedule(loan, [], "2024-01-31", "2024-02-01");
  assert.deepEqual(month.map((r) => r.date), ["2024-01-31", "2024-02-01"]);

  const year = accrualSchedule(fixedLoan({ startDate: "2023-12-31" }), [], "2023-12-31", "2024-01-01");
  assert.deepEqual(year.map((r) => r.date), ["2023-12-31", "2024-01-01"]);
  assert.equal(year[0].charged, 10000);
  assert.equal(year[1].charged, 10000);
});

// ---------- non-chargeable weekdays + holidays ----------
test("non-chargeable weekdays and holidays", () => {
  // 2024-01-06 is Saturday, 2024-01-07 is Sunday, 2024-01-08 Monday
  const loan = fixedLoan({
    startDate: "2024-01-06",
    skipWeekdays: [0, 6],
    holidays: ["2024-01-08"],
  });
  assert.equal(isChargeable(loan, "2024-01-06"), false);
  assert.equal(isChargeable(loan, "2024-01-07"), false);
  assert.equal(isChargeable(loan, "2024-01-08"), false);
  assert.equal(isChargeable(loan, "2024-01-09"), true);
  const rows = accrualSchedule(loan, [], "2024-01-06", "2024-01-09");
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  assert.equal(byDate["2024-01-06"].charged, 0);
  assert.equal(byDate["2024-01-06"].status, "no_charge");
  assert.equal(byDate["2024-01-09"].charged, 10000);
  assert.equal(byDate["2024-01-09"].status, "pending");
});

// ---------- unpaid carried forward without compounding ----------
test("unpaid carried forward without compounding", () => {
  const loan = fixedLoan({ startDate: "2024-01-01" });
  const rows = accrualSchedule(loan, [], "2024-01-01", "2024-01-04");
  assert.equal(rows[0].charged, 10000);
  assert.equal(rows[1].charged, 10000);
  assert.equal(rows[2].charged, 10000);
  // day-4 charge unchanged despite 3 days unpaid
  assert.equal(rows[3].charged, 10000);
  assert.equal(rows[3].principalForDay, 5000000);
  assert.equal(rows[3].outstandingInterest, 40000);
  // pct variant also must not compound: charge depends only on principal
  const ploan = fixedLoan({
    method: "pct_daily",
    dailyRatePct: 1,
    fixedDailyPaise: undefined,
    principalPaise: 1000000,
    startDate: "2024-01-01",
  });
  const prows = accrualSchedule(ploan, [], "2024-01-01", "2024-01-04");
  for (const r of prows) assert.equal(r.charged, 10000);
  assert.equal(prows[3].outstandingInterest, 40000);
});

// ---------- principal reduction both timings ----------
test("principal reduction affecting future interest (next_day)", () => {
  const loan = {
    id: "L1",
    customerId: "C1",
    principalPaise: 1000000,
    startDate: "2024-01-01",
    method: "pct_daily",
    dailyRatePct: 1,
    rounding: "paise",
    principalTiming: "next_day",
    skipWeekdays: [],
    holidays: [],
  };
  const txns = [
    {
      id: "c1",
      loanId: "L1",
      customerId: "C1",
      type: "collection",
      date: "2024-01-02",
      amountPaise: 500000,
      interestAllocPaise: 0,
      principalAllocPaise: 500000,
    },
  ];
  const rows = accrualSchedule(loan, txns, "2024-01-01", "2024-01-03");
  // next_day: repayment on 01-02 does NOT reduce 01-02 charge
  assert.equal(rows[0].principalForDay, 1000000);
  assert.equal(rows[0].charged, 10000);
  assert.equal(rows[1].principalForDay, 1000000);
  assert.equal(rows[1].charged, 10000);
  // but reduces from next day
  assert.equal(rows[2].principalForDay, 500000);
  assert.equal(rows[2].charged, 5000);
});

test("principal reduction affecting future interest (same_day)", () => {
  const loan = {
    id: "L1",
    customerId: "C1",
    principalPaise: 1000000,
    startDate: "2024-01-01",
    method: "pct_daily",
    dailyRatePct: 1,
    rounding: "paise",
    principalTiming: "same_day",
    skipWeekdays: [],
    holidays: [],
  };
  const txns = [
    {
      id: "c1",
      loanId: "L1",
      customerId: "C1",
      type: "collection",
      date: "2024-01-02",
      amountPaise: 500000,
      interestAllocPaise: 0,
      principalAllocPaise: 500000,
    },
  ];
  const rows = accrualSchedule(loan, txns, "2024-01-01", "2024-01-03");
  assert.equal(rows[0].principalForDay, 1000000);
  assert.equal(rows[0].charged, 10000);
  // same_day: repayment on 01-02 reduces 01-02 charge immediately
  assert.equal(rows[1].principalForDay, 500000);
  assert.equal(rows[1].charged, 5000);
  assert.equal(rows[2].principalForDay, 500000);
  assert.equal(rows[2].charged, 5000);
});

// ---------- MANDATORY worked test ----------
test("MANDATORY: 50000 fixed 100x5, collect 300 interest-only, then rest + 5000 principal", () => {
  const loan = {
    id: "L1",
    customerId: "C1",
    principalPaise: 5000000, // Rs 50,000
    startDate: "2024-01-01",
    method: "fixed_daily",
    fixedDailyPaise: 10000, // Rs 100
    rounding: "paise",
    principalTiming: "next_day",
    skipWeekdays: [],
    holidays: [],
  };
  // 5 days = Rs 500 accrued: [2024-01-01, 2024-01-05] inclusive => 01..05
  let s = summarizeLoan(loan, [], "2024-01-05");
  assert.equal(s.interestAccrued, 50000);
  assert.equal(s.principalOutstanding, 5000000);

  // collect Rs 300 interest-only on day 5
  const txns1 = [
    {
      id: "col1",
      loanId: "L1",
      customerId: "C1",
      type: "collection",
      date: "2024-01-05",
      amountPaise: 30000,
      interestAllocPaise: 30000,
      principalAllocPaise: 0,
    },
  ];
  s = summarizeLoan(loan, txns1, "2024-01-05");
  assert.equal(s.interestAccrued, 50000);
  assert.equal(s.interestReceived, 30000);
  assert.equal(s.interestOutstanding, 20000);
  assert.equal(s.principalOutstanding, 5000000);

  const rows1 = accrualSchedule(loan, txns1, "2024-01-01", "2024-01-05");
  const day5 = rows1.find((r) => r.date === "2024-01-05");
  assert.equal(day5.charged, 10000);
  assert.equal(day5.interestReceived, 30000);
  // cumulative: 50000 - 30000 = 20000 pending
  assert.equal(day5.outstandingInterest, 20000);

  // then collect remaining 20000 interest + separate 500000 principal repayment
  // (same-day window: all collections dated 2024-01-05, asOf 2024-01-05 inclusive)
  const txnsFinal = [
    txns1[0],
    {
      id: "col2b",
      loanId: "L1",
      customerId: "C1",
      type: "collection",
      date: "2024-01-05",
      amountPaise: 20000,
      interestAllocPaise: 20000,
      principalAllocPaise: 0,
    },
    {
      id: "col3b",
      loanId: "L1",
      customerId: "C1",
      type: "collection",
      date: "2024-01-05",
      amountPaise: 500000,
      interestAllocPaise: 0,
      principalAllocPaise: 500000,
    },
  ];
  const sFinal = summarizeLoan(loan, txnsFinal, "2024-01-05");
  assert.equal(sFinal.interestAccrued, 50000);
  assert.equal(sFinal.interestReceived, 50000);
  assert.equal(sFinal.interestOutstanding, 0);
  assert.equal(sFinal.principalOutstanding, 4500000);
  assert.equal(sFinal.totalOutstanding, 4500000);
});

// ---------- validate + describe ----------
test("validateLoan catches bad configs", () => {
  assert.ok(validateLoan({}).length > 0);
  assert.ok(validateLoan({ customerId: "", principalPaise: 0, startDate: "bad", method: "bogus" }).length >= 3);
  const badFixed = fixedLoan({ fixedDailyPaise: 0 });
  assert.ok(validateLoan(badFixed).some((e) => /fixedDaily/i.test(e)));
  const badPct = fixedLoan({ method: "pct_daily", dailyRatePct: 0, fixedDailyPaise: undefined });
  assert.ok(validateLoan(badPct).some((e) => /dailyRate/i.test(e)));
  const badPctHigh = fixedLoan({ method: "pct_daily", dailyRatePct: 150, fixedDailyPaise: undefined });
  assert.ok(validateLoan(badPctHigh).length > 0);
  const badMonthly = fixedLoan({ method: "pct_monthly", monthlyRatePct: 5, dayCount: undefined, fixedDailyPaise: undefined });
  assert.ok(validateLoan(badMonthly).some((e) => /dayCount/i.test(e)));
  const badRounding = fixedLoan({ rounding: "bogus" });
  assert.ok(validateLoan(badRounding).some((e) => /rounding/i.test(e)));
  const badTiming = fixedLoan({ principalTiming: "bogus" });
  assert.ok(validateLoan(badTiming).some((e) => /principalTiming/i.test(e)));
  const badPolicy = fixedLoan({ allocationPolicy: "bogus" });
  assert.ok(validateLoan(badPolicy).some((e) => /allocationPolicy/i.test(e)));
  const badEnd = fixedLoan({ interestStartDate: "2024-02-01", interestEndDate: "2024-01-01" });
  assert.ok(validateLoan(badEnd).some((e) => /end/i.test(e)));
  const badDue = fixedLoan({ dueDate: "not-a-date" });
  assert.ok(validateLoan(badDue).some((e) => /due/i.test(e)));
  const farFuture = fixedLoan({ startDate: addDaysISO(toISODate(new Date()), 60) });
  assert.ok(validateLoan(farFuture).some((e) => /future/i.test(e)));
  assert.deepEqual(validateLoan(fixedLoan()), []);
});

test("describeLoan is human readable", () => {
  const s = describeLoan(fixedLoan());
  assert.match(s, /₹/);
  assert.match(s, /without compounding/i);
});

test("compat: daily_simple annualRatePct and inclusive schedule (ledger rollups)", () => {
  const loan = {
    id: "L1",
    customerId: "C1",
    principalPaise: 100000,
    startDate: "2026-01-01",
    annualRatePct: 36.5,
    method: "daily_simple",
    rounding: "per_day",
    status: "active",
  };
  // 100/day
  assert.equal(dailyChargePaise(loan, "2026-01-05", 100000), 100);
  assert.deepEqual(validateLoan({ ...loan, principalPaise: 100000 }), []);
  // inclusive 4-arg schedule: 01-01..01-10 = 10 days
  const sched = accrualSchedule(loan, [], "2026-01-01", "2026-01-10");
  assert.equal(sched.length, 10);
  assert.ok(sched.every((r) => r.charged === 100 && r.interestForDay === 100));
  const s = summarizeLoan(loan, [], "2026-01-10");
  assert.equal(s.interestAccrued, 1000);
  assert.equal(s.principalLent, 100000);
  assert.equal(s.principalDisbursed, 100000);
});
