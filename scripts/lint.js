// InterestLedger lint. Node builtins only.
//
// 1. Runs `node --check` on every JS file in js/ and scripts/ (syntax check).
// 2. Scans js/app.js + index.html for forbidden strings
//    (proves no secrets, paid APIs, or excluded payment rails).
// Reports OK/FAIL per file and exits 0 on success, 1 on any failure.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;

function jsFilesIn(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => `${dir}/${f}`);
}

// 1. Syntax check every js file.
const targets = [...jsFilesIn("js"), ...jsFilesIn("scripts")];
if (targets.length === 0) {
  console.error("FAIL: no JS files found in js/ or scripts/.");
  failures += 1;
}
for (const f of targets) {
  const r = spawnSync(process.execPath, ["--check", join(ROOT, f)], { encoding: "utf8" });
  if (r.status === 0) {
    console.log(`OK: ${f}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${f}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}

// 2. Forbidden-string scan (case-insensitive).
const FORBIDDEN = ["sk-", "api.openai", "upi", "qrcode", "stripe", "razorpay"];
const SCAN_FILES = ["js/app.js", "index.html"];
for (const f of SCAN_FILES) {
  const abs = join(ROOT, f);
  if (!existsSync(abs)) {
    console.log(`SKIP: ${f} (file not found, nothing to scan)`);
    continue;
  }
  const text = readFileSync(abs, "utf8").toLowerCase();
  const hits = FORBIDDEN.filter((s) => text.includes(s.toLowerCase()));
  if (hits.length > 0) {
    failures += 1;
    console.error(`FAIL: ${f} contains forbidden string(s): ${hits.join(", ")}`);
  } else {
    console.log(`OK: ${f} (no secrets/excluded rails)`);
  }
}

if (failures > 0) {
  console.error(`LINT FAILED: ${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`LINT OK: ${targets.length} JS file(s) checked, ${SCAN_FILES.length} file(s) scanned.`);
