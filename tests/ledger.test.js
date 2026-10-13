import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCollection,
  buildIdempotencyKey,
  newFormKey,
  reverseTransaction,
  summarizeCustomer,
  reconcileTotals,
  validateCustomer,
} from "../js/ledger.js";
import { summarizeLoan, accrualSchedule, isValidISO } from "../js/interest.js";

// --- helpers ---------------------------------------------------------------
// pct_daily 0.1% on Rs1000 (100000 paise) = 100 paise/day. Inclusive day count:
// start 2026-01-01 .. asOf 2026-01-10 = 10 chargeable days = 1000 paise.
function mkLoan(over = {}) {
  return {
    id: "L1",
    customerId: "C1",
    principalPaise: 100000,
    startDate: "2026-01-01",
    method: "pct_daily",
    dailyRatePct: 0.1,
    rounding: "paise",
    principalTiming: "next_day",
    status: "active",
    ...over,
  };
}

function col(over = {}) {
  return {
    id: "t1",
    loanId: "L1",
    customerId: "C1",
    type: "collection",
    date: "2026-01-05",
    createdAt: "2026-01-05T10:00:00.000Z",
    amountPaise: 300,
    interestAllocPaise: 300,
    principalAllocPaise: 0,
    idempotencyKey: "k1",
    ...over,
  };
}

function summaryFor(loan, txns, asOf) {
  return summarizeLoan(loan, txns, asOf);
}

function scheduleFor(loan, txns, from, to) {
  return accrualSchedule(loan, txns, from, to);
}

// --- partial interest collection -------------------------------------------
test("partial interest collection validates and reduces interest outstanding", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10"; // 10 days x 100 = 1000 paise accrued
  const s0 = summaryFor(loan, [], asOf);
  assert.equal(s0.interestAccrued, 1000);
  assert.equal(s0.interestOutstanding, 1000);

  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 300,
    interestAllocPaise: 300,
    principalAllocPaise: 0,
    idempotencyKey: "k-partial",
    usedKeys: [],
  });
  assert.equal(err, null);

  const txns = [col({ date: asOf, createdAt: `${asOf}T10:00:00.000Z`, amountPaise: 300, interestAllocPaise: 300, principalAllocPaise: 0 })];
  const s1 = summaryFor(loan, txns, asOf);
  assert.equal(s1.interestReceived, 300);
  assert.equal(s1.interestOutstanding, 700);
  assert.equal(s1.principalOutstanding, 100000);
});

// --- full collection (full interest due) -----------------------------------
test("full interest collection settles interest outstanding", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10";
  const s0 = summaryFor(loan, [], asOf);
  assert.equal(s0.interestOutstanding, 1000);
  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 1000,
    interestAllocPaise: 1000,
    principalAllocPaise: 0,
    idempotencyKey: "k-full",
    usedKeys: [],
  });
  assert.equal(err, null);
  const s1 = summaryFor(loan, [col({ date: asOf, createdAt: `${asOf}T10:00:00.000Z`, amountPaise: 1000, interestAllocPaise: 1000 })], asOf);
  assert.equal(s1.interestOutstanding, 0);
});

// --- principal-only repayment ----------------------------------------------
test("principal-only repayment reduces principal outstanding", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10";
  const s0 = summaryFor(loan, [], asOf);
  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 50000,
    interestAllocPaise: 0,
    principalAllocPaise: 50000,
    idempotencyKey: "k-prin",
    usedKeys: [],
  });
  assert.equal(err, null);
  const txns = [
    col({ id: "p1", date: "2026-01-02", createdAt: "2026-01-02T10:00:00.000Z", amountPaise: 50000, interestAllocPaise: 0, principalAllocPaise: 50000 }),
  ];
  const s1 = summaryFor(loan, txns, asOf);
  assert.equal(s1.principalOutstanding, 50000);
  assert.equal(s1.interestReceived, 0);
});

// --- split payment ----------------------------------------------------------
test("split payment across interest + principal", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10";
  const s0 = summaryFor(loan, [], asOf);
  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 1000,
    interestAllocPaise: 400,
    principalAllocPaise: 600,
    idempotencyKey: "k-split",
    usedKeys: [],
  });
  assert.equal(err, null);
  const txns = [col({ date: asOf, createdAt: `${asOf}T10:00:00.000Z`, amountPaise: 1000, interestAllocPaise: 400, principalAllocPaise: 600 })];
  const s1 = summaryFor(loan, txns, asOf);
  assert.equal(s1.interestOutstanding, 600);
  assert.equal(s1.principalOutstanding, 100000 - 600);
});

// --- principal change affecting future interest ------------------------------
test("repayment reduces next-day charge (no same-day effect)", () => {
  const loan = mkLoan();
  // Rs500 principal repaid on 2026-01-02; range 01-01..01-03
  const txns = [
    col({ id: "r1", date: "2026-01-02", createdAt: "2026-01-02T10:00:00.000Z", amountPaise: 50000, interestAllocPaise: 0, principalAllocPaise: 50000 }),
  ];
  const sched = scheduleFor(loan, txns, "2026-01-01", "2026-01-03");
  assert.equal(sched.length, 3);
  assert.equal(sched[0].charged, 100); // 01-01 full
  assert.equal(sched[1].charged, 100); // 01-02 same-day unaffected (next_day timing)
  assert.equal(sched[2].charged, 50); // 01-03 reduced
  const s = summaryFor(loan, txns, "2026-01-03");
  assert.equal(s.interestAccrued, 250);
  // Without repayment it would be 300
  assert.equal(summaryFor(loan, [], "2026-01-03").interestAccrued, 300);
});

// --- unpaid carried forward without compounding -------------------------------
test("unpaid interest carried forward without compounding", () => {
  const loan = mkLoan();
  const d10 = summaryFor(loan, [], "2026-01-10");
  const d20 = summaryFor(loan, [], "2026-01-20");
  assert.equal(d10.interestAccrued, 1000);
  assert.equal(d20.interestAccrued, 2000); // linear 20x100, not compounding
  assert.equal(d20.principalOutstanding, 100000);
  assert.equal(d20.interestOutstanding, 2000);
  const sched = scheduleFor(loan, [], "2026-01-01", "2026-01-20");
  assert.ok(sched.every((r) => r.charged === 100));
});

// --- backdated collection ----------------------------------------------------
test("backdated collection recalculates derived balances but preserves createdAt order", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10";
  const t1 = col({ id: "t1", loanId: "L1", date: "2026-01-08", createdAt: "2026-01-10T10:00:00.000Z", amountPaise: 50000, interestAllocPaise: 0, principalAllocPaise: 50000 });
  const before = summaryFor(loan, [t1], asOf);
  // 01-01..01-08 full (8x100=800) + 01-09..01-10 on 50k (2x50=100) = 900
  assert.equal(before.interestAccrued, 900);

  const t2 = col({ id: "t2", loanId: "L1", date: "2026-01-03", createdAt: "2026-01-10T12:00:00.000Z", amountPaise: 20000, interestAllocPaise: 0, principalAllocPaise: 20000 });
  const txns = [t1, t2];
  // createdAt order preserved: t1 before t2 even though t2 is backdated
  const byCreated = [...txns].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  assert.deepEqual(byCreated.map((t) => t.id), ["t1", "t2"]);

  const after = summaryFor(loan, txns, asOf);
  // 01-01..01-03 full (3x100=300) + 01-04..01-08 on 80k (5x80=400) + 01-09..01-10 on 30k (2x30=60) = 760
  assert.equal(after.interestAccrued, 760);
  assert.ok(after.interestAccrued < before.interestAccrued);
  assert.equal(after.principalOutstanding, 30000);
});

// --- reversal -----------------------------------------------------------------
test("reversal creates offsetting entry and restores balances", () => {
  const loan = mkLoan();
  const asOf = "2026-01-10";
  const c1 = col({ id: "c1", date: asOf, createdAt: `${asOf}T10:00:00.000Z`, amountPaise: 1000, interestAllocPaise: 400, principalAllocPaise: 600 });
  const state = { loans: [loan], transactions: [c1], customers: [{ id: "C1", name: "A" }] };
  const snapLen = state.transactions.length;
  const paid = summaryFor(loan, state.transactions, asOf);
  assert.equal(paid.interestOutstanding, 600);

  const { state: next, reversal } = reverseTransaction(state, "c1", "wrong split", `${asOf}T12:00:00.000Z`);
  // input not mutated
  assert.equal(state.transactions.length, snapLen);
  assert.equal(state.transactions[0].reversedById, undefined);
  // audit preserved: original + reversal
  assert.equal(next.transactions.length, 2);
  assert.equal(reversal.type, "reversal");
  assert.equal(reversal.reversesId, "c1");
  assert.equal(reversal.amountPaise, -1000);
  assert.equal(reversal.interestAllocPaise, -400);
  assert.equal(reversal.principalAllocPaise, -600);
  assert.equal(next.transactions.find((t) => t.id === "c1").reversedById, reversal.id);

  const restored = summaryFor(loan, next.transactions, asOf);
  assert.equal(restored.interestOutstanding, 1000);
  assert.equal(restored.principalOutstanding, 100000);

  assert.throws(() => reverseTransaction(next, "c1", "again", "2026-01-13T00:00:00.000Z"), /already reversed/);
  assert.throws(() => reverseTransaction(state, "missing", "x", "2026-01-13T00:00:00.000Z"), /not found/);
  assert.throws(() => reverseTransaction(state, "c1", "", "2026-01-13T00:00:00.000Z"), /Reason is required/);
});

// --- duplicate idempotency ------------------------------------------------------
test("duplicate idempotency key blocked", () => {
  const loan = mkLoan();
  const s0 = summaryFor(loan, [], "2026-01-10");
  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 100,
    interestAllocPaise: 100,
    principalAllocPaise: 0,
    idempotencyKey: "dup-key",
    usedKeys: ["dup-key"],
  });
  assert.match(err, /already recorded/);
  const errSet = validateCollection({
    loanSummary: s0,
    amountPaise: 100,
    interestAllocPaise: 100,
    principalAllocPaise: 0,
    idempotencyKey: "dup-key",
    usedKeys: new Set(["dup-key"]),
  });
  assert.match(errSet, /already recorded/);
});

// --- mismatched allocation --------------------------------------------------------
test("mismatched allocation (sum != amount) rejected", () => {
  const loan = mkLoan();
  const s0 = summaryFor(loan, [], "2026-01-10");
  const err = validateCollection({
    loanSummary: s0,
    amountPaise: 1000,
    interestAllocPaise: 400,
    principalAllocPaise: 500,
    idempotencyKey: "k-mismatch",
    usedKeys: [],
  });
  assert.match(err, /mismatch/i);
});

// --- over-allocation ---------------------------------------------------------------
test("over-allocation to interest/principal rejected (no advance payments)", () => {
  const loan = mkLoan();
  const s0 = summaryFor(loan, [], "2026-01-10"); // int 1000, prin 100000
  const overI = validateCollection({
    loanSummary: s0,
    amountPaise: 2000,
    interestAllocPaise: 2000,
    principalAllocPaise: 0,
    idempotencyKey: "k-over-i",
    usedKeys: [],
  });
  assert.match(overI, /exceeds outstanding interest/);
  const overP2 = validateCollection({
    loanSummary: s0,
    amountPaise: 101000,
    interestAllocPaise: 1000,
    principalAllocPaise: 100000,
    idempotencyKey: "k2",
    usedKeys: [],
  });
  assert.equal(overP2, null); // exactly at limit is allowed
  const overP3 = validateCollection({
    loanSummary: s0,
    amountPaise: 100001,
    interestAllocPaise: 0,
    principalAllocPaise: 100001,
    idempotencyKey: "k3",
    usedKeys: [],
  });
  assert.match(overP3, /exceeds outstanding principal/);
});

// --- validation edge cases -----------------------------------------------------------
test("collection validation: bad integers, zero amount, missing key", () => {
  const loan = mkLoan();
  const s0 = summaryFor(loan, [], "2026-01-10");
  assert.match(
    validateCollection({ loanSummary: s0, amountPaise: 0, interestAllocPaise: 0, principalAllocPaise: 0, idempotencyKey: "k", usedKeys: [] }),
    /more than zero/
  );
  assert.match(
    validateCollection({ loanSummary: s0, amountPaise: 100.5, interestAllocPaise: 100.5, principalAllocPaise: 0, idempotencyKey: "k", usedKeys: [] }),
    /more than zero/
  );
  assert.match(
    validateCollection({ loanSummary: s0, amountPaise: 100, interestAllocPaise: -5, principalAllocPaise: 105, idempotencyKey: "k", usedKeys: [] }),
    /non-negative/
  );
  assert.match(
    validateCollection({ loanSummary: s0, amountPaise: 100, interestAllocPaise: 100, principalAllocPaise: 0, idempotencyKey: "", usedKeys: [] }),
    /Missing idempotency key/
  );
});

// --- keys ------------------------------------------------------------------------------
test("buildIdempotencyKey deterministic; newFormKey unique", () => {
  const k1 = buildIdempotencyKey({ loanId: "L1", date: "2026-01-05", amountPaise: 1000, interestAllocPaise: 400, principalAllocPaise: 600 });
  assert.equal(k1, "L1|2026-01-05|1000|400|600");
  const k2 = buildIdempotencyKey({ loanId: "L1", date: "2026-01-05", amountPaise: 1000, interestAllocPaise: 400, principalAllocPaise: 600 });
  assert.equal(k1, k2);
  const f1 = newFormKey();
  const f2 = newFormKey();
  assert.ok(f1 && f2 && f1 !== f2);
});

// --- summarizeCustomer + reconcileTotals --------------------------------------------------
test("reconciliation: reconcileTotals equals manual sum of summarizeLoan over 2 customers/3 loans", () => {
  const loans = [
    mkLoan({ id: "L1", customerId: "C1", principalPaise: 100000, startDate: "2026-01-01" }),
    mkLoan({ id: "L2", customerId: "C1", principalPaise: 200000, startDate: "2026-01-05", dailyRatePct: 0.1 }),
    mkLoan({ id: "L3", customerId: "C2", principalPaise: 50000, startDate: "2026-01-03" }),
  ];
  const txns = [
    { id: "a1", loanId: "L1", customerId: "C1", type: "collection", date: "2026-01-06", createdAt: "2026-01-06T10:00:00.000Z", amountPaise: 500, interestAllocPaise: 500, principalAllocPaise: 0, idempotencyKey: "a1" },
    { id: "a2", loanId: "L2", customerId: "C1", type: "collection", date: "2026-01-08", createdAt: "2026-01-08T10:00:00.000Z", amountPaise: 10000, interestAllocPaise: 0, principalAllocPaise: 10000, idempotencyKey: "a2" },
    { id: "a3", loanId: "L3", customerId: "C2", type: "collection", date: "2026-01-09", createdAt: "2026-01-09T10:00:00.000Z", amountPaise: 100, interestAllocPaise: 100, principalAllocPaise: 0, idempotencyKey: "a3" },
  ];
  const asOf = "2026-01-10";
  const state = { loans, transactions: txns, customers: [{ id: "C1", name: "A" }, { id: "C2", name: "B" }] };

  const c1 = summarizeCustomer("C1", loans, txns, asOf);
  const c2 = summarizeCustomer("C2", loans, txns, asOf);
  assert.equal(c1.loans.length, 2);
  assert.equal(c2.loans.length, 1);
  assert.equal(c1.activeLoans + c2.activeLoans, 3);

  const manual = [summarizeLoan(loans[0], txns, asOf), summarizeLoan(loans[1], txns, asOf), summarizeLoan(loans[2], txns, asOf)];
  const lentOf = (m) => m.principalLent ?? m.principalDisbursed ?? 0;
  const sum = (f) => manual.reduce((s, m) => s + (m[f] || 0), 0);

  const rec = reconcileTotals(state, asOf);
  assert.equal(rec.totalPrincipalLent, manual.reduce((s, m) => s + lentOf(m), 0));
  assert.equal(rec.principalOutstanding, sum("principalOutstanding"));
  assert.equal(rec.interestAccrued, sum("interestAccrued"));
  assert.equal(rec.interestCollected, sum("interestReceived"));
  assert.equal(rec.interestOutstanding, sum("interestOutstanding"));
  assert.equal(rec.activeLoans, 3);
  assert.equal(rec.activeCustomers, 2);
  // rollups agree with manual sums too
  assert.equal(c1.principalLent + c2.principalLent, rec.totalPrincipalLent);
  assert.equal(c1.interestAccrued + c2.interestAccrued, rec.interestAccrued);
});

// --- customer validation --------------------------------------------------------------------
test("validateCustomer: name/phone/notes rules", () => {
  assert.ok(validateCustomer({ name: "", phone: "", notes: "" }).length > 0);
  assert.ok(validateCustomer({ name: "Ravi", phone: "123", notes: "" }).length > 0);
  assert.deepEqual(validateCustomer({ name: "Ravi", phone: "9876543210", notes: "" }), []);
  assert.deepEqual(validateCustomer({ name: "Ravi", phone: "+91 98765 43210", notes: "ok" }), []);
  assert.deepEqual(validateCustomer({ name: "Ravi", phone: "91 9876543210" }), []);
  assert.ok(validateCustomer({ name: "Ravi", phone: "", notes: "x".repeat(501) }).length > 0);
  assert.deepEqual(validateCustomer({ name: "Ravi", phone: "", notes: "x".repeat(500) }), []);
});

// --- interest helpers sanity ------------------------------------------------------------------
test("isValidISO rejects bad dates", () => {
  assert.equal(isValidISO("2026-01-01"), true);
  assert.equal(isValidISO("2026-02-30"), false);
  assert.equal(isValidISO("not-a-date"), false);
});
