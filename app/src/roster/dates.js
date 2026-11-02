// Calendar days as plain YYYY-MM-DD strings, with UTC-safe maths (so a weekday never shifts with the device's time zone).
// Pure: no page, no clock. node tests import it directly (app/test/roster.unit.test.mjs).

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const DAY_MS = 86400000;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {string} key @returns {number} UTC midnight of that day */
const ms = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
/** @param {number} t @returns {string} */
const key = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** @param {unknown} v @returns {boolean} a real calendar day written YYYY-MM-DD */
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && key(ms(v)) === v;
/** @param {unknown} v @returns {boolean} */
export const isMonth = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
/** @param {string} day @param {number} n days later (or earlier) @returns {string} */
export const addDays = (day, n) => key(ms(day) + n * DAY_MS);
/** @param {string} a @param {string} b @returns {number} whole days from a to b (negative if b is earlier) */
export const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / DAY_MS);
/** @param {string} day @returns {number} 0 = Sunday ... 6 = Saturday */
export const weekday = day => new Date(ms(day)).getUTCDay();
/** @param {string} day @returns {string} 'Mon' ... */
export const weekdayName = day => WEEKDAYS[weekday(day)];
/** @param {string} day @returns {boolean} Saturday or Sunday */
export const isWeekend = day => { const w = weekday(day); return w === 0 || w === 6; };
/** @param {string} month YYYY-MM @returns {number} */
export const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** @param {string} month YYYY-MM @returns {string[]} every day of the month, in order */
export const monthDays = month => Array.from({ length: daysIn(month) }, (_, i) => `${month}-${pad(i + 1)}`);
/** @param {string} day @returns {string} the Monday of that day's week */
export const mondayOf = day => addDays(day, -((weekday(day) + 6) % 7));
/** @param {string} from @param {string} to @returns {string[]} from..to inclusive (empty if to < from) */
export const rangeDays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** @param {string} day @returns {string} the next Monday to Friday after it ('2026-11-06' gives '2026-11-09') */
export function nextWorkday(day) {
  let d = addDays(day, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}
/** @param {string} day @returns {string} '12 Oct' */
export const shortDay = day => { const [, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

// The device's calendar day (local time), as YYYY-MM-DD. The only place the roster code reads the clock; the engine's
// functions are given days. (The other functions here are UTC, so a day never shifts with the device's zone.)
export const todayKey = (/** @type {Date} */ d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
