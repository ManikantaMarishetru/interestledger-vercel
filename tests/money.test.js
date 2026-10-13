import test from "node:test";
import assert from "node:assert/strict";
import { toPaise, formatINR, toQty } from "../js/money.js";

test("toPaise parses rupees correctly", () => {
  assert.equal(toPaise("500"), 50000);
  assert.equal(toPaise("500.50"), 50050);
  assert.equal(toPaise("₹1,000.00"), 100000);
});

test("toPaise rejects negative and invalid", () => {
  assert.throws(() => toPaise("-5"), /negative/);
  assert.throws(() => toPaise("abc"), /Invalid amount/);
  assert.throws(() => toPaise("10.999"), /Invalid amount/);
});

test("formatINR uses en-IN grouping", () => {
  assert.equal(formatINR(100000), "₹1,000.00");
  assert.equal(formatINR(-60000), "-₹600.00");
});

test("toQty rejects zero/negative/fractions", () => {
  assert.equal(toQty("2"), 2);
  assert.throws(() => toQty("0"), /quantity/i);
  assert.throws(() => toQty("-1"), /quantity/i);
  assert.throws(() => toQty("1.5"), /quantity/i);
});
