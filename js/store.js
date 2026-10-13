/**
 * InterestLedger persistent store — IndexedDB-first with localStorage/memory fallback.
 * Plain JS, zero dependencies. Works in browser and Node (tests).
 *
 * Data shape (emptyState):
 * { version:1, customers:[], loans:[], transactions:[], usedKeys:[],
 *   counters:{customerSeq:0,loanSeq:0,txnSeq:0}, settings:{lang:'en'} }
 *
 * Pure helpers (addCustomer/addLoan/addCollectionRecord) never mutate their
 * input: they deep-clone first, then append. Changing language (settings.lang)
 * is a pure settings lookup via js/i18n.js and never touches data.
 *
 * NOTE: this file also preserves the legacy SmartBill API (defaultState/load/
 * save/nextInvoiceNo/...) so existing views and tests keep working. New
 * InterestLedger code should use emptyState/loadState/saveState.
 */
import { calcBalance } from "./ledger.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const BACKUP_SCHEMA = 1;
export const IL_KEY = "interestledger_v1";
const DB_NAME = "interestledger";

export function uid(prefix = "id") {
  try {
    const g = globalThis;
    if (g && g.crypto && typeof g.crypto.randomUUID === "function") {
      return `${prefix}_${g.crypto.randomUUID()}`;
    }
  } catch { /* fall through */ }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function clone(o) {
  if (o === null || o === undefined) return o;
  return JSON.parse(JSON.stringify(o));
}

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function isValidDateStr(s) {
  if (typeof s !== "string" || s.trim() === "") return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

function todayISODate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function normalizePhoneOrThrow(raw) {
  const s = String(raw).trim();
  if (s === "") return "";
  const digits = s.replace(/\D/g, "");
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw new Error("Enter a valid 10-digit mobile number.");
  }
  return s;
}

/** Attach non-enumerable result helpers so both styles work without breaking JSON:
 *  s2 = addCustomer(s, d); s2.customers / s2.customer
 *  const { state, customer } = addCustomer(s, d);
 *  Non-enumerable => invisible to JSON.stringify and deepStrictEqual. */
function attachResult(stateObj, extra) {
  for (const [k, v] of Object.entries(extra)) {
    Object.defineProperty(stateObj, k, {
      value: v, enumerable: false, writable: true, configurable: true,
    });
  }
  if (!Object.prototype.hasOwnProperty.call(stateObj, "state")) {
    Object.defineProperty(stateObj, "state", {
      value: stateObj, enumerable: false, writable: true, configurable: true,
    });
  }
  return stateObj;
}

function ensureILShape(s) {
  if (!isObj(s)) return emptyState();
  if (!Array.isArray(s.customers)) s.customers = [];
  if (!Array.isArray(s.loans)) s.loans = [];
  if (!Array.isArray(s.transactions)) s.transactions = [];
  if (!Array.isArray(s.usedKeys)) s.usedKeys = [];
  if (!isObj(s.counters)) s.counters = { customerSeq: 0, loanSeq: 0, txnSeq: 0 };
  for (const k of ["customerSeq", "loanSeq", "txnSeq"]) {
    if (!Number.isInteger(s.counters[k]) || s.counters[k] < 0) s.counters[k] = 0;
  }
  if (!isObj(s.settings)) s.settings = { lang: "en" };
  if (s.settings.lang !== "kn" && s.settings.lang !== "en") s.settings.lang = "en";
  s.version = 1;
  return s;
}

// ---------------------------------------------------------------------------
// InterestLedger state + pure helpers
// ---------------------------------------------------------------------------

export function emptyState() {
  return {
    version: 1,
    customers: [],
    loans: [],
    transactions: [],
    usedKeys: [],
    counters: { customerSeq: 0, loanSeq: 0, txnSeq: 0 },
    settings: { lang: "en" },
  };
}

/** Merge loaded data with defaults. Never deletes valid entries. */
function mergeState(raw) {
  const d = emptyState();
  if (!isObj(raw)) return d;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const cRaw = isObj(raw.counters) ? raw.counters : {};
  const sRaw = isObj(raw.settings) ? raw.settings : {};
  return {
    version: 1,
    customers: arr(raw.customers),
    loans: arr(raw.loans),
    transactions: arr(raw.transactions),
    usedKeys: arr(raw.usedKeys),
    counters: {
      customerSeq: Number.isInteger(cRaw.customerSeq) && cRaw.customerSeq >= 0 ? cRaw.customerSeq : 0,
      loanSeq: Number.isInteger(cRaw.loanSeq) && cRaw.loanSeq >= 0 ? cRaw.loanSeq : 0,
      txnSeq: Number.isInteger(cRaw.txnSeq) && cRaw.txnSeq >= 0 ? cRaw.txnSeq : 0,
    },
    settings: { ...d.settings, ...sRaw, lang: sRaw.lang === "kn" ? "kn" : "en" },
  };
}

export function nextCustomerId(state) {
  if (!isObj(state)) throw new Error("State is required.");
  if (!isObj(state.counters)) state.counters = { customerSeq: 0, loanSeq: 0, txnSeq: 0 };
  const n = (Number.isInteger(state.counters.customerSeq) ? state.counters.customerSeq : 0) + 1;
  state.counters.customerSeq = n;
  return "C" + String(n).padStart(4, "0");
}

export function nextLoanId(state) {
  if (!isObj(state)) throw new Error("State is required.");
  if (!isObj(state.counters)) state.counters = { customerSeq: 0, loanSeq: 0, txnSeq: 0 };
  const n = (Number.isInteger(state.counters.loanSeq) ? state.counters.loanSeq : 0) + 1;
  state.counters.loanSeq = n;
  return "L" + String(n).padStart(4, "0");
}

export function nextTxnRef(state) {
  if (!isObj(state)) throw new Error("State is required.");
  if (!isObj(state.counters)) state.counters = { customerSeq: 0, loanSeq: 0, txnSeq: 0 };
  const n = (Number.isInteger(state.counters.txnSeq) ? state.counters.txnSeq : 0) + 1;
  state.counters.txnSeq = n;
  return "T" + String(n).padStart(6, "0");
}

function splitBaseInput(state, data) {
  let base = state;
  let input = data;
  if (input === undefined) {
    input = base;
    base = emptyState();
  }
  if (!base || typeof base !== "object") base = emptyState();
  return [base, input];
}

export function addCustomer(state, data) {
  const [base, input] = splitBaseInput(state, data);
  if (!isObj(input)) throw new Error("Customer data is required.");
  const name = input.name != null ? String(input.name).trim() : "";
  if (!name) throw new Error("Name is required.");
  const phone = input.phone != null ? normalizePhoneOrThrow(String(input.phone)) : "";

  const s = ensureILShape(clone(base));
  let id;
  if (input.id != null && String(input.id).trim() !== "") {
    id = String(input.id).trim();
    if (s.customers.some((c) => c && c.id === id)) {
      throw new Error("This customer already exists (duplicate prevented).");
    }
  } else {
    id = nextCustomerId(s);
  }
  const now = new Date().toISOString();
  const customer = {
    id,
    name,
    phone: phone || "",
    note: input.note != null ? String(input.note) : "",
    createdAt: now,
  };
  if (input.address != null && String(input.address).trim() !== "") {
    customer.address = String(input.address);
  }
  s.customers.push(customer);
  return attachResult(s, { customer });
}

function pickFirst(obj, keys, fallback) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim?.() !== "") {
      return obj[k];
    }
    if (obj && obj[k] !== undefined && obj[k] !== null && typeof obj[k] === "number") return obj[k];
  }
  return fallback;
}

export function addLoan(state, data) {
  const [base, input] = splitBaseInput(state, data);
  if (!isObj(input)) throw new Error("Loan data is required.");
  const customerIdRaw = pickFirst(input,
    ["customerId", "customer_id", "customer", "customerID"], undefined);
  const customerId = customerIdRaw != null ? String(customerIdRaw).trim() : "";
  if (!customerId) throw new Error("Customer is required.");

  const principalRaw = pickFirst(input,
    ["principal", "principalPaise", "amount", "amountPaise", "loan_principal"], undefined);
  const principal = typeof principalRaw === "string" && principalRaw.trim() !== ""
    ? Number(principalRaw.trim())
    : principalRaw;
  if (!Number.isInteger(principal) || principal <= 0) {
    throw new Error("Enter a valid amount greater than zero.");
  }

  const dateRaw = pickFirst(input,
    ["startDate", "start", "date", "loan_start", "loanStart", "start_date"], "");
  const startDate = dateRaw != null ? String(dateRaw).trim() : "";
  if (!isValidDateStr(startDate)) throw new Error("Enter a valid date.");

  let rate = 0;
  const rateRaw = pickFirst(input, ["rate", "ratePa", "interestRate", "loan_rate", "interest_rate"], undefined);
  if (rateRaw !== undefined) {
    const n = typeof rateRaw === "number" ? rateRaw : Number(String(rateRaw).trim());
    if (!Number.isFinite(n) || n < 0) throw new Error("Enter a valid interest rate.");
    rate = n;
  }

  const methodRaw = pickFirst(input, ["method", "loan_method", "loanMethod"], "Cash");
  const method = String(methodRaw).trim() || "Cash";

  // Full InterestLedger engine fields (persisted verbatim when present so
  // summarizeLoan/validateLoan see the agreed terms; legacy "Cash" loans
  // without engine fields keep working for old tests).
  const engine = {};
  if (input.fixedDailyPaise !== undefined) engine.fixedDailyPaise = input.fixedDailyPaise;
  if (input.dailyRatePct !== undefined) engine.dailyRatePct = input.dailyRatePct;
  if (input.monthlyRatePct !== undefined) engine.monthlyRatePct = input.monthlyRatePct;
  if (input.dayCount !== undefined) engine.dayCount = input.dayCount;
  if (input.rounding !== undefined) engine.rounding = input.rounding;
  if (input.principalTiming !== undefined) engine.principalTiming = input.principalTiming;
  if (input.allocationPolicy !== undefined) engine.allocationPolicy = input.allocationPolicy;
  if (input.interestStartDate !== undefined) engine.interestStartDate = input.interestStartDate;
  if (input.interestEndDate !== undefined) engine.interestEndDate = input.interestEndDate;
  if (input.skipWeekdays !== undefined) engine.skipWeekdays = input.skipWeekdays;
  if (input.holidays !== undefined) engine.holidays = input.holidays;
  if (input.dueDate !== undefined) engine.dueDate = input.dueDate;
  if (input.annualRatePct !== undefined) engine.annualRatePct = input.annualRatePct;
  if (input.annualRate !== undefined) engine.annualRate = input.annualRate;

  const s = ensureILShape(clone(base));
  if (!s.customers.some((c) => c && c.id === customerId)) {
    throw new Error("Customer not found.");
  }
  let id;
  if (input.id != null && String(input.id).trim() !== "") {
    id = String(input.id).trim();
    if (s.loans.some((l) => l && l.id === id)) {
      throw new Error("This loan already exists (duplicate prevented).");
    }
  } else {
    id = nextLoanId(s);
  }
  const now = new Date().toISOString();
  const loan = {
    id,
    customerId,
    principal,
    principalPaise: principal,
    amount: principal,
    amountPaise: principal,
    startDate,
    date: startDate,
    method,
    rate,
    allocation: input.allocation != null ? String(input.allocation) : "",
    status: input.status != null && String(input.status).trim() !== "" ? String(input.status).trim() : "active",
    note: input.note != null ? String(input.note) : "",
    notes: input.notes != null ? String(input.notes) : (input.note != null ? String(input.note) : ""),
    createdAt: now,
    ...engine,
  };
  s.loans.push(loan);
  return attachResult(s, { loan });
}

export function addCollectionRecord(state, data) {
  const [base, input] = splitBaseInput(state, data);
  if (!isObj(input)) throw new Error("Collection data is required.");
  const loanIdRaw = pickFirst(input, ["loanId", "loan_id", "loan", "loanID"], undefined);
  const loanId = loanIdRaw != null ? String(loanIdRaw).trim() : "";
  if (!loanId) throw new Error("Loan is required.");

  const amountRaw = pickFirst(input,
    ["amount", "amountPaise", "cash_received", "cashReceived", "cash", "cashReceivedPaise"], undefined);
  const amount = typeof amountRaw === "string" && amountRaw.trim() !== ""
    ? Number(amountRaw.trim())
    : amountRaw;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Enter a valid amount greater than zero.");
  }

  let dateRaw = pickFirst(input,
    ["date", "collectionDate", "collection_date", "collectiondate", "createdAt"], undefined);
  let date = dateRaw != null ? String(dateRaw).trim() : "";
  if (date === "") date = todayISODate();
  if (!isValidDateStr(date)) throw new Error("Enter a valid date.");

  const iRaw = pickFirst(input, ["interestAllocPaise", "interestAlloc", "interest_alloc", "interest"], undefined);
  const pRaw = pickFirst(input, ["principalAllocPaise", "principalAlloc", "principal_alloc", "principal"], undefined);
  let interestAlloc = 0;
  let principalAlloc = amount;
  if (iRaw !== undefined || pRaw !== undefined) {
    interestAlloc = iRaw === undefined ? 0 : (typeof iRaw === "string" ? Number(String(iRaw).trim()) : iRaw);
    principalAlloc = pRaw === undefined ? 0 : (typeof pRaw === "string" ? Number(String(pRaw).trim()) : pRaw);
    if (!Number.isInteger(interestAlloc) || interestAlloc < 0 ||
        !Number.isInteger(principalAlloc) || principalAlloc < 0) {
      throw new Error("Interest + principal must equal cash received.");
    }
    const sum = interestAlloc + principalAlloc;
    if (sum > amount) throw new Error("Allocation exceeds received amount.");
    if (sum !== amount) throw new Error("Interest + principal must equal cash received.");
  }

  const methodRaw = pickFirst(input, ["method"], "Cash");
  const method = String(methodRaw).trim() || "Cash";

  const keyRaw = pickFirst(input, ["idempotencyKey", "key", "idempotency_key"], undefined);
  const idemKey = keyRaw != null && String(keyRaw).trim() !== "" ? String(keyRaw).trim() : null;

  const s = ensureILShape(clone(base));
  if (!s.loans.some((l) => l && l.id === loanId)) throw new Error("Loan not found.");
  if (idemKey && s.usedKeys.includes(idemKey)) {
    throw new Error("This payment was already recorded (duplicate prevented).");
  }

  let id;
  if (input.id != null && String(input.id).trim() !== "") {
    id = String(input.id).trim();
    if (s.transactions.some((t) => t && t.id === id) || s.usedKeys.includes(id)) {
      throw new Error("This payment was already recorded (duplicate prevented).");
    }
  } else {
    id = nextTxnRef(s);
    if (s.transactions.some((t) => t && t.id === id)) {
      id = uid("T");
    }
  }
  const now = new Date().toISOString();
  const loanForTxn = s.loans.find((l) => l && l.id === loanId);
  const txn = {
    id,
    ref: id,
    txnRef: id,
    loanId,
    loan_id: loanId,
    customerId: loanForTxn && loanForTxn.customerId ? loanForTxn.customerId : (input.customerId != null ? String(input.customerId) : ""),
    type: "collection",
    method,
    date: String(date).slice(0, 10),
    collectionDate: String(date).slice(0, 10),
    collection_date: String(date).slice(0, 10),
    amount,
    amountPaise: amount,
    cash_received: amount,
    cashReceived: amount,
    cashReceivedPaise: amount,
    interestAlloc,
    interest_alloc: interestAlloc,
    interestAllocPaise: interestAlloc,
    principalAlloc,
    principal_alloc: principalAlloc,
    principalAllocPaise: principalAlloc,
    note: input.note != null ? String(input.note) : "",
    idempotencyKey: idemKey || id,
    createdAt: now,
  };
  s.transactions.push(txn);
  s.usedKeys.push(idemKey || id);
  return attachResult(s, { transaction: txn, txn, record: txn, collection: txn });
}

export function getCustomer(state, id) {
  if (!isObj(state) || !Array.isArray(state.customers)) return null;
  const found = state.customers.find((c) => c && c.id === id);
  return found ? { ...found } : null;
}

export function getLoan(state, id) {
  if (!isObj(state) || !Array.isArray(state.loans)) return null;
  const found = state.loans.find((l) => l && l.id === id);
  return found ? { ...found } : null;
}

export function loansForCustomer(state, customerId) {
  if (!isObj(state) || !Array.isArray(state.loans)) return [];
  return state.loans
    .filter((l) => l && l.customerId === customerId)
    .map((l) => ({ ...l }));
}

export function txnsForLoan(state, loanId) {
  if (!isObj(state) || !Array.isArray(state.transactions)) return [];
  return state.transactions
    .filter((t) => t && (t.loanId === loanId || t.loan_id === loanId))
    .map((t) => ({ ...t }));
}

// ---------------------------------------------------------------------------
// Persistence: IndexedDB-first, localStorage fallback, memory fallback
// ---------------------------------------------------------------------------

function getLS() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === "function" && typeof ls.setItem === "function") return ls;
    return null;
  } catch { return null; }
}

let __memFallback = null;

function hasIDB() {
  try {
    const g = globalThis;
    return !!(g && g.indexedDB && typeof g.indexedDB.open === "function");
  } catch { return false; }
}

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = globalThis.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const n of ["customers", "loans", "transactions"]) {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed."));
      req.onblocked = () => reject(new Error("IndexedDB blocked."));
    } catch (e) { reject(e); }
  });
}

function reqDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed."));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

async function saveIDB(state) {
  const db = await openDb();
  try {
    const tx = db.transaction(["customers", "loans", "transactions", "meta"], "readwrite");
    const cs = tx.objectStore("customers");
    const ls = tx.objectStore("loans");
    const ts = tx.objectStore("transactions");
    const ms = tx.objectStore("meta");
    for (const store of [cs, ls, ts, ms]) {
      const clr = store.clear();
      await reqDone(clr);
    }
    for (const c of state.customers) {
      if (!c || typeof c.id !== "string" || !c.id) continue;
      await reqDone(cs.put(clone(c)));
    }
    for (const l of state.loans) {
      if (!l || typeof l.id !== "string" || !l.id) continue;
      await reqDone(ls.put(clone(l)));
    }
    for (const t of state.transactions) {
      if (!t || typeof t.id !== "string" || !t.id) continue;
      await reqDone(ts.put(clone(t)));
    }
    await reqDone(ms.put({ key: "counters", value: clone(state.counters) }));
    await reqDone(ms.put({ key: "usedKeys", value: clone(state.usedKeys) }));
    await reqDone(ms.put({ key: "settings", value: clone(state.settings) }));
    await reqDone(ms.put({ key: "version", value: 1 }));
    await txDone(tx);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

async function loadIDB() {
  const db = await openDb();
  try {
    const tx = db.transaction(["customers", "loans", "transactions", "meta"], "readonly");
    const customers = await reqDone(tx.objectStore("customers").getAll());
    const loans = await reqDone(tx.objectStore("loans").getAll());
    const transactions = await reqDone(tx.objectStore("transactions").getAll());
    const metaRows = await reqDone(tx.objectStore("meta").getAll());
    const meta = {};
    for (const r of metaRows || []) {
      if (r && typeof r.key === "string") meta[r.key] = r.value;
    }
    const hasAny = (customers && customers.length) || (loans && loans.length) ||
      (transactions && transactions.length) || Object.keys(meta).length > 0;
    if (!hasAny) return null;
    return mergeState({
      version: 1,
      customers: customers || [],
      loans: loans || [],
      transactions: transactions || [],
      usedKeys: meta.usedKeys || [],
      counters: meta.counters || { customerSeq: 0, loanSeq: 0, txnSeq: 0 },
      settings: meta.settings || { lang: "en" },
    });
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

export function loadStateSync() {
  const ls = getLS();
  if (ls) {
    try {
      const raw = ls.getItem(IL_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      return mergeState(parsed);
    } catch {
      return __memFallback ? clone(__memFallback) : emptyState();
    }
  }
  return __memFallback ? clone(__memFallback) : emptyState();
}

export function saveStateSync(state) {
  const clean = mergeState(clone(state));
  const ls = getLS();
  __memFallback = clone(clean);
  if (!ls) return;
  try {
    ls.setItem(IL_KEY, JSON.stringify(clean));
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new Error("Device storage is full. Free space and retry.");
    }
    throw new Error("Could not save data (" + (e && e.message ? e.message : "storage error") + ").");
  }
}

export async function loadState() {
  if (hasIDB()) {
    try {
      const fromIDB = await loadIDB();
      if (fromIDB) {
        __memFallback = clone(fromIDB);
        return fromIDB;
      }
    } catch { /* fall through to localStorage */ }
  }
  return loadStateSync();
}

export async function saveState(state) {
  const clean = mergeState(clone(state));
  __memFallback = clone(clean);
  if (hasIDB()) {
    try {
      await saveIDB(clean);
    } catch { /* IDB failed: continue to localStorage fallback */ }
  }
  saveStateSync(clean);
}

export async function clearState() {
  __memFallback = emptyState();
  const ls = getLS();
  if (ls) {
    try { ls.removeItem(IL_KEY); } catch { /* ignore */ }
  }
  if (hasIDB()) {
    try {
      const db = await openDb();
      try {
        const tx = db.transaction(["customers", "loans", "transactions", "meta"], "readwrite");
        for (const n of ["customers", "loans", "transactions", "meta"]) {
          await reqDone(tx.objectStore(n).clear());
        }
        await txDone(tx);
      } finally {
        try { db.close(); } catch { /* ignore */ }
      }
    } catch { /* ignore: fallback already cleared */ }
  }
}

/** Isolated in-memory adapter for tests. */
export function createMemoryStore(initial) {
  let mem = mergeState(initial ? clone(initial) : emptyState());
  return {
    async loadState() { return clone(mem); },
    async saveState(s) { mem = mergeState(clone(s)); },
    loadStateSync() { return clone(mem); },
    saveStateSync(s) { mem = mergeState(clone(s)); },
    async clearState() { mem = emptyState(); },
  };
}

// ---------------------------------------------------------------------------
// Legacy SmartBill API (preserved so js/app.js and old tests keep working)
// ---------------------------------------------------------------------------

import { calcBalance as _calcBalance } from "./ledger.js";

const KEY = "smartbill_v1";

function defaultState() {
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

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const d = defaultState();
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore: read-only contexts still get defaults */ }
      return d;
    }
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") throw new Error("Stored data is not an object.");
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
    const d = defaultState();
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
    return d;
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw new Error("Device storage is full. Free space and retry.");
    }
    throw new Error("Could not save data (" + (e && e.message ? e.message : "storage error") + ").");
  }
}

function nextInvoiceNo(state) {
  state.counters.invoiceSeq = (state.counters.invoiceSeq || 0) + 1;
  const year = new Date().getFullYear();
  const seq = String(state.counters.invoiceSeq).padStart(4, "0");
  return `SB-${year}-${seq}`;
}

function customerOutstanding(state, customerId) {
  const customers = state && Array.isArray(state.customers) ? state.customers : [];
  const c = customers.find((x) => x && x.id === customerId);
  if (!c) return 0;
  const ledger = Array.isArray(state.ledger) ? state.ledger : [];
  const txns = ledger.filter((t) => t && t.customerId === customerId && !t.void);
  return _calcBalance(c.openingPaise || 0, txns);
}

function invoicePaidTotal(state, invoiceId) {
  const ledger = state && Array.isArray(state.ledger) ? state.ledger : [];
  return ledger
    .filter((t) => t && t.invoiceId === invoiceId && t.type === "payment" && !t.void && Number.isInteger(t.amountPaise))
    .reduce((s, t) => s + -t.amountPaise, 0);
}

export { KEY, defaultState, load, save, nextInvoiceNo, customerOutstanding, invoicePaidTotal };
