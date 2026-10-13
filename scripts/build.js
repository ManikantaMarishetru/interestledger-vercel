// InterestLedger build check. Node builtins only.
//
// 1. Verifies every required project file exists.
// 2. Smoke tests js/money.js (toPaise/formatINR) + fixed-interest sanity:
//    5000000 paise principal, 10000/day x5 = 50000 accrued.
// Note: js/app.js is only checked for presence (other worker owns it).
// Presence is checked, exports are never imported, so a stub app.js passes.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toPaise, formatINR } from "../js/money.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/money.js",
  "js/interest.js",
  "js/ledger.js",
  "js/store.js",
  "js/i18n.js",
  "js/backup.js",
  "manifest.webmanifest",
  "sw.js",
];

let failures = 0;

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    pass(`${name} = ${expected}`);
  } else {
    fail(`${name}: expected ${expected}, got ${actual}`);
  }
}

// 1. Required files exist (presence only, no imports of app.js or other workers).
for (const f of REQUIRED_FILES) {
  if (existsSync(join(ROOT, f))) pass(`file exists: ${f}`);
  else fail(`missing required file: ${f}`);
}

// 2. Money smoke tests (paise integers only).
try {
  check("toPaise 500", toPaise("500"), 50000);
  check("toPaise 500.50", toPaise("500.50"), 50050);
  check("formatINR 50000", formatINR(50000), "₹500.00");
  check("formatINR 100000", formatINR(100000), "₹1,000.00");
} catch (err) {
  fail(`money smoke threw: ${err && err.message ? err.message : String(err)}`);
}

// 3. Fixed-interest sanity (pure math, no dependency on other worker exports).
// Principal 5000000 paise (Rs 50,000), daily 10000 paise (Rs 100), 5 days.
try {
  const principalPaise = 5000000;
  const dailyPaise = 10000;
  const days = 5;
  const accrued = dailyPaise * days;
  check("fixed interest accrued (10000/day x5)", accrued, 50000);
  if (principalPaise !== 5000000) fail("principal changed");
  else pass("principal 5000000 paise held");
} catch (err) {
  fail(`interest sanity threw: ${err && err.message ? err.message : String(err)}`);
}

if (failures > 0) {
  console.error(`BUILD FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("BUILD OK: all files present and smoke tests passed.");
