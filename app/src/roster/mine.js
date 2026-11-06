// "This is me": one person's week in short lines, for the My week card on the Week tab (screens/week-mine.js). Read from
// the same settled lists, grid and sections the Week grid draws, so the card cannot disagree with it. No DOM.
import { addDays, shortDay, weekdayName } from './dates.js';
import { TIERS, TIER_LABEL, consOf, leaveIndex } from './model.js';
import { listOf } from './grid.js';

/** @typedef {{ day: string, facts: string[] }} MyDay  facts: 'AM NUH KRWOT 3 (Dr A)', 'On call (REG)', 'Leave (AM)' */

/**
 * One person's days of a week: Mon to Fri, plus Sat and Sun when they are on call then. A built week gives their lists and
 * free time; an unbuilt one only calls, post-call and leave (the lists are not settled into people yet).
 * @param {{ name: string, days: string[], lists: import('./model.js').ListSlot[], grid: import('./grid.js').GridRow[],
 *   sec: { postCall: Record<string, string[]>, free: Record<string, import('./sections.js').FreeEntry[]> },
 *   calls: import('./model.js').CallDay[], leave: import('./model.js').Leave[], built: boolean, holidays?: string[] }} o
 *   days: the week's Mon to Fri (sectionsOf); calls: the week's calls (callsAround)
 * @returns {MyDay[]}
 */
export function myWeek({ name, days, lists, grid, sec, calls, leave, built, holidays = [] }) {
  const lv = leaveIndex(leave);
  /** @param {string} day @returns {string[]} 'On call (REG)', or none */
  const onCall = day => {
    const c = calls.find(x => x.date === day);
    return c ? TIERS.filter(t => c[t] === name).map(t => `On call (${TIER_LABEL[t]})`) : [];
  };
  const out = days.map(day => {
    /** @type {string[]} */ const facts = [];
    if (holidays.includes(day)) facts.push('Public holiday');
    if (built) for (const s of /** @type {const} */ (['AM', 'PM'])) {
      const id = listOf(grid, day, s, name);
      // a junior's place on the grid; a consultant's own open lists
      const on = id ? lists.filter(l => l.id === id && l.day === day && l.session === s)
        : lists.filter(l => l.day === day && l.session === s && l.status === 'open' && consOf(l).includes(name));
      for (const l of on) facts.push(`${s} ${l.site} ${l.name}${l.consultant && !consOf(l).includes(name) ? ` (${consOf(l).join(' / ')})` : ''}`);
    }
    if (lv.full(name, day)) facts.push('Leave (all day)');
    else for (const s of /** @type {const} */ (['AM', 'PM'])) if (lv.blocks(name, day, s)) facts.push(`Leave (${s})`);
    if (sec.postCall[day]?.includes(name)) facts.push('Post-call (PM)');
    const free = built ? sec.free[day]?.find(f => f.name === name && !f.why) : undefined;
    if (free) facts.push(`Free (${free.when === 'FULL DAY' ? 'all day' : free.when})`);
    facts.push(...onCall(day));
    return { day, facts };
  });
  // the weekend after, only when on call (its post-call is next week's Monday)
  const fri = days[days.length - 1];
  for (const day of fri ? [addDays(fri, 1), addDays(fri, 2)] : []) {
    const facts = onCall(day);
    if (facts.length) out.push({ day, facts });
  }
  return out;
}

/**
 * The person's next call on or after today, from every stored month: 'Next call: Sat 14 Nov (REG)', or '' when none is made.
 * @param {string} name @param {{ calls?: import('./model.js').CallDay[] }[]} rosters @param {string} today
 * @returns {string}
 */
export function nextCall(name, rosters, today) {
  const next = rosters.flatMap(r => r.calls ?? []).filter(c => c.date >= today && TIERS.some(t => c[t] === name))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return '';
  const tiers = TIERS.filter(t => next[t] === name).map(t => TIER_LABEL[t]).join(', ');
  return `Next call: ${next.date === today ? 'today' : `${weekdayName(next.date)} ${shortDay(next.date)}`} (${tiers})`;
}

/** @param {string} day @returns {string} 'Mon 9' */
export const dayLabel = day => `${weekdayName(day)} ${Number(day.slice(8))}`;
