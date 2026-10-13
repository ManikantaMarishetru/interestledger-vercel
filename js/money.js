/**
 * InterestLedger money helpers — ALL amounts are integer paise.
 * Integers avoid floating-point currency errors.
 */

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

// Parse quantity: positive integer >= 1 (kept for backward-compatible tests).
export function toQty(input) {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid quantity "${input}". Quantity must be a whole number of 1 or more.`);
  }
  if (n > 100000) throw new Error("Quantity is too large.");
  return n;
}

export function formatDateIN(iso) {
  if (!iso || typeof iso !== "string") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!m) {
    try {
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return String(iso); }
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(m[2], 10) - 1;
  return `${m[3]} ${months[mi] || m[2]} ${m[1]}`;
}
