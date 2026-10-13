import test from "node:test";
import assert from "node:assert/strict";
import { calcBill, validateItem } from "../js/calc.js";
import { calcBalance, summarize } from "../js/ledger.js";
import { invoiceBillText } from "../js/whatsapp.js";
import { buildInvoicePdfBytes } from "../js/pdf.js";

// Bug: calcBill(null/undefined) threw "items is not iterable" instead of
// returning a validation error. completeSale always passes an array, but the
// pure calculator must never throw on bad input.
test("calcBill with non-array items returns errors, does not throw", () => {
  for (const bad of [null, undefined, "x", 42]) {
    const r = calcBill(bad);
    assert.ok(Array.isArray(r.errors) && r.errors.length > 0, `expected errors for ${String(bad)}`);
    assert.equal(r.grandTotal, 0);
  }
});

// Bug: a string taxRate ("18") passed validation via == coercion and then
// poisoned tax math (NaN in inclusive mode, string stored on the invoice).
test("validateItem rejects non-numeric tax rates", () => {
  const base = { name: "X", qty: 1, unitPricePaise: 10000, discountType: "none", discountValue: 0 };
  assert.ok(validateItem({ ...base, taxRate: "18" }).length > 0, "string rate must fail");
  assert.deepEqual(validateItem({ ...base, taxRate: 18 }), []);
  assert.deepEqual(validateItem({ ...base, taxRate: 5 }), []);
});

// Bug: one corrupt transaction (string amount) turned balances into strings/NaN
// and crashed every money display downstream.
test("ledger ignores corrupt non-integer amounts", () => {
  const txns = [
    { id: "t1", customerId: "c1", type: "credit_sale", amountPaise: 90000 },
    { id: "bad", customerId: "c1", type: "payment", amountPaise: "oops" },
  ];
  assert.equal(calcBalance(0, txns), 90000);
  const s = summarize(0, txns);
  assert.equal(s.outstanding, 90000);
  assert.equal(calcBalance(0, null), 0);
  assert.equal(summarize(undefined, undefined).outstanding, 0);
});

// Bug: invoiceBillText printed "Invalid Date" for corrupt invoice dates.
test("invoiceBillText never prints Invalid Date", () => {
  const inv = {
    number: "SB-1", date: "not-a-date", mode: "non-gst", customerName: "Walk-in",
    itemsSnapshot: [], totals: { subtotalGross: 0, grandTotal: 0 },
    paymentMethod: "cash", paidPaise: 0, balancePaise: 0, status: "unpaid",
  };
  const text = invoiceBillText(inv, {});
  assert.ok(!text.includes("Invalid Date"), text);
});

// Bug: PDF embedded raw ₹ (U+20B9) bytes, which WinAnsi Helvetica cannot render.
test("invoice PDF uses Rs. instead of raw INR sign", () => {
  const inv = {
    number: "SB-1", date: "2026-01-01T10:00:00.000Z", mode: "non-gst",
    customerName: "Walk-in", itemsSnapshot: [],
    totals: { subtotalGross: 100, itemDiscountTotal: 0, billDiscountPaise: 0, taxableValue: 100, taxTotal: 0, roundoff: 0, grandTotal: 100 },
    paymentMethod: "cash", paidPaise: 0, balancePaise: 100, status: "unpaid", businessName: "Shop",
  };
  const text = Buffer.from(buildInvoicePdfBytes(inv, { name: "Shop" })).toString("utf8");
  assert.ok(!text.includes("₹"), "PDF must not contain raw INR sign");
  assert.ok(text.includes("Rs."), "PDF must contain Rs. amounts");
});

// Bug: store.load() trusted stored collections, so one corrupt value
// (invoices: "garbage") crashed every view; corrupt JSON was never repaired;
// save() quota errors crashed handlers with no message.
test("store load tolerates corruption, save reports quota", async () => {
  const backing = new Map();
  const quotaError = () => {
    const e = new Error("quota");
    e.name = "QuotaExceededError";
    return e;
  };
  let failWrites = false;
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw quotaError(); backing.set(k, String(v)); },
    removeItem: (k) => { backing.delete(k); },
  };
  const { load, save, KEY } = await import("../js/store.js");

  backing.set(KEY, "{not json");
  const d1 = load();
  assert.deepEqual(d1.invoices, []);
  assert.deepEqual(d1.customers, []);
  // Corrupt blob is repaired so the next load does not re-parse garbage.
  assert.doesNotThrow(() => JSON.parse(backing.get(KEY)));

  backing.set(KEY, JSON.stringify({ version: 1, invoices: "garbage", customers: null, business: "x", counters: [1] }));
  const d2 = load();
  assert.deepEqual(d2.invoices, []);
  assert.deepEqual(d2.customers, []);
  assert.equal(d2.business.name, "My Shop");

  failWrites = true;
  assert.throws(() => save(d2), /storage is full/i);
  delete globalThis.localStorage;
});
