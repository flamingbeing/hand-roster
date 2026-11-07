// Singapore public holidays, to suggest a month's holidays in Calls > Settings (the admin still saves them).
// Pure: no page, no clock. Only screens/calls.js imports it (a lazy screen), never the start-up files.
// The dates are copied from the Ministry of Manpower's page (https://www.mom.gov.sg/employment-practices/public-holidays),
// checked against it again 7 Nov 2026 (page last updated 19 Jun 2026), including the Mondays it names as the day off for a
// holiday on a Sunday. A holiday on a Saturday gets no day in lieu (MOM names none), so the table never has one. Add each
// new year here once the ministry publishes it; a year not in the table suggests nothing.
// Owner decision 7 Nov 2026: public holidays follow MOM's official Singapore list. A holiday on a Saturday or Sunday counts
// as a weekend day for calls (weekend plan and weekend balance), not as a holiday (model.js dayType); a Monday in lieu is a
// holiday only when the holiday falls on a Sunday.
import { addDays, isDay, isWeekend, shortDay, weekday } from './dates.js';

/** @type {Record<string, [string, string][]>} year: [day, name] */
const TABLE = {
  2026: [
    ['2026-01-01', 'New Year’s Day'],
    ['2026-02-17', 'Chinese New Year'],
    ['2026-02-18', 'Chinese New Year (day 2)'],
    ['2026-03-21', 'Hari Raya Puasa'],
    ['2026-04-03', 'Good Friday'],
    ['2026-05-01', 'Labour Day'],
    ['2026-05-27', 'Hari Raya Haji'],
    ['2026-05-31', 'Vesak Day'],
    ['2026-06-01', 'Vesak Day (in lieu)'],
    ['2026-08-09', 'National Day'],
    ['2026-08-10', 'National Day (in lieu)'],
    ['2026-11-08', 'Deepavali'],
    ['2026-11-09', 'Deepavali (in lieu)'],
    ['2026-12-25', 'Christmas Day'],
  ],
  2027: [
    ['2027-01-01', 'New Year’s Day'],
    ['2027-02-06', 'Chinese New Year'],
    ['2027-02-07', 'Chinese New Year (day 2)'],
    ['2027-02-08', 'Chinese New Year (in lieu)'],
    ['2027-03-10', 'Hari Raya Puasa'],
    ['2027-03-26', 'Good Friday'],
    ['2027-05-01', 'Labour Day'],
    ['2027-05-17', 'Hari Raya Haji'],
    ['2027-05-20', 'Vesak Day'],
    ['2027-08-09', 'National Day'],
    ['2027-10-28', 'Deepavali'],
    ['2027-12-25', 'Christmas Day'],
  ],
};

const IN_LIEU = /\(in lieu\)/;
/** @param {string} day @returns {boolean} a holiday in the table falls on this day */
const listed = day => (TABLE[day.slice(0, 4)] ?? []).some(([d, name]) => d === day && !IN_LIEU.test(name));

/**
 * A day in lieu stands only for a holiday on a Sunday (MOM's rule): the Monday after it, or the next day after that is not
 * itself a holiday. A Saturday holiday gets none. Kept as a guard so a mistyped table row can never suggest an in-lieu day
 * after a Saturday.
 * @param {string} day @returns {boolean}
 */
export function inLieuStands(day) {
  if (isWeekend(day)) return false;
  let d = addDays(day, -1);
  while (listed(d) && weekday(d) !== 0) d = addDays(d, -1);   // step back over weekday holidays (a Sunday then Monday pair)
  return weekday(d) === 0 && listed(d);
}

/**
 * A month's public holidays. Only Monday to Friday ones are suggested (with a Monday in lieu of a Sunday holiday); a
 * Saturday or Sunday holiday counts as a weekend day for calls (owner, 7 Nov 2026), so it is only named, never added.
 * @param {string} month YYYY-MM
 * @returns {{ suggest: { day: string, name: string }[], weekendNames: string[] }} weekendNames like '8 Nov Deepavali'
 */
export function holidaysIn(month) {
  const all = (TABLE[month.slice(0, 4)] ?? []).filter(([day]) => day.startsWith(`${month}-`));
  return {
    suggest: all.filter(([day, name]) => !isWeekend(day) && (!IN_LIEU.test(name) || inLieuStands(day))).map(([day, name]) => ({ day, name })),
    weekendNames: all.filter(([day]) => isWeekend(day)).map(([day, name]) => `${shortDay(day)} ${name}`),
  };
}

/** The table's rows for one year, for tests. @param {string | number} year @returns {[string, string][]} */
export const holidayTable = year => [...(TABLE[String(year)] ?? [])];

/**
 * Typed holiday days that fall on a Saturday or Sunday: they count as the weekend for calls, not as a holiday.
 * @param {string[]} days YYYY-MM-DD @returns {string[]}
 */
export const weekendHolidays = days => days.filter(isWeekend);

/**
 * The holidays field as typed, read for one month: lines (or commas) of YYYY-MM-DD. A line of several days split by spaces
 * is read as those days. Anything else (a typo, a day that does not exist, a day of another month) is ignored and handed
 * back as typed, so the sheet can say so instead of dropping it unseen.
 * @param {string} text @param {string} month YYYY-MM
 * @returns {{ days: string[], ignored: string[] }} days sorted, without repeats
 */
export function readHolidays(text, month) {
  /** @type {Set<string>} */
  const days = new Set();
  /** @type {string[]} */
  const ignored = [];
  for (const entry of String(text).split(/[\n,;]+/).map(e => e.trim()).filter(Boolean)) {
    const words = entry.split(/\s+/);
    if (!words.every(isDay)) { ignored.push(entry); continue; }
    for (const w of words) if (w.startsWith(`${month}-`)) days.add(w); else ignored.push(w);
  }
  return { days: [...days].sort(), ignored: [...new Set(ignored)] };
}
