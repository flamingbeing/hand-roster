# Notes

Lasting decisions and how to test. Shaping decisions have their own records in [docs/decisions/](docs/decisions/).

## How to test

See README, "Tests". The browser tests share the `spaces/_/` data, so each test uses its own made-up accounts and list or person names
and checks only those; they run side by side.

## UI kit gestures and the `/kit/` gallery (app-ui)

The kit, its gallery and their tests live in [app-ui](https://github.com/flamingbeing/app-ui) since 1.0.0-rc.1
([decision 0011](docs/decisions/0011-ui-kit-served-from-app-ui.md)); this app pins one version. In short:

`@core/ui` has touch gestures (hold menu, select mode, sheets with detents, pushed screens with edge-swipe back,
shrinking tab bar, collapsing large title), each started only where its markup is. The gallery `/kit/` shows them all
on made-up data, signed out; its tests are listed in app-ui's [kit-tests.md](https://github.com/flamingbeing/app-ui/blob/main/docs/kit-tests.md) and run at 390, 820 and
1280 px. Stage notes: [ui-kit-progress.md](https://github.com/flamingbeing/app-ui/blob/main/docs/ui-kit-progress.md). Port rules: hold 500 ms within 10 px, the
lift's click swallowed; no gesture from fields, dialogs, sideways scrollers, drag handles or screen edges; the tab bar
never moves with a swipe; Still (this device) or Reduce Motion turns motion off. Layout parts (grid, stack, split,
toolbar, segmented, stepper) and the opt-in extra-dense level (never under 24 px) are on `/kit/dense/`; rules in
[ui-kit.md](https://github.com/flamingbeing/app-ui/blob/main/docs/ui-kit.md#layout-parts-and-extra-dense).

## The shell (app-ui 1.0.0-rc.13)

The sample page runs on the kit's shell (`.ui-shell`, tab pages, side bar, drawer) and `settingsScreen`; see the
new-app checklist, section 7. Known gaps, all for app-ui: the bar's start/end layout (`.bar-side`, `.bar-end`) is
hand-written in `app.css`; `adaptiveShell` needs a `.ui-pane-detail` even in an app with no detail pane (a hidden
placeholder here); the kit's current-tab colour is 4.1:1 in the navy look (`app.css` overrides it with `--link`); the
kit's bar is clear until the page scrolls, so the glass tests set `.is-collapsed`.

## Startup (cloud app)

What the page does before the list is there, measured at 4x CPU slowdown on a signed-in reload (hermetic core files, so
network latency is not in it): the shell starts first (tabs and menu work at once); the sign-in screen is shown only once
Firebase has restored the sign-in and says nobody is signed in (it used to flash on every start); a device that ended
signed in paints the list as last drawn, read-only, until the real list replaces it (`src/hint.js`, a yes/no and at most
100 rows, cleared whenever the sign-in says signed out); `modules.json` entries marked `"preload"` get a
`<link rel="modulepreload">` each (written by `node tools/modules.mjs`). Not here: lazy sheets (the starter has none;
an app with many gets them from its own module) and the Vite bundle (`npm run vite`, still opt-in).

## Later

- Restore from the bin (the bin entries keep the deleted version in `data`).
- Multi-group, email-link and passcode sign-in (app-devkit `custom-token.js`).
- Enforce the Content-Security-Policy (decision 0003).

## Held conflicts (app-sync 0.6.3)

`cloud.js` sets `backend.held` and `edits: '_edits'`: a same-field clash is held on the phone that made the save and
shown there as a side-by-side sheet (both versions, when in SGT, who and device); other phones see nothing to answer.
Choices are `app.resolve(c, 'mine' | 'theirs' | { field: … })`. Rules allow the `_edits` map on items.

## Files formats (`@core/files` v0, decision 0009; the `files` module, `node tools/add.mjs files`)

Kept on the device, so a change needs a new version and a test that the old one reads as empty (`files.unit.test.mjs`).

- Upload queue, `ctx.storage()` key `<name>:files/queue`: `{ v: 1, uid, jobs: Job[] }`, Job `{ id, scope, op: 'put' |
  'delete', parts: ['file', 'thumb'?], tries, at, stuck?, rec? }` (`app/public/files/queue.js` once the module is added). Another `v` reads as
  empty; an empty queue removes the key.
- Device cache, IndexedDB database `<name>-files`, store `blobs`: one Blob per key `<scope>/<id>` and
  `<scope>/<id>.thumb` (`app/public/files/cache.js`). Sign-out keeps both; a switch to another account wipes both.
- Worker: R2 bucket `<name>-files` bound as `FILES`, object key `<scope>/<id>[.thumb]` (`worker/files.js`).

## Settings (`@core/settings`)

`app/src/options.js` lists every option the app allows (scope `device` or `account`; new ones are off); nothing else can
be saved. Where values live (change these only with a migration; `settings.unit.test.mjs` checks the shapes):

- Device values: `ctx.storage('settings')` key `device` = `{ v: 1, values: { <key>: value } }` (stored as
  `settings:settings/device` in localStorage). Kept at sign-out, wiped on an account switch or forget.
- Account values: one sync record per person in the `settings` collection (`spaces/_/settings/<uid>`): one field per
  account option plus `profile`; `null` forgets a value. The local copy is `settings/account` = `{ uid, rec }`, used
  only while `uid` is the signed-in account.
- Rules: only the person writes their own doc (field list in `firestore.app.rules`: add each new account option there
  and in `options.js`); the group can read it, because a list listen cannot be proven to ask for one doc. Keep secrets
  out of options.
- The settings file (`kind: core-settings`, `version`) carries account options only.
- Decision: `@core/theme`'s per-device choice can later move onto settings (device scope, same storage shape); today it
  keeps its own storage, so adopting settings changes no theme file.

## Search (`@core/search`)

`createSearch({ fields, boost, store, operators, newest })` (`app/public/search/`) is an in-memory index over vendored
MiniSearch 7.2.0 (`app/public/vendor/minisearch/7.2.0/`, ESM build, types and LICENSE; its `package.json` only says
`"sideEffects": false` so a page that imports `parseQuery` alone carries none of MiniSearch). It holds no storage and
no module: build it at start, `feed` the list, and keep it current from the list watch (the sample tasks feed only records whose
text changed). Nothing is saved, so there is no format to migrate.

- Query syntax (`query.js`, ported from a working parser): words (all must match, prefix + fuzzy 0.2), `field:value`,
  `"phrase"`, `-word` / `-field:value`, `a OR b` / `a | b`. Operators the app names (`is:`, `has:`, `after:`) are
  callbacks on the record and run as filters; a near miss of a field or operator name is searched as text and returned
  in `unknown` for a "did you mean" line. A query with no words (only filters, phrases or leave-outs) lists matches
  newest first (`newest(record)`, default `updatedAt`).
- Later: a `toJSON`/`loadJSON` cache of the index (rebuild at start is cheap below ~10k records).

## Export: one layout, five outputs

`roster/layout.js` builds a week as blocks (a session at a site, each on-call tier, leave, post-call, free), each with its
lines per day. `coreRows` lays them out like the CORE sheet (DEPARTMENTS column, a header row then a row per junior);
`handSections` stacks them one row per section like the hand-made grid (headers "Consultant SITE List rooms - patients");
`whatsapp.js` reads the same blocks for a day or the week. `xlsx.js` takes ExcelJS as a parameter (so tests load the vendored file in node
and read the workbook back); `screens/export.js` loads ExcelJS with a script tag on first use (`script-src 'self'` allows it),
saves the file through a blob link, draws the print sheet into `#week-print-sheet` (shown only in print, replacing the view
on screen once drawn; Ctrl+P re-draws it through `beforeprint` once the code is in: a button loads it, a laptop loads it when
first idle) and copies text. Calls prints its month on its own (`html[data-print="calls"]`, set by its Print or by Ctrl+P on
that tab); without it the print CSS prints the Week.

- ExcelJS is the browser build from the owner's other roster app (MIT, licence beside it); never edit the vendored file.
- No PDF library: the print sheet is HTML and CSS (`@page` A4 landscape) and the browser saves it as PDF.
- Post-call in the sheet follows the engine: the PM only; FREE is shown once the week is built.
- `handGrid` (layout.js) lays the week out as the roster maker's own workbook, cell by cell: title, day names and dates,
  the AM lists (two rows per list: coloured header, then names joined " + "), Skills, Research, AM free, leave, two grey
  gap rows, the PM lists, post call, Research, PM free, leave with its half, on call. Beside it the same formulas she
  uses, written live with their results filled in: a per-person tally (T..AC: `SUMPRODUCT(--ISNUMBER(SEARCH(" "&$T4&" ",
  " "&SUBSTITUTE(range,","," ")&" ")))` over the rows of each kind) and an "accounted for everyone" check per day and
  half (H..M: occurrences of " name " in the half minus those marked with the other half). The spaces around the name
  keep "Jo" from matching "Joe"; the check counts case-sensitively, as hers does. Ranges are read from the rows
  the lists took, so they stay right when lists change. Not reproduced: short names, "KIV" and "with" notes, times,
  two lists in one cell, an emergency-OT column (no such list kind; left blank).
- A list's consultant, patients, juniors needed and status can be changed for one week from the pencil on its card
  (an override in the week; "Back to the usual" removes it). Patients show as "(21 pts)" in the hand grid always, and in
  the print when the patient-numbers option is on.

## Rule cards and app-roster (7 Nov 2026)

- Every rule the week builder and the call maker keep is a card in app-roster's rule shape (`app/src/roster/rule-cards.js`,
  `DEFAULT_RULES`): `{ id, type, words, level, priority, tags, on, params, topic, fixed }`. A maker's saved copy lives in
  `spaces/_/rules/{id}` (the same id replaces the default; `rulesOf`); makers write, viewers read (Firestore rules + rules test).
- The builders keep their own seeded method (`buildWeek`, `solveCalls`) and read their settings from the cards
  (`weekRules`, `callRules`: points, post-call, asks, AM-to-PM, the call gap). The default cards give the same week and
  calls seed for seed (`app/test/rule-cards.unit.test.mjs`). `fixed` cards are always kept (not switchable yet).
- `app/src/roster/problem.js` turns a built week or month into app-roster's slot model (`weekProblem`, `callsProblem`), so
  `@core/roster`'s `score`, `check` and `candidates` read the same roster and cards; pinned at app-roster 0.1.0
  (devDependency + `modules.json` core; e2e copy in `e2e/fixtures/core/roster/`). The tests check that the package's
  score of a built week breaks only what the builder itself reports short.
- `tools/modules.mjs` and `tools/sw-files.mjs` carry app-starter#139's lines (app-roster as a core package, its imports
  precached) until the next template update.
