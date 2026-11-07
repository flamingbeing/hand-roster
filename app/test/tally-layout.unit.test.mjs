// Fairness tallies (roster/tally.js) and the saved export layout (roster/export-layout.js), with invented names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tallyOf, weightsOf, tallyTable, DEFAULT_WEIGHTS, mondaysIn } from '../src/roster/tally.js';
import { layoutOf, labelOf, tallyColumns } from '../src/roster/export-layout.js';
import { TALLY, handGrid, handSections, weekLayout, callsLayout } from '../src/roster/layout.js';
import { buildWeek } from '../src/roster/week.js';
import { gridRows } from '../src/roster/grid.js';

const calls = [
  { date: '2026-11-06', con: 'Dr Con One', reg: 'Dr Ann Test', moNuh: 'Dr Bo Test' },   // Friday
  { date: '2026-11-07', con: 'Dr Con One', reg: 'Dr Bo Test', moNuh: 'Dr Ann Test' },   // Saturday
  { date: '2026-12-01', con: 'Dr Con One', reg: 'Dr Ann Test' },                          // outside
];

test('tally: calls by tier, weekend calls, lists and EOT in the range, weighted', () => {
  const weeks = [{ id: '2026-11-02', lists: [{ id: 'a' }, { id: 'e', emergency: true }],
    grid: [{ day: '2026-11-03', session: 'AM', list: 'a', juniors: ['Dr Ann Test'] }, { day: '2026-11-04', session: 'PM', list: 'e', juniors: ['Dr Ann Test', 'Dr Bo Test'] },
      { day: '2026-12-02', session: 'AM', list: 'a', juniors: ['Dr Bo Test'] }] }];
  const rows = tallyOf({ calls, weeks, from: '2026-11-01', to: '2026-11-30', weights: { ...DEFAULT_WEIGHTS } });
  const ann = rows.find(r => r.name === 'Dr Ann Test'), bo = rows.find(r => r.name === 'Dr Bo Test');
  assert.deepEqual([ann.tiers.reg, ann.tiers.moNuh, ann.calls, ann.weekend, ann.lists, ann.eot], [1, 1, 2, 1, 2, 1]);
  assert.deepEqual([bo.calls, bo.weekend, bo.lists, bo.eot], [2, 1, 1, 1]);
  assert.equal(ann.score, 1 + 1 + 1 + 0.2 * 2 + 0.5);   // two calls, one at the weekend, two lists, one EOT
  assert.equal(rows[0].name === 'Dr Ann Test' || rows[0].score >= rows[1].score, true, 'most carried first');
  const heavy = tallyOf({ calls, weeks, from: '2026-11-01', to: '2026-11-30', weights: { ...DEFAULT_WEIGHTS, weekend: 10 } });
  assert.ok(heavy.find(r => r.name === 'Dr Ann Test').score > ann.score, 'a maker weight changes the score');
  assert.equal(tallyOf({ calls, from: '2026-12-01', to: '2026-12-31' }).length, 2, 'a range is any days');
});

test('tally: weights fall back to the default when missing or out of range; the table has a column per tier used', () => {
  assert.equal(weightsOf({ weights: { lists: 0.5, eot: -1, con: 99 } }).lists, 0.5);
  assert.equal(weightsOf({ weights: { eot: -1, con: 99 } }).eot, DEFAULT_WEIGHTS.eot);
  assert.equal(weightsOf(undefined).con, DEFAULT_WEIGHTS.con);
  const t = tallyTable(tallyOf({ calls, from: '2026-11-01', to: '2026-11-30' }));
  assert.deepEqual(t.head, ['Name', 'CON', 'REG', 'MO (NUH)', 'Weekend/PH', 'Lists', 'EOT', 'Score']);
  assert.deepEqual(mondaysIn('2026-11-04', '2026-11-17'), ['2026-11-02', '2026-11-09', '2026-11-16']);
});

test('export layout: nothing saved is today\'s columns; order, hide and labels apply', () => {
  assert.deepEqual(tallyColumns(undefined, TALLY), TALLY);
  assert.deepEqual(tallyColumns(layoutOf({}), TALLY), TALLY);
  const xl = layoutOf({ order: ['eot', 'msp'], hide: ['al', 'free'], labels: { 'tally.eot': 'Emergency', bad: 5 }, print: { patients: false } });
  const cols = tallyColumns(xl, TALLY);
  assert.deepEqual(cols.map(c => c[0]), ['eot', 'msp', 'ot', 'clinic', 'admin', 'post']);
  assert.equal(cols[0][1], 'Emergency');
  assert.equal(labelOf(xl, 'x', 'dflt'), 'dflt');
  assert.equal(xl.print.patients, false);
});

test('the hand grid, the print rows and the calls file carry the saved words and columns', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));
  const input = { monday: fx.week.from, lists: fx.lists, people: fx.people, calls: fx.calls };
  const built = buildWeek({ ...input, seed: 1 });
  const lay = weekLayout({ ...input, style: 'hand', grid: gridRows(built.grid), built: true });
  const plain = handGrid(lay, fx.people);
  const xl = layoutOf({ order: ['eot'], hide: ['al'], labels: { 'tally.eot': 'Emergency OT', 'tally.total': 'All', 'row.MORNING SESSION': 'Morning lists' } });
  const mine = handGrid(lay, fx.people, xl);
  const heads = g => g.cells.filter(c => c.r === 3 && c.k === 'th').map(c => c.v);
  assert.equal(plain.tallyN, 8);
  assert.equal(mine.tallyN, 7);
  assert.ok(heads(mine).includes('Emergency OT') && heads(mine).includes('All') && !heads(mine).includes('AL'));
  assert.ok(heads(plain).includes('AL') && heads(plain).includes('Total'));
  // the first tally column is the EOT one, and the total sums only the columns shown
  const first = mine.cells.find(c => c.r === 3 && c.c === 21);
  assert.equal(first.v, 'Emergency OT');
  const total = mine.cells.find(c => c.k === 'count' && c.c === 28 && c.f);
  assert.match(total.f, /^SUM\(U\d+:AA\d+\)$/);
  assert.ok(handSections(lay, xl).some(r => r.title === 'Morning lists'));
  assert.ok(handSections(lay).some(r => r.title === 'AM sessions'));
  const cl = callsLayout({ month: '2026-11', calls, xl: layoutOf({ labels: { 'tier.reg': 'Registrar' } }), tally: tallyOf({ calls, from: '2026-11-01', to: '2026-11-30' }) });
  assert.ok(cl.head.includes('Registrar') && cl.countsHead.includes('Registrar'));
  assert.equal(cl.fairness.head.at(-1), 'Score');
  assert.equal(cl.fairness.head.includes('Registrar'), true);
});
