/**
 * SmartBill persistent store (localStorage).
 *
 * NOTE (beginner read): this app is frontend-only in Phase 1, so data is
 * stored in the browser's localStorage on THIS device only. That is NOT
 * secure cloud storage: anyone with the device/browser can read it, and
 * clearing browser data deletes it. No login, no server validation, and no
 * multi-shop isolation exist yet. A backend would be needed for those.
 */
import { calcBalance } from "./ledger.js";

const KEY = "smartbill_v1";

function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function defaultState() {
  return {
    version: 1,
    business: {
      name: "My Shop", address: "", phone: "", email: "",
      gstin: "", taxMode: "non-gst", gstType: "intrastate", priceIncludesTax: false,
    },
    products: [],
    customers: [],
    invoices: [],
    ledger: [],
    usedKeys: [],
    counters: { invoiceSeq: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const d = defaultState();
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore: read-only contexts still get defaults */ }
      return d;
    }
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") throw new Error("Stored data is not an object.");
    // Safe migration: fill missing fields, coerce corrupt collections to [],
    // never delete existing valid data.
    const d = defaultState();
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      ...d, ...s,
      business: { ...d.business, ...obj(s.business) },
      counters: { ...d.counters, ...obj(s.counters) },
      products: arr(s.products),
      customers: arr(s.customers),
      invoices: arr(s.invoices),
      ledger: arr(s.ledger),
      usedKeys: arr(s.usedKeys),
    };
  } catch {
    // Corrupt/unreadable storage: fall back to defaults and best-effort reset
    // so every later load does not re-parse the same broken blob.
    const d = defaultState();
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
    return d;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new Error("Device storage is full. Free space and retry.");
    }
    throw new Error("Could not save data (" + (e && e.message ? e.message : "storage error") + ").");
  }
}

export function nextInvoiceNo(state) {
  state.counters.invoiceSeq = (state.counters.invoiceSeq || 0) + 1;
  const year = new Date().getFullYear();
  const seq = String(state.counters.invoiceSeq).padStart(4, "0");
  return `SB-${year}-${seq}`;
}

export function customerOutstanding(state, customerId) {
  const customers = state && Array.isArray(state.customers) ? state.customers : [];
  const c = customers.find((x) => x && x.id === customerId);
  if (!c) return 0;
  const ledger = Array.isArray(state.ledger) ? state.ledger : [];
  const txns = ledger.filter((t) => t && t.customerId === customerId && !t.void);
  return calcBalance(c.openingPaise || 0, txns);
}

export function invoicePaidTotal(state, invoiceId) {
  const ledger = state && Array.isArray(state.ledger) ? state.ledger : [];
  return ledger
    .filter((t) => t && t.invoiceId === invoiceId && t.type === "payment" && !t.void && Number.isInteger(t.amountPaise))
    .reduce((s, t) => s + -t.amountPaise, 0);
}

export { uid, KEY };
