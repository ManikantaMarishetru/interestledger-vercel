/**
 * SmartBill money helpers — ALL amounts are integer paise.
 * Using integers avoids floating-point currency errors (e.g. 0.1 + 0.2).
 */

// Parse user input (string like "500", "500.50", "₹1,000.00") to integer paise.
// Throws Error with helpful message on invalid input. Never returns NaN.
export function toPaise(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Amount must be a number.");
    if (input < 0) throw new Error("Amount cannot be negative.");
    return Math.round(input * 100);
  }
  if (typeof input !== "string") throw new Error("Amount must be text or a number.");
  let s = input.trim().replace(/[₹\s]/g, "").replace(/,/g, "");
  if (s === "") throw new Error("Amount is required.");
  if (s.startsWith("-")) throw new Error("Amount cannot be negative.");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Invalid amount "${input}". Use numbers like 500 or 500.50.`);
  }
  const [rs, ps = ""] = s.split(".");
  const paise = parseInt(rs, 10) * 100 + parseInt((ps + "00").slice(0, 2), 10);
  if (!Number.isSafeInteger(paise)) throw new Error("Amount is too large.");
  return paise;
}

// Parse quantity: positive integer >= 1.
export function toQty(input) {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid quantity "${input}". Quantity must be a whole number of 1 or more.`);
  }
  if (n > 100000) throw new Error("Quantity is too large.");
  return n;
}

// Format integer paise as INR, e.g. 100000 -> ₹1,000.00
export function formatINR(paise) {
  if (!Number.isInteger(paise)) throw new Error("Internal error: paise must be an integer.");
  const neg = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, "0");
  const grouped = rupees.toLocaleString("en-IN");
  return `${neg}₹${grouped}.${p}`;
}

export function isNonNegInt(n) {
  return Number.isInteger(n) && n >= 0;
}
