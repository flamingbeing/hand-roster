// The sections around a week's grid, worked out from the grid and the inputs each time they are shown: who is on leave,
// post-call, on call and free each day, what each list is short of, and why a placement is a problem. The same rules as
// buildWeek (week.js), so a hand-edited grid is judged the way a built one was. Also here: picking the parts of the stored
// months that a week or a month needs (callsAround, monthCells, ...). Pure.
import { addDays, rangeDays, mondayOf, monthDays, weekday } from './dates.js';
import { callMapOf, callRow, canWork, conText, isJunior, worksOn, leads, leaveIndex, minOf, regLed, TIERS } from './model.js';
import { juniorsOn } from './grid.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {{ name: string, when: 'AM' | 'PM' | 'FULL DAY', why?: string }} FreeEntry */
/** @typedef {{ list: string, day: string, session: 'AM' | 'PM', need: number, min: number, got: number, noReg?: boolean }} Gap  noReg: an MSP list or emergency slot with no registrar */

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
      if (p.byHand) continue;   // around only on the days someone puts them on a list
      const runs = (/** @type {'AM' | 'PM'} */ s) => lists.some(l => l.day === day && l.session === s && l.status === 'open' && (l.consultant === p.name || l.consultant2 === p.name));
      const open = /** @type {('AM' | 'PM')[]} */ (['AM', 'PM']).filter(s => worksOn(p, day, s) && !runs(s) && !grid.some(r => r.day === day && r.session === s && r.juniors.includes(p.name))
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

// The Short panel's choices: for a list below its minimum, the ways to stretch the people there are, each with what it
// costs, cheapest first: someone free that session; someone moved off a list that has more than it must (an emergency
// slot's MO first, the lowest priority, then a list's extra junior); running with the juniors it has; closing it. An
// MSP list or emergency slot with no registrar needs one, so only registrars are offered for it. Pure.

/**
 * @typedef {{ kind: 'add', name: string, text: string, cost: string }
 *   | { kind: 'move', name: string, from: string, text: string, cost: string }
 *   | { kind: 'fewer', min: number, text: string, cost: string }
 *   | { kind: 'close', text: string, cost: string }} ShortOption
 */

/** @param {ListSlot} l @returns {string} 'KRWOT 3 (Dr A)' */
export const listName = l => `${l.name}${l.consultant ? ` (${conText(l)})` : ''}`;

/**
 * @param {{ gap: Gap, lists: ListSlot[], grid: import('./grid.js').GridRow[], people: Person[], free: FreeEntry[] }} o
 *   free: that day's free entries (sectionsOf)
 * @returns {ShortOption[]}
 */
export function shortOptions({ gap, lists, grid, people, free }) {
  const list = lists.find(l => l.id === gap.list);
  if (!list) return [];
  const grade = new Map(people.map(p => [p.name, p.grade]));
  const who = new Map(people.map(p => [p.name, p]));
  // a list without the lead it must have (a registrar; a HOT clinic also an R3) takes only someone who can lead it
  const needsReg = regLed(list) && !juniorsOn(grid, gap.day, gap.session, list.id).some(n => leads(list, who.get(n)));
  const fits = (/** @type {string} */ n) => { const p = who.get(n); return !!p && (!needsReg || leads(list, p)) && canWork(p, list); };
  /** @type {ShortOption[]} */
  const out = [];

  for (const f of free) {
    if (f.why || (f.when !== 'FULL DAY' && f.when !== gap.session) || !fits(f.name)) continue;
    out.push({ kind: 'add', name: f.name, text: `Add ${f.name}`, cost: 'free that session' });
    if (out.length >= 2) break;
  }

  /** @type {{ o: ShortOption, rank: number }[]} */
  const moves = [];
  for (const l of lists) {
    if (l.id === list.id || l.day !== gap.day || l.session !== gap.session || l.status !== 'open') continue;
    const on = juniorsOn(grid, l.day, l.session, l.id);
    const spare = on.length - minOf(l);
    if (spare <= 0) continue;
    // from an MSP list or emergency slot only an MO: it keeps its registrar
    const regs = on.filter(n => leads(l, who.get(n)));
    const movable = regLed(l) ? on.filter(n => !leads(l, who.get(n)) || regs.length > 1) : on;
    for (const n of movable.filter(fits)) {
      const cost = l.emergency ? `the emergency slot ${listName(l)} loses ${grade.get(n) === 'reg' ? 'a registrar' : 'its MO'}` : `${listName(l)} drops to ${on.length - 1} of the ${l.need} it wants`;
      moves.push({ o: { kind: 'move', name: n, from: l.id, text: `Move ${n} from ${l.name}`, cost }, rank: l.emergency ? 0 : 1 });
    }
  }
  moves.sort((a, b) => a.rank - b.rank);
  out.push(...moves.slice(0, 3).map(m => m.o));

  const got = juniorsOn(grid, gap.day, gap.session, list.id).length;
  out.push({ kind: 'fewer', min: got, text: got ? `Run with ${got}` : 'Run with no junior',
    cost: `${got} junior${got === 1 ? '' : 's'} instead of ${gap.min}, this week only` });
  out.push({ kind: 'close', text: 'Close it', cost: list.emergency ? 'no emergency slot that session' : list.kind === 'ot' || list.kind === 'msp' ? 'its cases move to another day' : 'its patients are rebooked' });
  return out;
}

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
