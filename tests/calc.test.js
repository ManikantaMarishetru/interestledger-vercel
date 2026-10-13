import test from "node:test";
import assert from "node:assert/strict";
import { calcBill, paymentStatus, validatePayment } from "../js/calc.js";

// Acceptance 1: two items at ₹500 each -> subtotal ₹1,000
test("AC1: 2 x Rs500 subtotal is Rs1000", () => {
  const r = calcBill([
    { name: "A", sku: "", qty: 1, unitPricePaise: 50000, taxRate: 0, discountType: "none", discountValue: 0 },
    { name: "B", sku: "", qty: 1, unitPricePaise: 50000, taxRate: 0, discountType: "none", discountValue: 0 },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.subtotalGross, 100000);
  assert.equal(r.grandTotal, 100000);
});

// Acceptance 2: 10% bill discount -> 900 before tax/rounding
test("AC2: 10% discount gives 900", () => {
  const r = calcBill(
    [{ name: "A", sku: "", qty: 2, unitPricePaise: 50000, taxRate: 0, discountType: "none", discountValue: 0 }],
    { type: "percent", value: 10 },
    { mode: "non-gst", gstType: "intrastate", priceIncludesTax: false },
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.billDiscountPaise, 10000);
  assert.equal(r.taxableValue, 90000);
  assert.equal(r.grandTotal, 90000);
});

// Acceptance 3: discount applied once — pure calc of same input twice gives same output (no accumulation)
test("AC3: discount cannot double-apply", () => {
  const items = [{ name: "A", sku: "", qty: 2, unitPricePaise: 50000, taxRate: 0, discountType: "none", discountValue: 0 }];
  const bd = { type: "percent", value: 10 };
  const once = calcBill(items, bd);
  const twiceAsOnce = calcBill(items, bd); // caller must NOT add discount to already-discounted value
  assert.equal(once.grandTotal, twiceAsOnce.grandTotal);
  assert.equal(once.billDiscountPaise, 10000);
});

// Acceptance 4: GST intrastate splits CGST/SGST; interstate uses IGST; per-item rates differ
test("AC4: GST modes and per-item rates", () => {
  const items = [
    { name: "Low", sku: "", qty: 1, unitPricePaise: 100000, taxRate: 5, discountType: "none", discountValue: 0 },
    { name: "High", sku: "", qty: 1, unitPricePaise: 100000, taxRate: 28, discountType: "none", discountValue: 0 },
  ];
  const intra = calcBill(items, { type: "none", value: 0 }, { mode: "gst", gstType: "intrastate", priceIncludesTax: false });
  assert.equal(intra.taxTotal, 5000 + 28000);
  assert.equal(intra.cgstTotal + intra.sgstTotal, intra.taxTotal);
  const inter = calcBill(items, { type: "none", value: 0 }, { mode: "gst", gstType: "interstate", priceIncludesTax: false });
  assert.equal(inter.igstTotal, 33000);
  assert.equal(inter.cgstTotal, 0);
  const nogst = calcBill(items, { type: "none", value: 0 }, { mode: "non-gst", gstType: "intrastate", priceIncludesTax: false });
  assert.equal(nogst.taxTotal, 0);
});

// Tax-inclusive extraction does not add tax on top
test("tax-inclusive price extracts tax", () => {
  const r = calcBill(
    [{ name: "A", sku: "", qty: 1, unitPricePaise: 11800, taxRate: 18, discountType: "none", discountValue: 0 }],
    { type: "none", value: 0 },
    { mode: "gst", gstType: "intrastate", priceIncludesTax: true },
  );
  assert.equal(r.taxableValue, 10000);
  assert.equal(r.taxTotal, 1800);
  assert.equal(r.grandTotal, 11800);
});

test("validation blocks bad discounts and overpayment", () => {
  const r = calcBill(
    [{ name: "A", sku: "", qty: 1, unitPricePaise: 50000, taxRate: 0, discountType: "percent", discountValue: 150 }],
  );
  assert.ok(r.errors.length > 0);
  assert.equal(paymentStatus(90000, 0), "unpaid");
  assert.equal(paymentStatus(90000, 30000), "partially_paid");
  assert.equal(paymentStatus(90000, 90000), "paid");
  assert.match(validatePayment(90000, 100000), /exceed/);
});
