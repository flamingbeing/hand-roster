// The roster maker's plain-text "Roster info" block, as typed or pasted into a message:
//
//   Leave
//   Dr A 12 to 16 Oct (away Mon to Fri)
//   Dr B 14 Oct (away Wed AM)
//   Calls (Reg / NUH MO / NTF MO)
//   Mon 12 Oct (Dr C / Dr D / Dr E)
//
// parseInfo turns it into leave rows and call rows; formatInfo writes the same text back from data. Forgiving: bullets,
// blank lines and case are ignored, a line it cannot read is reported in `problems` (with the heading it was under), never
// thrown. Pure.
import { MONTHS, WEEKDAYS, isDay, rangeDays, weekdayName } from './dates.js';

/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').Tier} Tier */
/** @typedef {{ leave: Leave[], calls: CallDay[], problems: { line: number, text: string, reason: string, section: '' | 'leave' | 'calls' }[] }} Info */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const MON = '((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)';
const monthNo = (/** @type {string} */ s) => MONTHS.findIndex(m => m.toLowerCase() === s.slice(0, 3).toLowerCase()) + 1;
const NOBODY = /^(-+|nil|none|n\/a|x|tbc|\?)?$/i;
/** @type {Record<string, Tier>} */
const HEAD_TIER = { con: 'con', consultant: 'con', reg: 'reg', registrar: 'reg', nuh: 'moNuh', ntf: 'moNtf', ntfgh: 'moNtf' };

/**
 * @param {string} text
 * @param {{ year: number, today?: string, start?: '' | 'leave' } | { year?: number, today: string, start?: '' | 'leave' }} opts
 *   year: the year the dates are in; today ('YYYY-MM-DD'): instead, each date takes the year that puts it from 3 months
 *   before today's month to 8 after (yearFor), so January read in December is next year's. Either way a range running
 *   past December rolls into the next year. start 'leave': lines before any heading are read as leave (a plain list
 *   pasted on the Leave tab)
 * @returns {Info}
 */
export function parseInfo(text, { year, today, start = '' }) {
  /** @type {(m: number) => number} */
  const yearOf = m => (today ? yearFor(m, today) : Number(year));
  /** @type {Info} */
  const out = { leave: [], calls: [], problems: [] };
  /** @type {'' | 'leave' | 'calls'} */
  let section = start;
  /** @type {Tier[]} */
  let order = ['reg', 'moNuh', 'moNtf'];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!line) return;
    const head = /^(leave|calls?|on[- ]?call)\b\s*(?:\((.*)\))?\s*:?$/i.exec(line);
    if (head) {
      section = /^leave/i.test(head[1]) ? 'leave' : 'calls';
      if (section === 'calls' && head[2]) {
        const tiers = head[2].split('/').map(h => tierOfHead(h));
        if (tiers.every(Boolean)) order = /** @type {Tier[]} */ (tiers);
      }
      return;
    }
    if (section === 'leave') {
      const r = leaveLine(line, yearOf);
      if (typeof r === 'string') out.problems.push({ line: i + 1, text: line, reason: r, section }); else out.leave.push(r);
    } else if (section === 'calls') {
      const r = callLine(line, yearOf, order);
      if (typeof r === 'string') out.problems.push({ line: i + 1, text: line, reason: r, section }); else out.calls.push(r);
    } else out.problems.push({ line: i + 1, text: line, reason: 'before a Leave or Calls heading', section });
  });
  return out;
}

/** @param {string} h @returns {Tier | null} */
function tierOfHead(h) {
  if (/\breg(?:istrar)?\s*2\b/i.test(h)) return 'reg2';
  /** @type {string[]} */
  const words = h.toLowerCase().match(/[a-z]+/g) ?? [];
  const mo = words.includes('mo');
  for (const w of words) {
    if ((w === 'nuh' || w === 'ntf' || w === 'ntfgh') && (mo || words.length === 1)) return HEAD_TIER[w];
    if (!mo && (w === 'con' || w === 'consultant' || w === 'reg' || w === 'registrar')) return HEAD_TIER[w];
  }
  return null;
}

/**
 * The year a day-and-month date with no year is in, read on `today`: the one that puts the month from 3 months before
 * today's month to 8 after it, as rosters are made ahead and leave is pasted soon after. Read in Nov, Aug to Dec are this
 * year and Jan to Jul next year; read in Jan, Oct to Dec are last year.
 * @param {number} month 1 to 12
 * @param {string} today 'YYYY-MM-DD'
 * @returns {number}
 */
export function yearFor(month, today) {
  const y = Number(today.slice(0, 4));
  const ahead = month - Number(today.slice(5, 7));
  if (ahead < -3) return y + 1;
  if (ahead > 8) return y - 1;
  return y;
}

/** @param {number} y @param {number} m @param {number} d @returns {string | null} */
function mk(y, m, d) { const k = `${y}-${pad(m)}-${pad(d)}`; return isDay(k) ? k : null; }

/** @param {string} line @param {(m: number) => number} yearOf @returns {Leave | string} */
function leaveLine(line, yearOf) {
  const r = new RegExp(`^(.*?)\\s+(\\d{1,2})(?:\\s+${MON})?(?:\\s*(?:to|-|\\u2013)\\s*(\\d{1,2})(?:\\s+${MON})?)?\\s*(?:\\((.*)\\))?\\s*$`, 'i').exec(line);
  if (!r) return 'not a leave line (Name 12 to 16 Oct)';
  const [, name, d1, mon1, d2, mon2, note] = r;
  const startMon = mon1 ?? mon2;
  const endMon = mon2 ?? mon1;
  if (!startMon || !endMon) return 'missing the month';
  const sm = monthNo(startMon);
  const em = monthNo(endMon);
  // the end takes the start's year, or the next one when its month comes before the start's
  const year = yearOf(sm);
  const from = mk(year, sm, Number(d1));
  const to = d2 === undefined ? from : mk(em < sm ? year + 1 : year, em, Number(d2));
  if (!from || !to) return 'not a real date';
  if (to < from) return 'the end is before the start';
  /** @type {Leave} */
  const lv = { name: name.trim(), from, to };
  const n = (note ?? '').trim();
  const half = /\b(AM|PM)\b/i.exec(n);
  if (half) lv.session = /** @type {'AM' | 'PM'} */ (half[1].toUpperCase());
  if (n && !/^away\b/i.test(n)) lv.note = n;
  return lv;
}

/** @param {string} line @param {(m: number) => number} yearOf @param {Tier[]} order @returns {CallDay | string} */
function callLine(line, yearOf, order) {
  const r = new RegExp(`^(?:(${WEEKDAYS.join('|')})[a-z]*,?\\s+)?(\\d{1,2})\\s+${MON}\\s*\\((.*)\\)\\s*$`, 'i').exec(line);
  if (!r) return 'not a call line (Mon 12 Oct (A / B / C))';
  const m = monthNo(r[3]);
  const date = mk(yearOf(m), m, Number(r[2]));
  if (!date) return 'not a real date';
  if (r[1] && weekdayName(date).toLowerCase() !== r[1].slice(0, 3).toLowerCase()) return `${date} is a ${weekdayName(date)}, not ${r[1]}`;
  const names = r[4].split('/').map(s => s.trim());
  if (names.length > order.length) return `${names.length} names but ${order.length} columns in the Calls heading`;
  /** @type {CallDay} */
  const row = { date, con: null, reg: null, moNuh: null, moNtf: null };
  order.forEach((t, i) => { const n = names[i]; const v = n === undefined || NOBODY.test(n) ? null : n; if (v || t !== 'reg2') row[t] = v; });
  return row;
}

/** @param {string} day @returns {string} '12 Oct' */
const dm = day => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/**
 * The same text back from data, in the order the heading names.
 * @param {{ leave: Leave[], calls: CallDay[] }} info
 * @param {Tier[]} [order]
 * @returns {string}
 */
export function formatInfo(info, order = ['reg', 'moNuh', 'moNtf']) {
  const head = { con: 'Con', reg: 'Reg', reg2: 'Reg 2', moNuh: 'NUH MO', moNtf: 'NTF MO' };
  const lines = ['Leave'];
  for (const l of info.leave) {
    const days = rangeDays(l.from, l.to);
    let span;
    if (l.from === l.to) span = dm(l.from);
    else if (l.from.slice(0, 7) === l.to.slice(0, 7)) span = `${Number(l.from.slice(8))} to ${dm(l.to)}`;
    else span = `${dm(l.from)} to ${dm(l.to)}`;
    const wd = weekdayName(l.from) === weekdayName(l.to) && days.length === 1 ? weekdayName(l.from) : `${weekdayName(l.from)} to ${weekdayName(l.to)}`;
    const away = `away ${wd}${l.session && l.session !== 'both' ? ` ${l.session}` : ''}`;
    lines.push(`${l.name} ${span} (${l.note ? `${l.note}` : away})`);
  }
  lines.push(`Calls (${order.map(t => head[t]).join(' / ')})`);
  for (const c of info.calls) {
    lines.push(`${weekdayName(c.date)} ${dm(c.date)} (${order.map(t => c[t] ?? '-').join(' / ')})`);
  }
  return lines.join('\n');
}
