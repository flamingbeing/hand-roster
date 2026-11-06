// The weekly grid as stored: a flat list of rows, one per list per session ({ day, session, list, juniors }), and the few
// edits a person makes by hand (move a junior to another list or to FREE, swap two, add, take off). Pure: every function
// returns a new list and leaves its input alone.

/** @typedef {{ day: string, session: 'AM' | 'PM', list: string, juniors: string[] }} GridRow */

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
  ? { ...r, juniors: r.juniors.filter(n => n !== name) } : r));

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
