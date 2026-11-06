// A roster maker's edits to a week, as pure steps (screens/week-edit.js saves them). Each edit is worked out from the
// week as it is when it is saved, never from the copy a sheet opened with: a change another maker saved in between stays.
// Undo puts back the fields an edit changed, as they were just before it.
import { juniorsOn, move, place } from './grid.js';
import { coOf, minOf } from './model.js';

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

/** several edits, each on the grid the one before left: saved as one, so one Undo puts them all back @param {GridRow[]} rows @param {GridEdit[]} edits @returns {GridRow[]} */
export const applyEdits = (rows, edits) => edits.reduce(applyEdit, rows);

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

/**
 * A list's change for this week from its sheet: only the fields typed differently from the list as it stands unsettled
 * (the template with the week's changes), so a field left alone never becomes a change. Never from the settled list: a
 * holiday, leave or no patients would be saved as closed with no juniors, and stay so once the reason went (7 Nov 2026).
 * A sharer the lead also is drops out; a minimum left as shown keeps whatever change the week has by then; an empty
 * number (patients aside) changes nothing.
 * @param {import('./model.js').ListSlot} raw  the list unsettled
 * @param {{ consultant?: string | null, consultant2?: string | null, consultant3?: string | null, patients?: number | null,
 *   need?: number | null, min?: number | null, status?: string, away?: boolean }} v  the sheet's values
 * @returns {Partial<import('../data/lists.js').Override>}
 */
export function listChange(raw, v) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const consultant = v.consultant || null;
  if (consultant !== (raw.consultant ?? null)) out.consultant = consultant;
  const [c2 = null, c3 = null] = coOf(consultant ?? '', v.consultant2, v.consultant3);
  if (c2 !== (raw.consultant2 ?? null)) out.consultant2 = c2;
  if (c3 !== (raw.consultant3 ?? null)) out.consultant3 = c3;
  const patients = v.patients ?? null;
  if (patients !== (raw.patients ?? null)) out.patients = patients;
  if (v.need != null && v.need !== raw.need) out.need = v.need;
  if (v.min != null && v.min !== minOf(raw)) out.min = v.min;
  if (v.status && v.status !== raw.status) out.status = v.status;
  if (!!v.away !== !!raw.away) out.away = !!v.away;
  return out;
}

/** @typedef {{ type: 'list-person', person: string, list: string, day: string, session: 'AM' | 'PM' }} Ask */

/**
 * Build again, keeping the hand edits: one ask per placement the grid has now that a build would not make (a junior moved
 * or added by hand). The ask names the list by id, so two lists of the same name never mix. Someone taken off a list
 * leaves no ask: the builder may place them again (7 Nov 2026).
 * @param {GridRow[]} builtRows  what the last build would make now @param {GridRow[]} rows  the grid as it is now
 * @returns {Ask[]}
 */
export function keptAsks(builtRows, rows) {
  /** @type {Ask[]} */
  const out = [];
  for (const r of rows) {
    const was = juniorsOn(builtRows, r.day, r.session, r.list);
    for (const person of r.juniors) if (!was.includes(person)) out.push({ type: 'list-person', person, list: r.list, day: r.day, session: r.session });
  }
  return out;
}

/** how many asks the new grid kept: the person is on that list then @param {Ask[]} asks @param {GridRow[]} rows @returns {number} */
export const keptCount = (asks, rows) => asks.filter(a => juniorsOn(rows, a.day, a.session, a.list).includes(a.person)).length;

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


// "Check against Epic" (screens/epic.js): a box per consultant and session, over that consultant's lists then.

/**
 * What a box says: the patients Epic has booked (a whole number 0 to 200), away (A or away, any case), or nothing typed
 * (keep the usual). null when it can't be read ('O', '1.5', '250'): never taken as "keep the usual", which would drop an away.
 * @param {string} text @returns {{ away: boolean, patients: number | undefined } | null}
 */
export function readEpicBox(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (t === 'a' || t === 'away') return { away: true, patients: undefined };
  if (!/^\d{0,3}$/.test(t) || Number(t) > 200) return null;
  return { away: false, patients: t ? Number(t) : undefined };
}

/**
 * The text a box opens with: A when a list is away; the patients when the lists agree; else empty (lists that differ
 * are left alone unless the box is typed in).
 * @param {{ away?: boolean, patients?: number | null }[]} lists @returns {string}
 */
export function epicBoxText(lists) {
  if (lists.some(l => l.away)) return 'A';
  const ps = new Set(lists.map(l => l.patients ?? null));
  const [p] = ps;
  return ps.size === 1 && p != null ? String(p) : '';
}

/**
 * The changes to save: only the boxes typed in (trimmed text not as it opened), so an untouched box keeps its lists' week
 * changes. `bad` names each box that can't be read ('Mon 9 AM, Dr Ann Test: type a number or A'); nothing is saved then.
 * @param {{ label: string, was: string, now: string, lists: string[] }[]} boxes  label: 'Mon 9 AM, Dr Ann Test'; lists: their ids
 * @returns {{ changes: [string, { away: boolean, patients: number | undefined }][], bad: string[] }}
 */
export function epicChanges(boxes) {
  /** @type {[string, { away: boolean, patients: number | undefined }][]} */
  const changes = [];
  /** @type {string[]} */
  const bad = [];
  for (const b of boxes) {
    const v = readEpicBox(b.now);
    if (!v) { bad.push(`${b.label}: type a number or A`); continue; }
    if (b.now.trim() !== b.was.trim()) for (const id of b.lists) changes.push([id, v]);
  }
  return { changes, bad };
}
