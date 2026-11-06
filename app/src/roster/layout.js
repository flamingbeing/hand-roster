// One layout for everything that leaves the app as a sheet: the xlsx export, the print view and the WhatsApp text are all
// made from the same blocks, so they cannot disagree. A week is a list of BLOCKS (a session at a site, the on-call tier,
// leave, post-call, free), each with its lines per day; `coreRows` lays them out like the CORE sheet (DEPARTMENTS column,
// one column per day, a list's header row then a row per junior) and `handSections` like the hand-made weekly grid (one
// row per section, the lines stacked in each day's cell). `handGrid` lays them out as the roster maker's own workbook, with
// her live formulas (a tally per person and an "accounted for everyone" check). The month's calls have their own small
// layout. Pure.
import { addDays, rangeDays, weekdayName, shortDay, MONTH_NAMES, MONTHS, monthDays } from './dates.js';
import { DEFAULT_TIER_PLAN, TIERS, TIER_LABEL, callMapOf, conText, consOf, dayType, isJunior, leaveIndex, tiersShown } from './model.js';
import { sectionsOf } from './sections.js';
import { juniorsOn } from './grid.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {'head' | 'closed' | 'name' | 'text'} LineKind  a list's header, a closed or empty list's header, a person, other text */
/**
 * @typedef {object} Line
 * @property {string} t
 * @property {LineKind} k
 * @property {string} [short]  a list header for the chat text: "KRWOT 3 (Dr X)"
 * @property {ListSlot['kind']} [kind]  a list header's kind and site (the hand-made grid's workbook groups and colours by them)
 * @property {string} [site]
 * @property {string} [who]  the person a line is about: a list header's consultant, a FREE line's person (with when and why)
 * @property {'AM' | 'PM' | 'FULL DAY'} [when]
 * @property {string} [why]
 * @property {boolean} [eot]  a list header for an emergency slot (its consultant away): the hand grid's EOT group
 */
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
 * @property {string[]} [holidays]  public holidays: their lists are closed
 * @property {import('./model.js').TierPlan} [tierPlan]  which call tiers each kind of day has (default DEFAULT_TIER_PLAN)
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
  const sec = sectionsOf({ monday: o.monday, people: o.people, leave, calls: o.calls ?? [], lists: o.lists, grid, postCallAm: o.postCallAm, holidays });
  const lv = leaveIndex(leave);
  const map = callMapOf(o.calls ?? []);
  /** @type {Block[]} */
  const blocks = [];

  const sites = [...new Set(o.lists.map(l => l.site))].sort((a, b) => (SITE_ORDER.indexOf(a) + 1 || 9) - (SITE_ORDER.indexOf(b) + 1 || 9) || a.localeCompare(b));
  /** @param {ListSlot} l @returns {boolean} */
  const closedList = l => l.status === 'closed' || (l.kind === 'clinic' && !!l.consultant && consOf(l).every(n => lv.blocks(n, l.day, l.session)));

  /** @param {ListSlot} l @returns {Line} */
  function head(l) {
    const closed = closedList(l);
    const con = conText(l);
    const who = closed ? (l.holiday ? 'CLOSED (PH)' : 'CLOSED') : l.emergency ? `EOT (${con || 'consultant'} away)` : con || (l.kind === 'hot' ? '' : 'EMPTY');
    // (the hand-made grid also greys a clinic with no patients booked)
    const grey = closed || l.status === 'template' || l.status === 'empty' || (style === 'hand' && l.patients === 0);
    const nameText = style === 'hand' && l.kind === 'clinic' ? 'Clinic' : l.name;
    let t;
    if (style === 'core') t = `${l.site} ${nameText}${who ? ` - ${who}` : ''}`;
    else {
      const flag = closed ? (l.holiday ? ' (public holiday)' : ' (closed)') : l.emergency ? ' EOT (consultant away)' : !l.consultant && l.kind !== 'hot' ? ' (empty)' : '';
      t = `${[con, l.site, nameText, l.rooms].filter(Boolean).join(' ')}${l.patients != null && showPatients ? ` (${l.patients} pts)` : ''}${flag}`;
    }
    return { t, k: grey ? 'closed' : 'head', short: `${l.name}${closed ? ' (closed)' : l.emergency ? ' (EOT)' : con ? ` (${con})` : ''}`, kind: l.kind, site: l.site,
      ...(con && !l.emergency ? { who: con } : {}), ...(l.emergency ? { eot: true } : {}) };
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
  const plan = o.tierPlan ?? DEFAULT_TIER_PLAN;
  for (const tier of tiersShown(plan, (o.calls ?? []).filter(c => days.includes(c.date)))) {
    const lines = days.map(d => {
      const name = map[d]?.[tier] ?? '';
      if (name) return [/** @type {Line} */ ({ t: name, k: 'text' })];
      return [{ t: plan[dayType(d, holidays)].includes(tier) ? '–' : '', k: /** @type {LineKind} */ ('text') }];
    });
    blocks.push({ section: SECTIONS.call, label: TIER_LABEL[tier], lines, prefix: true });
  }
  /** @param {string} d @param {string} n @returns {string} the leave with its half day */
  const leaveText = (d, n) => {
    const am = lv.blocks(n, d, 'AM'), pm = lv.blocks(n, d, 'PM');
    return am && pm ? n : `${n} (${am ? 'AM' : 'PM'})`;
  };
  blocks.push({ section: SECTIONS.leave, label: '', lines: days.map(d => (sec.leave[d] ?? []).map(n => /** @type {Line} */ ({ t: leaveText(d, n), k: 'text' }))) });
  // the hand-made grid marks the NTFGH MO's call: "(NTF)" on post call, "(NTF on call)" in the free row
  /** @param {string} d @param {string} n @returns {boolean} */
  const ntf = (d, n) => style === 'hand' && map[d]?.moNtf === n;
  blocks.push({ section: SECTIONS.post, label: '', lines: days.map(d => (sec.postCall[d] ?? []).map(n => /** @type {Line} */ ({ t: `${n}${ntf(addDays(d, -1), n) ? ' (NTF)' : ''}`, k: 'text' }))) });
  if (built) {
    blocks.push({
      section: SECTIONS.free, label: '',
      lines: days.map(d => (sec.free[d] ?? []).map(f => {
        const why = f.why && ntf(d, f.name) ? `NTF ${f.why}` : f.why;
        return /** @type {Line} */ ({
          t: style === 'core' ? `${f.name} (${f.when})` : why ? `${f.name} (${why})` : f.when === 'FULL DAY' ? f.name : `${f.name} (${f.when})`, k: 'text',
          who: f.name, when: f.when, ...(why ? { why } : {}),
        });
      })),
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
  /** @param {string} section @returns {{ title: string, section: string, cells: Line[][] }} */
  const row0 = section => ({ title: HAND_NAMES[section] ?? section, section, cells: layout.days.map(() => /** @type {Line[]} */ ([])) });
  // the hand-made grid always has these rows, empty or not; FREE only once built
  const out = [SECTIONS.am, SECTIONS.pm, SECTIONS.call, SECTIONS.leave, SECTIONS.post].map(s => row0(s));
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

// ---- the hand-made grid as a workbook ----
/** @typedef {'msp' | 'eot' | 'ot' | 'clinic' | 'admin' | 'al' | 'free' | 'post'} TallyKind  what a column of the tally counts */
/** @typedef {'clinic' | 'ot' | 'msp' | 'away' | 'grey'} Tone  a list header's colour: home-site clinic, home-site OT, MSP, another site, closed or no patients */
/**
 * @typedef {'title' | 'day' | 'date' | 'label' | 'head' | 'names' | 'skills' | 'free' | 'post' | 'text' | 'gap' | 'th' | 'who' | 'count'} HandKind
 *   title, the day names and dates, a row's label (column A), a list's header and its juniors, the Skills row (blue), the
 *   yellow rows (research, free, leave copied), post-call (orange), plain text (leave, on call), the grey gap between AM and
 *   PM, and the side tables' headers, names and counts
 * @typedef {object} HandCell  one cell of the hand-made grid's sheet
 * @property {number} r  row, from 1
 * @property {number} c  column, from 1 (A = 1)
 * @property {HandKind} k
 * @property {string | number} [v]  the text, or a formula's result (shown before Excel recalculates)
 * @property {string} [f]  an Excel formula, without the "="
 * @property {Tone} [tone]  a list header's colour
 * @typedef {[number, number]} Rows  first and last row of a band B:F
 * @typedef {object} HandGrid
 * @property {string} title
 * @property {string} sheet
 * @property {HandCell[]} cells
 * @property {number} last  the last row of the printed grid (columns A:F)
 * @property {Record<TallyKind, Rows[]>} ranges  the bands each tally column counts in
 * @property {Rows} am  the bands the "accounted for everyone" check reads: AM lists to the leave copied in
 * @property {Rows} pm  PM lists to the leave row
 * @property {Record<string, number>} rowOf  the named rows: skills, amResearch, amFree, amLeave, post, pmResearch, pmFree, leave, call
 * @property {string[]} juniors  one tally and check row each
 */

/** the tally's columns, as the roster maker heads them; EOT counts the emergency slots (an OT list whose consultant is away) */
export const TALLY = /** @type {[TallyKind, string][]} */ ([
  ['msp', 'MSP/ LA OT'], ['eot', 'EOT'], ['ot', 'Elective OT'], ['clinic', 'Clinic'], ['admin', 'Admin/ Research/ Skills'],
  ['al', 'AL'], ['free', 'Free on call/other commitments'], ['post', 'Post-call'],
]);
/** rows the roster maker keeps under the grid for her own notes; the app has nothing to put in them */
export const NOTE_ROWS = ['Ortho Reg', 'Special Clinic', 'NUH Locums', 'NTF Locums', 'Outposters', 'Fam Med', 'ED', 'RAI'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GROUPS = /** @type {const} */ (['clinic', 'ot', 'eot', 'msp']);
/** where the side tables sit: the check in H (names) and I:M (days), the tally in T (names), U:AB (kinds), AC (total) */
export const HAND_COLS = { check: 8, tally: 20 };

/** @param {number} n a column from 1 @returns {string} its letters: 1 -> A, 28 -> AB */
export function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** @param {string} s @returns {string} the text as the formulas read it: commas as spaces, a space each end */
const padded = s => ` ${s.replace(/,/g, ' ')} `;
/** @param {string} s @returns {string} a formula's string literal */
const lit = s => `"${s.replace(/"/g, '""')}"`;

/**
 * The week as the roster maker's hand-made workbook: the title over A:F, the day names and dates, then the AM block (a
 * group of rows per site and kind, two rows a list: its header, then its juniors joined by " + "; rows inserted inside a group
 * in Excel are taken into its formulas), Skills, Research, the AM free row and the leave copied in by formula; a grey gap; the PM
 * block likewise with Post call, Research, the PM free row, On leave and On call; then her note rows. Beside the grid, two
 * tables of live formulas over the bands written here (so they stay right when the lists change): "Have you accounted for
 * everyone?" (H:M, how often each junior is named that day and session, 1 when right) and the tally (T:AC, the sessions of
 * each kind per junior: list bands by kind, the Skills/Research rows, leave, the free rows, post-call). A name is matched as
 * whole words between spaces (commas read as spaces), so "Dr Jo" never counts "Dr Joe". Each formula's result is worked
 * out here the same way.
 * @param {WeekLayout} layout  a 'hand' layout
 * @param {Person[]} people  the juniors among them who appear in the week get a tally and check row
 * @returns {HandGrid}
 */
export function handGrid(layout, people) {
  const days = layout.days, nd = days.length, home = SITE_ORDER[0];
  /** @type {HandCell[]} */
  const cells = [];
  /** @type {Map<string, string>} the text of each cell of the grid, B:F, for the formulas' results */
  const text = new Map();
  /** @param {HandCell} cell */
  const put = cell => { cells.push(cell); if (cell.c >= 2 && cell.c <= 1 + nd && typeof cell.v === 'string') text.set(`${cell.r},${cell.c}`, cell.v); };
  /** @type {Record<TallyKind, Rows[]>} */
  const ranges = { msp: [], eot: [], ot: [], clinic: [], admin: [], al: [], free: [], post: [] };
  /** @type {Record<string, number>} */
  const rowOf = {};
  /** @param {string} section @returns {Block[]} */
  const blocksOf = section => layout.blocks.filter(b => b.section === section);
  /** @param {string} section @param {number} i @returns {Line[]} day i's lines of a section's blocks */
  const linesOf = (section, i) => blocksOf(section).flatMap(b => b.lines[i] ?? []);
  /** @param {number} r @param {string} label @param {HandKind} k @param {(i: number) => string} day */
  const row = (r, label, k, day) => {
    put({ r, c: 1, k: 'label', v: label });
    days.forEach((_, i) => put({ r, c: 2 + i, k, v: day(i) }));
  };
  /** @param {Line} l @returns {'clinic' | 'ot' | 'eot' | 'msp'} */
  const groupOf = l => (l.eot ? 'eot' : l.kind === 'msp' ? 'msp' : l.kind === 'clinic' || l.kind === 'hot' ? 'clinic' : 'ot');

  put({ r: 1, c: 1, k: 'title', v: layout.title });
  days.forEach((d, i) => { put({ r: 2, c: 2 + i, k: 'day', v: DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()] }); put({ r: 3, c: 2 + i, k: 'date', v: d }); });

  /** writes a session's lists from row r, one group per site and kind @param {string} section @param {string[]} label @param {number} r @returns {number} the next row */
  function lists(section, label, r) {
    const top = r;
    for (const b of blocksOf(section)) {
      // each day's lists at this site: a header line, then its juniors
      const perDay = b.lines.map(lines => {
        /** @type {{ head: Line, names: string[] }[]} */
        const out = [];
        for (const l of lines) {
          if (l.k === 'head' || l.k === 'closed') out.push({ head: l, names: [] });
          else if (l.k === 'name' && out.length) out[out.length - 1].names.push(l.t);
        }
        return out;
      });
      for (const g of GROUPS) {
        // (the HOT clinic after the clinics, as on her sheet)
        const mine = perDay.map(ls => ls.filter(x => groupOf(x.head) === g).sort((x, y) => Number(x.head.kind === 'hot') - Number(y.head.kind === 'hot')));
        const n = Math.max(0, ...mine.map(ls => ls.length));
        if (!n) continue;
        mine.forEach((ls, i) => ls.forEach((x, j) => {
          const tone = x.head.k === 'closed' ? 'grey' : g === 'msp' ? 'msp' : x.head.site !== home ? 'away' : g === 'eot' ? 'ot' : g;
          put({ r: r + 2 * j, c: 2 + i, k: 'head', v: x.head.t, tone });
          put({ r: r + 2 * j + 1, c: 2 + i, k: 'names', v: x.names.join(' + ') });
        }));
        ranges[g].push([r, r + 2 * n - 1]);
        r += 2 * n;
      }
    }
    r = Math.max(r, top + label.length);
    label.forEach((t, i) => put({ r: top + i, c: 1, k: 'label', v: t }));
    return r;
  }
  /** @param {number} i @param {'AM' | 'PM'} s @returns {string} who is free that session, and why; like her sheet, not someone on a list then (on call but in an AM list, or running their own clinic) */
  const freeText = (i, s) => {
    const busy = new Set(linesOf(s === 'AM' ? SECTIONS.am : SECTIONS.pm, i).map(l => (l.k === 'name' ? l.t : l.who)));
    return linesOf(SECTIONS.free, i).filter(l => l.who && l.when !== (s === 'AM' ? 'PM' : 'AM') && !busy.has(l.who))
      .map(l => `${l.who}${l.why ? ` (${l.why})` : ''}`).join(', ');
  };
  const leaveText = (/** @type {number} */ i) => linesOf(SECTIONS.leave, i).map(l => l.t).join(', ');

  // AM
  const amTop = 4;
  let r = lists(SECTIONS.am, ['AM sessions', 'and staff', 'distribution'], amTop);
  rowOf.skills = r; row(r, 'Skills', 'skills', () => ''); ranges.admin.push([r, r]); r++;
  rowOf.amResearch = r; row(r, 'Research', 'free', () => ''); ranges.admin.push([r, r]); r++;
  rowOf.amFree = r; row(r, 'Free period on call/other commitments', 'free', i => freeText(i, 'AM')); ranges.free.push([r, r]); r++;
  rowOf.amLeave = r; row(r, 'On leave', 'free', () => ''); r++; // filled with formulas once the leave row is known
  for (let g = 0; g < 2; g++, r++) for (let c = 1; c <= 1 + nd; c++) put({ r, c, k: 'gap' });
  // PM
  const pmTop = r;
  r = lists(SECTIONS.pm, ['PM sessions', 'and staff', 'distribution'], pmTop);
  rowOf.post = r; row(r, 'Post call', 'post', i => linesOf(SECTIONS.post, i).map(l => l.t).join(', ')); ranges.post.push([r, r]); r++;
  rowOf.pmResearch = r; row(r, 'Research', 'free', () => ''); ranges.admin.push([r, r]); r++;
  rowOf.pmFree = r; row(r, 'Free period on call/other commitments', 'free', i => freeText(i, 'PM')); ranges.free.push([r, r]); r++;
  rowOf.leave = r; row(r, 'On leave', 'text', leaveText); ranges.al.push([r, r]); r++;
  // on call: everyone on call that day, consultant first, the NTFGH MO marked "(NTF)" as she does
  rowOf.call = r;
  row(r, 'On call', 'text', i => blocksOf(SECTIONS.call).map(b => {
    const t = b.lines[i]?.[0]?.t ?? '';
    return t && t !== '–' ? `${t}${b.label === TIER_LABEL.moNtf ? ' (NTF)' : ''}` : '';
  }).filter(Boolean).join(', '));
  r += 2;
  for (const label of NOTE_ROWS) row(r++, label, 'text', () => '');
  const last = r - 1;
  // the leave copied into the AM block, by formula (so a change to the leave row carries up)
  for (let i = 0; i < nd; i++) {
    const cell = /** @type {HandCell} */ (cells.find(x => x.r === rowOf.amLeave && x.c === 2 + i));
    cell.f = `${colName(2 + i)}${rowOf.leave}`;
    cell.v = leaveText(i);
    text.set(`${cell.r},${cell.c}`, cell.v);
  }

  // ---- the formulas' results, worked out the way Excel will ----
  /** @param {Rows} band @param {(t: string) => number} each @param {number} [only] one column @returns {number} */
  const over = ([a, b], each, only) => {
    let n = 0;
    for (let rr = a; rr <= b; rr++) for (let c = 2; c <= 1 + nd; c++) if (only == null || c === only) n += each(text.get(`${rr},${c}`) ?? '');
    return n;
  };
  /** SEARCH: the cells naming the person, any case @param {Rows[]} bands @param {string} name */
  const cellsNaming = (bands, name) => bands.reduce((n, band) => n + over(band, t => (padded(t).toLowerCase().includes(` ${name.toLowerCase()} `) ? 1 : 0)), 0);
  /** SUBSTITUTE: how often a whole phrase is in a band's cells of one column, case as typed @param {Rows} band @param {number} c @param {string} needle */
  const times = (band, c, needle) => over(band, t => padded(t).split(needle).length - 1, c);

  const allBands = Object.values(ranges).flat();
  const juniors = people.filter(isJunior).map(p => p.name).filter(n => cellsNaming(allBands, n) > 0);

  // the tally: T names, U:AB a column per kind, AC the row's total
  const T = HAND_COLS.tally, tc = colName(T), first = colName(2), lastCol = colName(1 + nd);
  put({ r: 3, c: T, k: 'th', v: 'Sessions' });
  TALLY.forEach(([, head], j) => put({ r: 3, c: T + 1 + j, k: 'th', v: head }));
  put({ r: 3, c: T + 1 + TALLY.length, k: 'th', v: 'Total' });
  juniors.forEach((name, i) => {
    const tr = 4 + i;
    put({ r: tr, c: T, k: 'who', v: name });
    let total = 0;
    TALLY.forEach(([kind], j) => {
      const bands = ranges[kind];
      if (!bands.length) { put({ r: tr, c: T + 1 + j, k: 'count' }); return; }
      const v = cellsNaming(bands, name);
      total += v;
      put({ r: tr, c: T + 1 + j, k: 'count', v,
        f: bands.map(([a, b]) => `SUMPRODUCT(--ISNUMBER(SEARCH(" "&$${tc}${tr}&" "," "&SUBSTITUTE($${first}$${a}:$${lastCol}$${b},","," ")&" ")))`).join('+') });
    });
    put({ r: tr, c: T + 1 + TALLY.length, k: 'count', v: total, f: `SUM(${colName(T + 1)}${tr}:${colName(T + TALLY.length)}${tr})` });
  });

  // "Have you accounted for everyone?": H names, I:M the days, AM then PM. A half day of leave is in the leave row as
  // "name (AM)" or "name (PM)"; the other session's check takes it off again.
  const H = HAND_COLS.check, hc = colName(H);
  /** @param {number} top @param {'AM' | 'PM'} s @param {Rows} band @returns {number} the row after the table */
  function check(top, s, band) {
    days.forEach((d, i) => { put({ r: top, c: H + 1 + i, k: 'th', v: DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()][0] }); put({ r: top + 1, c: H + 1 + i, k: 'th', v: s }); });
    put({ r: top, c: H, k: 'th', v: '' });
    const other = s === 'AM' ? ' (PM)' : ' (AM)';
    juniors.forEach((name, j) => {
      const rr = top + 2 + j;
      put({ r: rr, c: H, k: 'who', v: name });
      days.forEach((_, i) => {
        const col = colName(2 + i), rng = `${col}$${band[0]}:${col}$${band[1]}`;
        const hay = `" "&SUBSTITUTE(${rng},","," ")&" "`;
        /** @param {string} needle */
        const occ = needle => `SUMPRODUCT((LEN(${hay})-LEN(SUBSTITUTE(${hay},${needle},"")))/LEN(${needle}))`;
        put({ r: rr, c: H + 1 + i, k: 'count',
          f: `${occ(`" "&$${hc}${rr}&" "`)}-${occ(`" "&$${hc}${rr}&${lit(`${other} `)}`)}`,
          v: times(band, 2 + i, ` ${name} `) - times(band, 2 + i, ` ${name}${other} `) });
      });
    });
    return top + 2 + juniors.length;
  }
  const am = /** @type {Rows} */ ([amTop, rowOf.amLeave]), pm = /** @type {Rows} */ ([pmTop, rowOf.leave]);
  put({ r: amTop, c: H, k: 'label', v: 'Have you accounted for everyone? (Text is case sensitive)' });
  const amEnd = check(amTop + 1, 'AM', am);
  check(Math.max(pmTop, amEnd + 1), 'PM', pm);

  return { title: layout.title, sheet: layout.sheet, cells, last, ranges, am, pm, rowOf, juniors };
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
 * @param {{ month: string, calls: CallDay[], holidays?: string[], counts?: CountRow[], tierPlan?: import('./model.js').TierPlan }} o
 * @returns {CallsLayout}
 */
export function callsLayout({ month, calls, holidays = [], counts = [], tierPlan = DEFAULT_TIER_PLAN }) {
  const by = new Map(calls.map(c => [c.date, c]));
  const tiers = tiersShown(tierPlan, calls.filter(c => c.date.startsWith(month)));
  const [y, m] = month.split('-').map(Number);
  return {
    title: `HRM on-call roster, ${MONTH_NAMES[m - 1]} ${y}`,
    sheet: `Calls ${MONTHS[m - 1]} ${y}`,
    head: ['Date', 'Day', ...tiers.map(t => TIER_LABEL[t])],
    rows: monthDays(month).map(date => {
      const type = dayType(date, holidays), plan = tierPlan[type], row = by.get(date);
      return {
        off: type !== 'weekday',
        cells: [shortDay(date), `${weekdayName(date)}${holidays.includes(date) ? ' (PH)' : ''}`,
          ...tiers.map(t => row?.[t] ?? (plan.includes(t) ? '' : '–'))],
      };
    }),
    countsHead: ['Name', 'Total', 'Weekend/PH', ...tiers.map(t => TIER_LABEL[t])],
    counts: counts.filter(c => c.total > 0).map(c => [c.name, String(c.total), String(c.weekend), ...tiers.map(t => String(c.tiers[t] ?? 0))]),
  };
}

