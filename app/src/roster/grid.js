// The weekly grid as stored: a flat list of rows, one per list per session ({ day, session, list, juniors, pinned? });
// `pinned`: juniors Build again keeps there (pins.js). Hand edits: grid-edits.js (off the startup path).

/** @typedef {{ day: string, session: 'AM' | 'PM', list: string, juniors: string[], pinned?: string[] }} GridRow */

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

/** @param {GridRow[]} rows @param {string} day @param {'AM' | 'PM'} session @param {string} list @param {string} name @returns {boolean} */
export const isPinned = (rows, day, session, list, name) => !!rows.find(r => r.day === day && r.session === session && r.list === list)?.pinned?.includes(name);
