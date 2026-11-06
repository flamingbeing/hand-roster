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
- Export: the week and the calls as Excel in the CORE sheet's layout, the week as Excel in the hand-made grid's layout
  with its tally and check formulas live, a landscape A4 print of the week like the hand-made grid, and "Copy for WhatsApp" (the next working day, plain text). All from one layout (`roster/layout.js`), loaded only
  when a button is used; ExcelJS 4.4.0 is vendored.
- Checks run here: type check, 240 unit tests, modules, devkit, proofread, links, rules build, startup budget (48 requests,
  290 KiB gzip; startup is at 289 KiB, so new screens must load lazily) and the Week smoke browser test. A real browser run fixed one start-up crash (the kit's shell
  needs a `.ui-list` in the page; an empty hidden one is there now).

## Waiting on the owner

- <nothing>

## Next

- Run the full checks in CI: the rules tests and most browser specs need the emulators (only the roster smoke spec ran here).
- Try it on the real data: enter the people, leave and lists for one month and week, compare the output with the hand-made
  sheet, then tune the fairness weights and the post-call rule (AM or whole day).
- Missing for real use: a list that stays short is reported, not solved (no locum or swap suggestion); no import from the old
  sheet; no swap requests between juniors; no notification; the Excel layout is checked only against its unit tests, not
  opened in Excel. Undecided: whether a public holiday on a weekend counts for calls; extend the holiday table when the
  ministry publishes 2028.
- The held-conflict browser test for lists is not ported yet; recipes and the static flavour still carry the sample Tasks app.

## Decisions (dated)

- 2026-11-07 improvement rounds (all merged, PR numbers on this repo):
  - #27 Week's editing code loads on first use (viewers skip it); every save uses the current week; Undo on grid edits, list
    changes and Build.
  - #28 Undo after Delete (people, lists, leave, requests) and after Make calls or a day's call edit.
  - #29 Cancel or Esc on a sheet no longer re-runs the last Save or Delete; built weeks keep "run by another team"; sheet hints
    reach screen readers.
  - #30 Leave and request sheets warn when new leave clashes with a call or a built week (never blocks Save).
  - #26 Calls lists calls given to people off the roster; a problem line opens its day; the day sheet lists who is free.
  - #31 Calls > Settings suggests 2026 and 2027 Singapore public holidays and names mistyped holiday dates.
  - #32 Calls edits save onto the month as it is; "Release them" frees hand-set calls; other months' requests are ignored.
  - #35 "This is me" (Week > More) marks your name on Week and Calls and adds a My week card.
  - #37 Ctrl+P prints one clean week; Calls has a one-page landscape Print; day cards and the Calls month follow page width.
  - #33 Week flags juniors on a list while away, on call or post-call; says when the month's calls are not made; the Epic check
    saves only changed boxes.
  - #34 Leave tab: several request days at once, Who filter, month headings, names not on the roster tagged.
  - #36 Renaming a person carries their leave, requests and lists' consultant names (tick, with Undo).
  - #39 "Change for this week" no longer freezes a closure into the week; juniors left on a closed list are flagged and freed.
  - #41 Calls checks the month's last days against next month's calls; each calendar day reads its names to screen readers.
  - #43 Build again offers Keep my changes, Replace them or Cancel.
  - #38 Paste leave from the roster-info text on the Leave tab, with preview and one Undo.
  - #40 Week > More copies the day on screen, the next working day (holidays skipped) or the whole week for WhatsApp.
  - #42 On a phone Week opens at today's column; a viewer's own lists are marked; a first-time viewer picks their name.
  - #45 Make calls on a month with calls offers "Fix the problems only" (keeps every good call), "Make all new" or Cancel.
  - #47 Week: one-tap "Take off" on each clash and "Take them all off", one Undo.
  - #49 Make calls, Build week and Check against Epic wait until their data has loaded.
  - #44 Pasted leave in Oct to Dec reads January dates as next year (and Oct to Dec in Jan to Mar as last year).
  - #46 Week says when the Lists tab changed since the week was built, with Build again.
  - #48 Calls has Copy: the month's calls (or only yours) as WhatsApp text.
- 2026-11-06: the week builder puts a junior with a consultant of their own team, as its lowest rule (owner): only between
  people every other rule scores the same (`roster/week.js`). Laptop layout like Todo's (owner: "a proper tablet/desktop UI"):
  app-ui's wide side bar (`html[data-wide-side]`, 280 px, hide button) with the tabs' icons; from 840 px the week and the calls
  run wide and People, Lists and Leave lay their groups in columns; no menu button or "Off the tab bar" once the side bar shows.
  Calls now draws when first opened (it stayed blank until a change came).
- 2026-11-05: people have an optional free-text team ("Team 1"); People shows them by team (the default, owner) or by grade (a toggle anyone
  can use, kept on the device).

- 2026-11-04: the signed-out page is app-ui's `signInScreen` (app-ui rc.90): icon, name, one line, Continue with Google;
  Forget this device only while this phone keeps a copy.
