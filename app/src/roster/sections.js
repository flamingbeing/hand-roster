// The sections around a week's grid, worked out from the grid and the inputs each time they are shown: who is on leave,
// post-call, on call and free each day, what each list is short of, and why a placement is a problem. The same rules as
// buildWeek (week.js), so a hand-edited grid is judged the way a built one was. Also here: picking the parts of the stored
// months that a week or a month needs (callsAround, monthCells, ...). Pure.
import { addDays, rangeDays, mondayOf, monthDays, weekday } from './dates.js';
import { callMapOf, callRow, conText, consOf, isJunior, worksOn, leads, leaveIndex, minOf, regLed, shutBy, TIERS } from './model.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {{ name: string, when: 'AM' | 'PM' | 'FULL DAY', why?: string }} FreeEntry */
/** @typedef {{ list: string, day: string, session: 'AM' | 'PM', need: number, min: number, got: number, noReg?: boolean }} Gap  noReg: an MSP list or emergency slot with no registrar */

/**
 * `short` holds the lists below their minimum (the Short panel), `under` the ones with fewer than they want (not counting
 * an emergency slot's MO). On a public holiday nobody is listed as free. Someone on a list that is not open this week
 * counts as free that session (clashesOf flags them).
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
  const byGrade = new Map(people.map(p => [p.name, p.grade]));
  /** @param {string} day @returns {string[]} */
  const callers = day => TIERS.map(t => map[day]?.[t]).filter(/** @returns {n is string} */ n => !!n);
  // a place on a list not open this week (closed since the build) does not take the session: free, and offered on Short
  const shut = new Set(lists.filter(l => l.status !== 'open').map(l => l.id));

  /** @type {Record<string, string[]>} */ const leaveOut = {};
  /** @type {Record<string, string[]>} */ const postCall = {};
  /** @type {Record<string, Record<string, string | null>>} */ const onCall = {};
  /** @type {Record<string, FreeEntry[]>} */ const free = {};
  for (const day of days) {
    const prev = callers(addDays(day, -1)), today = callers(day);
    onCall[day] = Object.fromEntries(TIERS.map(t => [t, map[day]?.[t] ?? null]));
    postCall[day] = prev.filter(n => names.has(n) || byGrade.get(n) === 'reg');
    leaveOut[day] = people.filter(p => lv.blocks(p.name, day)).map(p => p.name).sort();
    free[day] = [];
    if (holidays.includes(day)) continue;
    for (const p of juniors) {
      if (lv.full(p.name, day)) continue;
      if (today.includes(p.name)) { free[day].push({ name: p.name, when: 'FULL DAY', why: 'on call' }); continue; }
      if (p.byHand) continue;   // around only on the days someone puts them on a list
      const runs = (/** @type {'AM' | 'PM'} */ s) => lists.some(l => l.day === day && l.session === s && l.status === 'open' && consOf(l).includes(p.name));
      const open = /** @type {('AM' | 'PM')[]} */ (['AM', 'PM']).filter(s => worksOn(p, day, s) && !runs(s) && !grid.some(r => r.day === day && r.session === s && !shut.has(r.list) && r.juniors.includes(p.name))
        && !lv.blocks(p.name, day, s) && !(prev.includes(p.name) && (s === 'PM' || !postCallAm)));
      if (open.length === 2) free[day].push({ name: p.name, when: 'FULL DAY' });
      else if (open.length === 1) free[day].push({ name: p.name, when: open[0] });
    }
    free[day].sort((a, b) => a.name.localeCompare(b.name));
  }
  const byName = new Map(people.map(p => [p.name, p]));
  /** @type {Gap[]} */ const short = [];
  /** @type {Gap[]} */ const under = [];
  for (const l of lists) {
    if (l.need <= 0 || l.status !== 'open') continue;
    const on = grid.find(r => r.day === l.day && r.session === l.session && r.list === l.id)?.juniors ?? [], got = on.length;
    /** @type {Gap} */
    const gap = { list: l.id, day: l.day, session: l.session, need: l.need, min: minOf(l), got };
    // an MSP list or emergency slot must have a registrar (a HOT clinic a registrar or an R3), whoever else is on it
    if (regLed(l) && !on.some(n => leads(l, byName.get(n)))) gap.noReg = true;
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

/**
 * Juniors a built grid has on a list while on leave, on call or post-call (leave or calls changed since the build), or on a
 * list that is not open this week (a holiday, the consultant away or on leave, or closed since the build: 7 Nov 2026), with
 * why ('on leave then', 'the list is closed (public holiday)'). Not a double booking; on a public holiday only the closed list.
 * @param {{ grid: GridRow[], lists?: ListSlot[], leave: Leave[], calls: CallDay[], holidays?: string[], postCallAm?: boolean }} o
 *   lists: the week's lists, settled
 * @returns {{ day: string, session: 'AM' | 'PM', list: string, name: string, why: string[] }[]}
 */
export function clashesOf({ grid, lists = [], leave, calls, holidays = [], postCallAm = true }) {
  const byId = new Map(lists.map(l => [l.id, l]));
  return grid.flatMap(r => {
    const l = byId.get(r.list), shut = l && l.status !== 'open' ? shutText(l) : '';
    const ph = holidays.includes(r.day);
    return r.juniors.map(name => ({ day: r.day, session: r.session, list: r.list, name,
      why: [...(shut ? [shut] : []), ...(ph ? [] : whyNot({ name, day: r.day, session: r.session, leave, calls, grid: [], postCallAm }).map(w => w.slice(name.length + 4)))] }));
  }).filter(c => c.why.length);
}

/** @param {ListSlot} l  settled, not open @returns {string} 'the list is closed (public holiday)', 'the list is closed', 'the list is consultant only' */
const shutText = l => {
  const why = shutBy(l);
  return l.holiday || l.consultantOnLeave ? `the list is closed (${why})` : `the list is ${why}`;
};

// ---- the months a week or a month needs ----
/**
 * The calls that touch a week: the day before it (for post-call) to its Sunday, from whichever months' rosters hold them.
 * @param {{ id: string, calls?: CallDay[] }[]} rosters @param {string} monday @returns {CallDay[]}
 */
export function callsAround(rosters, monday) {
  const from = addDays(monday, -1), to = addDays(monday, 6);
  return rosters.flatMap(r => r.calls ?? []).filter(c => c.date >= from && c.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The months (YYYY-MM) of a week's Monday and Friday whose calls are not made (no one on any tier): its post-call is not known.
 * @param {{ id: string, calls?: CallDay[] }[]} rosters @param {string} monday @returns {string[]}
 */
export function callsUnmade(rosters, monday) {
  return [...new Set([monday, addDays(monday, 4)].map(d => d.slice(0, 7)))]
    .filter(mo => !rosters.find(r => r.id === mo)?.calls?.some(c => TIERS.some(t => c[t])));
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

// The Short panel's choices: for a list below its minimum, the ways to stretch the people there are, each with what it
// costs, cheapest first: someone free that session; someone moved off a list that has more than it must (an emergency
// slot's MO first, the lowest priority, then a list's extra junior); running with the juniors it has; closing it. An
// MSP list or emergency slot with no registrar needs one, so only registrars are offered for it. Pure.

/** @param {ListSlot} l @returns {string} 'KRWOT 3 (Dr A)' */
export const listName = l => `${l.name}${l.consultant ? ` (${conText(l)})` : ''}`;

// Where the Week and Calls tabs open
/** the Monday to show first: this week, or next once the weekend is here @param {string} today */
export const firstWeek = today => (weekday(today) === 6 || weekday(today) === 0 ? addDays(mondayOf(today), 7) : mondayOf(today));
/** the Monday the roster maker starts on: as firstWeek, but next week once this one is built (the next job is there)
 * @param {string} today @param {(monday: string) => boolean} isBuilt */
export const makerWeek = (today, isBuilt) => {
  const mon = firstWeek(today);
  return mon === mondayOf(today) && isBuilt(mon) ? addDays(mon, 7) : mon;
};
/** the month (YYYY-MM) the Calls tab opens on: the roster maker's is next month from the 20th, when its calls are made
 * @param {string} today @param {boolean} maker */
export const firstMonth = (today, maker) => (maker && Number(today.slice(8)) >= 20 ? shiftMonth(today.slice(0, 7), 1) : today.slice(0, 7));
