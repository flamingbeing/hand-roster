// The sections around a week's grid, worked out from the grid and the inputs each time they are shown: who is on leave,
// post-call, on call and free each day, what each list is short of, and why a placement is a problem. The same rules as
// buildWeek (week.js), so a hand-edited grid is judged the way a built one was. Also here: picking the parts of the stored
// months that a week or a month needs (callsAround, monthCells, ...). Pure.
import { addDays, rangeDays, mondayOf, monthDays } from './dates.js';
import { callMapOf, callRow, isJunior, leaveIndex, TIERS } from './model.js';
import { minOf } from './settle.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {{ name: string, when: 'AM' | 'PM' | 'FULL DAY', why?: string }} FreeEntry */
/** @typedef {{ list: string, day: string, session: 'AM' | 'PM', need: number, min: number, got: number, noReg?: boolean }} Gap  noReg: an emergency slot with no registrar */

/**
 * `short` holds the lists below their minimum (the Short panel), `under` the ones with fewer than they want (not counting
 * an emergency slot's MO). On a public holiday nobody is listed as free.
 * @param {{ monday: string, people: Person[], leave: Leave[], calls: CallDay[], lists: ListSlot[], grid: GridRow[], postCallAm?: boolean, holidays?: string[] }} o
 * @returns {{ days: string[], leave: Record<string, string[]>, postCall: Record<string, string[]>, onCall: Record<string, Record<string, string | null>>,
 *   free: Record<string, FreeEntry[]>, short: Gap[], under: Gap[] }}
 */
export function sectionsOf({ monday, people, leave, calls, lists, grid, postCallAm = true, holidays = [] }) {
  const days = rangeDays(monday, addDays(monday, 4));
  const lv = leaveIndex(leave);
  const map = callMapOf(calls);
  const juniors = people.filter(isJunior);
  const names = new Set(juniors.map(p => p.name));
  /** @param {string} day @returns {string[]} */
  const callers = day => TIERS.map(t => map[day]?.[t]).filter(/** @returns {n is string} */ n => !!n);

  /** @type {Record<string, string[]>} */ const leaveOut = {};
  /** @type {Record<string, string[]>} */ const postCall = {};
  /** @type {Record<string, Record<string, string | null>>} */ const onCall = {};
  /** @type {Record<string, FreeEntry[]>} */ const free = {};
  for (const day of days) {
    const prev = callers(addDays(day, -1)), today = callers(day);
    onCall[day] = Object.fromEntries(TIERS.map(t => [t, map[day]?.[t] ?? null]));
    postCall[day] = prev.filter(n => names.has(n));
    leaveOut[day] = people.filter(p => lv.blocks(p.name, day)).map(p => p.name).sort();
    free[day] = [];
    if (holidays.includes(day)) continue;
    for (const p of juniors) {
      if (lv.full(p.name, day)) continue;
      if (today.includes(p.name)) { free[day].push({ name: p.name, when: 'FULL DAY', why: 'on call' }); continue; }
      const open = /** @type {('AM' | 'PM')[]} */ (['AM', 'PM']).filter(s => !grid.some(r => r.day === day && r.session === s && r.juniors.includes(p.name))
        && !lv.blocks(p.name, day, s) && !(prev.includes(p.name) && (s === 'PM' || !postCallAm)));
      if (open.length === 2) free[day].push({ name: p.name, when: 'FULL DAY' });
      else if (open.length === 1) free[day].push({ name: p.name, when: open[0] });
    }
    free[day].sort((a, b) => a.name.localeCompare(b.name));
  }
  const regs = new Set(people.filter(p => p.grade === 'reg').map(p => p.name));
  /** @type {Gap[]} */ const short = [];
  /** @type {Gap[]} */ const under = [];
  for (const l of lists) {
    if (l.need <= 0 || l.status !== 'open') continue;
    const on = grid.find(r => r.day === l.day && r.session === l.session && r.list === l.id)?.juniors ?? [], got = on.length;
    /** @type {Gap} */
    const gap = { list: l.id, day: l.day, session: l.session, need: l.need, min: minOf(l), got };
    // an emergency slot must be led by a registrar, whoever else is on it
    if (l.emergency && !on.some(n => regs.has(n))) gap.noReg = true;
    if (got < gap.min || gap.noReg) short.push(gap);
    else if (got < l.need && !l.emergency) under.push(gap);
  }
  return { days, leave: leaveOut, postCall, onCall, free, short, under };
}

/**
 * Why putting a person on a list in a session is a problem, in words ([] when it is fine): leave, on call, post-call, or
 * already on another list that session. A hand edit may go ahead anyway; the sheet shows these as a warning.
 * @param {{ name: string, day: string, session: 'AM' | 'PM', leave: Leave[], calls: CallDay[], grid: GridRow[], list?: string | null, postCallAm?: boolean }} o
 * @returns {string[]}
 */
export function whyNot({ name, day, session, leave, calls, grid, list = null, postCallAm = true }) {
  const lv = leaveIndex(leave), map = callMapOf(calls);
  const out = [];
  if (lv.blocks(name, day, session)) out.push(`${name} is on leave then`);
  if (TIERS.some(t => map[day]?.[t] === name)) out.push(`${name} is on call that day`);
  if (TIERS.some(t => map[addDays(day, -1)]?.[t] === name) && (session === 'PM' || !postCallAm)) out.push(`${name} is post-call then`);
  const there = grid.find(r => r.day === day && r.session === session && r.juniors.includes(name) && r.list !== list);
  if (there) out.push(`${name} is already on another list that session`);
  return out;
}

// ---- the months a week or a month needs ----
/**
 * The calls that touch a week: the day before it (for post-call) to its Sunday, from whichever months' rosters hold them.
 * @param {{ id: string, calls?: CallDay[] }[]} rosters @param {string} monday @returns {CallDay[]}
 */
export function callsAround(rosters, monday) {
  const from = addDays(monday, -1), to = addDays(monday, 6);
  return rosters.flatMap(r => r.calls ?? []).filter(c => c.date >= from && c.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

/** @param {string} month YYYY-MM @returns {string} the month before */
export function monthBefore(month) { return shiftMonth(month, -1); }
/** @param {string} month YYYY-MM @param {number} n @returns {string} */
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** @param {string} day @returns {string} YYYY-MM */
export const monthOf = day => day.slice(0, 7);

/**
 * The month as calendar cells, Monday first: leading and trailing blanks are null.
 * @param {string} month @returns {(string | null)[]}
 */
export function monthCells(month) {
  const days = monthDays(month);
  const lead = (new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** @param {CallDay[]} calls @param {string} month @returns {import('./model.js').CallMap} the month's days of the rows, as the solver's `locked` or `prior` */
export function callMapIn(calls, month) {
  /** @type {import('./model.js').CallMap} */
  const out = {};
  for (const c of calls) if (c.date.startsWith(month)) out[c.date] = callRow(c);
  return out;
}
export { mondayOf };
