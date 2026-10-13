/**
 * Stages the SmartBill web app for Capacitor (APK builds).
 * Copies only the runtime files into www/ — never node_modules,
 * tests, or scripts — so the APK stays small.
 * Run: npm run mobile:copy
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const www = path.join(root, "www");

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(root, "index.html"), path.join(www, "index.html"));
fs.cpSync(path.join(root, "css"), path.join(www, "css"), { recursive: true });
fs.cpSync(path.join(root, "js"), path.join(www, "js"), { recursive: true });

console.log("www/ staged: index.html + css/ + js/");
