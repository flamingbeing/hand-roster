// How the Leave tab lays out and adds its rows: the days of a run of requests (one request a day), the clash lines of such a
// run, and the rows grouped by month for the month headings. Pure.
import { addDays, isDay, rangeDays, MONTH_NAMES } from './dates.js';
import { requestClashes, MAX_DAYS, MAX_LINES } from './leave-clash.js';

/**
 * The days from `from` to `to`, both kept, at most `cap` of them. A missing or earlier last day gives the first day alone.
 * @param {string} from @param {string | null | undefined} to @param {number} [cap] @returns {string[]}
 */
export function expandDays(from, to, cap = MAX_DAYS) {
  if (!isDay(from)) return [];
  if (!to || !isDay(to) || to <= from) return [from];
  const last = addDays(from, Math.max(1, cap) - 1);
  return rangeDays(from, to < last ? to : last);
}

/**
 * The clash lines of a run of requests, one day at a time through requestClashes: each line names its day when there
 * is more than one, and past MAX_LINES the rest are counted.
 * @param {{ name: string, from: string, to?: string | null, type: string, rosters: import('./leave-clash.js').RosterLike[] }} o
 * @returns {string[]}
 */
export function requestRangeClashes({ name, from, to, type, rosters }) {
  const days = expandDays(from, to);
  const lines = days.flatMap(d => requestClashes({ name, date: d, type, rosters, sayDay: days.length > 1 }));
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `And ${lines.length - MAX_LINES} more.`] : lines;
}

/**
 * Rows in groups by month, in the order they come (sort them first): [{ month: '2026-12', label: 'December 2026', rows }].
 * @template T @param {T[]} rows @param {(row: T) => string} keyOf  the row's day, YYYY-MM-DD
 * @returns {{ month: string, label: string, rows: T[] }[]}
 */
export function groupByMonth(rows, keyOf) {
  /** @type {{ month: string, label: string, rows: T[] }[]} */
  const out = [];
  for (const r of rows) {
    const month = String(keyOf(r) ?? '').slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) { last.rows.push(r); continue; }
    const [y, m] = month.split('-').map(Number);
    out.push({ month, label: m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : 'No date', rows: [r] });
  }
  return out;
}
