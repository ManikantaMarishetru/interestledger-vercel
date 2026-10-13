import test from "node:test";
import assert from "node:assert/strict";
import { LANGS, STRINGS, t, hasKey } from "../js/i18n.js";
import { emptyState, addCustomer } from "../js/store.js";

test("every en key exists in kn and vice versa", () => {
  assert.deepEqual(LANGS, ["en", "kn"]);
  const enKeys = Object.keys(STRINGS.en).sort();
  const knKeys = Object.keys(STRINGS.kn).sort();
  assert.deepEqual(knKeys, enKeys);
  for (const k of ["app_name", "save", "cancel", "customer", "backup", "invalid_amount", "required_name"]) {
    assert.ok(hasKey(k), `missing key ${k}`);
  }
});

test("Kannada strings differ from English for at least 10 keys", () => {
  const keys = Object.keys(STRINGS.en);
  let diff = 0;
  for (const k of keys) {
    if (STRINGS.kn[k] !== STRINGS.en[k]) diff++;
  }
  assert.ok(diff >= 10, `only ${diff} keys differ`);
  assert.equal(t("kn", "app_name"), "ಇಂಟರೆಸ್ಟ್ ಲೆಡ್ಜರ್");
  assert.equal(t("kn", "nav_home"), "ಮುಖಪುಟ");
  assert.equal(t("kn", "save"), "ಉಳಿಸಿ");
  assert.equal(t("kn", "cancel"), "ರದ್ದುಮಾಡಿ");
  assert.equal(t("kn", "customer"), "ಗ್ರಾಹಕ");
  // fallback to English when missing
  assert.equal(t("kn", "__no_such_key__"), "__no_such_key__");
});

test("language switch does not mutate state", () => {
  let s = emptyState();
  s = addCustomer(s, { name: "Ravi", phone: "9876543210" });
  const before = JSON.stringify(s);
  // Pure lookups in both languages
  t("en", "save");
  t("kn", "save");
  t("en", "app_name");
  t("kn", "app_name");
  assert.equal(JSON.stringify(s), before);
  // Changing settings.lang on a copy leaves data untouched
  const copy = JSON.parse(JSON.stringify(s));
  copy.settings.lang = "kn";
  assert.deepEqual(copy.customers, s.customers);
  assert.deepEqual(copy.loans, s.loans);
  assert.deepEqual(copy.transactions, s.transactions);
  assert.equal(JSON.stringify(s), before);
});
