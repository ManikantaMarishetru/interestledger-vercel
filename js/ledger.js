/**
 * InterestLedger ledger / audit / collection-validation layer.
 * Plain JS, zero deps. Pure logic — no DOM / no localStorage.
 *
 * Interest math lives in js/interest.js (summarizeLoan). This file owns:
 *   - collection validation with explicit split + idempotency
 *   - idempotency key builders
 *   - append-only reversals (audit preserved, never deleted)
 *   - per-customer rollups + dashboard reconciliation
 *   - customer validation
 *
 * Backward compatibility: the pre-InterestLedger SmartBill credit ledger
 * (calcBalance / summarize(opening,txns) / validateCollection({outstandingPaise,...})
 * / validateCustomer({...,openingPaise})) is preserved so existing views and
 * regression tests keep working. New InterestLedger paths are selected when
 * loanSummary / split allocations are present.
 */
import { summarizeLoan } from "./interest.js";

function hasKey(arrOrSet, key) {
  if (!arrOrSet) return false;
  if (typeof arrOrSet.has === "function") {
    try {
      return arrOrSet.has(key);
    } catch {
      return false;
    }
  }
  if (Array.isArray(arrOrSet)) return arrOrSet.includes(key);
  return false;
}

/* ---------- legacy credit-ledger math (kept for existing app + tests) ---------- */

export function calcBalance(openingPaise, transactions) {
  let bal = Number.isInteger(openingPaise) ? openingPaise : 0;
  const list = Array.isArray(transactions) ? transactions : [];
  for (const t of list) {
    if (t && Number.isInteger(t.amountPaise)) bal += t.amountPaise;
  }
  return bal;
}

export function summarize(openingPaise, transactions) {
  const opening = Number.isInteger(openingPaise) ? openingPaise : 0;
  let creditSales = 0;
  let payments = 0;
  let adjustments = 0;
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

/* ---------- collection validation (dual-mode) ---------- */

/**
 * New InterestLedger mode:
 *   validateCollection({ loanSummary, amountPaise, interestAllocPaise,
 *     principalAllocPaise, idempotencyKey, usedKeys, allocationPolicy })
 * Legacy SmartBill mode:
 *   validateCollection({ outstandingPaise, amountPaise, idempotencyKey, usedKeys })
 * Returns an error string or null.
 */
export function validateCollection(args) {
  const a = args && typeof args === "object" ? args : {};
  const isNew =
    "loanSummary" in a ||
    "interestAllocPaise" in a ||
    "principalAllocPaise" in a;

  if (!isNew) {
    // Legacy path — messages frozen for existing tests/views.
    const { outstandingPaise, amountPaise, idempotencyKey, usedKeys } = a;
    if (!Number.isInteger(amountPaise) || amountPaise <= 0)
      return "Collection amount must be more than zero.";
    if (Number.isInteger(outstandingPaise) && amountPaise > outstandingPaise)
      return `Collection of ${amountPaise} paise exceeds outstanding ${outstandingPaise} paise. Record the extra as an adjustment with a reason if needed.`;
    if (!idempotencyKey) return "Missing idempotency key. Please reopen the form and try again.";
    if (usedKeys && hasKey(usedKeys, idempotencyKey))
      return "This payment was already recorded (duplicate prevented).";
    return null;
  }

  const {
    loanSummary,
    amountPaise,
    interestAllocPaise,
    principalAllocPaise,
    idempotencyKey,
    usedKeys,
  } = a;
  // allocationPolicy is accepted but intentionally ignored: the UI may prefill
  // a split using interest_first/principal_first, but validation still
  // requires an explicit balanced split (no silent allocation).

  if (!Number.isInteger(amountPaise) || amountPaise <= 0)
    return "Collection amount must be more than zero.";
  if (!Number.isInteger(interestAllocPaise) || interestAllocPaise < 0)
    return "Interest allocation must be a non-negative integer (paise). Enter an explicit split.";
  if (!Number.isInteger(principalAllocPaise) || principalAllocPaise < 0)
    return "Principal allocation must be a non-negative integer (paise). Enter an explicit split.";
  if (!idempotencyKey || (typeof idempotencyKey === "string" && idempotencyKey.trim() === ""))
    return "Missing idempotency key. Please reopen the form and try again.";
  if (usedKeys && hasKey(usedKeys, idempotencyKey))
    return "This payment was already recorded (duplicate prevented).";
  if (interestAllocPaise + principalAllocPaise !== amountPaise)
    return `Allocation mismatch: amount ${amountPaise} paise != interest ${interestAllocPaise} + principal ${principalAllocPaise} paise. Enter an explicit split that adds up.`;

  const interestOutstanding =
    loanSummary && Number.isInteger(loanSummary.interestOutstanding)
      ? loanSummary.interestOutstanding
      : 0;
  const principalOutstanding =
    loanSummary && Number.isInteger(loanSummary.principalOutstanding)
      ? loanSummary.principalOutstanding
      : 0;

  if (interestAllocPaise > interestOutstanding)
    return `Interest allocation of ${interestAllocPaise} paise exceeds outstanding interest of ${interestOutstanding} paise. Advance payments are not allowed — allocate only what is due.`;
  if (principalAllocPaise > principalOutstanding)
    return `Principal allocation of ${principalAllocPaise} paise exceeds outstanding principal of ${principalOutstanding} paise. Advance payments are not allowed — allocate only what is due.`;
  return null;
}

/* ---------- idempotency keys ---------- */

export function buildIdempotencyKey({ loanId, date, amountPaise, interestAllocPaise, principalAllocPaise }) {
  return `${loanId}|${date}|${amountPaise}|${interestAllocPaise}|${principalAllocPaise}`;
}

export function newFormKey(prefix = "form") {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function newId(prefix) {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function deepClone(value) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {
    /* fall through to JSON */
  }
  return JSON.parse(JSON.stringify(value));
}

/* ---------- reversals (append-only audit) ---------- */

/**
 * reverseTransaction(state, txnId, reason, nowISO) -> { state, reversal }.
 * Never mutates the input. Clones the transaction collections, marks the
 * original reversedById, and appends an offsetting 'reversal' entry.
 * Supports InterestLedger state ({ transactions }) and legacy state ({ ledger }).
 */
export function reverseTransaction(state, txnId, reason, nowISO) {
  if (!state || typeof state !== "object") throw new Error("Invalid state.");
  if (!txnId) throw new Error("Transaction id is required.");
  if (!reason || String(reason).trim() === "") throw new Error("Reason is required for reversal.");
  const now = nowISO || new Date().toISOString();
  const businessDate = String(now).slice(0, 10);

  const hasTransactions = Array.isArray(state.transactions);
  const hasLedger = Array.isArray(state.ledger);
  const key = hasTransactions ? "transactions" : hasLedger ? "ledger" : "transactions";

  const list = Array.isArray(state[key]) ? state[key] : [];
  const orig = list.find((t) => t && t.id === txnId);
  if (!orig) throw new Error(`Transaction ${txnId} not found.`);
  if (orig.reversedById) throw new Error(`Transaction ${txnId} was already reversed.`);
  const existing = list.find((t) => t && t.reversesId === txnId);
  if (existing) throw new Error(`Transaction ${txnId} was already reversed.`);

  const next = deepClone(state);
  if (!Array.isArray(next[key])) next[key] = [];
  const origCopy = next[key].find((t) => t && t.id === txnId);
  if (!origCopy) throw new Error(`Transaction ${txnId} not found.`);
  if (origCopy.reversedById) throw new Error(`Transaction ${txnId} was already reversed.`);

  const reversal = {
    id: newId("rev"),
    loanId: origCopy.loanId,
    customerId: origCopy.customerId,
    type: "reversal",
    date: businessDate,
    createdAt: String(now).length > 10 ? String(now) : businessDate,
    amountPaise: -(origCopy.amountPaise || 0),
    interestAllocPaise: -(origCopy.interestAllocPaise || 0),
    principalAllocPaise: -(origCopy.principalAllocPaise || 0),
    reversesId: txnId,
    reason: String(reason).trim(),
    idempotencyKey: newFormKey("rev"),
    void: false,
  };
  // Carry legacy invoice linkage when present so old views keep working.
  if (origCopy.invoiceId !== undefined) reversal.invoiceId = origCopy.invoiceId;
  if (origCopy.ref !== undefined) reversal.ref = origCopy.ref;

  origCopy.reversedById = reversal.id;
  next[key] = [...next[key], reversal];
  return { state: next, reversal };
}

/* ---------- rollups + reconciliation ---------- */

export function summarizeCustomer(customerId, loans, transactions, asOfISO) {
  const loanList = Array.isArray(loans) ? loans.filter((l) => l && l.customerId === customerId) : [];
  const txns = Array.isArray(transactions) ? transactions : [];
  const perLoan = loanList.map((l) => summarizeLoan(l, txns, asOfISO));
  let principalLent = 0;
  let principalOutstanding = 0;
  let interestAccrued = 0;
  let interestReceived = 0;
  let interestOutstanding = 0;
  let totalOutstanding = 0;
  let activeLoans = 0;
  for (const s of perLoan) {
    principalLent += s.principalLent ?? s.principalDisbursed ?? 0;
    principalOutstanding += s.principalOutstanding || 0;
    interestAccrued += s.interestAccrued || 0;
    interestReceived += s.interestReceived ?? s.interestCollected ?? 0;
    interestOutstanding += s.interestOutstanding || 0;
    totalOutstanding += s.totalOutstanding || 0;
    if ((s.totalOutstanding || 0) > 0) activeLoans += 1;
  }
  return {
    customerId,
    loans: perLoan,
    principalLent,
    principalOutstanding,
    interestAccrued,
    interestReceived,
    interestCollected: interestReceived,
    interestOutstanding,
    totalOutstanding,
    activeLoans,
  };
}

export function reconcileTotals(state, asOfISO) {
  const s = state && typeof state === "object" ? state : {};
  const loans = Array.isArray(s.loans) ? s.loans : [];
  const txns = Array.isArray(s.transactions)
    ? s.transactions
    : Array.isArray(s.ledger)
      ? s.ledger
      : [];
  let totalPrincipalLent = 0;
  let principalOutstanding = 0;
  let interestAccrued = 0;
  let interestCollected = 0;
  let interestOutstanding = 0;
  let totalOutstanding = 0;
  const activeCustomerIds = new Set();
  let activeLoans = 0;
  for (const loan of loans) {
    if (!loan) continue;
    const sum = summarizeLoan(loan, txns, asOfISO);
    totalPrincipalLent += sum.principalLent ?? sum.principalDisbursed ?? 0;
    principalOutstanding += sum.principalOutstanding || 0;
    interestAccrued += sum.interestAccrued || 0;
    interestCollected += sum.interestReceived ?? sum.interestCollected ?? 0;
    interestOutstanding += sum.interestOutstanding || 0;
    totalOutstanding += sum.totalOutstanding || 0;
    if ((sum.totalOutstanding || 0) > 0) {
      activeLoans += 1;
      if (loan.customerId !== undefined) activeCustomerIds.add(loan.customerId);
    }
  }
  return {
    totalPrincipalLent,
    principalOutstanding,
    interestAccrued,
    interestCollected,
    interestOutstanding,
    totalOutstanding,
    activeCustomers: activeCustomerIds.size,
    activeLoans,
  };
}

/* ---------- customer validation (dual-mode) ---------- */

export function validateCustomer(args) {
  const a = args && typeof args === "object" ? args : {};
  const { name, phone, notes, openingPaise } = a;
  const errs = [];
  if (!name || !String(name).trim()) errs.push("Customer name is required.");
  if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
    const digits = String(phone).replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(local))
      errs.push("Phone looks invalid. Use a 10-digit Indian mobile number (optional).");
  }
  if (notes !== undefined && notes !== null && String(notes).length > 500)
    errs.push("Notes must be at most 500 characters.");
  // Legacy field — still validated when present so old forms keep working.
  if (openingPaise !== undefined && (!Number.isInteger(openingPaise) || openingPaise < 0))
    errs.push("Opening balance cannot be negative.");
  return errs;
}
