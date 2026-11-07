// The few edits a person makes by hand to the weekly grid (grid.js): move a junior to another list or to FREE, swap two,
// add, take off. Pure: every function returns a new list and leaves its input alone. Taken off a list loses the pin there.
import { listOf } from './grid.js';

/** @typedef {import('./grid.js').GridRow} GridRow */

/** takes a person off every list of that session @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} name @returns {GridRow[]} */
export const unplace = (rows, day, session, name) => rows.map(r => (r.day === day && r.session === session && r.juniors.includes(name)
  ? dropPin({ ...r, juniors: r.juniors.filter(n => n !== name) }, name) : r));

/** @param {GridRow} r @param {string} name @returns {GridRow} */
function dropPin(r, name) {
  const { pinned, ...rest } = r, keep = (pinned ?? []).filter(n => n !== name);
  return keep.length ? { ...rest, pinned: keep } : rest;
}

/**
 * Puts a person on a list (taking them off any other list that session). A list not in the grid yet gets its row.
 * @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} list @param {string} name @returns {GridRow[]}
 */
export function place(rows, day, session, list, name) {
  const next = unplace(rows, day, session, name);
  const at = next.findIndex(r => r.day === day && r.session === session && r.list === list);
  if (at < 0) return [...next, { day, session, list, juniors: [name] }];
  return next.map((r, i) => (i === at ? { ...r, juniors: [...r.juniors, name] } : r));
}

/**
 * Moves a person to another list (or to FREE with `to` null). With `swapWith`, that person goes to where the first one was
 * (their list, or FREE).
 * @param {GridRow[]} rows
 * @param {{ day: string, session: 'AM' | 'PM', name: string, to: string | null, swapWith?: string | null }} m
 * @returns {GridRow[]}
 */
export function move(rows, { day, session, name, to, swapWith = null }) {
  const from = listOf(rows, day, session, name);
  let next = unplace(rows, day, session, name);
  if (swapWith) {
    next = unplace(next, day, session, swapWith);
    if (from) next = place(next, day, session, from, swapWith);
  }
  return to ? place(next, day, session, to, name) : next;
}
