# Status

## Now

- Engine and screens built on the app-starter shell: Week (build, move, print), Calls (make, hand edit, check), People, Lists,
  Leave and requests; data modules and rules for people, lists, leave, requests, rosters and weeks.
- Taking the roster out (export): the week as an Excel file in the CORE sheet's layout, the month of calls as an Excel file, a
  landscape A4 print of the week like the hand-made grid, and "Copy for WhatsApp" (the next working day, plain text). All made
  from one layout (`roster/layout.js`) and loaded only when a button is used (`screens/export.js`); ExcelJS 4.4.0 is vendored in
  `app/public/vendor/exceljs/` (948 KB, also in the offline cache list).
- Startup is at the budget (48 requests, 279 KiB gzip): add a file to the first screen only by merging another.

## Waiting on the owner

- <nothing>

## Next

- Run the full checks in CI (rules tests and the browser tests need the emulators); the held-conflict browser test for lists is not ported yet; recipes and the static flavour still carry the sample Tasks app.

## Decisions (dated)

- <date>: <decision>
