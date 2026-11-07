// Pins on the week grid (owner 7 Nov 2026): a row's `pinned` juniors are kept there by Build again. Apart from grid.js
// so the first screen loads less: only the maker's edits (screens/week-edit.js) use these.

/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {{ person: string, list: string, day: string, session: 'AM' | 'PM' }} Pin */

/** a row without an empty or stale `pinned` (only juniors on the row can be pinned) @param {GridRow} r @returns {GridRow} */
function tidy(r) {
  const { pinned, ...rest } = r;
  const keep = (pinned ?? []).filter(n => r.juniors.includes(n));
  return keep.length ? { ...rest, pinned: keep } : rest;
}

/**
 * Pins (on) or unpins a junior on the list they are on; nobody else changes.
 * @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} list @param {string} name @param {boolean} on @returns {GridRow[]}
 */
export const pin = (rows, day, session, list, name, on) => rows.map(r => (r.day === day && r.session === session && r.list === list && r.juniors.includes(name)
  ? tidy({ ...r, pinned: on ? [...new Set([...(r.pinned ?? []), name])] : r.pinned?.filter(n => n !== name) }) : r));

/** every pin in a grid @param {GridRow[]} rows @returns {Pin[]} */
export const pinsOf = rows => rows.flatMap(r => (r.pinned ?? []).filter(n => r.juniors.includes(n)).map(person => ({ person, list: r.list, day: r.day, session: r.session })));

/** a new grid with these pins marked where the person is on that list (a pin the grid could not keep is left out) @param {GridRow[]} rows @param {Pin[]} pins @returns {GridRow[]} */
export const withPins = (rows, pins) => pins.reduce((acc, p) => pin(acc, p.day, p.session, p.list, p.person, true), rows);


/** a refill's keep (buildWeek `keep`): every placement on the grid that is not a pin @param {GridRow[]} rows @returns {Pin[]} */
export const keepOf = rows => rows.flatMap(r => r.juniors.filter(n => !r.pinned?.includes(n)).map(person => ({ person, list: r.list, day: r.day, session: r.session })));

/** how many list-sessions a new grid fills differently (anyone on or off) @param {GridRow[]} was @param {GridRow[]} now */
export function changedRows(was, now) {
  const key = (/** @type {GridRow} */ r) => `${r.day}|${r.session}|${r.list}`;
  const before = new Map(was.map(r => [key(r), [...r.juniors].sort().join('\n')]));
  const seen = new Set();
  let n = 0;
  for (const r of now) { seen.add(key(r)); if ((before.get(key(r)) ?? '') !== [...r.juniors].sort().join('\n')) n++; }
  for (const r of was) if (!seen.has(key(r)) && r.juniors.length) n++;
  return n;
}
