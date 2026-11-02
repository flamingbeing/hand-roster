// The sheet layout (CORE and hand-made grid), the calls layout, the chat text and the xlsx writer (with the vendored
// ExcelJS read back). Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekLayout, coreRows, handSections, callsLayout, weekRange, weekTitleText, longDay } from '../src/roster/layout.js';
import { whatsappText } from '../src/roster/whatsapp.js';
import { buildWeekWorkbook, buildCallsWorkbook, sheetName } from '../src/roster/xlsx.js';
import { nextWorkday } from '../src/roster/dates.js';

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

test('core rows: ON-CALL by tier incl. the weekend, LEAVE with halves, POST-CALL, FREE with its words', () => {
  const { rows } = coreRows(weekLayout({ ...base, style: 'core' }));
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

test('hand grid: title, one row per section, "Consultant SITE Clinic rooms - patients" headers, tiered on-call lines', () => {
  const layout = weekLayout({ ...base, style: 'hand' });
  assert.equal(layout.days.length, 5);
  assert.equal(layout.title, 'HRM Registrar/Fellows/Medical Officer Daily Roster (2 - 6 November 2026)');
  const sections = handSections(layout);
  assert.deepEqual(sections.map(s => s.title), ['AM sessions', 'PM sessions', 'On call', 'Leave', 'Post-call', 'Free']);
  const am = sections[0].cells[0].map(l => l.t);
  assert.ok(am.includes('Dr Fay Test NUH Clinic G03/04 - 12'));
  assert.ok(am.includes('Dr Eve Test NUH KRWOT 3'));
  const pm = sections[1].cells[0].map(l => l.t);
  assert.ok(pm.includes('NTFGH NTFGH OT 15 (empty)'));
  assert.deepEqual(sections[2].cells[0].map(l => l.t), ['CON: Dr Fay Test', 'REG: Dr Ann Test', 'MO (NUH): Dr Dan Test', 'MO (NTFGH): Dr Cat Test']);
  assert.ok(sections[1].cells[1].length === 0, 'no PM lists on Tuesday');
  assert.ok(sections[5].cells[0].some(l => l.t === 'Dr Ann Test (on call)'));
  const noPatients = handSections(weekLayout({ ...base, style: 'hand', patients: false }))[0].cells[0].map(l => l.t);
  assert.ok(noPatients.includes('Dr Fay Test NUH Clinic G03/04'));
});

test('calls layout: a row a day, four tiers, off days marked, counts without the idle', () => {
  const cl = callsLayout({
    month: '2026-11', calls, holidays: ['2026-11-08'],
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
