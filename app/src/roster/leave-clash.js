// What a new leave or "cannot" request clashes with in what is already made: a call that day, or a place on a list in a
// built week (the stored grid is a snapshot and is not checked again). Shown under the Leave and request sheets as
// information only; Save is never blocked. Pure.
import { addDays, isDay, rangeDays, shortDay, weekdayName, mondayOf } from './dates.js';
import { TIERS, TIER_LABEL } from './model.js';
import { weekBuilt } from './grid.js';

/** the most days one leave is checked for */
export const MAX_DAYS = 31;
/** the most clash lines shown; the rest are counted */
export const MAX_LINES = 4;

/** @typedef {{ id: string, _deleted?: boolean, calls?: import('./model.js').CallDay[] }} RosterLike */
/** @typedef {{ id: string, _deleted?: boolean, built?: number, grid?: import('./grid.js').GridRow[], lists?: { id: string, name?: string, site?: string }[] }} WeekLike */
/** @typedef {{ name: string, from: string, to: string, session?: string | null, _deleted?: boolean }} LeaveLike */

/** @param {string} d @returns {string} 'Thu 12 Nov' */
const dayText = d => `${weekdayName(d)} ${shortDay(d)}`;

/** @param {RosterLike[]} rosters @param {string} from @param {string} to @returns {Map<string, import('./model.js').CallDay>} the call rows of those days, by date */
function callsBetween(rosters, from, to) {
  const out = new Map();
  for (const r of rosters) if (!r._deleted) for (const c of r.calls ?? []) if (c.date >= from && c.date <= to && !out.has(c.date)) out.set(c.date, c);
  return out;
}

/** @param {import('./model.js').CallDay | undefined} c @param {string} name @returns {string[]} the tiers' labels the person has that day */
const tiersOf = (c, name) => (c ? TIERS.filter(t => c[t] === name).map(t => TIER_LABEL[t]) : []);

/** @param {string[]} lines @returns {string[]} the first MAX_LINES, and a count of the rest */
const capped = lines => (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `And ${lines.length - MAX_LINES} more.`] : lines);

/**
 * The clashes of a leave, as short lines ([] when none): on call on a day away (any part of the day, as leave blocks the
 * call), or placed on a list in a built week in a session the leave covers. Then how many others are away on those days.
 * @param {{ name: string, from: string, to: string, session?: string | null, rosters: RosterLike[], weeks: WeekLike[], leave?: LeaveLike[] }} o
 * @returns {string[]}
 */
export function leaveClashes({ name, from, to, session, rosters, weeks, leave = [] }) {
  if (!name || !isDay(from) || !isDay(to) || to < from) return [];
  const last = to > addDays(from, MAX_DAYS - 1) ? addDays(from, MAX_DAYS - 1) : to;
  const days = rangeDays(from, last);
  const halves = session === 'AM' || session === 'PM' ? [session] : ['AM', 'PM'];
  const calls = callsBetween(rosters, from, last);
  const byId = new Map(weeks.filter(w => !w._deleted).map(w => [w.id, w]));
  /** @type {string[]} */
  const lines = [];
  for (const d of days) {
    for (const tier of tiersOf(calls.get(d), name)) lines.push(`${name} is on call (${tier}) on ${dayText(d)}. Change that call on the Calls tab.`);
    const wk = byId.get(mondayOf(d));
    if (!wk || !weekBuilt(wk)) continue;
    for (const half of halves) for (const r of wk.grid ?? []) {
      if (r.day !== d || r.session !== half || !r.juniors?.includes(name)) continue;
      const l = wk.lists?.find(x => x.id === r.list);
      const listText = l?.name ? (l.site && !l.name.startsWith(l.site) ? `${l.site} ${l.name}` : l.name) : r.list;
      lines.push(`${name} is on ${listText} on ${dayText(d)} ${half} (week built). Move them or build the week again.`);
    }
  }
  const out = capped(lines);
  const others = new Set(leave.filter(l => !l._deleted && l.name && l.name !== name && l.from <= last && (l.to || l.from) >= from).map(l => l.name));
  if (others.size) out.push(`${others.size} ${others.size === 1 ? 'other' : 'others'} away then.`);
  return out;
}

/**
 * The clash of a call request ([] when none): a "cannot" on a day the person is already on call. "Would like" gives none.
 * `sayDay` names the day in the line (a run of requests) rather than "that day".
 * @param {{ name: string, date: string, type: string, rosters: RosterLike[], sayDay?: boolean }} o
 * @returns {string[]}
 */
export function requestClashes({ name, date, type, rosters, sayDay = false }) {
  if (type !== 'cannot' || !name || !isDay(date)) return [];
  const when = sayDay ? dayText(date) : 'that day';
  return tiersOf(callsBetween(rosters, date, date).get(date), name).map(t => `${name} is on call (${t}) on ${when}. Change that call on the Calls tab.`);
}
