// The sheet layout (CORE and hand-made grid), the calls layout, the chat text and the xlsx writer (with the vendored
// ExcelJS read back). Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekLayout, coreRows, handSections, handGrid, callsLayout, weekRange, weekTitleText, longDay, colName, TALLY, HAND_COLS } from '../src/roster/layout.js';
import { whatsappText, weekText, DAY_SEPARATOR } from '../src/roster/whatsapp.js';
import { buildWeekWorkbook, buildHandWorkbook, buildCallsWorkbook, sheetName } from '../src/roster/xlsx.js';
import { nextWorkday } from '../src/roster/dates.js';
import { gridRows } from '../src/roster/grid.js';
import { sectionsOf } from '../src/roster/sections.js';
import { isJunior, settleLists } from '../src/roster/model.js';

const MON = '2026-11-02', TUE = '2026-11-03', SAT = '2026-11-07';
const people = [
  { name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'reg' }, { name: 'Dr Cat Test', grade: 'mo' },
  { name: 'Dr Dan Test', grade: 'mo' }, { name: 'Dr Eve Test', grade: 'con' }, { name: 'Dr Fay Test', grade: 'con' },
];
/** @type {import('../src/roster/model.js').ListSlot[]} */
const lists = [
  { id: 'ot1-am', site: 'NUH', kind: 'ot', name: 'KRWOT 3', day: MON, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 2 },
  { id: 'cl-am', site: 'NUH', kind: 'clinic', name: 'CLINIC', day: MON, session: 'AM', consultant: 'Dr Fay Test', status: 'open', need: 1, rooms: 'G03/04', patients: 12 },
  { id: 'ot2-pm', site: 'NTFGH', kind: 'ot', name: 'NTFGH OT 15', day: MON, session: 'PM', consultant: null, status: 'open', need: 1 },
  { id: 'cl-tue', site: 'NUH', kind: 'clinic', name: 'CLINIC', day: TUE, session: 'AM', consultant: 'Dr Fay Test', status: 'open', need: 1 },
  { id: 'hot', site: 'NUH', kind: 'hot', name: 'HOT', day: MON, session: 'PM', consultant: null, status: 'open', need: 1 },
];
const grid = [
  { day: MON, session: /** @type {'AM'} */ ('AM'), list: 'ot1-am', juniors: ['Dr Ann Test', 'Dr Cat Test'] },
  { day: MON, session: /** @type {'AM'} */ ('AM'), list: 'cl-am', juniors: ['Dr Dan Test'] },
  { day: MON, session: /** @type {'PM'} */ ('PM'), list: 'hot', juniors: ['Dr Ann Test'] },
];
const leave = [
  { name: 'Dr Fay Test', from: TUE, to: TUE },
  { name: 'Dr Ben Test', from: MON, to: MON, session: /** @type {'PM'} */ ('PM') },
];
const calls = [
  { date: '2026-11-01', con: 'Dr Eve Test', reg: 'Dr Ben Test', moNuh: 'Dr Cat Test', moNtf: null },
  { date: MON, con: 'Dr Fay Test', reg: 'Dr Ann Test', moNuh: 'Dr Dan Test', moNtf: 'Dr Cat Test' },
  { date: SAT, con: 'Dr Eve Test', reg: 'Dr Ben Test', moNuh: null, moNtf: null },
];
const base = { monday: MON, lists, grid, people, leave, calls, built: true };

test('titles: the hand-made roster title and the week range across months and years', () => {
  assert.equal(weekRange('2026-11-02'), '2 - 6 November 2026');
  assert.equal(weekRange('2026-10-26'), '26 - 30 October 2026');
  assert.equal(weekRange('2026-11-30'), '30 November - 4 December 2026');
  assert.equal(weekRange('2026-12-28'), '28 December 2026 - 1 January 2027');
  assert.equal(weekTitleText(MON), 'HRM Registrar/Fellows/Medical Officer Daily Roster (2 - 6 November 2026)');
  assert.equal(longDay(TUE), 'Tue 3 Nov 2026');
  assert.equal(nextWorkday('2026-11-06'), '2026-11-09');
  assert.equal(nextWorkday('2026-11-02'), '2026-11-03');
  assert.equal(nextWorkday('2026-11-06', []), '2026-11-09');
  assert.equal(nextWorkday('2026-11-07', ['2026-11-09']), '2026-11-10', 'a Monday holiday is skipped');
  assert.equal(nextWorkday('2026-12-24', ['2026-12-25']), '2026-12-28', 'a Friday holiday is skipped, then the weekend');
});

test('core rows: DEPARTMENTS plus seven days, sections, list header then juniors, closed clinics', () => {
  const layout = weekLayout({ ...base, style: 'core' });
  const { head, rows } = coreRows(layout);
  assert.deepEqual(head, ['DEPARTMENTS', 'Mon 2 Nov', 'Tue 3 Nov', 'Wed 4 Nov', 'Thu 5 Nov', 'Fri 6 Nov', 'Sat 7 Nov', 'Sun 8 Nov']);
  assert.ok(rows.every(r => r.length === 8), 'every row spans the same columns');
  const sections = rows.filter(r => r[0].k === 'section').map(r => r[0].t);
  assert.deepEqual(sections, ['MORNING SESSION', 'AFTERNOON SESSION', 'ON-CALL', 'LEAVE', 'POST-CALL', 'FREE']);
  const text = (/** @type {number} */ col) => rows.map(r => r[col].t);
  const mon = text(1);
  const am = mon.indexOf('NUH KRWOT 3 - Dr Eve Test');
  assert.ok(am > 0);
  assert.deepEqual(mon.slice(am, am + 4), ['NUH KRWOT 3 - Dr Eve Test', 'Dr Ann Test', 'Dr Cat Test', 'NUH CLINIC - Dr Fay Test']);
  assert.equal(rows[am][0].t, 'NUH', 'the site is named on the block\'s first row');
  assert.ok(mon.includes('NTFGH NTFGH OT 15 - EMPTY'), 'a list with no consultant is EMPTY');
  assert.ok(mon.includes('NUH HOT'), 'the HOT clinic has no consultant label');
  const tue = text(2);
  assert.ok(tue.includes('NUH CLINIC - CLOSED'), 'a clinic whose consultant is on leave is closed');
  assert.equal(rows.find(r => r[2].t === 'NUH CLINIC - CLOSED')?.[2].k, 'closed');
});

/** a plan with fewer tiers at the weekend (the app's first default), for the "tier a day does not have" cases */
const OLD_PLAN = { weekday: ['con', 'reg', 'moNuh', 'moNtf'], sat: ['con', 'reg'], sun: ['con'], ph: ['con', 'reg'] };

test('core rows: ON-CALL by tier incl. the weekend, LEAVE with halves, POST-CALL, FREE with its words', () => {
  const { rows } = coreRows(weekLayout({ ...base, style: 'core', tierPlan: OLD_PLAN }));
  const rowAt = (/** @type {string} */ label) => rows.find(r => r[0].t === label && r[0].k === 'label');
  assert.deepEqual(rowAt('CON')?.map(c => c.t).slice(1, 7), ['Dr Fay Test', '–', '–', '–', '–', 'Dr Eve Test']);
  assert.equal(rowAt('MO (NUH)')?.[6].t, '', 'a tier a Saturday does not have is blank');
  assert.equal(rowAt('REG')?.[6].t, 'Dr Ben Test');
  const all = rows.flatMap(r => r.map(c => c.t));
  assert.ok(all.includes('Dr Ben Test (PM)'), 'half-day leave says which half');
  assert.ok(all.includes('Dr Fay Test'));
  // post-call: Sunday's callers are post-call on Monday
  const post = rows.slice(rows.findIndex(r => r[0].t === 'POST-CALL'), rows.findIndex(r => r[0].t === 'FREE'));
  assert.deepEqual(post.map(r => r[1].t).filter(Boolean), ['Dr Ben Test', 'Dr Cat Test']);
  const free = rows.slice(rows.findIndex(r => r[0].t === 'FREE')).map(r => r[1].t).filter(Boolean);
  assert.ok(free.includes('Dr Ann Test (FULL DAY)'), 'Ann is on call on Monday so she is FREE the whole day');
  assert.ok(free.includes('Dr Dan Test (FULL DAY)'));
});

test('no FREE section until the week is built', () => {
  const layout = weekLayout({ ...base, grid: [], built: false });
  assert.equal(layout.blocks.some(b => b.section === 'FREE'), false);
});

test('hand grid: title, one row per section, "Consultant SITE Clinic rooms (patients)" headers, tiered on-call lines', () => {
  const layout = weekLayout({ ...base, style: 'hand' });
  assert.equal(layout.days.length, 5);
  assert.equal(layout.title, 'HRM Registrar/Fellows/Medical Officer Daily Roster (2 - 6 November 2026)');
  const sections = handSections(layout);
  assert.deepEqual(sections.map(s => s.title), ['AM sessions', 'PM sessions', 'On call', 'Leave', 'Post-call', 'Free']);
  const am = sections[0].cells[0].map(l => l.t);
  assert.ok(am.includes('Dr Fay Test NUH Clinic G03/04 (12 pts)'));
  assert.ok(am.includes('Dr Eve Test NUH KRWOT 3'));
  const pm = sections[1].cells[0].map(l => l.t);
  assert.ok(pm.includes('NTFGH NTFGH OT 15 (empty)'));
  assert.deepEqual(sections[2].cells[0].map(l => l.t), ['CON: Dr Fay Test', 'REG: Dr Ann Test', 'MO (NUH): Dr Dan Test', 'MO (NTFGH): Dr Cat Test']);
  assert.ok(sections[1].cells[1].length === 0, 'no PM lists on Tuesday');
  assert.ok(sections[5].cells[0].some(l => l.t === 'Dr Ann Test (on call)'));
  const noPatients = handSections(weekLayout({ ...base, style: 'hand', patients: false }))[0].cells[0].map(l => l.t);
  assert.ok(noPatients.includes('Dr Fay Test NUH Clinic G03/04'));
  const empty = handSections(weekLayout({ monday: '2026-11-02', style: 'hand', lists: [], people: [] }));
  assert.deepEqual(empty.map(s => s.title), ['AM sessions', 'PM sessions', 'On call', 'Leave', 'Post-call'], 'an empty week still prints the five rows');
});

test('calls layout: a row a day, four tiers, off days marked, counts without the idle', () => {
  const cl = callsLayout({
    month: '2026-11', calls, holidays: ['2026-11-08'], tierPlan: OLD_PLAN,
    counts: [{ name: 'Dr Ann Test', total: 1, weekend: 0, tiers: { reg: 1 } }, { name: 'Dr Zed Test', total: 0, weekend: 0, tiers: {} }],
  });
  assert.deepEqual(cl.head, ['Date', 'Day', 'CON', 'REG', 'MO (NUH)', 'MO (NTFGH)']);
  assert.equal(cl.rows.length, 30);
  assert.deepEqual(cl.rows[1].cells, ['2 Nov', 'Mon', 'Dr Fay Test', 'Dr Ann Test', 'Dr Dan Test', 'Dr Cat Test']);
  assert.deepEqual(cl.rows[6].cells, ['7 Nov', 'Sat', 'Dr Eve Test', 'Dr Ben Test', '–', '–']);
  assert.equal(cl.rows[6].off, true);
  assert.equal(cl.rows[7].cells[1], 'Sun (PH)');
  assert.equal(cl.rows[2].cells[2], '', 'a weekday with no call yet is blank, not a dash');
  assert.deepEqual(cl.counts, [['Dr Ann Test', '1', '0', '0', '1', '0', '0']]);
  assert.equal(cl.title, 'HRM on-call roster, November 2026');
  // the default: all four tiers every day, a blank where nobody is entered; REG 2 gets a column once a day has one
  const now = callsLayout({ month: '2026-11', calls: [...calls, { date: '2026-11-19', reg2: 'Dr Ann Test' }] });
  assert.deepEqual(now.head, ['Date', 'Day', 'CON', 'REG', 'REG 2', 'MO (NUH)', 'MO (NTFGH)']);
  assert.deepEqual(now.rows[6].cells, ['7 Nov', 'Sat', 'Dr Eve Test', 'Dr Ben Test', '–', '', '']);
  assert.equal(now.rows[18].cells[4], 'Dr Ann Test');
});

test('whatsapp text: tomorrow\'s lists by site, on call, leave, post-call and free', () => {
  const t = whatsappText(MON, base).split('\n');
  assert.equal(t[0], 'HRM roster, Mon 2 Nov 2026');
  const at = (/** @type {string} */ s) => t.indexOf(s);
  assert.ok(at('MORNING') > 0 && at('AFTERNOON') > at('MORNING'));
  assert.ok(t.includes('KRWOT 3 (Dr Eve Test): Dr Ann Test, Dr Cat Test'));
  assert.ok(t.includes('CLINIC (Dr Fay Test): Dr Dan Test'));
  assert.ok(t.includes('CON: Dr Fay Test') && t.includes('MO (NTFGH): Dr Cat Test'));
  assert.ok(t.some(l => l.startsWith('LEAVE: ') && l.includes('Dr Ben Test (PM)')));
  assert.ok(t.some(l => l.startsWith('POST-CALL: ')));
  const tue = whatsappText(TUE, base);
  assert.ok(tue.includes('CLINIC (closed)'), 'the closed clinic reads as closed');
  const sat = whatsappText(SAT, base);
  assert.ok(sat.includes('No lists at the weekend.') && sat.includes('CON: Dr Eve Test') && !sat.includes('MO (NUH)'));
  assert.equal(whatsappText('2026-12-01', base), '', 'a day outside the week gives nothing');
  assert.ok(!/[*_~`]/.test(whatsappText(MON, base)), 'plain text, no markup characters');
});

test('whatsapp text: a public holiday says so in its title, its lists read as closed', () => {
  const o = { ...base, holidays: [MON], lists: settleLists(lists, { holidays: [MON] }) };
  const t = whatsappText(MON, o).split('\n');
  assert.equal(t[0], 'HRM roster, Mon 2 Nov 2026 (public holiday)');
  assert.ok(t.includes('CLINIC (closed): Dr Dan Test') && t.includes('CON: Dr Fay Test'));
  assert.equal(whatsappText(TUE, o).split('\n')[0], 'HRM roster, Tue 3 Nov 2026', 'only the holiday is marked');
});

test('whatsapp week text: the five weekdays in order, a blank line and a separator between them, an empty day left out', () => {
  const t = weekText(base);
  const days = t.split(`\n\n${DAY_SEPARATOR}\n\n`);
  assert.equal(days.length, 5);
  assert.deepEqual(days.map(d => d.split('\n')[0]), ['Mon 2 Nov', 'Tue 3 Nov', 'Wed 4 Nov', 'Thu 5 Nov', 'Fri 6 Nov'].map(d => `HRM roster, ${d} 2026`));
  assert.equal(days[0], whatsappText(MON, base));
  assert.ok(!t.includes('Sat 7 Nov') && !/[*_~`]/.test(t), 'no weekend, no markup characters');
  // a day with no text (outside the week) is left out: no empty block, no doubled separator
  const some = weekText(base, [MON, '2026-12-01', TUE]);
  assert.equal(some, `${whatsappText(MON, base)}\n\n${DAY_SEPARATOR}\n\n${whatsappText(TUE, base)}`);
});

/** @param {import('../src/roster/layout.js').HandGrid} g */
const cellsOf = g => {
  const by = new Map(g.cells.map(c => [`${c.r},${c.c}`, c]));
  return (/** @type {number} */ r, /** @type {number} */ c) => by.get(`${r},${c}`);
};
/** @param {string} f @returns {[number, number][]} the B:F bands a tally formula reads */
const bandsIn = f => [...f.matchAll(/\$B\$(\d+):\$F\$(\d+)/g)].map(m => /** @type {[number, number]} */ ([Number(m[1]), Number(m[2])]));

test('hand grid workbook: her rows, a band of rows per site and kind, the leave copied up, and the side tables', () => {
  const g = handGrid(weekLayout({ ...base, style: 'hand' }), people);
  const at = cellsOf(g);
  assert.equal(at(1, 1)?.v, 'HRM Registrar/Fellows/Medical Officer Daily Roster (2 - 6 November 2026)');
  assert.deepEqual([2, 3, 4, 5, 6].map(c => at(2, c)?.v), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.equal(at(3, 2)?.v, MON);
  assert.deepEqual([4, 5, 6].map(r => at(r, 1)?.v), ['AM sessions', 'and staff', 'distribution']);
  // AM at NUH: the clinic band, then the OT band, each a header row and a names row per list
  assert.deepEqual(g.ranges.clinic[0], [4, 5]);
  assert.deepEqual([at(4, 2)?.v, at(4, 2)?.tone, at(5, 2)?.v], ['Dr Fay Test NUH Clinic G03/04 (12 pts)', 'clinic', 'Dr Dan Test']);
  assert.equal(at(4, 3)?.tone, 'grey', 'Tuesday\'s clinic is closed (the consultant is on leave)');
  assert.deepEqual(g.ranges.ot[0], [6, 7]);
  assert.deepEqual([at(6, 2)?.v, at(6, 2)?.tone, at(7, 2)?.v], ['Dr Eve Test NUH KRWOT 3', 'ot', 'Dr Ann Test + Dr Cat Test']);
  assert.equal(g.rowOf.skills, 8, 'Skills right under the last band');
  // PM: the HOT clinic is a clinic; NTFGH's OT is another site's colour
  const pmOt = g.ranges.ot[1];
  assert.equal(at(pmOt[0], 2)?.tone, 'away');
  assert.equal(g.ranges.msp.length, 0, 'no MSP lists this week');
  // the named rows, labelled as hers
  const label = (/** @type {string} */ key) => at(g.rowOf[key], 1)?.v;
  assert.deepEqual(['skills', 'amResearch', 'amFree', 'amLeave', 'post', 'pmResearch', 'pmFree', 'leave', 'call'].map(label),
    ['Skills', 'Research', 'Free period on call/other commitments', 'On leave', 'Post call', 'Research', 'Free period on call/other commitments', 'On leave', 'On call']);
  assert.ok(g.rowOf.amLeave < g.am[1] + 1 && g.am[1] === g.rowOf.amLeave && g.pm[1] === g.rowOf.leave);
  assert.equal(at(g.rowOf.leave, 2)?.v, 'Dr Ben Test (PM)');
  assert.deepEqual([at(g.rowOf.amLeave, 2)?.f, at(g.rowOf.amLeave, 2)?.v], [`B${g.rowOf.leave}`, 'Dr Ben Test (PM)'], 'the leave is copied up by formula');
  assert.equal(at(g.rowOf.call, 2)?.v, 'Dr Fay Test, Dr Ann Test, Dr Dan Test, Dr Cat Test (NTF)');
  assert.equal(at(g.rowOf.post, 2)?.v, 'Dr Ben Test, Dr Cat Test');
  // Monday: Cat and Dan are on call but on AM lists, so free ("on call") only in the PM, as on her sheet; Ann is on call
  // and on the HOT clinic in the PM, so not free at all; Ben, post-call, is free in the AM
  assert.equal(at(g.rowOf.amFree, 2)?.v, 'Dr Ben Test');
  assert.equal(at(g.rowOf.pmFree, 2)?.v, 'Dr Cat Test (NTF on call), Dr Dan Test (on call)');
  // bands by kind: what each tally column reads
  assert.deepEqual(g.ranges.admin, [[g.rowOf.skills, g.rowOf.skills], [g.rowOf.amResearch, g.rowOf.amResearch], [g.rowOf.pmResearch, g.rowOf.pmResearch]]);
  assert.deepEqual(g.ranges.free, [[g.rowOf.amFree, g.rowOf.amFree], [g.rowOf.pmFree, g.rowOf.pmFree]]);
  assert.deepEqual(g.ranges.al, [[g.rowOf.leave, g.rowOf.leave]]);
  assert.deepEqual(g.ranges.post, [[g.rowOf.post, g.rowOf.post]]);
  assert.deepEqual(g.juniors, ['Dr Ann Test', 'Dr Ben Test', 'Dr Cat Test', 'Dr Dan Test'], 'the juniors, never the consultants');
  assert.ok(g.cells.every(c => c.r <= g.last || c.c > 6), 'only the side tables run past the printed grid');
});

test('hand grid workbook: the tally\'s formulas read the bands of their kind and their results are the sessions counted', () => {
  const g = handGrid(weekLayout({ ...base, style: 'hand' }), people);
  const at = cellsOf(g), T = HAND_COLS.tally;
  assert.deepEqual([...Array(TALLY.length + 2)].map((_, j) => at(3, T + j)?.v),
    ['Sessions', 'MSP/ LA OT', 'EOT', 'Elective OT', 'Clinic', 'Admin/ Research/ Skills', 'AL', 'Free on call/other commitments', 'Post-call', 'Total']);
  const col = (/** @type {string} */ kind) => T + 1 + TALLY.findIndex(([k]) => k === kind);
  for (let r = 4; r < 4 + g.juniors.length; r++) {
    for (const [kind] of TALLY) {
      const c = at(r, col(kind));
      if (!g.ranges[kind].length) { assert.equal(c?.f, undefined, `${kind} has no bands: nothing to count`); continue; }
      assert.deepEqual(bandsIn(String(c?.f)), g.ranges[kind], `${kind} reads its own bands`);
      assert.ok(String(c?.f).includes(`SEARCH(" "&$${colName(T)}${r}&" "`), 'the name is matched between spaces');
    }
    assert.equal(at(r, T + TALLY.length + 1)?.f, `SUM(${colName(T + 1)}${r}:${colName(T + TALLY.length)}${r})`);
  }
  const row = (/** @type {string} */ name) => {
    const r = 4 + g.juniors.indexOf(name);
    return Object.fromEntries([...TALLY.map(([k]) => [k, at(r, col(k))?.v ?? null]), ['total', at(r, T + TALLY.length + 1)?.v]]);
  };
  // Ann: KRWOT 3 Monday AM, the HOT clinic Monday PM, post-call Tuesday PM, free Tuesday AM and Wednesday to Friday
  assert.deepEqual(row('Dr Ann Test'), { msp: null, eot: null, ot: 1, clinic: 1, admin: 0, al: 0, free: 7, post: 1, total: 10 });
  // Ben: free Monday AM, post-call and half a day's leave Monday PM (both counted, as hers would), free from Tuesday
  assert.deepEqual(row('Dr Ben Test'), { msp: null, eot: null, ot: 0, clinic: 0, admin: 0, al: 1, free: 9, post: 1, total: 11 });
  assert.equal(row('Dr Dan Test').clinic, 1);
  assert.equal(row('Dr Cat Test').post, 2, 'post-call Monday and Tuesday');
});

test('hand grid workbook: "accounted for everyone" counts each junior once a session; a half day of leave counts in its own half', () => {
  const g = handGrid(weekLayout({ ...base, style: 'hand' }), people);
  const at = cellsOf(g), H = HAND_COLS.check;
  assert.equal(at(g.am[0], H)?.v, 'Have you accounted for everyone? (Text is case sensitive)');
  assert.deepEqual([1, 2, 3, 4, 5].map(i => at(g.am[0] + 1, H + i)?.v), ['M', 'T', 'W', 'T', 'F']);
  assert.equal(at(g.am[0] + 2, H + 1)?.v, 'AM');
  const amRow = (/** @type {string} */ n) => g.am[0] + 3 + g.juniors.indexOf(n);
  const f = String(at(amRow('Dr Ann Test'), H + 1)?.f);
  assert.ok(f.includes(`B$${g.am[0]}:B$${g.am[1]}`), 'Monday AM reads column B of the AM block to the leave copied in');
  assert.ok(f.includes(`" "&$${colName(H)}${amRow('Dr Ann Test')}&" (PM) "`), 'an afternoon\'s leave is taken off the morning');
  // Monday: Ann free (on call), Ben and Cat on KRWOT 3 / free, Dan in clinic: each once in the AM
  assert.deepEqual(g.juniors.map(n => at(amRow(n), H + 1)?.v), [1, 1, 1, 1]);
  const pmTop = g.cells.filter(c => c.c === H + 1 && c.v === 'PM')[0].r - 1;
  const pmRow = (/** @type {string} */ n) => pmTop + 2 + g.juniors.indexOf(n);
  assert.ok(String(at(pmRow('Dr Ben Test'), H + 1)?.f).includes(`B$${g.pm[0]}:B$${g.pm[1]}`));
  // Monday PM: Ben is post-call and on leave that afternoon, Cat post-call and on call (free): twice each, so the check
  // flags them as hers would
  assert.deepEqual(g.juniors.map(n => at(pmRow(n), H + 1)?.v), [1, 2, 2, 1]);
  assert.deepEqual(g.juniors.map(n => at(pmRow(n), H + 2)?.v), [1, 1, 1, 1]);
});

test('hand grid workbook on the sample week: results match the grid and every placed junior is accounted for once', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));
  const o = { monday: fx.week.from, lists: fx.lists, grid: gridRows(fx.grid), people: fx.people, leave: fx.leave, calls: fx.calls, built: true };
  const g = handGrid(weekLayout({ ...o, style: 'hand' }), fx.people);
  const at = cellsOf(g), T = HAND_COLS.tally, H = HAND_COLS.check;
  const sec = sectionsOf(o);
  const days = sec.days;
  const juniors = new Set(fx.people.filter(isJunior).map((/** @type {any} */ p) => p.name));
  assert.ok(g.juniors.length > 10 && g.juniors.every(n => juniors.has(n)));
  /** @type {Record<string, (l: any) => boolean>} */
  const kinds = { msp: l => l.kind === 'msp', ot: l => l.kind === 'ot', clinic: l => l.kind === 'clinic' || l.kind === 'hot' };
  const col = (/** @type {string} */ kind) => T + 1 + TALLY.findIndex(([k]) => k === kind);
  g.juniors.forEach((name, i) => {
    const r = 4 + i;
    for (const [kind, is] of Object.entries(kinds)) {
      // the sessions on a list of that kind: as a junior on it, or running it (an AC's own clinic)
      const want = fx.lists.filter((/** @type {any} */ l) => is(l) && days.includes(l.day)
        && (l.consultant === name || o.grid.some(gr => gr.day === l.day && gr.session === l.session && gr.list === l.id && gr.juniors.includes(name)))).length;
      assert.equal(at(r, col(kind))?.v, want, `${name}: ${kind}`);
    }
    assert.equal(at(r, col('post'))?.v, days.filter(d => sec.postCall[d].includes(name)).length, `${name}: post-call`);
    assert.equal(at(r, col('al'))?.v, days.filter(d => sec.leave[d].includes(name)).length, `${name}: leave`);
  });
  // the check: anyone on exactly one list in a session, not post-call then, not on leave and not running a list, is named once
  const pmTop = g.cells.filter(c => c.c === H + 1 && c.v === 'PM')[0].r - 1;
  let checked = 0;
  for (const [s, top] of /** @type {const} */ ([['AM', g.am[0] + 3], ['PM', pmTop + 2]])) {
    g.juniors.forEach((name, j) => days.forEach((d, i) => {
      const on = o.grid.filter(gr => gr.day === d && gr.session === s && gr.juniors.includes(name)).length;
      const runs = fx.lists.some((/** @type {any} */ l) => l.day === d && l.session === s && l.consultant === name);
      if (on !== 1 || runs || sec.leave[d].includes(name) || (s === 'PM' && sec.postCall[d].includes(name))) return;
      assert.equal(at(top + j, H + 1 + i)?.v, 1, `${name} ${d} ${s}`);
      checked++;
    }));
  }
  assert.ok(checked > 50);
});

test('xlsx: sheet names are valid, the writer lays out the CORE rows and the calls sheet, read back with the vendored ExcelJS', async () => {
  assert.equal(sheetName('a:b/c?d*e[f]g'), 'a b c d e f g');
  assert.equal(sheetName('x'.repeat(40)).length, 31);
  // (the vendored file is the browser build, a UMD wrapper; it fills `module.exports` when one is given)
  const mod = { exports: /** @type {any} */ ({}) };
  new Function('module', 'exports', readFileSync(new URL('../public/vendor/exceljs/4.4.0/exceljs.min.js', import.meta.url), 'utf8'))(mod, mod.exports);
  const ExcelJS = mod.exports;
  const layout = weekLayout({ ...base, style: 'core' });
  const buf = await buildWeekWorkbook(ExcelJS, layout).xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  const ws = back.worksheets[0];
  assert.equal(ws.name, 'HRM 2 Nov 2026');
  assert.equal(ws.getRow(1).getCell(1).value, 'DEPARTMENTS');
  assert.equal(ws.getRow(1).getCell(8).value, 'Sun 8 Nov');
  const { rows } = coreRows(layout);
  assert.equal(ws.rowCount, rows.length + 1);
  const first = rows.findIndex(r => r[1].k === 'head');
  assert.equal(ws.getRow(first + 2).getCell(2).value, rows[first][1].t);
  assert.equal(ws.getRow(2).getCell(1).value, 'MORNING SESSION');

  const cl = callsLayout({ month: '2026-11', calls, counts: [{ name: 'Dr Ann Test', total: 1, weekend: 0, tiers: { reg: 1 } }] });
  const cbuf = await buildCallsWorkbook(ExcelJS, cl).xlsx.writeBuffer();
  const cb = new ExcelJS.Workbook();
  await cb.xlsx.load(cbuf);
  const cs = cb.worksheets[0];
  assert.equal(cs.getRow(1).getCell(1).value, 'HRM on-call roster, November 2026');
  assert.equal(cs.getRow(2).getCell(3).value, 'CON');
  assert.equal(cs.getRow(4).getCell(3).value, 'Dr Fay Test', '2 Nov is the second day row');
  assert.equal(cs.getRow(3 + 30 + 2).getCell(1).value, 'Name');
});

test('xlsx: the hand-made grid workbook keeps its formulas (array formulas, results filled in), dates, colours and print area', async () => {
  const mod = { exports: /** @type {any} */ ({}) };
  new Function('module', 'exports', readFileSync(new URL('../public/vendor/exceljs/4.4.0/exceljs.min.js', import.meta.url), 'utf8'))(mod, mod.exports);
  const ExcelJS = mod.exports;
  const g = handGrid(weekLayout({ ...base, style: 'hand' }), people);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await buildHandWorkbook(ExcelJS, g).xlsx.writeBuffer());
  const ws = back.worksheets[0];
  assert.equal(ws.name, 'HRM 2 Nov 2026');
  assert.equal(ws.getCell('A1').value, g.title);
  assert.ok(ws.getCell('A1').isMerged && ws.getCell('F1').isMerged);
  assert.ok(ws.getCell('B3').value instanceof Date && ws.getCell('B3').numFmt === 'd-mmm');
  assert.equal(ws.pageSetup.printArea, `A1:F${g.last}`);
  assert.equal(ws.getCell('B4').fill.fgColor.argb, 'FFA9D08E', 'a home-site clinic is green');
  // every formula of the grid is in the file, with its result
  const formulas = g.cells.filter(c => c.f);
  assert.equal(formulas.length, 4 * 7 + 4 * 5 * 2 + 5, 'a tally row (six kinds and the total) and ten checks per junior, and the leave copied up');
  for (const c of formulas) {
    const cell = ws.getCell(c.r, c.c);
    assert.equal(cell.formula, c.f, `${colName(c.c)}${c.r}`);
    assert.equal(cell.result ?? '', c.v, `${colName(c.c)}${c.r} result`); // (an empty text result is not written)
  }
  const tally = ws.getCell(4, HAND_COLS.tally + 3);
  assert.match(String(tally.formula), /^SUMPRODUCT\(--ISNUMBER\(SEARCH\(" "&\$T4&" "," "&SUBSTITUTE\(\$B\$\d+:\$F\$\d+,","," "\)&" "\)\)\)/);
  assert.equal(tally.value.shareType, 'array', 'written as an array formula, as hers are');
  assert.equal(ws.getCell(g.rowOf.amLeave, 2).formula, `B${g.rowOf.leave}`);
});
