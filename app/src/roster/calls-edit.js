// Hand edits to a month's calls, the day sheet's choices, and what to do with the solver's answer. Pure.
import { solveCalls } from './calls.js';
import { addDays, diffDays, shortDay, weekdayName } from './dates.js';
import { TIERS, TIER_LABEL, callRowsOf, callMapOf, canTake, leaveIndex } from './model.js';

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
 * What "Fix the problems only" keeps when the calls are made again: every call set by hand, and every other call of the month
 * the check does not name as a problem. The rest (the problem calls, and the empty tiers, which are free anyway) is for the
 * solver to fill. A call set by hand stays even when it is a problem, as it does today (7 Nov 2026).
 * @param {string} month 'YYYY-MM' (rows of other months are left out) @param {CallDay[]} calls @param {string[]} locked
 * @param {{ problems: { date: string, tier: Tier }[] }} check the month's checkCalls answer
 * @returns {import('./model.js').CallMap}
 */
export function keepGoodCalls(month, calls, locked, check) {
  const bad = new Set(check.problems.map(p => lockKey(p.date, p.tier)));
  /** @type {import('./model.js').CallMap} */
  const out = {};
  for (const [date, row] of Object.entries(callMapOf(calls))) {
    if (!date.startsWith(`${month}-`)) continue;
    for (const t of TIERS) {
      const name = row?.[t];
      if (name && !bad.has(lockKey(date, t))) (out[date] ??= {})[t] = name;
    }
  }
  for (const [date, row] of Object.entries(lockedMap(locked, calls))) {
    if (date.startsWith(`${month}-`)) out[date] = { ...out[date], ...row };
  }
  return out;
}

/**
 * "Fix the problems only": the solver fills the freed calls and keeps the rest. Owner, 7 Nov 2026: the clear-days rule holds
 * here as in Make all new, across the month's ends (against next month's calls once made, as last month's) and within it.
 * When the kept calls box a freed one in, so it could only be filled by breaking the rule, the kept calls within minGap days
 * of each problem day (never those set by hand) are freed too and the month solved again, twice as far the next round (three
 * rounds at most), taken only when it leaves fewer broken rules. Whatever still breaks one is reported as a problem.
 * @param {import('./calls.js').SolveOptions} o the month's solver options, without `locked`
 * @param {import('./model.js').CallMap} keep keepGoodCalls's answer
 * @param {import('./model.js').CallMap} hand the calls set by hand (lockedMap): they never move
 * @returns {{ result: import('./calls.js').SolveResult, moved: number }} moved: how many kept calls went to someone else
 */
export function fixCalls(o, keep, hand) {
  const minGap = Math.max(1, o.minGap ?? 2);
  let best = solveCalls({ ...o, locked: keep });
  for (let round = 1; round <= 3; round++) {
    const bad = best.problems.filter(p => p.rule === 'gap' || p.rule === 'double' || p.rule === 'unfilled');
    if (!bad.length) break;
    const reach = minGap * round;
    /** @type {Set<string>} */
    const near = new Set();
    for (const p of bad) for (let k = -reach; k <= reach; k++) near.add(addDays(p.date, k));
    /** @type {import('./model.js').CallMap} */
    const locked = {};
    for (const [date, row] of Object.entries(keep)) {
      for (const t of TIERS) {
        const name = row?.[t];
        if (name && (!near.has(date) || hand[date]?.[t])) (locked[date] ??= {})[t] = name;
      }
    }
    const next = solveCalls({ ...o, locked });
    if (next.cost.hard < best.cost.hard) best = next;
  }
  let moved = 0;
  for (const [date, row] of Object.entries(keep)) for (const t of TIERS) if (row?.[t] && best.assignments[date]?.[t] !== row[t]) moved++;
  return { result: best, moved };
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
 * The gap is the solver's: another call within `minGap` days, the month before (`prior`) and after (`after`) counted. The one holding the
 * call now stays a choice even when off the roster. Values are the plain names.
 * @param {{ date: string, tier: Tier, people: import('./model.js').Person[], calls: CallDay[], prior?: import('./model.js').CallMap, after?: import('./model.js').CallMap,
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
  for (const [date, row] of [...Object.entries(o.prior ?? {}), ...Object.entries(callMapOf(o.calls)), ...Object.entries(o.after ?? {})]) {
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

/**
 * What a day of the Calls calendar reads aloud (its label replaces what is inside, so the names, the bold of a call set by
 * hand and the wavy line of a problem are said as words): 'Mon 2 Nov: CON Dr Ann Test (set by hand), REG Dr Bo Test (problem),
 * MO (NUH) nobody.'
 * @param {string} date @param {boolean} ph a public holiday
 * @param {{ t: Tier, name: string | null, bad: boolean, hand: boolean }[]} tiers
 * @returns {string}
 */
export const dayLabel = (date, ph, tiers) => `${weekdayName(date)} ${shortDay(date)}${ph ? ', public holiday' : ''}: ${tiers.length
  ? tiers.map(x => `${TIER_LABEL[x.t]} ${x.name ?? 'nobody'}${x.bad ? ' (problem)' : ''}${x.hand ? ' (set by hand)' : ''}`).join(', ')
  : 'no calls'}.`;
