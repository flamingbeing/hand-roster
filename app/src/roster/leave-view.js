// How the Leave tab lays out and adds its rows: the days of a run of requests (one request a day), the clash lines of such a
// run, the rows grouped by month for the month headings, and which pasted leave lines are new. Pure.
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

/** @typedef {{ name: string, from: string, to: string, session: 'AM' | 'PM' | 'both', note: string | null }} NewLeave */

/** the most unread lines the paste preview names; the rest are counted */
export const MAX_BAD = 3;

/**
 * One leave row as it is saved: the name as the data keeps it (at most 60 characters), the last day never before the first,
 * all day as 'both' (as the Leave sheet saves it).
 * @param {{ name: string, from: string, to?: string | null, session?: string | null }} r
 * @returns {Omit<NewLeave, 'note'>}
 */
const asSaved = r => ({ name: r.name.trim().slice(0, 60), from: r.from, to: r.to && r.to > r.from ? r.to : r.from, session: r.session === 'AM' || r.session === 'PM' ? r.session : 'both' });

/**
 * One leave row as a key: name, first and last day and part of the day. Two rows with the same key are the same leave.
 * @param {{ name: string, from: string, to?: string | null, session?: string | null }} r @returns {string}
 */
export const leaveKey = r => { const a = asSaved(r); return JSON.stringify([a.name, a.from, a.to, a.session]); };

/**
 * The pasted leave rows that are not there yet, ready to save: a row equal to a kept one (same leaveKey) is dropped, and
 * so is a repeat inside the paste. AM and PM of the same day are different rows. `dup` counts the rows dropped.
 * @param {{ name: string, from: string, to: string, session?: string | null, note?: string | null }[]} parsed
 * @param {{ name: string, from: string, to?: string | null, session?: string | null, _deleted?: boolean }[]} existing
 * @returns {{ rows: NewLeave[], dup: number }}
 */
export function newLeaveRows(parsed, existing) {
  const seen = new Set(existing.filter(r => !r._deleted && r.name && isDay(r.from)).map(leaveKey));
  /** @type {NewLeave[]} */
  const rows = [];
  let dup = 0;
  for (const p of parsed) {
    const key = leaveKey(p);
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    rows.push({ ...asSaved(p), note: p.note || null });
  }
  return { rows, dup };
}

/**
 * The live lines under the paste sheet: how many rows are new and how many already there, each line it could not read
 * (the first MAX_BAD, the rest counted), and a pointer to the Calls tab when the text has a Calls block (left out).
 * @param {{ calls: unknown[], problems: { line: number, reason: string, section?: string }[] }} info
 * @param {{ rows: unknown[], dup: number }} picked  newLeaveRows' answer
 * @returns {string[]}
 */
export function pastePreview(info, { rows, dup }) {
  const bad = info.problems.filter(p => p.section !== 'calls');
  const hasCalls = info.calls.length > 0 || bad.length < info.problems.length;
  if (!rows.length && !dup && !bad.length && !hasCalls) return [];
  const n = rows.length;
  return [
    `${n} leave ${n === 1 ? 'row' : 'rows'} to add${dup ? `, ${dup} already there` : ''}.`,
    ...bad.slice(0, MAX_BAD).map(p => `Line ${p.line} not read: ${p.reason}.`),
    ...(bad.length > MAX_BAD ? [`And ${bad.length - MAX_BAD} more ${bad.length - MAX_BAD === 1 ? 'line' : 'lines'} not read.`] : []),
    ...(hasCalls ? ['Calls go on the Calls tab.'] : []),
  ];
}
