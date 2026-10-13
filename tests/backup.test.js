import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, addCustomer, addLoan, addCollectionRecord,
} from "../js/store.js";
import {
  BACKUP_VERSION, buildBackup, validateBackup, exportBackupJSON,
  transactionsToCSV, summaryToCSV, restoreReplace,
} from "../js/backup.js";

function sampleState() {
  let s = emptyState();
  s = addCustomer(s, { name: "Ravi", phone: "9876543210" });
  const cid = s.customers[0].id;
  s = addCustomer(s, { name: "Meena", phone: "9123456789" });
  s = addLoan(s, { customerId: cid, principal: 100000, startDate: "2026-01-05", rate: 2, method: "Cash" });
  const lid = s.loans[0].id;
  s = addCollectionRecord(s, {
    loanId: lid, amount: 5000, date: "2026-02-01", interestAlloc: 1000, principalAlloc: 4000,
  });
  return s;
}

test("backup round-trip preserves IDs and reconciles", () => {
  const s = sampleState();
  const b = buildBackup(s);
  assert.equal(b.schema, 1);
  assert.equal(b.schema, BACKUP_VERSION);
  assert.ok(typeof b.exportedAt === "string" && !Number.isNaN(Date.parse(b.exportedAt)));

  const json = JSON.stringify(b);
  const parsed = JSON.parse(json);
  const errors = validateBackup(parsed);
  assert.deepEqual(errors, []);

  const restored = restoreReplace(s, parsed);
  assert.equal(restored.customers.length, s.customers.length);
  assert.equal(restored.loans.length, s.loans.length);
  assert.equal(restored.transactions.length, s.transactions.length);
  assert.deepEqual(restored.customers.map((c) => c.id), s.customers.map((c) => c.id));
  assert.deepEqual(restored.loans.map((l) => l.id), s.loans.map((l) => l.id));
  assert.deepEqual(restored.transactions.map((t) => t.id), s.transactions.map((t) => t.id));
  // Reconciles: totals match
  const lent = restored.loans.reduce((sum, l) => sum + l.principal, 0);
  assert.equal(lent, 100000);
  const collected = restored.transactions
    .filter((t) => t.type === "collection")
    .reduce((sum, t) => sum + t.amount, 0);
  assert.equal(collected, 5000);
  // exportBackupJSON is valid JSON that also validates
  const reparsed = JSON.parse(exportBackupJSON(s));
  assert.deepEqual(validateBackup(reparsed), []);
});

test("corrupt backups are rejected", () => {
  const good = JSON.parse(JSON.stringify(buildBackup(sampleState())));

  const badSchema = { ...good, schema: 2 };
  assert.ok(validateBackup(badSchema).length > 0);
  assert.throws(() => restoreReplace(null, badSchema), /schema/i);

  const neg = JSON.parse(JSON.stringify(good));
  neg.loans[0].principal = -5;
  assert.ok(validateBackup(neg).length > 0);
  assert.throws(() => restoreReplace(null, neg), /amount/i);

  const badDate = JSON.parse(JSON.stringify(good));
  badDate.transactions[0].date = "not-a-date";
  assert.ok(validateBackup(badDate).length > 0);
  assert.throws(() => restoreReplace(null, badDate), /date/i);

  const dup = JSON.parse(JSON.stringify(good));
  dup.customers.push({ ...dup.customers[0] });
  assert.ok(validateBackup(dup).length > 0, "duplicate customer id must fail");
  assert.throws(() => restoreReplace(null, dup), /duplicate/i);

  const danglingLoan = JSON.parse(JSON.stringify(good));
  danglingLoan.loans[0].customerId = "C9999";
  assert.ok(validateBackup(danglingLoan).length > 0);
  assert.throws(() => restoreReplace(null, danglingLoan), /customer/i);

  const danglingTxn = JSON.parse(JSON.stringify(good));
  danglingTxn.transactions[0].loanId = "L9999";
  assert.ok(validateBackup(danglingTxn).length > 0);
  assert.throws(() => restoreReplace(null, danglingTxn), /loan/i);
});

test("CSV builders emit header + note rows with escaping", () => {
  const s = sampleState();
  const csv = transactionsToCSV(s.transactions, { from: "2026-01-01", to: "2026-12-31" });
  assert.ok(csv.includes("id,loanId,type,method,date,amount_paise,interest_alloc,principal_alloc,note"));
  assert.ok(csv.includes("paise"));
  assert.ok(csv.includes("2026-01-01"));
  const tricky = transactionsToCSV([{ id: 'a"b,c', loanId: "L0001", type: "collection", method: "Cash", date: "2026-01-01", amount: 100, interestAlloc: 0, principalAlloc: 100, note: 'hi, "there"' }]);
  assert.ok(tricky.includes('"a""b,c"'));
  const summary = summaryToCSV(s);
  assert.ok(summary.includes("metric,value"));
  assert.ok(summary.includes("total_lent_paise"));
});
