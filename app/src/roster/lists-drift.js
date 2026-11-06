// How far a built week's own copy of the lists is from the Lists tab now. A built week is drawn from the lists as they
// were built, so a list edited, added or deleted on the Lists tab later does not show there until it is built again.
// Both sides are unsettled (leave, holidays and the Epic check's flags are laid on when shown), so those flags are left out.
// Pure: no page. Loaded with the maker's edit code (screens/week-edit.js), never on the first screen.

/** @typedef {import('./model.js').ListSlot} ListSlot */

/** the fields a list is drawn and built from */
const FIELDS = /** @type {const} */ (['site', 'kind', 'name', 'day', 'session', 'consultant', 'consultant2', 'consultant3', 'status', 'need', 'rooms', 'patients']);

/** @param {unknown} v @returns {unknown} undefined, null and '' are all "none" */
const none = v => (v === undefined || v === null || v === '' ? null : v);

/** @param {ListSlot} l @returns {number} its minimum after the default (as model.js minOf, not imported: it stays small) */
const minOf = l => Math.min(l.need ?? 0, l.min ?? ((l.need ?? 0) > 0 ? 1 : 0));

/** @param {ListSlot} a @param {ListSlot} b @returns {boolean} */
const same = (a, b) => FIELDS.every(k => none(a[k]) === none(b[k])) && minOf(a) === minOf(b) && !a.external === !b.external;

/**
 * The lists that differ, by id.
 * @param {ListSlot[]} stored  the week's lists as built @param {ListSlot[]} fresh  slotsFor the Lists tab now, with the week's changes
 * @returns {{ added: ListSlot[], removed: ListSlot[], changed: ListSlot[] }}  added and changed as they are now, removed as built
 */
export function listsDrift(stored, fresh) {
  const was = new Map(stored.map(l => [l.id, l]));
  const now = new Set(fresh.map(l => l.id));
  return {
    added: fresh.filter(l => !was.has(l.id)),
    removed: stored.filter(l => !now.has(l.id)),
    changed: fresh.filter(l => { const w = was.get(l.id); return !!w && !same(w, l); }),
  };
}
