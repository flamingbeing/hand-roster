// Singapore public holidays, to suggest a month's holidays in Calls > Settings (the admin still saves them).
// Pure: no page, no clock. Only screens/calls.js imports it (a lazy screen), never the start-up files.
// The dates are copied from the Ministry of Manpower's page (https://www.mom.gov.sg/employment-practices/public-holidays),
// checked 7 Nov 2026, including the Mondays it names as the day off for a holiday on a Sunday. Add each new year here
// once the ministry publishes it; a year not in the table suggests nothing.
import { isDay, isWeekend, shortDay } from './dates.js';

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

/**
 * A month's public holidays. Only Monday to Friday ones are suggested; a Saturday or Sunday holiday is already a day off
 * (whether it should count as a holiday for calls is the owner's call), so it is only named.
 * @param {string} month YYYY-MM
 * @returns {{ suggest: { day: string, name: string }[], weekendNames: string[] }} weekendNames like '8 Nov Deepavali'
 */
export function holidaysIn(month) {
  const all = (TABLE[month.slice(0, 4)] ?? []).filter(([day]) => day.startsWith(`${month}-`));
  return {
    suggest: all.filter(([day]) => !isWeekend(day)).map(([day, name]) => ({ day, name })),
    weekendNames: all.filter(([day]) => isWeekend(day)).map(([day, name]) => `${shortDay(day)} ${name}`),
  };
}

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
