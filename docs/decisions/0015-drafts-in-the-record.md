# 0015: A week's or month's draft lives in its own record

Status: accepted (2026-11-07).

Decision: a week (`weeks`) or a month's calls (`rosters`) as viewers see it is the record's own fields; a roster maker's
working copy is the record's `draft` field, holding the same plan fields (`app/src/roster/drafts.js` `WEEK_PLAN`,
`MONTH_PLAN`), laid over them for makers only. Publish lays the draft over the record and sets `draft: null`; Back to draft
copies the record into a new draft; Discard draft sets `draft: null`. Builds and Make calls save into the draft; a hand
edit goes into the draft when there is one, else onto the record (a quick fix reaches viewers at once).

Why: viewers sync and read exactly as before (no new collection, no role-dependent listeners), and every week or month
made before drafts counts as published with no migration.

Cost: viewers' devices receive the draft with the record (Firestore rules can't hide a field), so a draft is hidden from
viewers by the app, not kept secret from them. A maker-only `drafts` collection would keep it from them but needs
listeners that differ by role; take that route only if drafts must be private.
