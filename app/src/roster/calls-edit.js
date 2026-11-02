// Hand edits to a month's calls and what to do with the solver's answer. Pure.
import { callRowsOf, callMapOf } from './model.js';

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
