// One layout for everything that leaves the app as a sheet: the xlsx export, the print view and the WhatsApp text are all
// made from the same blocks, so they cannot disagree. A week is a list of BLOCKS (a session at a site, the on-call tier,
// leave, post-call, free), each with its lines per day; `coreRows` lays them out like the CORE sheet (DEPARTMENTS column,
// one column per day, a list's header row then a row per junior) and `handSections` like the hand-made weekly grid (one
// row per section, the lines stacked in each day's cell). The month's calls have their own small layout. Pure.
import { addDays, rangeDays, weekdayName, shortDay, MONTH_NAMES, MONTHS, monthDays } from './dates.js';
import { DEFAULT_TIER_PLAN, TIERS, TIER_LABEL, callMapOf, dayType, leaveIndex } from './model.js';
import { sectionsOf } from './sections.js';
import { juniorsOn } from './grid.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {'head' | 'closed' | 'name' | 'text'} LineKind  a list's header, a closed or empty list's header, a person, other text */
/** @typedef {{ t: string, k: LineKind, short?: string }} Line  `short` is a list header for the chat text: "KRWOT 3 (Dr X)" */
/** @typedef {{ section: string, label: string, lines: Line[][], prefix?: boolean }} Block  lines[i] is day i's lines */
/** @typedef {{ title: string, sheet: string, style: 'core' | 'hand', days: string[], dayHeads: string[], blocks: Block[], built: boolean }} WeekLayout */
/** @typedef {{ t: string, k: 'section' | 'label' | LineKind | 'blank' }} SheetCell */

export const SECTIONS = /** @type {const} */ ({
  am: 'MORNING SESSION', pm: 'AFTERNOON SESSION', call: 'ON-CALL', leave: 'LEAVE', post: 'POST-CALL', free: 'FREE',
});
/** the hand-made grid's row names @type {Record<string, string>} */
export const HAND_NAMES = {
  'MORNING SESSION': 'AM sessions', 'AFTERNOON SESSION': 'PM sessions', 'ON-CALL': 'On call', LEAVE: 'Leave', 'POST-CALL': 'Post-call', FREE: 'Free',
};
const SITE_ORDER = ['NUH', 'NTFGH'];
const KIND_ORDER = { ot: 0, msp: 1, hot: 2, clinic: 3 };

/** @param {string} a @param {string} b @returns {number} 'KRWOT 3' before 'KRWOT 10' */
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** @param {string} monday @returns {string} '2 - 6 November 2026', '30 October - 3 November 2026', '29 December 2026 - 2 January 2027' */
export function weekRange(monday) {
  const fri = addDays(monday, 4);
  const [y, m, d] = monday.split('-').map(Number), [fy, fm, fd] = fri.split('-').map(Number);
  if (y !== fy) return `${d} ${MONTH_NAMES[m - 1]} ${y} - ${fd} ${MONTH_NAMES[fm - 1]} ${fy}`;
  if (m !== fm) return `${d} ${MONTH_NAMES[m - 1]} - ${fd} ${MONTH_NAMES[fm - 1]} ${fy}`;
  return `${d} - ${fd} ${MONTH_NAMES[fm - 1]} ${fy}`;
}
/** @param {string} monday @returns {string} the hand-made roster's title */
export const weekTitleText = monday => `HRM Registrar/Fellows/Medical Officer Daily Roster (${weekRange(monday)})`;
/** @param {string} day @returns {string} 'Tue 3 Nov 2026' */
export const longDay = day => `${weekdayName(day)} ${shortDay(day)} ${day.slice(0, 4)}`;

/**
 * @typedef {object} WeekLayoutInput
 * @property {string} monday
 * @property {'core' | 'hand'} [style]  core = Mon..Sun, "SITE LIST - Consultant"; hand = Mon..Fri, "Consultant SITE List rooms - patients" (default core)
 * @property {ListSlot[]} lists  every list of the week
 * @property {GridRow[]} [grid]  the juniors on each list
 * @property {Person[]} people
 * @property {Leave[]} [leave]
 * @property {CallDay[]} [calls]  the calls around the week
 * @property {string[]} [holidays]  public holidays (they have fewer on-call tiers)
 * @property {boolean} [built]  the grid has been built: FREE is shown only then (default: the grid has rows)
 * @property {boolean} [patients]  show patient counts in the hand-made header (default true)
 * @property {boolean} [postCallAm]
 * @param {WeekLayoutInput} o
 * @returns {WeekLayout}
 */
export function weekLayout(o) {
  const style = o.style ?? 'core';
  const grid = o.grid ?? [], leave = o.leave ?? [], holidays = o.holidays ?? [];
  const built = o.built ?? grid.length > 0;
  const showPatients = o.patients !== false;
  const week = rangeDays(o.monday, addDays(o.monday, 6));
  const days = style === 'hand' ? week.slice(0, 5) : week;
  const sec = sectionsOf({ monday: o.monday, people: o.people, leave, calls: o.calls ?? [], lists: o.lists, grid, postCallAm: o.postCallAm });
  const lv = leaveIndex(leave);
  const map = callMapOf(o.calls ?? []);
  /** @type {Block[]} */
  const blocks = [];

  const sites = [...new Set(o.lists.map(l => l.site))].sort((a, b) => (SITE_ORDER.indexOf(a) + 1 || 9) - (SITE_ORDER.indexOf(b) + 1 || 9) || a.localeCompare(b));
  /** @param {ListSlot} l @returns {boolean} */
  const closedList = l => l.status === 'closed' || (l.kind === 'clinic' && !!l.consultant && lv.blocks(l.consultant, l.day, l.session));

  /** @param {ListSlot} l @returns {Line} */
  function head(l) {
    const closed = closedList(l);
    const who = closed ? 'CLOSED' : l.consultant || (l.kind === 'hot' ? '' : 'EMPTY');
    const grey = closed || l.status === 'template' || l.status === 'empty';
    const nameText = style === 'hand' && l.kind === 'clinic' ? 'Clinic' : l.name;
    let t;
    if (style === 'core') t = `${l.site} ${nameText}${who ? ` - ${who}` : ''}`;
    else {
      const flag = closed ? ' (closed)' : !l.consultant && l.kind !== 'hot' ? ' (empty)' : '';
      t = `${[l.consultant, l.site, nameText, l.rooms].filter(Boolean).join(' ')}${l.patients != null && showPatients ? ` - ${l.patients}` : ''}${flag}`;
    }
    return { t, k: grey ? 'closed' : 'head', short: `${l.name}${closed ? ' (closed)' : l.consultant ? ` (${l.consultant})` : ''}` };
  }
  /** @param {string} day @param {'AM' | 'PM'} session @param {string} site @returns {Line[]} */
  function listLines(day, session, site) {
    const mine = o.lists.filter(l => l.day === day && l.session === session && l.site === site)
      .sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || natural(a.name, b.name) || natural(a.consultant ?? '', b.consultant ?? ''));
    return mine.flatMap(l => [head(l), ...juniorsOn(grid, day, session, l.id).map(n => /** @type {Line} */ ({ t: n, k: 'name' }))]);
  }

  for (const [session, section] of /** @type {const} */ ([['AM', SECTIONS.am], ['PM', SECTIONS.pm]])) {
    for (const site of sites) {
      const lines = days.map(d => listLines(d, session, site));
      if (lines.some(l => l.length)) blocks.push({ section, label: site, lines });
    }
  }
  for (const tier of TIERS) {
    const lines = days.map(d => {
      const name = map[d]?.[tier] ?? '';
      if (name) return [/** @type {Line} */ ({ t: name, k: 'text' })];
      return [{ t: DEFAULT_TIER_PLAN[dayType(d, holidays)].includes(tier) ? '–' : '', k: /** @type {LineKind} */ ('text') }];
    });
    blocks.push({ section: SECTIONS.call, label: TIER_LABEL[tier], lines, prefix: true });
  }
  /** @param {string} d @param {string} n @returns {string} the leave with its half day */
  const leaveText = (d, n) => {
    const am = lv.blocks(n, d, 'AM'), pm = lv.blocks(n, d, 'PM');
    return am && pm ? n : `${n} (${am ? 'AM' : 'PM'})`;
  };
  blocks.push({ section: SECTIONS.leave, label: '', lines: days.map(d => (sec.leave[d] ?? []).map(n => /** @type {Line} */ ({ t: leaveText(d, n), k: 'text' }))) });
  blocks.push({ section: SECTIONS.post, label: '', lines: days.map(d => (sec.postCall[d] ?? []).map(n => /** @type {Line} */ ({ t: n, k: 'text' }))) });
  if (built) {
    blocks.push({
      section: SECTIONS.free, label: '',
      lines: days.map(d => (sec.free[d] ?? []).map(f => /** @type {Line} */ ({
        t: style === 'core' ? `${f.name} (${f.when})` : f.why ? `${f.name} (on call)` : f.when === 'FULL DAY' ? f.name : `${f.name} (${f.when})`, k: 'text',
      }))),
    });
  }
  const [y, m, d] = o.monday.split('-').map(Number);
  return {
    title: weekTitleText(o.monday),
    sheet: `HRM ${d} ${MONTHS[m - 1]} ${y}`,
    style, days,
    dayHeads: days.map(day => `${weekdayName(day)} ${shortDay(day)}`),
    blocks, built,
  };
}

/**
 * The CORE sheet's rows: a header row (DEPARTMENTS and the days), then for each section a banner row, then each block as
 * as many rows as its longest day (the lines of a day run down its column). The first column carries the section banner and
 * the block's label (the site, the tier).
 * @param {WeekLayout} layout
 * @returns {{ head: string[], rows: SheetCell[][] }}
 */
export function coreRows(layout) {
  /** @type {SheetCell[][]} */
  const rows = [];
  let last = '';
  for (const b of layout.blocks) {
    if (b.section !== last) {
      rows.push([{ t: b.section, k: 'section' }, ...layout.days.map(() => /** @type {SheetCell} */ ({ t: '', k: 'section' }))]);
      last = b.section;
    }
    const n = Math.max(1, ...b.lines.map(l => l.length));
    for (let i = 0; i < n; i++) {
      rows.push([{ t: i === 0 ? b.label : '', k: 'label' },
        ...b.lines.map(l => /** @type {SheetCell} */ (l[i] ? { t: l[i].t, k: l[i].k } : { t: '', k: 'blank' }))]);
    }
  }
  return { head: ['DEPARTMENTS', ...layout.dayHeads], rows };
}

/**
 * The hand-made grid's rows: one per section, the first five always shown (AM sessions, PM sessions, on call, leave, post-call, free), each day's cell
 * the stacked lines of every block of that section. On-call lines carry their tier ("CON: name"), and an empty tier on a
 * day that has none is left out.
 * @param {WeekLayout} layout
 * @returns {{ title: string, section: string, cells: Line[][] }[]}
 */
export function handSections(layout) {
  /** @type {{ title: string, section: string, cells: Line[][] }[]} */
  const row0 = section => ({ title: HAND_NAMES[section] ?? section, section, cells: layout.days.map(() => /** @type {Line[]} */ ([])) });
  // the hand-made grid always has these rows, empty or not; FREE only once built
  const out = [SECTIONS.am, SECTIONS.pm, SECTIONS.call, SECTIONS.leave, SECTIONS.post].map(row0);
  for (const b of layout.blocks) {
    let row = out.find(r => r.section === b.section);
    if (!row) { row = row0(b.section); out.push(row); }
    b.lines.forEach((lines, i) => {
      for (const ln of lines) {
        if (b.prefix) { if (ln.t) row.cells[i].push({ ...ln, t: `${b.label}: ${ln.t}` }); } else row.cells[i].push(ln);
      }
    });
  }
  return out;
}

// ---- the month's calls ----
/**
 * @typedef {{ name: string, total: number, weekend: number, tiers: Record<string, number> }} CountRow
 * @typedef {object} CallsLayout
 * @property {string} title
 * @property {string} sheet
 * @property {string[]} head
 * @property {{ cells: string[], off: boolean }[]} rows  one per day; `off` marks a weekend or public holiday
 * @property {string[]} countsHead
 * @property {string[][]} counts
 */
/**
 * @param {{ month: string, calls: CallDay[], holidays?: string[], counts?: CountRow[] }} o
 * @returns {CallsLayout}
 */
export function callsLayout({ month, calls, holidays = [], counts = [] }) {
  const by = new Map(calls.map(c => [c.date, c]));
  const [y, m] = month.split('-').map(Number);
  return {
    title: `HRM on-call roster, ${MONTH_NAMES[m - 1]} ${y}`,
    sheet: `Calls ${MONTHS[m - 1]} ${y}`,
    head: ['Date', 'Day', ...TIERS.map(t => TIER_LABEL[t])],
    rows: monthDays(month).map(date => {
      const type = dayType(date, holidays), plan = DEFAULT_TIER_PLAN[type], row = by.get(date);
      return {
        off: type !== 'weekday',
        cells: [shortDay(date), `${weekdayName(date)}${holidays.includes(date) ? ' (PH)' : ''}`,
          ...TIERS.map(t => row?.[t] ?? (plan.includes(t) ? '' : '–'))],
      };
    }),
    countsHead: ['Name', 'Total', 'Weekend/PH', ...TIERS.map(t => TIER_LABEL[t])],
    counts: counts.filter(c => c.total > 0).map(c => [c.name, String(c.total), String(c.weekend), ...TIERS.map(t => String(c.tiers[t] ?? 0))]),
  };
}

