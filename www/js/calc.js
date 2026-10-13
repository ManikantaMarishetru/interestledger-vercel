/**
 * SmartBill billing calculations. All money in integer paise.
 *
 * Calculation order (shown on the bill and in the PDF):
 *   1. line gross        = qty × unit price
 *   2. item discount     = % or fixed, taken off the gross
 *   3. line net          = gross − item discount
 *   4. bill discount     = % or fixed on the sum of line nets (applied ONCE),
 *                          allocated back to lines proportionally so each
 *                          tax rate keeps its own correct tax.
 *   5. taxable value     = line net − allocated bill discount
 *   6. tax per line      = taxable × rate (CGST+SGST split or IGST, or 0 for non-GST)
 *   7. rounding          = round to nearest ₹1
 *   8. grand total       = taxable + tax + rounding
 *
 * Tax-inclusive mode: the unit price already includes tax, so tax is
 * extracted (taxable = net × 100 / (100 + rate)) instead of added on top.
 * The mode is explicit in the UI so GST is never applied twice.
 */
import { isNonNegInt } from "./money.js";

export const GST_RATES = [0, 5, 12, 18, 28];

export function validateItem(item) {
  const errors = [];
  if (!item.name || !String(item.name).trim()) errors.push("Item name is required.");
  if (!Number.isInteger(item.qty) || item.qty <= 0)
    errors.push(`"${item.name || "item"}": quantity must be 1 or more.`);
  if (!isNonNegInt(item.unitPricePaise))
    errors.push(`"${item.name || "item"}": price is invalid.`);
  if (!GST_RATES.includes(item.taxRate) && !(typeof item.taxRate === "number" && Number.isFinite(item.taxRate) && item.taxRate >= 0 && item.taxRate <= 28)) {
    errors.push(`"${item.name || "item"}": tax rate ${item.taxRate}% is not supported.`);
  }
  const gross = Number.isInteger(item.qty) && isNonNegInt(item.unitPricePaise)
    ? item.qty * item.unitPricePaise : 0;
  if (item.discountType === "percent") {
    if (typeof item.discountValue !== "number" || item.discountValue < 0 || item.discountValue > 100)
      errors.push(`"${item.name || "item"}": item discount % must be between 0 and 100.`);
  } else if (item.discountType === "fixed") {
    if (!isNonNegInt(item.discountValue))
      errors.push(`"${item.name || "item"}": item discount amount is invalid.`);
    else if (item.discountValue > gross)
      errors.push(`"${item.name || "item"}": item discount cannot exceed the line gross (${gross} paise).`);
  }
  return errors;
}

function itemDiscountPaise(item, gross) {
  if (item.discountType === "percent") return Math.round((gross * item.discountValue) / 100);
  if (item.discountType === "fixed") return Math.min(item.discountValue, gross);
  return 0;
}

// Tax for one taxable line (paise), split for display.
export function taxForLine(taxablePaise, rate, gstType) {
  if (rate === 0) return { tax: 0, cgst: 0, sgst: 0, igst: 0 };
  if (gstType === "interstate") {
    const igst = Math.round((taxablePaise * rate) / 100);
    return { tax: igst, cgst: 0, sgst: 0, igst };
  }
  // intrastate (or non-gst with rate forced 0): split evenly, fix odd-paise remainder on SGST
  const total = Math.round((taxablePaise * rate) / 100);
  const cgst = Math.floor(total / 2);
  const sgst = total - cgst;
  return { tax: total, cgst, sgst, igst: 0 };
}

export function calcLinePostDiscount(taxablePaise, rate, gstType, priceIncludesTax) {
  if (priceIncludesTax && rate > 0) {
    // Extract tax from the price: taxable = round(net*100/(100+rate))
    const base = Math.round((taxablePaise * 100) / (100 + rate));
    const tax = taxablePaise - base;
    if (gstType === "interstate") return { taxable: base, ...{ tax, cgst: 0, sgst: 0, igst: tax } };
    const cgst = Math.floor(tax / 2);
    return { taxable: base, tax, cgst, sgst: tax - cgst, igst: 0 };
  }
  const t = taxForLine(taxablePaise, rate, gstType);
  return { taxable: taxablePaise, ...t };
}

export function validateBillDiscount(bd, sumLineNet) {
  if (!bd || bd.type === "none") return [];
  if (bd.type === "percent") {
    if (typeof bd.value !== "number" || bd.value <= 0 || bd.value > 100)
      return ["Bill discount % must be more than 0 and at most 100."];
  } else if (bd.type === "fixed") {
    if (!Number.isInteger(bd.value) || bd.value <= 0)
      return ["Bill discount amount must be more than zero."];
    if (bd.value > sumLineNet)
      return ["Bill discount cannot exceed the bill subtotal after item discounts."];
  } else return ["Unknown bill discount type."];
  return [];
}

/**
 * Main bill calculator. Pure function — safe to test.
 * items: array of {name, qty, unitPricePaise, taxRate, discountType, discountValue}
 * billDiscount: {type:'none'|'percent'|'fixed', value} (value = % number or paise int)
 * tax: {mode:'non-gst'|'gst', gstType:'intrastate'|'interstate', priceIncludesTax:bool}
 */
export function calcBill(items, billDiscount = { type: "none", value: 0 }, tax = { mode: "gst", gstType: "intrastate", priceIncludesTax: false }) {
  const errors = [];
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(items) || items.length === 0) errors.push("Add at least one item to the bill.");
  const lines = [];
  let subtotalGross = 0;
  let itemDiscountTotal = 0;

  for (const it of list) {
    const errs = validateItem(it);
    errors.push(...errs);
    const gross = (Number.isInteger(it.qty) ? it.qty : 0) * (isNonNegInt(it.unitPricePaise) ? it.unitPricePaise : 0);
    const disc = itemDiscountPaise(
      { discountType: it.discountType || "none", discountValue: it.discountValue || 0 }, gross);
    const net = gross - disc;
    subtotalGross += gross;
    itemDiscountTotal += disc;
    const rate = tax.mode === "non-gst" ? 0 : (it.taxRate || 0);
    lines.push({ ...it, taxRate: rate, gross, itemDiscount: disc, net });
  }

  const sumLineNet = lines.reduce((s, l) => s + l.net, 0);
  errors.push(...validateBillDiscount(billDiscount, sumLineNet));

  let billDiscountPaise = 0;
  if (billDiscount && billDiscount.type === "percent") {
    billDiscountPaise = Math.round((sumLineNet * billDiscount.value) / 100);
  } else if (billDiscount && billDiscount.type === "fixed") {
    billDiscountPaise = Math.min(billDiscount.value, sumLineNet);
  }

  // Allocate bill discount proportionally (largest remainder keeps paise exact).
  const allocations = new Array(lines.length).fill(0);
  if (billDiscountPaise > 0 && sumLineNet > 0) {
    let assigned = 0;
    const fracs = lines.map((l, i) => {
      const exact = (l.net * billDiscountPaise) / sumLineNet;
      const fl = Math.floor(exact);
      assigned += fl;
      return { i, frac: exact - fl };
    });
    lines.forEach((l, i) => (allocations[i] = Math.floor((l.net * billDiscountPaise) / sumLineNet)));
    let rest = billDiscountPaise - assigned;
    fracs.sort((a, b) => b.frac - a.frac);
    for (const f of fracs) {
      if (rest <= 0) break;
      if (lines[f.i].net - allocations[f.i] > 0) { allocations[f.i]++; rest--; }
    }
  }

  let taxableValue = 0, taxTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
  const detail = lines.map((l, i) => {
    const afterBill = l.net - allocations[i];
    const c = calcLinePostDiscount(afterBill, l.taxRate, tax.gstType, tax.priceIncludesTax);
    taxableValue += c.taxable;
    taxTotal += c.tax; cgstTotal += c.cgst; sgstTotal += c.sgst; igstTotal += c.igst;
    return { ...l, billDiscountShare: allocations[i], taxable: c.taxable, tax: c.tax, cgst: c.cgst, sgst: c.sgst, igst: c.igst, lineTotal: c.taxable + c.tax };
  });

  const beforeRounding = taxableValue + taxTotal;
  const grandTotal = Math.round(beforeRounding / 100) * 100;
  const roundoff = grandTotal - beforeRounding;

  return {
    errors,
    lines: detail,
    subtotalGross,
    itemDiscountTotal,
    billDiscountPaise,
    taxableValue,
    taxTotal, cgstTotal, sgstTotal, igstTotal,
    beforeRounding,
    roundoff,
    grandTotal,
  };
}

export function paymentStatus(totalPaise, paidPaise) {
  if (paidPaise <= 0) return "unpaid";
  if (paidPaise >= totalPaise) return "paid";
  return "partially_paid";
}

export function validatePayment(totalPaise, paidPaise) {
  if (!Number.isInteger(paidPaise) || paidPaise < 0)
    return "Amount paid cannot be negative.";
  if (paidPaise > totalPaise)
    return "Amount paid cannot exceed the bill total.";
  return null;
}
