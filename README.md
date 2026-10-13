# InterestLedger

InterestLedger is a simple cash-only daily interest ledger for small lenders in India.

You can:

- Add customers (English or Kannada names).
- Record cash loans with a fixed daily interest amount.
- Record cash collections every day.
- See who is due today, active loans and totals.
- Print simple receipts (58mm / 80mm / A4).
- Use it in English or Kannada.
- Install it as an app on Android (PWA) and use it offline.

Cash-only means: every loan and collection is cash in hand. There is no support for other payment modes.

Exclusions (not in this app):

- No UPI.
- No bank transfers.
- No cloud sync.
- No QR codes.
- No online payments of any kind.

If you need those, this app is not for you.

## How your data is kept (please read)

- Local-only. Records stay in this browser on this device (IndexedDB / localStorage).
- No sync. There is no server, no account, no multi-device sync.
- No encryption claims. Anyone with full access to this device and browser can read the data.
- Clearing app data or browser data erases everything. That is why backups below matter.

## Commands

You need Node.js 18 or newer only for tests and checks. The app itself runs in any modern browser with zero dependencies.

```bash
npm test        # run the unit tests in tests/
npm run build   # check required files exist + smoke test money math
npm run lint    # syntax-check js/ + scan for secrets and paid APIs
npx serve . -l 5173
```

Then open http://localhost:5173 in your browser.

Other ways to run:

1. `npx serve . -l 5173` and open http://localhost:5173 (recommended).
2. `python -m http.server 5173` and open http://localhost:5173.
3. VS Code Live Server (right-click `index.html` → Open with Live Server).

## Android PWA install steps

1. Start the app with `npx serve . -l 5173` on a computer on the same Wi-Fi, or host the folder on your phone.
   On the phone browser, open the app address (for example `http://YOUR-PC-IP:5173`).
2. In Chrome on Android, tap the three-dot menu → Add to Home screen → Install.
   Or tap Install when the install banner appears.
3. Open InterestLedger from the home screen. It opens full-screen (standalone).
4. First open needs internet to the local server. After that, the service worker keeps the shell offline.

If install does not show, make sure you opened the app over `http://localhost` or `https://`, and that `manifest.webmanifest` and `sw.js` load.

## Backup and restore steps

Backups are manual JSON file copies. Do them often.

Backup:

1. Open More → Backup.
2. Tap Download backup and save the file.
3. Keep copies in two places (for example phone storage + a memory card or another device).
4. Name files with the date, for example `interestledger-2026-10-13.json`.

Restore:

1. Open More → Restore.
2. Pick a backup JSON file you saved earlier.
3. Confirm. The app checks the file and replaces current records.
4. Check Home totals and one customer detail to confirm.

Notes:

- Backup files are plain readable JSON. They are not encrypted.
- Never edit a backup file by hand unless you know what you are doing.
- The service worker never caches backup files. They always come from the file you pick.

## Capacitor note

This folder can be wrapped as an Android app with Capacitor.

- `capacitor.config.json` uses `appId com.interestledger.app`, `appName InterestLedger`, `webDir "."`.
- The web app has zero npm dependencies at runtime. Capacitor packages are dev tooling only.
- Typical flow: copy `index.html`, `css/`, `js/`, `manifest.webmanifest`, `icon.svg`, `sw.js` into your Capacitor Android project, then `npx cap sync android` and build in Android Studio.
- The wrapped app is still local-only with the same limits below.

## Limitations + lending-law reminder

- Local-only, single device. No sync, no login, no server checks.
- No encryption. Do not store passwords or other secrets in notes.
- Fixed daily interest only. A loan of ₹50,000 (5000000 paise) at ₹100 per day (10000 paise) for 5 days accrues ₹500 (50000 paise). Check each loan screen for the exact math.
- Receipts are simple records, not legal invoices. Long Kannada names wrap to new lines and are never cut off.
- Money is stored as integer paise to avoid rounding errors. Display uses Indian grouping (₹1,000.00).
- Lending-law reminder: money-lending is regulated. Interest limits, licences and record rules differ by state. Confirm allowed interest and licences with local authorities before lending. This app does not give legal advice.

## Project structure

```text
index.html            # shell: nav (Home/Customers/Collections/Reports + More), sections, toast, print area
css/styles.css        # mobile-first styles, 48px targets, Kannada line-height, print rules
js/app.js             # UI: dashboard, customers, loans, collections, reports, backup/restore
js/money.js           # paise parsing (toPaise, toQty), INR formatting (formatINR)
js/interest.js        # deterministic daily-interest engine (fixed/pct-daily/pct-monthly)
js/ledger.js          # collection validation, reversals, rollups, reconciliation
js/store.js           # IndexedDB-first persistence with localStorage/memory fallback
js/i18n.js            # English/Kannada strings (STRINGS, t)
js/backup.js          # versioned JSON backup/restore + CSV exports
js/pwa.js             # service-worker registration (registerSW)
manifest.webmanifest  # PWA name, colors, icons
icon.svg              # green ledger glyph
sw.js                 # shell-only cache, versioned
scripts/build.js      # file checks + money + interest smoke tests
scripts/lint.js       # syntax check + forbidden-string scan
capacitor.config.json # Capacitor app id, name, webDir
package.json          # scripts: start / test / build / lint
README.md             # this file
```
