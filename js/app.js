/**
 * InterestLedger UI — cash-only daily interest ledger.
 * Plain JS, zero dependencies. All money = integer paise.
 * Cash is the only payment method. No bank, gateway or cloud code.
 */
import { toPaise, formatINR, formatDateIN } from "./money.js";
import {
  isValidISO, addDaysISO, dateRangeISO, daysInMonthISO,
  isChargeable, dailyChargePaise, accrualSchedule,
  summarizeLoan, validateLoan, describeLoan,
} from "./interest.js";
import {
  validateCollection, buildIdempotencyKey, newFormKey,
  reverseTransaction, summarizeCustomer, reconcileTotals, validateCustomer,
} from "./ledger.js";
import {
  emptyState, uid, loadState, saveState,
  getCustomer, getLoan,
} from "./store.js";
import { STRINGS, t as tr, LANGS } from "./i18n.js";
import {
  BACKUP_VERSION, buildBackup, validateBackup,
  exportBackupJSON, transactionsToCSV, summaryToCSV, restoreReplace,
} from "./backup.js";

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function toast(msg, kind = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + (kind === "err" ? "err" : "ok");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = "toast"; el.textContent = ""; }, 3500);
}
function safeINR(v) {
  return Number.isInteger(v) ? formatINR(v) : "—";
}
function todayLocalISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* Extra loan/collection labels in both languages (centralized here). */
const X = {
  en: {
    home: "Home", customers: "Customers", collections: "Collections", reports: "Reports",
    more: "More", loan_details: "Loan details", new_loan: "New loan",
    edit_customer: "Edit customer", edit_loan_note: "Terms are locked after creation. You can change notes, due date and status only.",
    method_fixed: "Fixed amount per day", method_pct: "Percent per day",
    method_monthly: "Monthly percent (daily split)",
    fixed_per_day: "Fixed interest per day (Rs.)", daily_pct: "Daily rate (%)",
    monthly_pct: "Monthly rate (%)", day_count: "Day-count rule",
    day_actual: "Actual days in month", day_360: "30-day month",
    rounding: "Rounding", rounding_paise: "Nearest paise", rounding_rupee: "Nearest rupee",
    rounding_floor: "Round down", timing: "Principal effective",
    timing_next: "Repayment affects next day", timing_same: "Repayment affects same day",
    policy: "Payment split rule", policy_interest_first: "Interest first (suggested)",
    policy_principal_first: "Principal first (suggested)", policy_explicit: "I will enter split",
    skip_days: "No-charge weekdays", holidays: "Holidays (YYYY-MM-DD, comma separated)",
    int_start: "Interest start (optional)", int_end: "Interest end (optional)",
    due_date: "Due date (optional)", notes: "Notes", phone: "Phone (optional)",
    name: "Name", customer_id: "Customer ID", loan_id: "Loan ID",
    principal: "Principal given (Rs.)", start_date: "Start date",
    example: "How interest works", create_loan: "Create loan",
    loan_status: "Loan status", all: "All", collection_status: "Collection",
    cash: "Cash", received: "Cash received (Rs.)", int_got: "To interest (Rs.)",
    prin_got: "To principal (Rs.)", preview: "Preview", receipt_title: "Collection receipt",
    remaining_int: "Interest left", remaining_prin: "Principal left",
    reverse: "Reverse", reverse_reason: "Reason for reversal",
    close_loan: "Close loan", settle_loan: "Mark settled", reopen_loan: "Reopen",
    from: "From", to: "To", apply: "Apply", print: "Print",
    collected_total: "Interest collected", accrued_total: "Interest accrued",
    principal_repaid: "Principal repaid", total_due: "Total outstanding",
    by_customer: "Customer-wise", by_loan: "Loan-wise",
    daily_cash: "Daily cash in", monthly_cash: "Monthly cash in",
    backup_now: "Download backup (JSON)", restore_now: "Restore from backup file",
    restore_warn: "Restore replaces all current data. Continue only after a fresh backup.",
    csv_txn: "Download transactions CSV", csv_report: "Download report CSV",
    no_data: "Nothing here yet.", back: "Back", view: "View",
    confirm_collect: "Save this collection? Check the split before confirming.",
    saved: "Saved.", restored_ok: "Restore complete and verified.",
    need_confirm: "Please confirm.", lang_note: "Language changes display text only. Your data never changes.",
    step1: "Step 1", step2: "Step 2", step3: "Step 3",
    home_hi: "What do you want to do today?",
    home_gave: "Money you have given in total",
    home_back: "Money still with customers",
    home_int_left: "Interest customers still need to pay",
    how_it_works: "In plain words",
    pick_loan_help: "Pick whose loan this money is for.",
    cash_help: "Count the cash in your hand and type it here.",
    split_help: "Same cash split in two parts. Both parts added must equal the cash above.",
    split_auto: "Split for me",
    loan_amt_help: "How much cash did you give? Example: 50000",
    loan_day_help: "The day you gave the cash.",
    loan_pick_help: "Most beginners use the first option: same small amount every day. Example: Rs.100 per day.",
    adv_title: "Advanced (optional)",
    due_list_title: "Who needs to pay?",
    collect_now: "Collect",
    cust_card_due: "Still to come",
    start_easy: "Start here",
  },
  kn: {
    home: "ಮುಖಪುಟ", customers: "ಗ್ರಾಹಕರು", collections: "ವಸೂಲಾತಿಗಳು", reports: "ವರದಿಗಳು",
    more: "ಇನ್ನಷ್ಟು", loan_details: "ಸಾಲದ ವಿವರ", new_loan: "ಹೊಸ ಸಾಲ",
    edit_customer: "ಗ್ರಾಹಕರನ್ನು ಸಂಪಾದಿಸಿ", edit_loan_note: "ರಚನೆಯ ನಂತರ ನಿಯಮಗಳು ಬದಲಾಗುವುದಿಲ್ಲ. ಟಿಪ್ಪಣಿ, ದಿನಾಂಕ ಮತ್ತು ಸ್ಥಿತಿ ಮಾತ್ರ ಬದಲಾಯಿಸಬಹುದು.",
    method_fixed: "ದಿನಕ್ಕೆ ನಿಗದಿತ ಮೊತ್ತ", method_pct: "ದಿನಕ್ಕೆ ಶೇಕಡಾ",
    method_monthly: "ಮಾಸಿಕ ಶೇಕಡಾ (ದಿನದ ಹಂಚಿಕೆ)",
    fixed_per_day: "ದಿನದ ನಿಗದಿತ ಬಡ್ಡಿ (ರೂ.)", daily_pct: "ದೈನಂದಿನ ದರ (%)",
    monthly_pct: "ಮಾಸಿಕ ದರ (%)", day_count: "ದಿನ ಎಣಿಕೆ ನಿಯಮ",
    day_actual: "ತಿಂಗಳ ನಿಜ ದಿನಗಳು", day_360: "30-ದಿನದ ತಿಂಗಳು",
    rounding: "ಪೂರ್ಣಾಂಕ", rounding_paise: "ಹತ್ತಿರದ ಪೈಸೆ", rounding_rupee: "ಹತ್ತಿರದ ರೂಪಾಯಿ",
    rounding_floor: "ಕೆಳಕ್ಕೆ", timing: "ಅಸಲು ಜಾರಿ",
    timing_next: "ಮರುಪಾವತಿ ಮರುದಿನದಿಂದ", timing_same: "ಮರುಪಾವತಿ ಅದೇ ದಿನದಿಂದ",
    policy: "ಹಂಚಿಕೆ ನಿಯಮ", policy_interest_first: "ಮೊದಲು ಬಡ್ಡಿ (ಸಲಹೆ)",
    policy_principal_first: "ಮೊದಲು ಅಸಲು (ಸಲಹೆ)", policy_explicit: "ನಾನೇ ಹಂಚಿಕೆ ನೀಡುವೆ",
    skip_days: "ಶುಲ್ಕವಿಲ್ಲದ ವಾರದ ದಿನಗಳು", holidays: "ರಜಾದಿನಗಳು (YYYY-MM-DD, ಅಲ್ಪವಿರಾಮ)",
    int_start: "ಬಡ್ಡಿ ಪ್ರಾರಂಭ (ಐಚ್ಛಿಕ)", int_end: "ಬಡ್ಡಿ ಅಂತ್ಯ (ಐಚ್ಛಿಕ)",
    due_date: "ಅಂತಿಮ ದಿನಾಂಕ (ಐಚ್ಛಿಕ)", notes: "ಟಿಪ್ಪಣಿ", phone: "ಫೋನ್ (ಐಚ್ಛಿಕ)",
    name: "ಹೆಸರು", customer_id: "ಗ್ರಾಹಕ ಐಡಿ", loan_id: "ಸಾಲ ಐಡಿ",
    principal: "ನೀಡಿದ ಅಸಲು (ರೂ.)", start_date: "ಪ್ರಾರಂಭ ದಿನಾಂಕ",
    example: "ಬಡ್ಡಿ ಹೇಗೆ", create_loan: "ಸಾಲ ರಚಿಸಿ",
    loan_status: "ಸಾಲದ ಸ್ಥಿತಿ", all: "ಎಲ್ಲ", collection_status: "ವಸೂಲಾತಿ",
    cash: "ನಗದು", received: "ಸ್ವೀಕರಿಸಿದ ನಗದು (ರೂ.)", int_got: "ಬಡ್ಡಿಗೆ (ರೂ.)",
    prin_got: "ಅಸಲಿಗೆ (ರೂ.)", preview: "ಮುನ್ನೋಟ", receipt_title: "ವಸೂಲಾತಿ ರಸೀದಿ",
    remaining_int: "ಉಳಿದ ಬಡ್ಡಿ", remaining_prin: "ಉಳಿದ ಅಸಲು",
    reverse: "ರದ್ದುಗೊಳಿಸಿ", reverse_reason: "ರದ್ದತಿಗೆ ಕಾರಣ",
    close_loan: "ಸಾಲ ಮುಚ್ಚಿ", settle_loan: "ಇತ್ಯರ್ಥಗೊಳಿಸಿ", reopen_loan: "ಮತ್ತೆ ತೆರೆಯಿರಿ",
    from: "ಇಂದ", to: "ವರೆಗೆ", apply: "ಅನ್ವಯಿಸಿ", print: "ಮುದ್ರಿಸಿ",
    collected_total: "ವಸೂಲಾದ ಬಡ್ಡಿ", accrued_total: "ಸೇರಿದ ಬಡ್ಡಿ",
    principal_repaid: "ಮರುಪಾವತಿಸಿದ ಅಸಲು", total_due: "ಒಟ್ಟು ಬಾಕಿ",
    by_customer: "ಗ್ರಾಹಕರ ಪ್ರಕಾರ", by_loan: "ಸಾಲದ ಪ್ರಕಾರ",
    daily_cash: "ದೈನಂದಿನ ನಗದು", monthly_cash: "ಮಾಸಿಕ ನಗದು",
    backup_now: "ಬ್ಯಾಕಪ್ ಡೌನ್‌ಲೋಡ್ (JSON)", restore_now: "ಬ್ಯಾಕಪ್‌ನಿಂದ ಮರುಸ್ಥಾಪಿಸಿ",
    restore_warn: "ಮರುಸ್ಥಾಪನೆಯು ಪ್ರಸ್ತುತ ಡೇಟಾವನ್ನು ಬದಲಾಯಿಸುತ್ತದೆ. ಹೊಸ ಬ್ಯಾಕಪ್ ನಂತರವೇ ಮುಂದುವರಿಯಿರಿ.",
    csv_txn: "ವಹಿವಾಟು CSV ಡೌನ್‌ಲೋಡ್", csv_report: "ವರದಿ CSV ಡೌನ್‌ಲೋಡ್",
    no_data: "ಇಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.", back: "ಹಿಂದೆ", view: "ನೋಡಿ",
    confirm_collect: "ಈ ವಸೂಲಾತಿಯನ್ನು ಉಳಿಸಬೇಕೇ? ಹಂಚಿಕೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.",
    saved: "ಉಳಿಸಲಾಗಿದೆ.", restored_ok: "ಮರುಸ್ಥಾಪನೆ ಪೂರ್ಣ ಮತ್ತು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
    need_confirm: "ದಯವಿಟ್ಟು ದೃಢೀಕರಿಸಿ.", lang_note: "ಭಾಷೆಯು ಪ್ರದರ್ಶನವನ್ನು ಮಾತ್ರ ಬದಲಾಯಿಸುತ್ತದೆ. ನಿಮ್ಮ ಡೇಟಾ ಬದಲಾಗುವುದಿಲ್ಲ.",
    step1: "ಹಂತ 1", step2: "ಹಂತ 2", step3: "ಹಂತ 3",
    home_hi: "ಇಂದು ನೀವು ಏನು ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?",
    home_gave: "ನೀವು ಒಟ್ಟು ನೀಡಿದ ಹಣ",
    home_back: "ಗ್ರಾಹಕರ ಬಳಿ ಇನ್ನೂ ಇರುವ ಹಣ",
    home_int_left: "ಗ್ರಾಹಕರು ಇನ್ನೂ ಕೊಡಬೇಕಾದ ಬಡ್ಡಿ",
    how_it_works: "ಸರಳ ಮಾತುಗಳಲ್ಲಿ",
    pick_loan_help: "ಈ ಹಣ ಯಾರ ಸಾಲಕ್ಕೆ ಎಂದು ಆರಿಸಿ.",
    cash_help: "ಕೈಯಲ್ಲಿರುವ ನಗದನ್ನು ಎಣಿಸಿ ಇಲ್ಲಿ ಬರೆಯಿರಿ.",
    split_help: "ಅದೇ ನಗದನ್ನು ಎರಡು ಭಾಗ ಮಾಡಿ. ಎರಡೂ ಭಾಗಗಳು ಮೇಲಿನ ನಗದಿಗೆ ಸಮವಾಗಿರಬೇಕು.",
    split_auto: "ನನಗಾಗಿ ಹಂಚಿಕೆ ಮಾಡಿ",
    loan_amt_help: "ನೀವು ಎಷ್ಟು ನಗದು ನೀಡಿದ್ದೀರಿ? ಉದಾ: 50000",
    loan_day_help: "ನೀವು ಹಣ ನೀಡಿದ ದಿನ.",
    loan_pick_help: "ಹೆಚ್ಚಿನವರು ಮೊದಲ ಆಯ್ಕೆಯನ್ನು ಬಳಸುತ್ತಾರೆ: ಪ್ರತಿದಿನ ಒಂದೇ ಸಣ್ಣ ಮೊತ್ತ. ಉದಾ: ದಿನಕ್ಕೆ ರೂ.100.",
    adv_title: "ಹೆಚ್ಚುವರಿ (ಐಚ್ಛಿಕ)",
    due_list_title: "ಯಾರು ಕೊಡಬೇಕು?",
    collect_now: "ವಸೂಲಿ ಮಾಡಿ",
    cust_card_due: "ಇನ್ನೂ ಬರಬೇಕಾದದ್ದು",
    start_easy: "ಇಲ್ಲಿಂದ ಪ್ರಾರಂಭಿಸಿ",
  },
};
function xx(key) {
  const L = (state && state.settings && state.settings.lang === "kn") ? "kn" : "en";
  return (X[L] && X[L][key]) || X.en[key] || key;
}
function T(key) {
  const L = (state && state.settings && state.settings.lang === "kn") ? "kn" : "en";
  return tr(L, key);
}

/* ---------------- state ---------------- */
let state = null;
let booted = false;
let collectKey = newFormKey("collect");
let saving = false;
let custSearch = "", custLoanFilter = "all", custDueFilter = "all";
let colDate = "", colCust = "", colSearch = "";
let repFrom = "", repTo = "";
let loanDraft = null;

function principalOf(l) {
  if (!l) return 0;
  if (Number.isInteger(l.principalPaise)) return l.principalPaise;
  if (Number.isInteger(l.principal)) return l.principal;
  if (Number.isInteger(l.amountPaise)) return l.amountPaise;
  if (Number.isInteger(l.amount)) return l.amount;
  return 0;
}
function loanTxns(loanId) {
  return (state.transactions || []).filter((x) => x && !x.void && (x.loanId === loanId || x.loan_id === loanId));
}
function custLoans(cid) {
  return (state.loans || []).filter((l) => l && l.customerId === cid);
}
function loanSummary(l, asOf) {
  try {
    const full = { ...l, principalPaise: principalOf(l) };
    if (!full.method || full.method === "Cash") {
      // Legacy minimal loan without engine terms: no interest, principal only.
      const tx = loanTxns(l.id);
      let repaid = 0;
      for (const x of tx) {
        if (x.type !== "collection" || x.void) continue;
        const p = Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise
          : Number.isInteger(x.principalAlloc) ? x.principalAlloc
          : Number.isInteger(x.principal_alloc) ? x.principal_alloc : 0;
        const neg = x.reversedById ? 0 : p;
        void neg;
        repaid += p;
      }
      const pOut = Math.max(0, principalOf(l) - repaid);
      return {
        principalDisbursed: principalOf(l), principalLent: principalOf(l),
        principalRepaid: repaid, principalOutstanding: pOut,
        interestAccrued: 0, interestReceived: 0, interestCollected: 0,
        interestOutstanding: 0, totalOutstanding: pOut, perDay: [],
      };
    }
    return summarizeLoan(full, state.transactions || [], asOf || todayLocalISO());
  } catch {
    return {
      principalDisbursed: principalOf(l), principalLent: principalOf(l),
      principalRepaid: 0, principalOutstanding: principalOf(l),
      interestAccrued: 0, interestReceived: 0, interestCollected: 0,
      interestOutstanding: 0, totalOutstanding: principalOf(l), perDay: [],
    };
  }
}
function statusBadge(s) {
  const map = {
    collected: ["b-paid", T("collected")], partial: ["b-partial", T("partial")],
    pending: ["b-unpaid", T("pending")], no_charge: ["b-cancelled", T("no_charge")],
    active: ["b-paid", T("active")], closed: ["b-cancelled", T("closed")],
    settled: ["b-partial", T("settled")],
  };
  const m = map[s] || ["b-cancelled", String(s)];
  return `<span class="badge ${m[0]}">${esc(m[1])}</span>`;
}

/* ---------------- router ---------------- */
function route() {
  const h = window.location.hash || "#/home";
  if (h.startsWith("#/customer/")) return { name: "customer", param: safeDecode(h.slice("#/customer/".length)) };
  if (h.startsWith("#/loan/")) return { name: "loan", param: safeDecode(h.slice("#/loan/".length)) };
  if (h.startsWith("#/receipt/")) return { name: "receipt", param: safeDecode(h.slice("#/receipt/".length)) };
  if (h.startsWith("#/collect")) return { name: "collect" };
  if (h === "#/customers") return { name: "customers" };
  if (h === "#/collections") return { name: "collections" };
  if (h === "#/reports") return { name: "reports" };
  if (h === "#/more") return { name: "more" };
  return { name: "home" };
}
const sectionFor = {
  home: "view-home", customers: "view-customers", collections: "view-collections",
  reports: "view-reports", more: "view-more", customer: "view-customer-detail",
  loan: "view-loan-detail", collect: "view-receipt", receipt: "view-receipt",
};
function router() {
  if (!state) return;
  const r = route();
  document.querySelectorAll("main section").forEach((s) => s.classList.remove("active"));
  const sec = document.getElementById(sectionFor[r.name] || "view-home");
  if (sec) sec.classList.add("active");
  document.querySelectorAll("button[data-view]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-view") === r.name
      || (r.name === "customer" && b.getAttribute("data-view") === "customers")
      || (r.name === "loan" && b.getAttribute("data-view") === "customers")
      || ((r.name === "collect" || r.name === "receipt") && b.getAttribute("data-view") === "collections"));
  });
  applyNavLabels();
  if (r.name === "home") renderHome();
  else if (r.name === "customers") renderCustomers();
  else if (r.name === "customer") renderCustomerDetail(r.param);
  else if (r.name === "loan") renderLoanDetail(r.param);
  else if (r.name === "collect") renderCollect();
  else if (r.name === "receipt") renderReceipt(r.param);
  else if (r.name === "collections") renderCollectionsView();
  else if (r.name === "reports") renderReports();
  else if (r.name === "more") renderMore();
}
function applyNavLabels() {
  const set = (sel, txt) => { const e = document.querySelector(sel); if (e) e.textContent = txt; };
  set('button[data-view="home"]', T("nav_home"));
  set('button[data-view="customers"]', T("nav_customers"));
  set('button[data-view="collections"]', T("nav_collections"));
  set('button[data-view="reports"]', T("nav_reports"));
  const more = document.getElementById("more-menu-btn");
  if (more) more.textContent = T("nav_more") + " ▾";
  const rc = document.getElementById("record-collection");
  if (rc) rc.textContent = "＋ " + T("record_collection");
  document.title = T("app_name");
}

/* ---------------- home ---------------- */
function renderHome() {
  const el = document.getElementById("home-app");
  if (!el) return;
  const today = todayLocalISO();
  const rec = reconcileTotals({ loans: state.loans || [], transactions: state.transactions || [], customers: state.customers || [] }, today);
  // Period: last 30 days interest collected
  const from30 = addDaysISO(today, -29);
  let intPeriod = 0;
  for (const x of (state.transactions || [])) {
    if (!x || x.void || x.type !== "collection") continue;
    const d = String(x.date || "").slice(0, 10);
    if (d < from30 || d > today) continue;
    intPeriod += Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise
      : Number.isInteger(x.interestAlloc) ? x.interestAlloc : 0;
  }
  let intToday = 0, cashToday = 0, expectedToday = 0;
  for (const x of (state.transactions || [])) {
    if (!x || x.void || x.type !== "collection") continue;
    if (String(x.date || "").slice(0, 10) !== today) continue;
    intToday += Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise
      : Number.isInteger(x.interestAlloc) ? x.interestAlloc : 0;
    cashToday += Number.isInteger(x.amountPaise) ? x.amountPaise
      : Number.isInteger(x.amount) ? x.amount : 0;
  }
  for (const l of (state.loans || [])) {
    if (!l || l.status === "closed" || l.status === "settled") continue;
    if (!l.method || l.method === "Cash") continue;
    try {
      if (isChargeable({ ...l, principalPaise: principalOf(l) }, today)) {
        expectedToday += dailyChargePaise({ ...l, principalPaise: principalOf(l) }, today, loanSummary(l, today).principalOutstanding >= 0 ? currentPrincipalFor(l, today) : principalOf(l));
      }
    } catch { /* skip bad loan */ }
  }
  // Due / partial / pending customers
  const due = [], partial = [], pending = [];
  for (const c of (state.customers || [])) {
    const loans = custLoans(c.id).filter((l) => l.status !== "closed" && l.status !== "settled");
    if (!loans.length) continue;
    let oi = 0, got = 0;
    for (const l of loans) {
      const s = loanSummary(l, today);
      oi += s.interestOutstanding || 0;
      got += s.interestReceived || 0;
    }
    if (oi > 0 && got > 0) partial.push({ c, oi });
    else if (oi > 0) pending.push({ c, oi });
    else if (got >= 0 && loans.some((l) => { try { return isChargeable({ ...l, principalPaise: principalOf(l) }, today); } catch { return false; } })) due.push({ c, oi });
  }
  const recent = [...(state.transactions || [])]
    .filter((x) => x && !x.void)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 8);
  const custName = (id) => (state.customers.find((c) => c.id === id) || {}).name || id || "—";
  let html = `<h2>${esc(T("app_name"))}</h2>
  <p><small>${esc(T("tagline"))}</small></p>
  <div class="card"><strong>${esc(xx("start_easy"))}</strong><div class="help">${esc(xx("home_hi"))}</div>
    <div class="row-flex" style="margin-top:10px">
      <button class="btn btn-primary big-btn" id="h-collect">＋ ${esc(T("record_collection"))}</button>
      <a class="btn" href="#/customers" style="min-height:56px">${esc(T("add_customer"))}</a>
    </div></div>
  <div class="grid">
    <div class="card"><div><strong>${esc(T("total_lent"))}</strong></div><div class="hero-num">${safeINR(rec.totalPrincipalLent)}</div><div class="hero-why">${esc(xx("home_gave"))}</div></div>
    <div class="card"><div><strong>${esc(T("outstanding_principal"))}</strong></div><div class="hero-num">${safeINR(rec.principalOutstanding)}</div><div class="hero-why">${esc(xx("home_back"))}</div></div>
    <div class="card"><div><strong>${esc(T("interest_unpaid"))}</strong></div><div class="hero-num">${safeINR(rec.interestOutstanding)}</div><div class="hero-why">${esc(xx("home_int_left"))}</div></div>
  </div>
  <div class="card"><strong>${esc(T("today_expected"))} / ${esc(T("today_collected"))}</strong>
    <div>${esc(xx("today_expected"))}: ${safeINR(expectedToday)} · ${esc(xx("today_collected"))}: ${safeINR(cashToday)}</div>
    <div class="help">${esc(xx("interest_period"))} (30d): ${safeINR(intPeriod)} · ${esc(from30)} → ${esc(today)}</div></div>
  <div class="card"><strong>${esc(T("recent_txns"))}</strong>`;
  if (!recent.length) html += `<div class="empty">${esc(T("empty_txns"))}</div>`;
  else {
    html += `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("customer"))}</th><th>${esc(T("amount"))}</th><th>${esc(T("status"))}</th></tr></thead><tbody>`;
    for (const x of recent) {
      const amt = Number.isInteger(x.amountPaise) ? x.amountPaise : (Number.isInteger(x.amount) ? x.amount : 0);
      html += `<tr><td>${esc(formatDateIN(String(x.date || "").slice(0, 10)))}</td><td>${esc(custName(x.customerId))}</td><td>${safeINR(amt)}</td><td>${esc(x.type || "")}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  html += `</div>
  <div class="card"><strong>${esc(xx("due_list_title"))} (${pending.length + partial.length})</strong>`;
  if (!pending.length && !partial.length) html += `<div class="empty">${esc(xx("no_data"))}</div>`;
  else {
    for (const p of partial) html += `<div class="card person-card"><div class="person-top"><span class="person-name">${esc(p.c.name)}</span>${statusBadge("partial")}</div><div class="person-bal">${esc(xx("cust_card_due"))}: ${safeINR(p.oi)}</div><div><a class="btn" href="#/customer/${esc(p.c.id)}">${esc(xx("collect_now"))}</a></div></div>`;
    for (const p of pending) html += `<div class="card person-card"><div class="person-top"><span class="person-name">${esc(p.c.name)}</span>${statusBadge("pending")}</div><div class="person-bal">${esc(xx("cust_card_due"))}: ${safeINR(p.oi)}</div><div><a class="btn" href="#/customer/${esc(p.c.id)}">${esc(xx("collect_now"))}</a></div></div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
  const hc = el.querySelector("#h-collect");
  if (hc) hc.addEventListener("click", () => { window.location.hash = "#/collect"; });
}
function currentPrincipalFor(l, asOf) {
  const s = loanSummary(l, asOf);
  // principal applicable for today's charge under next_day timing:
  // disbursed minus repayments dated before today.
  let repaidBefore = 0;
  for (const x of loanTxns(l.id)) {
    if (x.type !== "collection" || x.void) continue;
    if (String(x.date || "").slice(0, 10) >= asOf) continue;
    repaidBefore += Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise
      : Number.isInteger(x.principalAlloc) ? x.principalAlloc
      : Number.isInteger(x.principal_alloc) ? x.principal_alloc : 0;
  }
  return Math.max(0, principalOf(l) - repaidBefore);
}

/* ---------------- customers ---------------- */
function renderCustomers() {
  const el = document.getElementById("customers-app");
  if (!el) return;
  let html = `<h2>${esc(T("nav_customers"))}</h2>
  <div class="card"><span class="step-tag">${esc(xx("step1"))}</span><strong>${esc(T("add_customer_title"))}</strong><div id="nc-err"></div>
    <div class="field"><label>${esc(xx("name"))} *</label><input id="nc-name" class="input" placeholder="Ravi Kumar"><div class="help">Example: Ravi Kumar</div></div>
    <div class="field"><label>${esc(xx("phone"))}</label><input id="nc-phone" class="input" inputmode="tel" placeholder="98765 43210"><div class="help">10-digit mobile. You can leave it empty.</div></div>
    <div class="field"><label>${esc(T("note"))}</label><input id="nc-note" class="input" placeholder="Lives near market"></div>
    <button class="btn btn-primary big-btn" id="nc-add">${esc(T("add_customer"))}</button></div>
  <div class="card"><div class="row-flex">
    <div class="field" style="flex:2"><label>${esc(T("search"))}</label><input id="c-q" class="input" value="${esc(custSearch)}" placeholder="${esc(T("search"))}"></div>
    <div class="field" style="flex:1"><label>${esc(xx("loan_status"))}</label><select id="c-loanf" class="input">
      <option value="all"${custLoanFilter === "all" ? " selected" : ""}>${esc(xx("all"))}</option>
      <option value="active"${custLoanFilter === "active" ? " selected" : ""}>${esc(T("active"))}</option>
      <option value="closed"${custLoanFilter === "closed" ? " selected" : ""}>${esc(T("closed"))}</option>
      <option value="settled"${custLoanFilter === "settled" ? " selected" : ""}>${esc(T("settled"))}</option>
    </select></div>
    <div class="field" style="flex:1"><label>${esc(xx("collection_status"))}</label><select id="c-duef" class="input">
      <option value="all"${custDueFilter === "all" ? " selected" : ""}>${esc(xx("all"))}</option>
      <option value="pending"${custDueFilter === "pending" ? " selected" : ""}>${esc(T("pending"))}</option>
      <option value="partial"${custDueFilter === "partial" ? " selected" : ""}>${esc(T("partial"))}</option>
      <option value="clear"${custDueFilter === "clear" ? " selected" : ""}>${esc(T("collected"))}</option>
    </select></div>
  </div><div id="c-list"></div></div>`;
  el.innerHTML = html;
  const draw = () => {
    const q = custSearch.trim().toLowerCase();
    const box = el.querySelector("#c-list");
    const today = todayLocalISO();
    let list = (state.customers || []).filter((c) => !q || ((c.name || "") + " " + (c.phone || "") + " " + (c.id || "")).toLowerCase().includes(q));
    list = list.filter((c) => {
      const loans = custLoans(c.id);
      if (custLoanFilter !== "all" && !loans.some((l) => (l.status || "active") === custLoanFilter)) return false;
      if (custDueFilter !== "all") {
        let oi = 0, got = 0;
        for (const l of loans) { const s = loanSummary(l, today); oi += s.interestOutstanding || 0; got += s.interestReceived || 0; }
        if (custDueFilter === "pending" && !(oi > 0 && got === 0)) return false;
        if (custDueFilter === "partial" && !(oi > 0 && got > 0)) return false;
        if (custDueFilter === "clear" && oi !== 0) return false;
      }
      return true;
    });
    if (!list.length) { box.innerHTML = `<div class="empty">${esc(T("empty_customers"))}</div>`; return; }
    let t = "";
    for (const c of list) {
      let po = 0, io = 0;
      for (const l of custLoans(c.id)) { const s = loanSummary(l, today); po += s.principalOutstanding || 0; io += s.interestOutstanding || 0; }
      t += `<div class="card person-card"><div class="person-top"><span class="person-name">${esc(c.name)}</span><a class="btn" href="#/customer/${esc(c.id)}">${esc(xx("view"))}</a></div><div><small>${esc(c.id || "")}${c.phone ? " · " + esc(c.phone) : ""}</small></div><div class="person-bal">${esc(xx("cust_card_due"))}: ${safeINR(po + io)}</div></div>`;
    }
    box.innerHTML = t;
  };
  el.querySelector("#c-q").addEventListener("input", (e) => { custSearch = e.target.value; draw(); });
  el.querySelector("#c-loanf").addEventListener("change", (e) => { custLoanFilter = e.target.value; draw(); });
  el.querySelector("#c-duef").addEventListener("change", (e) => { custDueFilter = e.target.value; draw(); });
  el.querySelector("#nc-add").addEventListener("click", async () => {
    const errBox = el.querySelector("#nc-err");
    const name = el.querySelector("#nc-name").value;
    const phone = el.querySelector("#nc-phone").value;
    const note = el.querySelector("#nc-note").value;
    const errs = validateCustomer({ name, phone, notes: note });
    if (errs.length) { errBox.innerHTML = `<div class="error">${errs.map(esc).join("<br>")}</div>`; return; }
    try {
      const fresh = await loadState();
      const cid = "C" + String((fresh.counters.customerSeq || 0) + 1).padStart(4, "0");
      if ((fresh.customers || []).some((c) => c.id === cid)) throw new Error(T("duplicate_blocked"));
      fresh.counters.customerSeq = (fresh.counters.customerSeq || 0) + 1;
      fresh.customers.push({ id: cid, name: String(name).trim(), phone: String(phone || "").trim(), notes: String(note || "").trim(), createdAt: new Date().toISOString() });
      await saveState(fresh);
      state = fresh;
      toast(T("success") + ": " + T("add_customer"));
      router();
    } catch (e) { errBox.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  });
  draw();
}

function renderCustomerDetail(id) {
  const el = document.getElementById("customer-detail-app");
  if (!el) return;
  const c = (state.customers || []).find((x) => x.id === id);
  if (!c) { el.innerHTML = `<h2>${esc(T("nav_customers"))}</h2><div class="error">${esc(T("empty_customers"))}</div><p><a href="#/customers">${esc(xx("back"))}</a></p>`; return; }
  const today = todayLocalISO();
  const loans = custLoans(c.id);
  let tp = 0, tio = 0, tir = 0, tia = 0, tpr = 0;
  for (const l of loans) {
    const s = loanSummary(l, today);
    tp += s.principalOutstanding || 0; tio += s.interestOutstanding || 0;
    tir += s.interestReceived || 0; tia += s.interestAccrued || 0;
    tpr += s.principalRepaid || 0;
  }
  const txAll = (state.transactions || []).filter((x) => x && (x.customerId === c.id || loans.some((l) => l.id === x.loanId || l.id === x.loan_id)));
  let html = `<p><a href="#/customers">← ${esc(xx("back"))}</a></p><h2>${esc(c.name)}</h2>
  <div class="card"><div>${esc(xx("customer_id"))}: ${esc(c.id || "")}</div><div>${esc(xx("phone"))}: ${esc(c.phone || "—")}</div>${c.notes ? `<div>${esc(T("note"))}: ${esc(c.notes)}</div>` : ""}</div>
  <div class="card"><strong>${esc(T("loan"))} (${loans.length})</strong>
    <div class="table-wrap"><table class="table"><tbody>
    <tr><td>${esc(xx("principal"))}</td><td>${safeINR(tp + tpr)}</td></tr>
    <tr><td>${esc(T("outstanding_principal"))}</td><td>${safeINR(tp)}</td></tr>
    <tr><td>${esc(xx("accrued_total"))}</td><td>${safeINR(tia)}</td></tr>
    <tr><td>${esc(xx("collected_total"))}</td><td>${safeINR(tir)}</td></tr>
    <tr><td>${esc(T("interest_unpaid"))}</td><td>${safeINR(tio)}</td></tr>
    <tr><td>${esc(xx("principal_repaid"))}</td><td>${safeINR(tpr)}</td></tr>
    <tr><td><strong>${esc(xx("total_due"))}</strong></td><td><strong>${safeINR(tp + tio)}</strong></td></tr>
    </tbody></table></div>
    <div class="row-flex" style="margin-top:10px">
      <button class="btn btn-primary" id="cd-newloan">${esc(xx("new_loan"))}</button>
      <button class="btn" id="cd-edit">${esc(T("edit"))}</button>
      <button class="btn btn-primary" id="cd-collect">＋ ${esc(T("record_collection"))}</button>
    </div><div id="cd-form"></div></div>`;
  if (!loans.length) html += `<div class="card"><div class="empty">${esc(T("empty_loans"))}</div></div>`;
  for (const l of loans) {
    const s = loanSummary(l, today);
    html += `<div class="card"><strong>${esc(xx("loan_id"))}: ${esc(l.id)} · ${statusBadge(l.status || "active")}</strong>
    <div>${esc(describeLoan({ ...l, principalPaise: principalOf(l) }))}</div>
    <div class="table-wrap"><table class="table"><tbody>
      <tr><td>${esc(xx("principal"))}</td><td>${safeINR(principalOf(l))}</td></tr>
      <tr><td>${esc(T("outstanding_principal"))}</td><td>${safeINR(s.principalOutstanding)}</td></tr>
      <tr><td>${esc(xx("accrued_total"))} / ${esc(xx("collected_total"))} / ${esc(T("interest_unpaid"))}</td><td>${safeINR(s.interestAccrued)} / ${safeINR(s.interestReceived)} / ${safeINR(s.interestOutstanding)}</td></tr>
      <tr><td>${esc(xx("total_due"))}</td><td>${safeINR(s.totalOutstanding)}</td></tr>
      ${l.dueDate ? `<tr><td>${esc(xx("due_date"))}</td><td>${esc(formatDateIN(l.dueDate))}</td></tr>` : ""}
    </tbody></table></div>
    <div class="row-flex"><a class="btn" href="#/loan/${esc(l.id)}">${esc(xx("loan_details"))}</a></div></div>`;
  }
  html += `<div class="card"><strong>${esc(T("recent_txns"))} (${txAll.length})</strong>`;
  if (!txAll.length) html += `<div class="empty">${esc(T("empty_txns"))}</div>`;
  else {
    html += `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("loan"))}</th><th>${esc(T("amount"))}</th><th></th></tr></thead><tbody>`;
    for (const x of [...txAll].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 20)) {
      const amt = Number.isInteger(x.amountPaise) ? x.amountPaise : (Number.isInteger(x.amount) ? x.amount : 0);
      html += `<tr><td>${esc(formatDateIN(String(x.date || "").slice(0, 10)))}</td><td>${esc(x.loanId || x.loan_id || "")}</td><td>${safeINR(amt)}<br><small>${esc(x.type || "")}${x.reversedById ? " · reversed" : ""}</small></td><td><a href="#/receipt/${esc(x.id)}">${esc(T("receipt"))}</a></td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
  el.querySelector("#cd-collect").addEventListener("click", () => { window.location.hash = "#/collect"; });
  el.querySelector("#cd-edit").addEventListener("click", () => editCustomer(c.id));
  el.querySelector("#cd-newloan").addEventListener("click", () => newLoanForm(c.id));
}

function editCustomer(id) {
  const c = (state.customers || []).find((x) => x.id === id);
  if (!c) return;
  const box = document.getElementById("cd-form");
  if (!box) return;
  box.innerHTML = `<hr><div class="field"><label>${esc(xx("name"))} *</label><input id="ec-name" class="input" value="${esc(c.name)}"></div>
  <div class="field"><label>${esc(xx("phone"))}</label><input id="ec-phone" class="input" value="${esc(c.phone || "")}"></div>
  <div class="field"><label>${esc(T("note"))}</label><input id="ec-note" class="input" value="${esc(c.notes || c.note || "")}"></div>
  <div id="ec-err"></div><button class="btn btn-primary" id="ec-save">${esc(T("save"))}</button>`;
  box.querySelector("#ec-save").addEventListener("click", async () => {
    const errs = validateCustomer({ name: box.querySelector("#ec-name").value, phone: box.querySelector("#ec-phone").value, notes: box.querySelector("#ec-note").value });
    if (errs.length) { box.querySelector("#ec-err").innerHTML = `<div class="error">${errs.map(esc).join("<br>")}</div>`; return; }
    const fresh = await loadState();
    const f = fresh.customers.find((x) => x.id === id);
    if (!f) return;
    f.name = box.querySelector("#ec-name").value.trim();
    f.phone = box.querySelector("#ec-phone").value.trim();
    f.notes = box.querySelector("#ec-note").value.trim();
    await saveState(fresh);
    state = fresh;
    toast(xx("saved"));
    router();
  });
}

function blankLoanDraft(customerId) {
  return {
    customerId, principal: "", startDate: todayLocalISO(), method: "fixed_daily",
    fixedDaily: "100", dailyPct: "0.1", monthlyPct: "2", dayCount: "actual",
    rounding: "paise", timing: "next_day", policy: "interest_first",
    skipSun: false, holidays: "", intStart: "", intEnd: "", dueDate: "", notes: "", err: "",
  };
}
function newLoanForm(customerId) {
  if (!loanDraft || loanDraft.customerId !== customerId) loanDraft = blankLoanDraft(customerId);
  const box = document.getElementById("cd-form");
  if (!box) return;
  const d = loanDraft;
  box.innerHTML = `<hr><span class="step-tag">${esc(xx("step1"))}</span><strong>${esc(xx("new_loan"))}</strong><div id="nl-err">${d.err ? `<div class="error">${esc(d.err)}</div>` : ""}</div>
  <div class="field"><label>${esc(xx("principal"))} *</label><input id="nl-prin" class="input" inputmode="decimal" value="${esc(d.principal)}" placeholder="50000"><div class="help">${esc(xx("loan_amt_help"))}</div></div>
  <div class="field"><label>${esc(xx("start_date"))} *</label><input id="nl-start" class="input" type="date" value="${esc(d.startDate)}"><div class="help">${esc(xx("loan_day_help"))}</div></div>
  <div class="field"><label>${esc(xx("policy"))} / method *</label><select id="nl-method" class="input">
    <option value="fixed_daily"${d.method === "fixed_daily" ? " selected" : ""}>${esc(X[state.settings.lang === "kn" ? "kn" : "en"].method_fixed)}</option>
    <option value="pct_daily"${d.method === "pct_daily" ? " selected" : ""}>${esc(X[state.settings.lang === "kn" ? "kn" : "en"].method_pct)}</option>
    <option value="pct_monthly"${d.method === "pct_monthly" ? " selected" : ""}>${esc(X[state.settings.lang === "kn" ? "kn" : "en"].method_monthly)}</option>
  </select><div class="help">${esc(xx("loan_pick_help"))}</div></div>
  <div class="field"><label>${esc(xx("fixed_per_day"))}</label><input id="nl-fixed" class="input" inputmode="decimal" value="${esc(d.fixedDaily)}"><div class="help">Example: 100 means Rs.100 every day.</div></div>
  <div class="field"><label>${esc(xx("daily_pct"))}</label><input id="nl-dpct" class="input" inputmode="decimal" value="${esc(d.dailyPct)}"></div>
  <div class="field"><label>${esc(xx("monthly_pct"))}</label><input id="nl-mpct" class="input" inputmode="decimal" value="${esc(d.monthlyPct)}"></div>
  <details class="adv"><summary>${esc(xx("adv_title"))}</summary>
  <div class="field"><label>${esc(xx("day_count"))}</label><select id="nl-dc" class="input">
    <option value="actual"${d.dayCount === "actual" ? " selected" : ""}>${esc(xx("day_actual"))}</option>
    <option value="thirty_360"${d.dayCount === "thirty_360" ? " selected" : ""}>${esc(xx("day_360"))}</option>
  </select></div>
  <div class="row-flex">
    <div class="field" style="flex:1"><label>${esc(xx("rounding"))}</label><select id="nl-round" class="input">
      <option value="paise"${d.rounding === "paise" ? " selected" : ""}>${esc(xx("rounding_paise"))}</option>
      <option value="rupee"${d.rounding === "rupee" ? " selected" : ""}>${esc(xx("rounding_rupee"))}</option>
      <option value="floor"${d.rounding === "floor" ? " selected" : ""}>${esc(xx("rounding_floor"))}</option>
    </select></div>
    <div class="field" style="flex:1"><label>${esc(xx("timing"))}</label><select id="nl-timing" class="input">
      <option value="next_day"${d.timing === "next_day" ? " selected" : ""}>${esc(xx("timing_next"))}</option>
      <option value="same_day"${d.timing === "same_day" ? " selected" : ""}>${esc(xx("timing_same"))}</option>
    </select></div>
  </div>
  <div class="field"><label>${esc(xx("policy"))}</label><select id="nl-policy" class="input">
    <option value="interest_first"${d.policy === "interest_first" ? " selected" : ""}>${esc(xx("policy_interest_first"))}</option>
    <option value="principal_first"${d.policy === "principal_first" ? " selected" : ""}>${esc(xx("policy_principal_first"))}</option>
    <option value="explicit"${d.policy === "explicit" ? " selected" : ""}>${esc(xx("policy_explicit"))}</option>
  </select></div>
  <div class="field"><label><input type="checkbox" id="nl-sun"${d.skipSun ? " checked" : ""}> ${esc(xx("skip_days"))} (Sun)</label></div>
  <div class="field"><label>${esc(xx("holidays"))}</label><input id="nl-hol" class="input" value="${esc(d.holidays)}" placeholder="2026-01-26"></div>
  <div class="row-flex"><div class="field" style="flex:1"><label>${esc(xx("int_start"))}</label><input id="nl-is" class="input" type="date" value="${esc(d.intStart)}"></div>
  <div class="field" style="flex:1"><label>${esc(xx("int_end"))}</label><input id="nl-ie" class="input" type="date" value="${esc(d.intEnd)}"></div></div>
  <div class="field"><label>${esc(xx("due_date"))}</label><input id="nl-due" class="input" type="date" value="${esc(d.dueDate)}"></div>
  </details>
  <div class="field"><label>${esc(xx("notes"))}</label><input id="nl-notes" class="input" value="${esc(d.notes)}"></div>
  <div id="nl-example"></div>
  <div class="row-flex"><button class="btn btn-primary big-btn" id="nl-go">${esc(xx("create_loan"))}</button><button class="btn" id="nl-prev">${esc(xx("preview"))}</button></div>`;
  const sync = () => {
    d.principal = box.querySelector("#nl-prin").value; d.startDate = box.querySelector("#nl-start").value;
    d.method = box.querySelector("#nl-method").value; d.fixedDaily = box.querySelector("#nl-fixed").value;
    d.dailyPct = box.querySelector("#nl-dpct").value; d.monthlyPct = box.querySelector("#nl-mpct").value;
    d.dayCount = box.querySelector("#nl-dc").value; d.rounding = box.querySelector("#nl-round").value;
    d.timing = box.querySelector("#nl-timing").value; d.policy = box.querySelector("#nl-policy").value;
    d.skipSun = box.querySelector("#nl-sun").checked; d.holidays = box.querySelector("#nl-hol").value;
    d.intStart = box.querySelector("#nl-is").value; d.intEnd = box.querySelector("#nl-ie").value;
    d.dueDate = box.querySelector("#nl-due").value; d.notes = box.querySelector("#nl-notes").value;
  };
  box.querySelector("#nl-prev").addEventListener("click", () => {
    sync();
    try {
      const cand = draftToLoan(d);
      const errs = validateLoan(cand);
      box.querySelector("#nl-example").innerHTML = errs.length
        ? `<div class="error">${errs.map(esc).join("<br>")}</div>`
        : `<div class="card"><strong>${esc(xx("example"))}</strong><div>${esc(describeLoan(cand))}</div></div>`;
    } catch (e) { box.querySelector("#nl-example").innerHTML = `<div class="error">${esc(e.message)}</div>`; }
  });
  box.querySelector("#nl-go").addEventListener("click", async () => {
    sync();
    let cand;
    try { cand = draftToLoan(d); }
    catch (e) { box.querySelector("#nl-err").innerHTML = `<div class="error">${esc(e.message)}</div>`; return; }
    const errs = validateLoan(cand);
    if (errs.length) { box.querySelector("#nl-err").innerHTML = `<div class="error">${errs.map(esc).join("<br>")}</div>`; return; }
    if (!window.confirm(T("confirm") + ": " + describeLoan(cand))) return;
    const fresh = await loadState();
    fresh.counters.loanSeq = (fresh.counters.loanSeq || 0) + 1;
    const lid = "L" + String(fresh.counters.loanSeq).padStart(4, "0");
    fresh.loans.push({ ...cand, id: lid, customerId, status: "active", createdAt: new Date().toISOString() });
    await saveState(fresh);
    state = fresh;
    loanDraft = null;
    toast(xx("saved"));
    window.location.hash = "#/loan/" + encodeURIComponent(lid);
  });
}
function draftToLoan(d) {
  let principalPaise;
  try { principalPaise = toPaise(d.principal); } catch { throw new Error(T("invalid_amount")); }
  if (!isValidISO(d.startDate)) throw new Error(T("invalid_date"));
  const loan = {
    customerId: d.customerId, principalPaise, startDate: d.startDate,
    method: d.method, rounding: d.rounding, principalTiming: d.timing,
    allocationPolicy: d.policy, status: "active", notes: (d.notes || "").trim(),
    skipWeekdays: d.skipSun ? [0] : [],
    holidays: String(d.holidays || "").split(",").map((s) => s.trim().slice(0, 10)).filter((s) => s !== ""),
    interestStartDate: d.intStart || undefined, interestEndDate: d.intEnd || undefined,
    dueDate: d.dueDate || undefined,
  };
  if (d.method === "fixed_daily") {
    try { loan.fixedDailyPaise = toPaise(d.fixedDaily); } catch { throw new Error(T("invalid_rate")); }
  } else if (d.method === "pct_daily") {
    const n = Number(d.dailyPct);
    if (!Number.isFinite(n) || n <= 0 || n > 100) throw new Error(T("invalid_rate"));
    loan.dailyRatePct = n;
  } else if (d.method === "pct_monthly") {
    const n = Number(d.monthlyPct);
    if (!Number.isFinite(n) || n <= 0 || n > 100) throw new Error(T("invalid_rate"));
    loan.monthlyRatePct = n;
    loan.dayCount = d.dayCount;
  }
  return loan;
}

/* ---------------- loan detail ---------------- */
function renderLoanDetail(id) {
  const el = document.getElementById("loan-detail-app");
  if (!el) return;
  const l = (state.loans || []).find((x) => x.id === id);
  if (!l) { el.innerHTML = `<h2>${esc(xx("loan_details"))}</h2><div class="empty">${esc(xx("no_data"))}</div>`; return; }
  const c = (state.customers || []).find((x) => x.id === l.customerId);
  const today = todayLocalISO();
  const s = loanSummary(l, today);
  const full = { ...l, principalPaise: principalOf(l) };
  const tx = loanTxns(l.id).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  let sched = [];
  try {
    if (full.method && full.method !== "Cash") {
      const end = full.interestEndDate && isValidISO(full.interestEndDate) && full.interestEndDate < today ? full.interestEndDate : today;
      sched = accrualSchedule(full, state.transactions || [], full.interestStartDate && isValidISO(full.interestStartDate) ? full.interestStartDate : full.startDate, end).slice(-30);
    }
  } catch { sched = []; }
  let html = `<p><a href="#/customer/${esc(l.customerId)}">← ${esc(c ? c.name : T("nav_customers"))}</a></p>
  <h2>${esc(xx("loan_id"))}: ${esc(l.id)} ${statusBadge(l.status || "active")}</h2>
  <div class="card"><div>${esc(T("customer"))}: ${esc(c ? c.name : l.customerId)}</div>
  <div>${esc(xx("principal"))}: ${safeINR(principalOf(l))} · ${esc(xx("start_date"))}: ${esc(formatDateIN(l.startDate))}</div>
  <div><small>${esc(describeLoan(full))}</small></div>
  ${l.dueDate ? `<div>${esc(xx("due_date"))}: ${esc(formatDateIN(l.dueDate))}</div>` : ""}
  ${l.notes || l.note ? `<div>${esc(T("note"))}: ${esc(l.notes || l.note)}</div>` : ""}
  <div class="row-flex" style="margin-top:8px">
    <button class="btn btn-primary" id="ld-collect">＋ ${esc(T("record_collection"))}</button>
    ${(l.status || "active") === "active" ? `<button class="btn" id="ld-close">${esc(xx("close_loan"))}</button><button class="btn" id="ld-settle">${esc(xx("settle_loan"))}</button>` : `<button class="btn" id="ld-reopen">${esc(xx("reopen_loan"))}</button>`}
  </div><div id="ld-msg"></div></div>
  <div class="card"><strong>Balances</strong><div class="table-wrap"><table class="table"><tbody>
    <tr><td>${esc(xx("principal"))}</td><td>${safeINR(principalOf(l))}</td></tr>
    <tr><td>${esc(T("outstanding_principal"))}</td><td>${safeINR(s.principalOutstanding)}</td></tr>
    <tr><td>${esc(xx("accrued_total"))}</td><td>${safeINR(s.interestAccrued)}</td></tr>
    <tr><td>${esc(xx("collected_total"))}</td><td>${safeINR(s.interestReceived)}</td></tr>
    <tr><td>${esc(T("interest_unpaid"))}</td><td>${safeINR(s.interestOutstanding)}</td></tr>
    <tr><td>${esc(xx("principal_repaid"))}</td><td>${safeINR(s.principalRepaid)}</td></tr>
    <tr><td><strong>${esc(xx("total_due"))}</strong></td><td><strong>${safeINR(s.totalOutstanding)}</strong></td></tr>
  </tbody></table></div></div>`;
  html += `<div class="card"><strong>${esc(T("date"))} · ${esc(T("collected"))} / ${esc(T("pending"))}</strong>`;
  if (!sched.length && !tx.length) html += `<div class="empty">${esc(T("empty_txns"))}</div>`;
  else if (sched.length) {
    html += `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("date"))}</th><th>${esc(xx("accrued_total"))}</th><th>${esc(xx("collected_total"))}</th><th>${esc(T("interest_unpaid"))}</th><th>${esc(T("status"))}</th></tr></thead><tbody>`;
    for (const r of sched) {
      html += `<tr><td>${esc(formatDateIN(r.date))}</td><td>${safeINR(r.charged)}</td><td>${safeINR(r.interestReceived)}</td><td>${safeINR(r.outstandingInterest)}</td><td>${statusBadge(r.status === "partial" ? "partial" : r.status)}</td></tr>`;
    }
    html += `</tbody></table></div><div><small>${esc(T("note"))}: ${esc(xx("cash"))} · ${esc(T("status"))}: ${esc(T("collected"))}/${esc(T("partial"))}/${esc(T("pending"))}/${esc(T("no_charge"))}</small></div>`;
  }
  html += `</div><div class="card"><strong>${esc(T("recent_txns"))} (${tx.length})</strong>`;
  if (!tx.length) html += `<div class="empty">${esc(T("empty_txns"))}</div>`;
  else {
    html += `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("amount"))}</th><th></th></tr></thead><tbody>`;
    for (const x of [...tx].reverse()) {
      const amt = Number.isInteger(x.amountPaise) ? x.amountPaise : (Number.isInteger(x.amount) ? x.amount : 0);
      const ia = Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise : (Number.isInteger(x.interestAlloc) ? x.interestAlloc : 0);
      const pa = Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise : (Number.isInteger(x.principalAlloc) ? x.principalAlloc : 0);
      html += `<tr><td>${esc(formatDateIN(String(x.date || "").slice(0, 10)))}<br><small>${esc(x.type || "")}${x.reversedById ? " · reversed" : ""}${x.reversesId ? " · reversal" : ""}</small></td><td>${safeINR(amt)}<br><small>int ${safeINR(ia)} · prin ${safeINR(pa)}</small></td><td><a href="#/receipt/${esc(x.id)}">${esc(T("receipt"))}</a> ${(!x.reversedById && (x.type === "collection")) ? `<button class="btn" data-rev="${esc(x.id)}">${esc(xx("reverse"))}</button>` : ""}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
  el.querySelector("#ld-collect").addEventListener("click", () => {
    collectKey = newFormKey("collect");
    window.location.hash = "#/collect";
    sessionStorage.setItem("il_collect_loan", l.id);
  });
  const closeB = el.querySelector("#ld-close"), setB = el.querySelector("#ld-settle"), reB = el.querySelector("#ld-reopen");
  const setStatus = async (st) => {
    if (!window.confirm(T("confirm") + "?")) return;
    const fresh = await loadState();
    const f = fresh.loans.find((x) => x.id === id);
    if (f) f.status = st;
    await saveState(fresh);
    state = fresh;
    toast(xx("saved"));
    router();
  };
  if (closeB) closeB.addEventListener("click", () => setStatus("closed"));
  if (setB) setB.addEventListener("click", () => setStatus("settled"));
  if (reB) reB.addEventListener("click", () => setStatus("active"));
  el.querySelectorAll("[data-rev]").forEach((b) => b.addEventListener("click", async () => {
    const tid = b.getAttribute("data-rev");
    const reason = window.prompt(xx("reverse_reason") + " *", "");
    if (!reason || !reason.trim()) { toast(xx("need_confirm"), "err"); return; }
    if (!window.confirm(T("confirm_reverse"))) return;
    try {
      const fresh = await loadState();
      const arr = Array.isArray(fresh.transactions) ? fresh.transactions : [];
      const orig = arr.find((x) => x.id === tid);
      if (!orig) throw new Error("not found");
      if (orig.reversedById) throw new Error(T("duplicate_blocked"));
      const revId = uid("rev");
      const rev = {
        id: revId, loanId: orig.loanId || orig.loan_id, customerId: orig.customerId,
        type: "reversal", date: todayLocalISO(), createdAt: new Date().toISOString(),
        amountPaise: -(Number.isInteger(orig.amountPaise) ? orig.amountPaise : orig.amount || 0),
        interestAllocPaise: -(Number.isInteger(orig.interestAllocPaise) ? orig.interestAllocPaise : orig.interestAlloc || 0),
        interestAlloc: -(Number.isInteger(orig.interestAllocPaise) ? orig.interestAllocPaise : orig.interestAlloc || 0),
        principalAllocPaise: -(Number.isInteger(orig.principalAllocPaise) ? orig.principalAllocPaise : orig.principalAlloc || 0),
        principalAlloc: -(Number.isInteger(orig.principalAllocPaise) ? orig.principalAllocPaise : orig.principalAlloc || 0),
        amount: -(Number.isInteger(orig.amountPaise) ? orig.amountPaise : orig.amount || 0),
        reversesId: tid, reason: reason.trim(), idempotencyKey: revId, method: "Cash",
      };
      orig.reversedById = revId;
      fresh.transactions.push(rev);
      await saveState(fresh);
      state = fresh;
      toast(xx("saved"));
      router();
    } catch (e) { toast(e.message, "err"); }
  }));
}

/* ---------------- collection form ---------------- */
let collectForm = null;
function renderCollect() {
  const el = document.getElementById("receipt-app");
  if (!el) return;
  collectKey = newFormKey("collect");
  saving = false;
  const preLoan = sessionStorage.getItem("il_collect_loan") || "";
  if (preLoan) sessionStorage.removeItem("il_collect_loan");
  const loans = (state.loans || []).filter((l) => (l.status || "active") === "active");
  collectForm = { loanId: preLoan || (loans[0] ? loans[0].id : ""), date: todayLocalISO(), cash: "", iAlloc: "", pAlloc: "", note: "", err: "", preview: null };
  drawCollect(el);
}
function drawCollect(el) {
  const f = collectForm;
  const loans = (state.loans || []).filter((l) => (l.status || "active") === "active");
  const loan = loans.find((l) => l.id === f.loanId) || null;
  const cname = (id) => ((state.customers || []).find((c) => c.id === id) || {}).name || "";
  let summaryHtml = "";
  if (loan) {
    const s = loanSummary(loan, f.date && isValidISO(f.date) ? f.date : todayLocalISO());
    summaryHtml = `<div class="card"><div>${esc(cname(loan.customerId))} · ${esc(loan.id)}</div>
    <div>${esc(T("interest_unpaid"))}: ${safeINR(s.interestOutstanding)} · ${esc(T("outstanding_principal"))}: ${safeINR(s.principalOutstanding)}</div>
    <div><small>${esc(describeLoan({ ...loan, principalPaise: principalOf(loan) }))}</small></div></div>`;
  }
  let prevHtml = "";
  if (f.preview) {
    const p = f.preview;
    prevHtml = `<div class="card"><strong>${esc(xx("preview"))}</strong>
    <div>${esc(T("interest_unpaid"))}: ${safeINR(p.before.interestOutstanding)} → ${safeINR(p.after.interestOutstanding)}</div>
    <div>${esc(T("outstanding_principal"))}: ${safeINR(p.before.principalOutstanding)} → ${safeINR(p.after.principalOutstanding)}</div>
    <div>${esc(xx("total_due"))}: ${safeINR(p.before.totalOutstanding)} → ${safeINR(p.after.totalOutstanding)}</div></div>`;
  }
  el.innerHTML = `<h2>＋ ${esc(T("record_collection"))}</h2>
  ${f.err ? `<div class="error">${esc(f.err)}</div>` : ""}
  <div class="card"><span class="step-tag">${esc(xx("step1"))}</span><strong>${esc(T("loan"))}</strong>
    <div class="field"><label>${esc(T("loan"))} *</label><select id="cf-loan" class="input">
      ${loans.map((l) => `<option value="${esc(l.id)}"${l.id === f.loanId ? " selected" : ""}>${esc(cname(l.customerId))} · ${esc(l.id)} · ${safeINR(loanSummary(l, todayLocalISO()).totalOutstanding)}</option>`).join("") || `<option value="">${esc(T("empty_loans"))}</option>`}
    </select><div class="help">${esc(xx("pick_loan_help"))}</div></div>
    <div class="field"><label>${esc(T("collection_date"))} *</label><input id="cf-date" class="input" type="date" value="${esc(f.date)}"></div></div>
  <div class="card"><span class="step-tag">${esc(xx("step2"))}</span><strong>${esc(xx("cash"))}</strong>
    <div class="field"><label>${esc(xx("received"))} * (${esc(xx("cash"))})</label><input id="cf-cash" class="input" inputmode="decimal" value="${esc(f.cash)}" placeholder="500"><div class="help">${esc(xx("cash_help"))}</div></div>
    <div class="row-flex">
      <div class="field" style="flex:1"><label>${esc(xx("int_got"))} *</label><input id="cf-i" class="input" inputmode="decimal" value="${esc(f.iAlloc)}" placeholder="300"></div>
      <div class="field" style="flex:1"><label>${esc(xx("prin_got"))} *</label><input id="cf-p" class="input" inputmode="decimal" value="${esc(f.pAlloc)}" placeholder="200"></div>
    </div><div class="help">${esc(xx("split_help"))}</div>
    <div class="field"><label>${esc(T("note"))}</label><input id="cf-note" class="input" value="${esc(f.note)}"></div>
    <div class="row-flex">
      <button class="btn" id="cf-prev">${esc(xx("preview"))}</button>
      <button class="btn" id="cf-fill-int">${esc(xx("split_auto"))}</button>
    </div>
  </div>
  ${summaryHtml}${prevHtml}
  <div class="card"><span class="step-tag">${esc(xx("step3"))}</span><strong>${esc(T("confirm_save"))}</strong><div class="help">${esc(xx("confirm_collect"))}</div>
  <button class="btn btn-primary big-btn" id="cf-save" style="margin-top:8px">${esc(T("confirm_save"))}</button></div>`;
  const sync = () => {
    f.loanId = el.querySelector("#cf-loan").value; f.date = el.querySelector("#cf-date").value;
    f.cash = el.querySelector("#cf-cash").value; f.iAlloc = el.querySelector("#cf-i").value;
    f.pAlloc = el.querySelector("#cf-p").value; f.note = el.querySelector("#cf-note").value;
  };
  el.querySelector("#cf-loan").addEventListener("change", () => { sync(); f.preview = null; f.err = ""; drawCollect(el); });
  el.querySelector("#cf-date").addEventListener("change", () => { sync(); f.preview = null; drawCollect(el); });
  ["#cf-cash", "#cf-i", "#cf-p", "#cf-note"].forEach((s) => el.querySelector(s).addEventListener("input", sync));
  el.querySelector("#cf-fill-int").addEventListener("click", () => {
    sync();
    const lo = (state.loans || []).find((l) => l.id === f.loanId);
    if (!lo) return;
    const s = loanSummary(lo, f.date && isValidISO(f.date) ? f.date : todayLocalISO());
    try {
      const cash = toPaise(f.cash);
      const i = Math.min(cash, s.interestOutstanding);
      f.iAlloc = (i / 100).toString();
      f.pAlloc = ((cash - i) / 100).toString();
    } catch { f.iAlloc = (s.interestOutstanding / 100).toString(); }
    drawCollect(el);
  });
  el.querySelector("#cf-prev").addEventListener("click", () => {
    sync();
    f.err = "";
    try {
      f.preview = buildPreview();
      if (!f.preview) throw new Error(T("validation_error"));
    } catch (e) { f.err = e.message; f.preview = null; }
    drawCollect(el);
  });
  el.querySelector("#cf-save").addEventListener("click", async () => {
    if (saving) return;
    sync();
    f.err = "";
    let parsed;
    try { parsed = parseCollectForm(); }
    catch (e) { f.err = e.message; drawCollect(el); return; }
    if (!window.confirm(xx("confirm_collect") + `\n${formatINR(parsed.amountPaise)} (int ${formatINR(parsed.iPaise)} + prin ${formatINR(parsed.pPaise)})`)) return;
    saving = true;
    const btn = el.querySelector("#cf-save");
    if (btn) btn.disabled = true;
    try {
      const fresh = await loadState();
      const lo = (fresh.loans || []).find((l) => l.id === parsed.loanId);
      if (!lo) throw new Error(T("empty_loans"));
      const tmpState = { ...fresh, loans: fresh.loans, transactions: fresh.transactions, customers: fresh.customers };
      const before = loanSummary(lo, parsed.date);
      // Recompute summary against fresh state for validation
      const savedState = { loans: fresh.loans, transactions: fresh.transactions, customers: fresh.customers || [] };
      const { summarizeLoan: sl } = await import("./interest.js").catch(() => ({ summarizeLoan }));
      void sl; void tmpState; void savedState;
      const freshSummary = (() => {
        const full = { ...lo, principalPaise: principalOf(lo) };
        if (!full.method || full.method === "Cash") {
          let repaid = 0;
          for (const x of (fresh.transactions || [])) {
            if ((x.loanId !== lo.id && x.loan_id !== lo.id) || x.void || x.type !== "collection") continue;
            if (String(x.date || "").slice(0, 10) > parsed.date) continue;
            repaid += Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise : (Number.isInteger(x.principalAlloc) ? x.principalAlloc : 0);
          }
          void before;
          return { interestOutstanding: 0, principalOutstanding: Math.max(0, principalOf(lo) - repaid) };
        }
        return summarizeLoan(full, fresh.transactions || [], parsed.date);
      })();
      const vErr = validateCollection({
        loanSummary: freshSummary, amountPaise: parsed.amountPaise,
        interestAllocPaise: parsed.iPaise, principalAllocPaise: parsed.pPaise,
        idempotencyKey: collectKey, usedKeys: fresh.usedKeys || [],
      });
      if (vErr) throw new Error(vErr);
      if ((fresh.usedKeys || []).includes(collectKey)) throw new Error(T("duplicate_blocked"));
      fresh.counters.txnSeq = (fresh.counters.txnSeq || 0) + 1;
      const ref = "T" + String(fresh.counters.txnSeq).padStart(6, "0");
      const now = new Date().toISOString();
      fresh.transactions.push({
        id: ref, ref, loanId: parsed.loanId, customerId: lo.customerId,
        type: "collection", method: "Cash", date: parsed.date, createdAt: now,
        amount: parsed.amountPaise, amountPaise: parsed.amountPaise,
        interestAlloc: parsed.iPaise, interestAllocPaise: parsed.iPaise,
        principalAlloc: parsed.pPaise, principalAllocPaise: parsed.pPaise,
        note: parsed.note, idempotencyKey: collectKey,
      });
      fresh.usedKeys = [...(fresh.usedKeys || []), collectKey];
      await saveState(fresh);
      state = fresh;
      toast(xx("saved"));
      window.location.hash = "#/receipt/" + encodeURIComponent(ref);
    } catch (e) {
      saving = false;
      f.err = e.message;
      drawCollect(el);
    }
  });
}
function parseCollectForm() {
  const f = collectForm;
  if (!f.loanId) throw new Error(T("empty_loans"));
  if (!isValidISO(f.date)) throw new Error(T("invalid_date"));
  let amountPaise, iPaise, pPaise;
  try { amountPaise = toPaise(f.cash); } catch { throw new Error(T("invalid_amount")); }
  try { iPaise = f.iAlloc.trim() === "" ? 0 : toPaise(f.iAlloc); } catch { throw new Error(T("invalid_amount")); }
  try { pPaise = f.pAlloc.trim() === "" ? 0 : toPaise(f.pAlloc); } catch { throw new Error(T("invalid_amount")); }
  if (amountPaise <= 0) throw new Error(T("invalid_amount"));
  if (iPaise + pPaise !== amountPaise) throw new Error(T("mismatch_allocation"));
  return { loanId: f.loanId, date: f.date.slice(0, 10), amountPaise, iPaise, pPaise, note: (f.note || "").trim() };
}
function buildPreview() {
  const p = parseCollectForm();
  const loan = (state.loans || []).find((l) => l.id === p.loanId);
  if (!loan) return null;
  const before = loanSummary(loan, p.date);
  const vErr = validateCollection({
    loanSummary: before, amountPaise: p.amountPaise,
    interestAllocPaise: p.iPaise, principalAllocPaise: p.pPaise,
    idempotencyKey: "preview", usedKeys: [],
  });
  if (vErr) throw new Error(vErr);
  const after = {
    interestOutstanding: before.interestOutstanding - p.iPaise,
    principalOutstanding: before.principalOutstanding - p.pPaise,
    totalOutstanding: before.totalOutstanding - p.amountPaise,
  };
  return { before, after };
}

/* ---------------- receipt ---------------- */
function renderReceipt(tid) {
  const el = document.getElementById("receipt-app");
  if (!el) return;
  // If this is the collect route (no id), renderCollect already handled.
  if (route().name === "collect") return;
  const x = (state.transactions || []).find((t) => t && t.id === tid);
  if (!x) { el.innerHTML = `<h2>${esc(T("receipt"))}</h2><div class="empty">${esc(xx("no_data"))}</div>`; return; }
  const c = (state.customers || []).find((cc) => cc.id === x.customerId);
  const amt = Number.isInteger(x.amountPaise) ? x.amountPaise : x.amount || 0;
  const ia = Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise : x.interestAlloc || 0;
  const pa = Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise : x.principalAlloc || 0;
  const loan = (state.loans || []).find((l) => l.id === (x.loanId || x.loan_id));
  const s = loan ? loanSummary(loan, String(x.date || "").slice(0, 10)) : null;
  el.innerHTML = `<p><a href="#/collections">← ${esc(xx("back"))}</a></p><h2>${esc(xx("receipt_title"))}</h2>
  <div class="card"><strong>${esc(T("app_name"))}</strong>
    <div class="table-wrap"><table class="table"><tbody>
    <tr><td>${esc(T("txn_id"))}</td><td>${esc(x.ref || x.id)}</td></tr>
    <tr><td>${esc(T("date"))}</td><td>${esc(formatDateIN(String(x.date || "").slice(0, 10)))}</td></tr>
    <tr><td>${esc(T("customer"))}</td><td>${esc(c ? c.name : x.customerId || "")}</td></tr>
    <tr><td>${esc(T("loan"))}</td><td>${esc(x.loanId || x.loan_id || "")}</td></tr>
    <tr><td>${esc(T("amount"))} (${esc(xx("cash"))})</td><td>${safeINR(amt)}</td></tr>
    <tr><td>${esc(T("interest_alloc")) || esc(xx("int_got"))}</td><td>${safeINR(ia)}</td></tr>
    <tr><td>${esc(T("principal_alloc")) || esc(xx("prin_got"))}</td><td>${safeINR(pa)}</td></tr>
    ${x.note ? `<tr><td>${esc(T("note"))}</td><td>${esc(x.note)}</td></tr>` : ""}
    ${s ? `<tr><td>${esc(T("remaining"))}</td><td>${esc(xx("remaining_int"))}: ${safeINR(s.interestOutstanding)} · ${esc(xx("remaining_prin"))}: ${safeINR(s.principalOutstanding)}</td></tr>` : ""}
    </tbody></table></div>
    <div class="row-flex" style="margin-top:10px"><button class="btn" id="rc-print">${esc(xx("print"))}</button><a class="btn" href="#/collections">${esc(T("nav_collections"))}</a></div>
  </div>`;
  el.querySelector("#rc-print").addEventListener("click", () => {
    const area = document.getElementById("print-area");
    if (area) area.innerHTML = `<div class="r-center"><strong>${esc(T("app_name"))}</strong><br>${esc(xx("receipt_title"))}</div><div class="r-sep"></div><div>${esc(T("txn_id"))}: ${esc(x.ref || x.id)}<br>${esc(T("date"))}: ${esc(formatDateIN(String(x.date || "").slice(0, 10)))}<br>${esc(T("customer"))}: ${esc(c ? c.name : "")}<br>${esc(T("amount"))}: ${safeINR(amt)} (${esc(xx("cash"))})<br>int ${safeINR(ia)} · prin ${safeINR(pa)}</div>`;
    document.body.classList.add("print-80");
    try { window.print(); } catch { /* ignore */ }
    setTimeout(() => { if (area) area.innerHTML = ""; document.body.classList.remove("print-80"); }, 600);
  });
}

/* ---------------- collections view ---------------- */
function renderCollectionsView() {
  const el = document.getElementById("collections-app");
  if (!el) return;
  if (!colDate) colDate = todayLocalISO();
  const cname = (id) => ((state.customers || []).find((c) => c.id === id) || {}).name || id || "—";
  let expected = 0;
  for (const l of (state.loans || [])) {
    if ((l.status || "active") !== "active" || !l.method || l.method === "Cash") continue;
    try {
      const full = { ...l, principalPaise: principalOf(l) };
      if (isChargeable(full, colDate)) expected += dailyChargePaise(full, colDate, currentPrincipalFor(l, colDate));
    } catch { /* skip */ }
  }
  let collected = 0, intGot = 0;
  const dayTx = (state.transactions || []).filter((x) => x && !x.void && x.type === "collection" && String(x.date || "").slice(0, 10) === colDate);
  for (const x of dayTx) {
    collected += Number.isInteger(x.amountPaise) ? x.amountPaise : x.amount || 0;
    intGot += Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise : x.interestAlloc || 0;
  }
  const q = colSearch.trim().toLowerCase();
  let hist = [...(state.transactions || [])].filter((x) => x && !x.void).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  if (colDate) hist = hist.filter((x) => !colDate || String(x.date || "").slice(0, 10) === colDate || true);
  // Date filter applies to history table too when set; keep full when empty.
  if (colCust) hist = hist.filter((x) => x.customerId === colCust);
  if (q) hist = hist.filter((x) => (cname(x.customerId) + " " + (x.id || "") + " " + (x.loanId || "")).toLowerCase().includes(q));
  hist = hist.slice(0, 60);
  // Pending/partial for the selected day
  let pendingAmt = 0, partialCount = 0;
  for (const l of (state.loans || [])) {
    if ((l.status || "active") !== "active") continue;
    const s = loanSummary(l, colDate);
    if ((s.interestOutstanding || 0) > 0) {
      pendingAmt += s.interestOutstanding;
      const gotToday = dayTx.filter((x) => (x.loanId === l.id || x.loan_id === l.id))
        .reduce((a, x) => a + (Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise : 0), 0);
      if (gotToday > 0) partialCount += 1;
    }
  }
  el.innerHTML = `<h2>${esc(T("nav_collections"))}</h2>
  <div class="grid">
    <div class="card"><div><strong>${esc(T("today_expected"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(expected)}</div><div><small>${esc(colDate)}</small></div></div>
    <div class="card"><div><strong>${esc(T("today_collected"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(collected)}</div><div><small>int ${safeINR(intGot)} · ${dayTx.length} txn</small></div></div>
    <div class="card"><div><strong>${esc(T("partial"))} / ${esc(T("pending"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(pendingAmt)}</div><div><small>${partialCount} partial</small></div></div>
  </div>
  <div class="card"><div class="row-flex">
    <div class="field" style="flex:1"><label>${esc(T("date"))}</label><input id="cl-date" class="input" type="date" value="${esc(colDate)}"></div>
    <div class="field" style="flex:1"><label>${esc(T("customer"))}</label><select id="cl-cust" class="input"><option value="">${esc(xx("all"))}</option>
    ${(state.customers || []).map((c) => `<option value="${esc(c.id)}"${colCust === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
  </div>
  <div class="field"><label>${esc(T("search"))} (${esc(T("customer"))} / ${esc(T("txn_id"))})</label><input id="cl-q" class="input" value="${esc(colSearch)}"></div>
  <div class="row-flex"><button class="btn btn-primary" id="cl-go">＋ ${esc(T("record_collection"))}</button><button class="btn" id="cl-csv">${esc(T("export_csv"))}</button></div></div>
  <div class="card"><strong>${esc(T("recent_txns"))} (${hist.length})</strong>
  ${!hist.length ? `<div class="empty">${esc(T("empty_txns"))}</div>` : `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("customer"))}</th><th>${esc(T("amount"))}</th><th></th></tr></thead><tbody>
  ${hist.map((x) => `<tr><td>${esc(formatDateIN(String(x.date || "").slice(0, 10)))}</td><td>${esc(cname(x.customerId))}<br><small>${esc(x.loanId || x.loan_id || "")}</small></td><td>${safeINR(Number.isInteger(x.amountPaise) ? x.amountPaise : x.amount || 0)}</td><td><a href="#/receipt/${esc(x.id)}">${esc(T("receipt"))}</a></td></tr>`).join("")}
  </tbody></table></div>`}</div>`;
  el.querySelector("#cl-date").addEventListener("change", (e) => { colDate = e.target.value; router(); });
  el.querySelector("#cl-cust").addEventListener("change", (e) => { colCust = e.target.value; router(); });
  el.querySelector("#cl-q").addEventListener("input", (e) => { colSearch = e.target.value; router(); });
  el.querySelector("#cl-go").addEventListener("click", () => { window.location.hash = "#/collect"; });
  el.querySelector("#cl-csv").addEventListener("click", () => {
    downloadFile(`interestledger-txns-${colDate}.csv`, transactionsToCSV(state.transactions || [], { from: colDate, to: colDate }), "text/csv");
  });
}

/* ---------------- reports ---------------- */
function renderReports() {
  const el = document.getElementById("reports-app");
  if (!el) return;
  const today = todayLocalISO();
  if (!repFrom) repFrom = addDaysISO(today, -29);
  if (!repTo) repTo = today;
  const rec = reconcileTotals({ loans: state.loans || [], transactions: state.transactions || [], customers: state.customers || [] }, repTo);
  let intAcc = 0, intCol = 0, prinRep = 0, cashIn = 0;
  const byDay = {};
  for (const l of (state.loans || [])) {
    const full = { ...l, principalPaise: principalOf(l) };
    if (!full.method || full.method === "Cash") continue;
    try {
      const rows = accrualSchedule(full, state.transactions || [], repFrom > full.startDate ? repFrom : full.startDate, repTo);
      for (const r of rows) intAcc += r.charged || 0;
    } catch { /* skip */ }
  }
  for (const x of (state.transactions || [])) {
    if (!x || x.void || x.type !== "collection") continue;
    const d = String(x.date || "").slice(0, 10);
    if (d < repFrom || d > repTo) continue;
    const ia = Number.isInteger(x.interestAllocPaise) ? x.interestAllocPaise : x.interestAlloc || 0;
    const pa = Number.isInteger(x.principalAllocPaise) ? x.principalAllocPaise : x.principalAlloc || 0;
    const am = Number.isInteger(x.amountPaise) ? x.amountPaise : x.amount || 0;
    intCol += ia; prinRep += pa; cashIn += am;
    byDay[d] = (byDay[d] || 0) + am;
  }
  const byMonth = {};
  for (const [d, v] of Object.entries(byDay)) {
    const m = d.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + v;
  }
  const cname = (id) => ((state.customers || []).find((c) => c.id === id) || {}).name || id || "—";
  el.innerHTML = `<h2>${esc(T("nav_reports"))}</h2>
  <div class="card"><div class="row-flex">
    <div class="field" style="flex:1"><label>${esc(xx("from"))}</label><input id="rp-from" class="input" type="date" value="${esc(repFrom)}"></div>
    <div class="field" style="flex:1"><label>${esc(xx("to"))}</label><input id="rp-to" class="input" type="date" value="${esc(repTo)}"></div>
    <div class="field"><label>&nbsp;</label><button class="btn btn-primary" id="rp-apply">${esc(xx("apply"))}</button></div>
  </div><div><small>INR · ${esc(repFrom)} → ${esc(repTo)}</small></div></div>
  <div class="grid">
    <div class="card"><div><strong>${esc(T("total_lent"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(rec.totalPrincipalLent)}</div></div>
    <div class="card"><div><strong>${esc(T("outstanding_principal"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(rec.principalOutstanding)}</div></div>
    <div class="card"><div><strong>${esc(xx("accrued_total"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(intAcc)}</div></div>
    <div class="card"><div><strong>${esc(xx("collected_total"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(intCol)}</div></div>
    <div class="card"><div><strong>${esc(T("interest_unpaid"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(rec.interestOutstanding)}</div></div>
    <div class="card"><div><strong>${esc(xx("principal_repaid"))}</strong></div><div style="font-size:22px;font-weight:800">${safeINR(prinRep)}</div></div>
  </div>
  <div class="card"><strong>${esc(xx("daily_cash"))}</strong>
    ${!Object.keys(byDay).length ? `<div class="empty">${esc(xx("no_data"))}</div>` : `<div class="table-wrap"><table class="table"><tbody>${Object.keys(byDay).sort().map((d) => `<tr><td>${esc(formatDateIN(d))}</td><td>${safeINR(byDay[d])}</td></tr>`).join("")}</tbody></table></div>`}
  </div>
  <div class="card"><strong>${esc(xx("monthly_cash"))}</strong>
    ${!Object.keys(byMonth).length ? `<div class="empty">${esc(xx("no_data"))}</div>` : `<div class="table-wrap"><table class="table"><tbody>${Object.keys(byMonth).sort().map((m) => `<tr><td>${esc(m)}</td><td>${safeINR(byMonth[m])}</td></tr>`).join("")}</tbody></table></div>`}
  </div>
  <div class="card"><strong>${esc(xx("by_customer"))}</strong><div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("customer"))}</th><th>${esc(xx("total_due"))}</th><th></th></tr></thead><tbody>
  ${(state.customers || []).map((c) => {
    const s = summarizeCustomer(c.id, state.loans || [], state.transactions || [], repTo);
    return `<tr><td>${esc(c.name)}</td><td>${safeINR(s.totalOutstanding)}</td><td><a href="#/customer/${esc(c.id)}">${esc(xx("view"))}</a></td></tr>`;
  }).join("") || `<tr><td colspan="3">${esc(xx("no_data"))}</td></tr>`}
  </tbody></table></div></div>
  <div class="card"><strong>${esc(xx("by_loan"))}</strong><div class="table-wrap"><table class="table"><thead><tr><th>${esc(T("loan"))}</th><th>${esc(T("status"))}</th><th>${esc(xx("total_due"))}</th><th></th></tr></thead><tbody>
  ${(state.loans || []).map((l) => {
    const s = loanSummary(l, repTo);
    return `<tr><td>${esc(l.id)}<br><small>${esc(cname(l.customerId))}</small></td><td>${statusBadge(l.status || "active")}</td><td>${safeINR(s.totalOutstanding)}</td><td><a href="#/loan/${esc(l.id)}">${esc(xx("view"))}</a></td></tr>`;
  }).join("") || `<tr><td colspan="4">${esc(xx("no_data"))}</td></tr>`}
  </tbody></table></div></div>
  <div class="card"><div class="row-flex">
    <button class="btn" id="rp-csv-txn">${esc(xx("csv_txn"))}</button>
    <button class="btn" id="rp-csv-rep">${esc(xx("csv_report"))}</button>
  </div></div>`;
  el.querySelector("#rp-apply").addEventListener("click", () => {
    repFrom = el.querySelector("#rp-from").value || repFrom;
    repTo = el.querySelector("#rp-to").value || repTo;
    router();
  });
  el.querySelector("#rp-csv-txn").addEventListener("click", () => {
    downloadFile(`interestledger-txns-${repFrom}-${repTo}.csv`, transactionsToCSV(state.transactions || [], { from: repFrom, to: repTo }), "text/csv");
  });
  el.querySelector("#rp-csv-rep").addEventListener("click", () => {
    downloadFile(`interestledger-report-${repFrom}-${repTo}.csv`, summaryToCSV({ totalPrincipalLent: rec.totalPrincipalLent, principalOutstanding: rec.principalOutstanding, interestAccruedPeriod: intAcc, interestCollectedPeriod: intCol, interestOutstanding: rec.interestOutstanding, principalRepaidPeriod: prinRep, cashInPeriod: cashIn, from: repFrom, to: repTo, currency: "INR-paise" }, { from: repFrom, to: repTo }), "text/csv");
  });
}

/* ---------------- more: settings / language / backup / restore ---------------- */
function renderMore() {
  const el = document.getElementById("more-app");
  if (!el) return;
  const L = state.settings.lang || "en";
  el.innerHTML = `<h2>${esc(T("nav_more"))}</h2>
  <div class="card"><strong>${esc(T("settings"))}</strong>
    <div class="error" style="background:#FAF0DA;color:#664d03">${esc(T("data_loss_warning"))}</div>
    <div><small>${esc(T("lending_law_note"))}</small></div>
    <div><small>${esc(T("sensitive_backup_warning"))} (schema v${BACKUP_VERSION})</small></div></div>
  <div class="card"><strong>${esc(T("language"))}</strong><div><small>${esc(xx("lang_note"))}</small></div>
    <div class="row-flex" style="margin-top:8px">
      <button class="btn${L === "en" ? " btn-primary" : ""}" id="lang-en">English</button>
      <button class="btn${L === "kn" ? " btn-primary" : ""}" id="lang-kn">ಕನ್ನಡ</button>
    </div></div>
  <div class="card"><strong>${esc(T("backup"))} / ${esc(T("restore"))}</strong>
    <div class="row-flex">
      <button class="btn btn-primary" id="bk-dl">${esc(xx("backup_now"))}</button>
      <button class="btn" id="bk-csv">${esc(T("export_csv"))}</button>
    </div>
    <div style="margin-top:10px" class="error">${esc(xx("restore_warn"))}</div>
    <div class="field" style="margin-top:8px"><label>${esc(xx("restore_now"))} (.json)</label><input id="bk-file" class="input" type="file" accept="application/json,.json"></div>
    <div id="bk-msg"></div></div>`;
  el.querySelector("#lang-en").addEventListener("click", async () => { await setLang("en"); });
  el.querySelector("#lang-kn").addEventListener("click", async () => { await setLang("kn"); });
  el.querySelector("#bk-dl").addEventListener("click", () => {
    downloadFile(`interestledger-backup-${todayLocalISO()}.json`, exportBackupJSON(state), "application/json");
    toast(T("backup") + ": OK");
  });
  el.querySelector("#bk-csv").addEventListener("click", () => {
    downloadFile(`interestledger-txns.csv`, transactionsToCSV(state.transactions || [], {}), "text/csv");
  });
  el.querySelector("#bk-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const msg = el.querySelector("#bk-msg");
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      const errs = validateBackup(obj);
      if (errs.length) { msg.innerHTML = `<div class="error">${errs.map(esc).join("<br>")}</div>`; return; }
      const dup = (obj.transactions || []).length && (state.transactions || []).some((x) => (obj.transactions || []).some((y) => y.id === x.id));
      if (!window.confirm(T("confirm_restore") + (dup ? "\n(existing IDs overlap — they will be replaced)" : ""))) return;
      const next = restoreReplace(state, obj);
      // Verify reconciliation before declaring success.
      const before = reconcileTotals({ loans: next.loans, transactions: next.transactions, customers: next.customers }, todayLocalISO());
      await saveState(next);
      state = next;
      const after = reconcileTotals({ loans: state.loans, transactions: state.transactions, customers: state.customers }, todayLocalISO());
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(T("validation_error"));
      msg.innerHTML = `<div class="card">${esc(xx("restored_ok"))} (${(next.customers || []).length} customers, ${(next.loans || []).length} loans, ${(next.transactions || []).length} txns)</div>`;
      toast(xx("restored_ok"));
      router();
    } catch (err) { msg.innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  });
}
async function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  const fresh = await loadState();
  fresh.settings = { ...(fresh.settings || {}), lang };
  await saveState(fresh);
  state = fresh;
  document.documentElement.lang = lang === "kn" ? "kn" : "en";
  router();
  toast((lang === "kn" ? "ಭಾಷೆ: ಕನ್ನಡ" : "Language: English"));
}

/* ---------------- boot ---------------- */
async function boot() {
  if (booted) return;
  booted = true;
  const homeEl = document.getElementById("home-app");
  if (homeEl) homeEl.innerHTML = `<div class="empty">${esc("Loading...")}</div>`;
  try {
    state = await loadState();
  } catch {
    state = emptyState();
  }
  if (!state.settings) state.settings = { lang: "en" };
  document.documentElement.lang = state.settings.lang === "kn" ? "kn" : "en";
  document.querySelectorAll("button[data-view]").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-view");
      window.location.hash = v === "home" ? "#/home" : "#/" + v;
    });
  });
  const moreBtn = document.getElementById("more-menu-btn");
  const moreMenu = document.getElementById("more-menu");
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener("click", () => {
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.setAttribute("aria-expanded", String(open));
    });
    moreMenu.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
      moreMenu.hidden = true;
      window.location.hash = "#/more";
    }));
  }
  const rc = document.getElementById("record-collection");
  if (rc) rc.addEventListener("click", () => { window.location.hash = "#/collect"; });
  window.addEventListener("hashchange", router);
  router();
}
if (typeof window !== "undefined") {
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot);
  else boot();
}
export { boot };
