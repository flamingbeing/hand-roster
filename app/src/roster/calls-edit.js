// Hand edits to a month's calls, the day sheet's choices, and what to do with the solver's answer. Pure.
import { diffDays } from './dates.js';
import { TIERS, callRowsOf, callMapOf, canTake, leaveIndex } from './model.js';

/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').Tier} Tier */

/** @param {string} date @param {Tier} tier @returns {string} the key a hand edit is locked under */
export const lockKey = (date, tier) => `${date}|${tier}`;

/**
 * Sets (or empties, name null) one call. Returns the new rows and the locked list: a call a person set by hand is locked, so
 * "Make calls" keeps it; emptying one unlocks it.
 * @param {CallDay[]} calls @param {string[]} locked @param {string} date @param {Tier} tier @param {string | null} name
 * @returns {{ calls: CallDay[], locked: string[] }}
 */
export function setCall(calls, locked, date, tier, name) {
  const map = callMapOf(calls);
  map[date] = { ...(map[date] ?? {}), [tier]: name };
  const key = lockKey(date, tier);
  const keep = locked.filter(k => k !== key);
  return { calls: callRowsOf(map), locked: name ? [...keep, key] : keep };
}

/**
 * A day sheet's save, laid onto the month as it is now. Only the tiers the person changed in the sheet are set (`before` is
 * what the sheet opened with, `after` what it saves), so a call someone else set while the sheet was open stays: another
 * day's, or a tier of this day the person left alone.
 * @param {CallDay[]} calls the month's calls now @param {string[]} locked the month's locked list now @param {string} date
 * @param {Partial<Record<Tier, string | null>>} before @param {Partial<Record<Tier, string | null>>} after
 * @returns {{ calls: CallDay[], locked: string[] }}
 */
export function applyDayEdit(calls, locked, date, before, after) {
  let state = { calls, locked };
  for (const t of TIERS) {
    if (!(t in after)) continue;
    const name = after[t] || null;
    if (name !== (before[t] || null)) state = setCall(state.calls, state.locked, date, t, name);
  }
  return state;
}

/** @param {string[]} locked @param {CallDay[]} calls @returns {number} how many calls are set by hand (locked and holding a name) */
export const handCount = (locked, calls) => Object.values(lockedMap(locked, calls)).reduce((n, row) => n + Object.values(row).filter(Boolean).length, 0);

/** @param {string[]} locked @returns {import('./model.js').CallMap} the locked entries, with the names from `calls` @param {CallDay[]} calls */
export function lockedMap(locked, calls) {
  const map = callMapOf(calls);
  /** @type {import('./model.js').CallMap} */
  const out = {};
  for (const k of locked) {
    const [date, tier] = k.split('|');
    const name = map[date]?.[/** @type {Tier} */ (tier)];
    if (name) (out[date] ??= {})[/** @type {Tier} */ (tier)] = name;
  }
  return out;
}

/**
 * The month's rows from a solver answer, laid over the other months' rows already stored (they stay).
 * @param {CallDay[]} others calls outside the month @param {import('./model.js').CallMap} assignments @returns {CallDay[]}
 */
export const mergeCalls = (others, assignments) => [...others, ...callRowsOf(assignments)].sort((a, b) => a.date.localeCompare(b.date));

/** @param {{ date: string, tier: Tier, text: string }[]} problems @returns {string[]} problems as short lines for the roster document */
export const problemLines = problems => problems.slice(0, 60).map(p => p.text.slice(0, 160));

/**
 * The day sheet's choices for one tier: 'Nobody', then who may take it, free people first (those who asked for the day
 * ahead of the rest), each with their calls this month and why they may not be free, as 'Dr Ann Test · 3 calls (on leave)'.
 * The gap is the solver's: another call within `minGap` days, the month before (`prior`) counted. The one holding the
 * call now stays a choice even when off the roster. Values are the plain names.
 * @param {{ date: string, tier: Tier, people: import('./model.js').Person[], calls: CallDay[], prior?: import('./model.js').CallMap,
 *   leave?: import('./model.js').Leave[], requests?: import('./model.js').CallRequest[], minGap?: number, current?: string | null }} o
 * @returns {[string, string][]}
 */
export function callChoices(o) {
  const minGap = Math.max(1, o.minGap ?? 2);
  const lv = leaveIndex(o.leave ?? []);
  const month = o.date.slice(0, 7);
  /** @type {Map<string, number>} */
  const total = new Map();
  /** @type {Map<string, number>} days from this date to the person's nearest other call (this slot left out) */
  const near = new Map();
  for (const [date, row] of [...Object.entries(o.prior ?? {}), ...Object.entries(callMapOf(o.calls))]) {
    for (const t of TIERS) {
      const name = row?.[t];
      if (!name) continue;
      if (date.startsWith(month)) total.set(name, (total.get(name) ?? 0) + 1);
      if (date === o.date && t === o.tier) continue;
      const d = diffDays(o.date, date);
      const was = near.get(name);
      if (Math.abs(d) <= minGap && (was === undefined || Math.abs(d) < Math.abs(was))) near.set(name, d);
    }
  }
  const reqs = (o.requests ?? []).filter(r => r.date === o.date);
  /** @param {string} name @param {string[]} notes */
  const label = (name, notes) => { const n = total.get(name) ?? 0; return `${name} · ${n} call${n === 1 ? '' : 's'}${notes.length ? ` (${notes.join(', ')})` : ''}`; };
  const rows = o.people.filter(p => canTake(p, o.tier)).map(p => {
    const notes = [];
    if (lv.blocks(p.name, o.date)) notes.push('on leave');
    if (reqs.some(r => r.name === p.name && r.type === 'cannot')) notes.push('asked not to');
    const d = near.get(p.name);
    if (d !== undefined) notes.push(d === 0 ? 'on call that day' : `on call ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ${d < 0 ? 'before' : 'after'}`);
    const busy = notes.length > 0;
    const wants = reqs.some(r => r.name === p.name && r.type === 'want' && (!r.tier || r.tier === o.tier));
    if (wants) notes.push('wants this day');
    return { name: p.name, rank: busy ? 2 : wants ? 0 : 1, text: label(p.name, notes) };
  }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  /** @type {[string, string][]} */
  const out = [['', 'Nobody'], ...rows.map(r => /** @type {[string, string]} */ ([r.name, r.text]))];
  if (o.current && !rows.some(r => r.name === o.current)) out.push([o.current, label(o.current, ['not on the roster for this'])]);
  return out;
}
