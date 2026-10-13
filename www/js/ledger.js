/**
 * Customer credit-ledger pure logic (no DOM / no localStorage).
 * Append-only: balances are ALWAYS recomputed from transactions,
 * never trusted from a frontend-supplied value.
 *
 * Transaction: { id, customerId, type, amountPaise (signed int),
 *   invoiceId?, reason?, note?, dueDate?, createdAt, createdBy? }
 *   type 'credit_sale'  -> amountPaise > 0 (debit to customer)
 *   type 'payment'      -> amountPaise < 0 (credit to customer)
 *   type 'adjustment'   -> amountPaise != 0, requires reason
 *   type 'reversal'     -> amountPaise = -(original amount), requires reason + reversesId
 */

export function calcBalance(openingPaise, transactions) {
  let bal = Number.isInteger(openingPaise) ? openingPaise : 0;
  const list = Array.isArray(transactions) ? transactions : [];
  for (const t of list) {
    // Ignore corrupt entries (non-integer amounts) so one bad transaction
    // cannot turn the whole balance into NaN/a string.
    if (t && Number.isInteger(t.amountPaise)) bal += t.amountPaise;
  }
  return bal;
}

export function summarize(openingPaise, transactions) {
  const opening = Number.isInteger(openingPaise) ? openingPaise : 0;
  let creditSales = 0, payments = 0, adjustments = 0;
  const list = Array.isArray(transactions) ? transactions : [];
  for (const t of list) {
    if (!t || !Number.isInteger(t.amountPaise)) continue;
    if (t.type === "credit_sale") creditSales += t.amountPaise;
    else if (t.type === "payment") payments += -t.amountPaise;
    else if (t.type === "adjustment" || t.type === "reversal") adjustments += t.amountPaise;
  }
  return {
    opening,
    creditSales,
    payments,
    adjustments,
    outstanding: opening + creditSales - payments + adjustments,
  };
}

export function validateCollection({ outstandingPaise, amountPaise, idempotencyKey, usedKeys }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0)
    return "Collection amount must be more than zero.";
  if (amountPaise > outstandingPaise)
    return `Collection of ${amountPaise} paise exceeds outstanding ${outstandingPaise} paise. Record the extra as an adjustment with a reason if needed.`;
  if (!idempotencyKey) return "Missing idempotency key. Please reopen the form and try again.";
  if (usedKeys && usedKeys.includes(idempotencyKey))
    return "This payment was already recorded (duplicate prevented).";
  return null;
}

export function validateCustomer({ name, phone, openingPaise }) {
  const errs = [];
  if (!name || !String(name).trim()) errs.push("Customer name is required.");
  if (phone && String(phone).trim() !== "") {
    const digits = String(phone).replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local))
      errs.push("Phone looks invalid. Use a 10-digit Indian mobile number (optional).");
  }
  if (openingPaise !== undefined && (!Number.isInteger(openingPaise) || openingPaise < 0))
    errs.push("Opening balance cannot be negative.");
  return errs;
}
