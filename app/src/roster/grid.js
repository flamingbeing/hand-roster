// The weekly grid as stored: a flat list of rows, one per list per session ({ day, session, list, juniors }), and the few
// edits a person makes by hand (move a junior to another list or to FREE, swap two, add, take off). Pure: every function
// returns a new list and leaves its input alone. A row's `pinned` are those of its juniors Build again always keeps there
// (owner 7 Nov 2026): kept in the row, so a junior taken off loses their pin with their place.

/** @typedef {{ day: string, session: 'AM' | 'PM', list: string, juniors: string[], pinned?: string[] }} GridRow */
/** @typedef {{ person: string, list: string, day: string, session: 'AM' | 'PM' }} Pin */

/** @param {Record<string, Record<'AM' | 'PM', { list: string, juniors: string[] }[]>>} grid  buildWeek's grid @returns {GridRow[]} */
export function gridRows(grid) {
  /** @type {GridRow[]} */
  const out = [];
  for (const day of Object.keys(grid).sort()) for (const session of /** @type {const} */ (['AM', 'PM'])) {
    for (const p of grid[day]?.[session] ?? []) out.push({ day, session, list: p.list, juniors: [...p.juniors] });
  }
  return out;
}

/** a week is built once it has a grid; an empty grid with no build time is a build undone @param {{ grid?: unknown[], built?: number } | undefined} wk */
export const weekBuilt = wk => Array.isArray(wk?.grid) && (wk.grid.length > 0 || !!wk.built);

/** @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} list @returns {string[]} */
export const juniorsOn = (rows, day, session, list) => rows.find(r => r.day === day && r.session === session && r.list === list)?.juniors ?? [];

/** @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} name @returns {string | null} the list id the person is on, or null */
export const listOf = (rows, day, session, name) => rows.find(r => r.day === day && r.session === session && r.juniors.includes(name))?.list ?? null;

/** takes a person off every list of that session @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} name @returns {GridRow[]} */
export const unplace = (rows, day, session, name) => rows.map(r => (r.day === day && r.session === session && r.juniors.includes(name)
  ? tidy({ ...r, juniors: r.juniors.filter(n => n !== name), pinned: r.pinned?.filter(n => n !== name) }) : r));

/** a row without an empty or stale `pinned` (only juniors on the row can be pinned) @param {GridRow} r @returns {GridRow} */
function tidy(r) {
  const { pinned, ...rest } = r;
  const keep = (pinned ?? []).filter(n => r.juniors.includes(n));
  return keep.length ? { ...rest, pinned: keep } : rest;
}

/** @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} list @param {string} name @returns {boolean} */
export const isPinned = (rows, day, session, list, name) => !!rows.find(r => r.day === day && r.session === session && r.list === list)?.pinned?.includes(name);

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
