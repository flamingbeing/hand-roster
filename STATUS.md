# Status

## Now

- A working first version on the app-starter shell, app name "Hand Roster", host handroster.anawj.com. Tabs: Week (first),
  Calls, People, Lists, Leave and requests. Admins and members edit; viewers (juniors on a phone) read.
- Calls: the monthly on-call solver (`roster/calls.js`) fills CON, REG, MO (NUH) and MO (NTFGH) with a greedy pass and
  seeded annealing. Hard rules: nobody on leave, one tier a day, at least one clear day between calls (default two; never
  less, as the day after a call is post-call), "cannot" requests, locked entries kept, last month's calls counted. Soft:
  fair totals per grade (scaled to days around), weekend and holiday balance, tier spread, calls spaced out, "want"
  requests. Anything it cannot meet is listed as a problem, never broken silently. Hand edits are checked the same way.
- Week: built from the weekly lists (OT lists and clinics, consultant, juniors needed): AM and PM per site, leave, post-call
  (PM; whole day if set), free (AM, PM or full day), on-call. A clinic closes when its consultant is on leave.
- Export: the week and the calls as Excel in the CORE sheet's layout, a landscape A4 print of the week like the hand-made
  grid, and "Copy for WhatsApp" (the next working day, plain text). All from one layout (`roster/layout.js`), loaded only
  when a button is used; ExcelJS 4.4.0 is vendored.
- Checks run here: type check, 147 unit tests, modules, devkit, proofread, links, rules build, startup budget (48 requests,
  279 KiB gzip, at the budget) and the Week smoke browser test. A real browser run fixed one start-up crash (the kit's shell
  needs a `.ui-list` in the page; an empty hidden one is there now).

## Waiting on the owner

- <nothing>

## Next

- Run the full checks in CI: the rules tests and most browser specs need the emulators (only the roster smoke spec ran here).
- Try it on the real data: enter the people, leave and lists for one month and week, compare the output with the hand-made
  sheet, then tune the fairness weights and the post-call rule (AM or whole day).
- Missing for real use: public holidays are typed in per month (no built-in calendar); a list that stays short is reported, not
  solved (no locum or swap suggestion); no import from the old sheet or from a pasted roster; no swap requests between
  juniors; no per-person view or notification; the Excel layout is checked only against its unit tests, not opened in Excel.
- The held-conflict browser test for lists is not ported yet; recipes and the static flavour still carry the sample Tasks app.

## Decisions (dated)

- <date>: <decision>
