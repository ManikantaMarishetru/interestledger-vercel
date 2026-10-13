/**
 * InterestLedger versioned JSON backup/restore + CSV export.
 * Plain JS, zero dependencies. No console logging of personal data.
 */
import { emptyState } from "./store.js";

export const BACKUP_VERSION = 1;

function clone(o) {
  if (o === null || o === undefined) return o;
  return JSON.parse(JSON.stringify(o));
}

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function isValidDateStr(s) {
  if (typeof s !== "string" || s.trim() === "") return false;
  return !Number.isNaN(Date.parse(s));
}

export function buildBackup(state) {
  const base = state && typeof state === "object" ? state : emptyState();
  return {
    schema: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    customers: clone(Array.isArray(base.customers) ? base.customers : []),
    loans: clone(Array.isArray(base.loans) ? base.loans : []),
    transactions: clone(Array.isArray(base.transactions) ? base.transactions : []),
    usedKeys: clone(Array.isArray(base.usedKeys) ? base.usedKeys : []),
    counters: clone(base.counters && typeof base.counters === "object"
      ? base.counters
      : { customerSeq: 0, loanSeq: 0, txnSeq: 0 }),
    settings: clone(base.settings && typeof base.settings === "object"
      ? base.settings
      : { lang: "en" }),
  };
}

const AMOUNT_FIELDS = new Set([
  "principal", "principalPaise", "amount", "amountPaise",
  "cash_received", "cashReceived", "cashReceivedPaise",
  "interestAlloc", "principalAlloc", "interest_alloc", "principal_alloc",
  "openingPaise", "paidPaise", "balancePaise",
]);

const DATE_FIELDS = new Set([
  "date", "startDate", "start", "start_date", "collectionDate",
  "collection_date", "createdAt", "exportedAt", "dueDate",
]);

function checkAmounts(record, label, errors) {
  if (!isObj(record)) return;
  for (const [k, v] of Object.entries(record)) {
    const isAmountKey = AMOUNT_FIELDS.has(k) || /Paise$/.test(k);
    if (!isAmountKey) continue;
    if (v === undefined || v === null || v === "") continue;
    if (!Number.isInteger(v) || v < 0) {
      errors.push(`${label} has invalid amount field "${k}": must be an integer >= 0.`);
    }
  }
}

function checkDates(record, label, errors) {
  if (!isObj(record)) return;
  for (const [k, v] of Object.entries(record)) {
    if (!DATE_FIELDS.has(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || !isValidDateStr(v)) {
      errors.push(`${label} has invalid date field "${k}".`);
    }
  }
}

/**
 * Validate a parsed backup object. Returns string[] errors (empty = valid).
 * Checks: object, schema===1, arrays present, amounts integer>=0, dates valid
 * ISO, IDs non-empty unique strings per collection, loan.customerId refs an
 * existing customer, txn.loanId refs an existing loan.
 */
export function validateBackup(obj) {
  const errors = [];
  if (!isObj(obj)) return ["Backup must be an object."];
  if (obj.schema !== BACKUP_VERSION) {
    errors.push(`Invalid backup schema: expected ${BACKUP_VERSION}.`);
  }
  for (const k of ["customers", "loans", "transactions"]) {
    if (!Array.isArray(obj[k])) errors.push(`Backup "${k}" must be an array.`);
  }
  if (obj.usedKeys !== undefined && !Array.isArray(obj.usedKeys)) {
    errors.push('Backup "usedKeys" must be an array.');
  }
  if (errors.length > 0) return errors;

  const seenCustomers = new Set();
  const seenLoans = new Set();
  const seenTxns = new Set();

  for (let i = 0; i < obj.customers.length; i++) {
    const c = obj.customers[i];
    const label = `Customer[${i}]`;
    if (!isObj(c) || typeof c.id !== "string" || c.id.trim() === "") {
      errors.push(`${label} must have a non-empty string id.`);
    } else if (seenCustomers.has(c.id)) {
      errors.push(`Duplicate customer id "${c.id}".`);
    } else {
      seenCustomers.add(c.id);
    }
    checkAmounts(c, label, errors);
    checkDates(c, label, errors);
  }

  for (let i = 0; i < obj.loans.length; i++) {
    const l = obj.loans[i];
    const label = `Loan[${i}]`;
    if (!isObj(l) || typeof l.id !== "string" || l.id.trim() === "") {
      errors.push(`${label} must have a non-empty string id.`);
    } else if (seenLoans.has(l.id)) {
      errors.push(`Duplicate loan id "${l.id}".`);
    } else {
      seenLoans.add(l.id);
    }
    checkAmounts(l, label, errors);
    checkDates(l, label, errors);
    const cid = l && (l.customerId !== undefined ? l.customerId : l.customer_id);
    if (typeof cid !== "string" || cid.trim() === "") {
      errors.push(`${label} must reference a customer (missing customerId).`);
    } else if (!seenCustomers.has(cid) &&
        !obj.customers.some((c) => c && c.id === cid)) {
      errors.push(`${label} references missing customer "${cid}".`);
    }
  }

  for (let i = 0; i < obj.transactions.length; i++) {
    const txn = obj.transactions[i];
    const label = `Transaction[${i}]`;
    if (!isObj(txn) || typeof txn.id !== "string" || txn.id.trim() === "") {
      errors.push(`${label} must have a non-empty string id.`);
    } else if (seenTxns.has(txn.id)) {
      errors.push(`Duplicate transaction id "${txn.id}".`);
    } else {
      seenTxns.add(txn.id);
    }
    checkAmounts(txn, label, errors);
    checkDates(txn, label, errors);
    const lid = txn && (txn.loanId !== undefined ? txn.loanId : txn.loan_id);
    if (typeof lid !== "string" || lid.trim() === "") {
      errors.push(`${label} must reference a loan (missing loanId).`);
    } else if (!seenLoans.has(lid) &&
        !obj.loans.some((l) => l && l.id === lid)) {
      errors.push(`${label} references missing loan "${lid}".`);
    }
  }

  return errors;
}

export function exportBackupJSON(state) {
  return JSON.stringify(buildBackup(state), null, 2);
}

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function txAmount(t) {
  for (const k of ["amount", "amountPaise", "cash_received", "cashReceived"]) {
    if (Number.isInteger(t[k])) return t[k];
  }
  return "";
}

function txDate(t) {
  for (const k of ["date", "collectionDate", "collection_date", "createdAt"]) {
    if (typeof t[k] === "string" && t[k] !== "") return t[k];
  }
  return "";
}

/** Transactions CSV with header + date-range/currency note rows. */
export function transactionsToCSV(input, options) {
  const opts = options && typeof options === "object" ? options : {};
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (input && Array.isArray(input.transactions)) list = input.transactions;
  const from = opts.from ? String(opts.from) : "";
  const to = opts.to ? String(opts.to) : "";
  const lines = [];
  lines.push("# InterestLedger transactions export");
  lines.push("# Amounts in paise (1 INR = 100 paise); dates in ISO format");
  lines.push(`# Date range: ${from || "all"} to ${to || "all"}`);
  lines.push(`# Exported: ${new Date().toISOString()}`);
  lines.push("id,loanId,type,method,date,amount_paise,interest_alloc,principal_alloc,note");
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const loanId = t.loanId !== undefined ? t.loanId : (t.loan_id !== undefined ? t.loan_id : "");
    const iAlloc = t.interestAlloc !== undefined ? t.interestAlloc
      : (t.interest_alloc !== undefined ? t.interest_alloc : "");
    const pAlloc = t.principalAlloc !== undefined ? t.principalAlloc
      : (t.principal_alloc !== undefined ? t.principal_alloc : "");
    lines.push([
      csvEscape(t.id), csvEscape(loanId), csvEscape(t.type),
      csvEscape(t.method), csvEscape(txDate(t)), csvEscape(txAmount(t)),
      csvEscape(iAlloc), csvEscape(pAlloc), csvEscape(t.note),
    ].join(","));
  }
  return lines.join("\n");
}

/** Summary CSV with header + currency note rows. Accepts a state or a plain summary object. */
export function summaryToCSV(input, options) {
  const opts = options && typeof options === "object" ? options : {};
  const from = opts.from ? String(opts.from) : "";
  const to = opts.to ? String(opts.to) : "";
  const lines = [];
  lines.push("# InterestLedger summary export");
  lines.push("# Amounts in paise (1 INR = 100 paise); dates in ISO format");
  if (from || to) lines.push(`# Date range: ${from || "all"} to ${to || "all"}`);
  lines.push(`# Exported: ${new Date().toISOString()}`);
  lines.push("metric,value");

  let rows = [];
  if (input && Array.isArray(input.customers) && Array.isArray(input.loans)) {
    const loans = Array.isArray(input.loans) ? input.loans : [];
    const txns = Array.isArray(input.transactions) ? input.transactions : [];
    const totalLent = loans.reduce((s, l) => {
      const p = l && (Number.isInteger(l.principal) ? l.principal
        : Number.isInteger(l.principalPaise) ? l.principalPaise
        : Number.isInteger(l.amount) ? l.amount : 0);
      return s + (Number.isInteger(p) ? p : 0);
    }, 0);
    const totalCollected = txns.reduce((s, t) => {
      if (!t || t.type !== "collection") return s;
      const a = txAmount(t);
      return s + (Number.isInteger(a) ? a : 0);
    }, 0);
    rows = [
      ["total_customers", input.customers.length],
      ["total_loans", loans.length],
      ["total_transactions", txns.length],
      ["total_lent_paise", totalLent],
      ["total_collected_paise", totalCollected],
    ];
  } else if (isObj(input)) {
    rows = Object.entries(input).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]);
  }
  for (const [k, v] of rows) {
    lines.push(`${csvEscape(k)},${csvEscape(v)}`);
  }
  return lines.join("\n");
}

/**
 * Replace-semantics restore: validates first (throws on error), then returns
 * a fresh cloned state with preserved IDs and full history.
 */
export function restoreReplace(existing, backupObj) {
  const errors = validateBackup(backupObj);
  if (errors.length > 0) {
    throw new Error("Invalid backup: " + errors.join("; "));
  }
  const base = emptyState();
  return {
    version: 1,
    customers: clone(backupObj.customers),
    loans: clone(backupObj.loans),
    transactions: clone(backupObj.transactions),
    usedKeys: Array.isArray(backupObj.usedKeys) ? clone(backupObj.usedKeys) : [],
    counters: backupObj.counters && typeof backupObj.counters === "object"
      ? clone(backupObj.counters)
      : clone(base.counters),
    settings: backupObj.settings && typeof backupObj.settings === "object"
      ? clone(backupObj.settings)
      : clone(base.settings),
  };
}
