// A roster maker's edits to a week, as pure steps (screens/week-edit.js saves them). Each edit is worked out from the
// week as it is when it is saved, never from the copy a sheet opened with: a change another maker saved in between stays.
// Undo puts back the fields an edit changed, as they were just before it.
import { move, place } from './grid.js';

/** @typedef {import('./grid.js').GridRow} GridRow */
/**
 * @typedef {{ kind: 'move', day: string, session: 'AM' | 'PM', name: string, to: string | null, swapWith?: string | null }
 *   | { kind: 'add', day: string, session: 'AM' | 'PM', list: string, name: string }
 *   | { kind: 'clear', day: string, session: 'AM' | 'PM', list: string }} GridEdit
 *   move (to null: take off the list), add a junior, or take everyone off a list for that session
 */

/** @param {GridRow[]} rows  the grid as it is now @param {GridEdit} e @returns {GridRow[]} */
export function applyEdit(rows, e) {
  if (e.kind === 'add') return place(rows, e.day, e.session, e.list, e.name);
  if (e.kind === 'clear') return rows.map(r => (r.list === e.list && r.day === e.day && r.session === e.session ? { ...r, juniors: [] } : r));
  return move(rows, e);
}

/**
 * Lays changes over a week's list changes. Each is laid over the list's earlier change (a key set to undefined drops it);
 * null drops the list's change altogether.
 * @template {{ id: string }} O
 * @param {O[]} overrides  as they are now @param {[string, Record<string, unknown> | null][]} changes  list id, change
 * @returns {O[]}
 */
export function mergeOverrides(overrides, changes) {
  const by = new Map(overrides.map(o => [o.id, o]));
  for (const [id, c] of changes) {
    if (!c) { by.delete(id); continue; }
    /** @type {Record<string, unknown>} */
    const next = { ...by.get(id), ...c, id };
    for (const k of Object.keys(next)) if (next[k] === undefined || (k === 'away' && next[k] === false)) delete next[k];
    if (Object.keys(next).length > 1) by.set(id, /** @type {any} */ (next)); else by.delete(id);
  }
  return [...by.values()];
}

const NONE = /** @type {Record<string, unknown>} */ ({ grid: [], lists: [], overrides: [], seed: 0, built: 0 });

/**
 * The fields an edit is about to save, as the week has them now: what Undo saves back. A field the week did not have
 * comes back empty; a week with no grid comes back not built (an empty grid and no build time).
 * @param {Record<string, unknown> | undefined} wk  the week's row now @param {string[]} keys  the fields the edit saves
 * @returns {Record<string, unknown>}
 */
export function undoFields(wk, keys) {
  /** @type {Record<string, unknown>} */
  const was = Object.fromEntries(keys.filter(k => k in NONE).map(k => [k, wk?.[k] ?? NONE[k]]));
  if (keys.includes('grid') && !Array.isArray(wk?.grid)) was.built = 0;
  return was;
}

