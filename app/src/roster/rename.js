// What a person's new name carries along. Leave, requests, lists, calls and weeks are keyed by the name, so without this a
// rename leaves them under the old one.
// Owner decision, 7 Nov 2026 (after #36): a rename changes the name everywhere, past months too, in one save:
// their leave and requests, the lists they lead (consultant, consultant2, consultant3), every month's calls (rosters: every
// tier, the calls set by hand included; `locked` holds only 'date|tier', so it needs no change) and every built week (the
// grid's juniors, the week's snapshot of its lists, its overrides). Before, calls and built weeks kept the old name as
// history and were then flagged "not on the roster". A roster's `problems` lines are left as they are: they are the last
// "Make calls" run's words, only put back by its Undo, and written afresh by the next run.
// Undo reverses all of it, spot by spot (undoPatch). Pure: the People sheet saves the patches.
import { TIERS } from './model.js';

/** the list fields that hold a consultant's name */
export const CONSULTANT_KEYS = /** @type {const} */ (['consultant', 'consultant2', 'consultant3']);
/** the kinds of record a rename changes, in the order the plan says them */
export const RENAMED = /** @type {const} */ (['leave', 'requests', 'lists', 'rosters', 'weeks']);

/** @typedef {typeof RENAMED[number]} Renamed */
/** @template R @typedef {[R, Record<string, unknown>][]} Patches  each row with the fields to change on it */
/** @typedef {{ id: string, _deleted?: boolean } & Record<string, any>} AnyRow */
/** @typedef {{ leave: Patches<any>, requests: Patches<any>, lists: Patches<any>, rosters: Patches<any>, weeks: Patches<any> }} Plan */

/**
 * One row renamed: the fields that change and the spots in it that held the old name (`only`: change only these spots).
 * A whole array field is patched (a month's calls, a week's grid), as the data modules save a field whole.
 * @param {Renamed} kind @param {AnyRow} row @param {string} from @param {string} to @param {Set<string>} [only]
 * @returns {{ patch: Record<string, unknown>, spots: string[] } | null}  null when nothing in the row changes
 */
export function renameRow(kind, row, from, to, only) {
  /** @type {string[]} */
  const spots = [];
  /** @param {string} spot @param {unknown} v */
  const hit = (spot, v) => v === from && (!only || only.has(spot)) && !!spots.push(spot);
  /** @type {Record<string, unknown>} */
  const patch = {};
  if (kind === 'leave' || kind === 'requests') {
    if (hit('name', row.name)) patch.name = to;
  } else if (kind === 'lists') {
    for (const k of CONSULTANT_KEYS) if (hit(k, row[k])) patch[k] = to;
  } else if (kind === 'rosters') {
    /** @param {Record<string, any>} c */
    const calls = (Array.isArray(row.calls) ? row.calls : []).map(c => {
      const out = { ...c };
      for (const t of TIERS) if (hit(`calls|${c.date}|${t}`, c[t])) out[t] = to;
      return out;
    });
    if (spots.length) patch.calls = calls;
  } else {
    /** @param {string} field @param {(r: Record<string, any>) => Record<string, any>} one */
    const each = (field, one) => {
      if (!Array.isArray(row[field])) return;
      const before = spots.length;
      const next = row[field].map(one);
      if (spots.length > before) patch[field] = next;
    };
    each('grid', g => {
      const spot = `grid|${g.day}|${g.session}|${g.list}`;
      return Array.isArray(g.juniors) && g.juniors.some((/** @type {unknown} */ n) => n === from) && hit(spot, from)
        ? { ...g, juniors: g.juniors.map((/** @type {unknown} */ n) => (n === from ? to : n)) } : g;
    });
    /** @param {string} at @returns {(r: Record<string, any>) => Record<string, any>} */
    const consultants = at => r => {
      const out = { ...r };
      for (const k of CONSULTANT_KEYS) if (hit(`${at}|${r.id}|${r.day ?? ''}|${k}`, r[k])) out[k] = to;
      return out;
    };
    each('lists', consultants('lists'));
    each('overrides', consultants('overrides'));
  }
  return spots.length ? { patch, spots } : null;
}

/**
 * The rows a rename changes, and how: exact name match only, deleted rows left alone.
 * @param {{ from: string, to: string, leave: AnyRow[], requests: AnyRow[], lists: AnyRow[], rosters?: AnyRow[], weeks?: AnyRow[] }} o
 * @returns {Plan}
 */
export function renamePlan({ from, to, ...rows }) {
  const name = (to ?? '').trim();
  /** @type {any} */
  const plan = Object.fromEntries(RENAMED.map(kind => [kind, !from || !name || from === name ? [] : (rows[kind] ?? []).filter(r => !r._deleted).flatMap(r => {
    const did = renameRow(kind, r, from, name);
    return did ? [[r, did.patch]] : [];
  })]));
  return plan;
}

/**
 * The undo of one row's rename, on the row as it is by then: the old name back only on the spots the rename changed, and
 * only where the new name still stands (a call or a junior changed since is left alone). null: nothing to put back.
 * @param {Renamed} kind @param {AnyRow} was  the row before the rename @param {AnyRow} now @param {string} from @param {string} to
 * @returns {Record<string, unknown> | null}
 */
export function undoPatch(kind, was, now, from, to) {
  const did = renameRow(kind, was, from, to);
  return did ? renameRow(kind, now, to, from, new Set(did.spots))?.patch ?? null : null;
}

/** @param {Record<Renamed, unknown[]>} plan @returns {number} rows it changes */
export const planSize = plan => RENAMED.reduce((n, kind) => n + (plan[kind]?.length ?? 0), 0);

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');

/**
 * The plan in words: '3 leave, 2 requests, 1 month of calls and 4 built weeks' ('' when it changes nothing).
 * @param {Partial<Record<Renamed, unknown[]>>} plan
 */
export function planText(plan) {
  const n = (/** @type {Renamed} */ kind) => plan[kind]?.length ?? 0;
  const parts = [
    n('leave') ? `${n('leave')} leave` : '',
    count(n('requests'), 'request', 'requests'),
    count(n('lists'), 'list', 'lists'),
    count(n('rosters'), 'month of calls', 'months of calls'),
    count(n('weeks'), 'built week', 'built weeks'),
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}
