// The pure parts the Week and Calls screens draw from: hand edits of the grid, the sections around it, the calls of a
// week, month cells, and hand edits of calls. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridRows, juniorsOn, listOf, move, place, unplace } from '../src/roster/grid.js';
import { sectionsOf, whyNot } from '../src/roster/sections.js';
import { callsAround, monthCells, shiftMonth, callMapIn, firstWeek, makerWeek, firstMonth } from '../src/roster/sections.js';
import { setCall, lockedMap, lockKey, mergeCalls } from '../src/roster/calls-edit.js';
import { buildWeek } from '../src/roster/week.js';
import { solveCalls } from '../src/roster/calls.js';

const people = [
  { name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'reg' }, { name: 'Dr Cat Test', grade: 'mo' },
  { name: 'Dr Dan Test', grade: 'mo' }, { name: 'Dr Eve Test', grade: 'con' },
];
const MON = '2026-11-02';
const lists = [
  { id: 'a', site: 'NUH', kind: 'ot', name: 'OT 1', day: MON, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 2 },
  { id: 'b', site: 'NUH', kind: 'clinic', name: 'CLINIC', day: MON, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 1 },
  { id: 'c', site: 'NTFGH', kind: 'ot', name: 'OT 2', day: MON, session: 'PM', consultant: null, status: 'open', need: 1 },
];

test('grid: rows from a built week, place and move keep one list per person per session', () => {
  const built = buildWeek({ monday: MON, lists, people, seed: 3 });
  const rows = gridRows(built.grid);
  assert.equal(rows.length, 3);
  assert.equal(juniorsOn(rows, MON, 'AM', 'a').length, 2);
  const name = juniorsOn(rows, MON, 'AM', 'a')[0];
  const to = move(rows, { day: MON, session: 'AM', name, to: 'b' });
  assert.equal(listOf(to, MON, 'AM', name), 'b');
  assert.equal(juniorsOn(to, MON, 'AM', 'a').includes(name), false);
  const free = move(rows, { day: MON, session: 'AM', name, to: null });
  assert.equal(listOf(free, MON, 'AM', name), null);
  assert.equal(rows.length, gridRows(built.grid).length, 'the input is not changed');
});

test('grid: a swap sends the other person to where the first one was', () => {
  const rows = [{ day: MON, session: /** @type {'AM'} */ ('AM'), list: 'a', juniors: ['x', 'y'] }, { day: MON, session: /** @type {'AM'} */ ('AM'), list: 'b', juniors: ['z'] }];
  const next = move(rows, { day: MON, session: 'AM', name: 'x', to: 'b', swapWith: 'z' });
  assert.deepEqual(juniorsOn(next, MON, 'AM', 'a').sort(), ['y', 'z']);
  assert.deepEqual(juniorsOn(next, MON, 'AM', 'b'), ['x']);
  const added = place(rows, MON, 'AM', 'new', 'q');
  assert.deepEqual(juniorsOn(added, MON, 'AM', 'new'), ['q']);
  assert.deepEqual(juniorsOn(unplace(added, MON, 'AM', 'q'), MON, 'AM', 'new'), []);
});

test('sections: leave, post-call (PM only), on call, free and short lists are worked out from the grid', () => {
  const calls = [{ date: '2026-11-01', con: 'Dr Eve Test', reg: 'Dr Ann Test', moNuh: null, moNtf: null }, { date: MON, con: 'Dr Eve Test', reg: 'Dr Ben Test', moNuh: null, moNtf: null }];
  const leave = [{ name: 'Dr Dan Test', from: MON, to: MON, session: /** @type {'PM'} */ ('PM') }];
  const grid = [{ day: MON, session: /** @type {'AM'} */ ('AM'), list: 'a', juniors: ['Dr Cat Test'] }];
  const s = sectionsOf({ monday: MON, people, leave, calls, lists, grid });
  assert.deepEqual(s.days.length, 5);
  assert.deepEqual(s.postCall[MON], ['Dr Ann Test']);
  assert.equal(s.onCall[MON].reg, 'Dr Ben Test');
  assert.deepEqual(s.leave[MON], ['Dr Dan Test']);
  const free = Object.fromEntries(s.free[MON].map(f => [f.name, f.why ? `${f.when} ${f.why}` : f.when]));
  assert.equal(free['Dr Ben Test'], 'FULL DAY on call');
  assert.equal(free['Dr Ann Test'], 'AM', 'post-call keeps the AM open');
  assert.equal(free['Dr Dan Test'], 'AM');
  assert.equal(free['Dr Cat Test'], 'PM', 'placed in the AM only');
  assert.equal('Dr Eve Test' in free, false, 'consultants are not juniors');
  assert.deepEqual(s.short.map(x => [x.list, x.need, x.got]), [['b', 1, 0], ['c', 1, 0]], 'below the minimum (1 when a list wants any)');
  assert.deepEqual(s.under.map(x => [x.list, x.need, x.got]), [['a', 2, 1]], 'at its minimum but fewer than it wants');
});

test('sections: whyNot names leave, on call, post-call and a double booking', () => {
  const calls = [{ date: '2026-11-01', con: null, reg: 'Dr Ann Test', moNuh: null, moNtf: null }, { date: MON, con: null, reg: 'Dr Ben Test', moNuh: null, moNtf: null }];
  const leave = [{ name: 'Dr Dan Test', from: MON, to: MON }];
  const grid = [{ day: MON, session: /** @type {'AM'} */ ('AM'), list: 'a', juniors: ['Dr Cat Test'] }];
  const base = { day: MON, leave, calls, grid };
  assert.deepEqual(whyNot({ ...base, name: 'Dr Dan Test', session: 'AM' }), ['Dr Dan Test is on leave then']);
  assert.deepEqual(whyNot({ ...base, name: 'Dr Ben Test', session: 'AM' }), ['Dr Ben Test is on call that day']);
  assert.deepEqual(whyNot({ ...base, name: 'Dr Ann Test', session: 'AM' }), []);
  assert.deepEqual(whyNot({ ...base, name: 'Dr Ann Test', session: 'PM' }), ['Dr Ann Test is post-call then']);
  assert.deepEqual(whyNot({ ...base, name: 'Dr Cat Test', session: 'AM', list: 'b' }), ['Dr Cat Test is already on another list that session']);
  assert.deepEqual(whyNot({ ...base, name: 'Dr Cat Test', session: 'AM', list: 'a' }), []);
});

test('inputs: calls around a week come from both months; month cells start on a Monday', () => {
  const rosters = [{ id: '2026-10', calls: [{ date: '2026-10-31', con: 'a' }, { date: '2026-10-20', con: 'z' }] }, { id: '2026-11', calls: [{ date: '2026-11-01', con: 'b' }, { date: '2026-11-08', con: 'c' }] }];
  assert.deepEqual(callsAround(/** @type {any} */ (rosters), MON).map(c => c.date), ['2026-11-01', '2026-11-08'].filter(d => d <= '2026-11-08'));
  assert.deepEqual(callsAround(/** @type {any} */ (rosters), '2026-10-26').map(c => c.date), ['2026-10-31', '2026-11-01']);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  const cells = monthCells('2026-11');   // 1 Nov 2026 is a Sunday
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.indexOf('2026-11-01'), 6);
  assert.equal(cells.filter(Boolean).length, 30);
  assert.deepEqual(Object.keys(callMapIn(/** @type {any} */ (rosters[0].calls), '2026-10')).sort(), ['2026-10-20', '2026-10-31']);
});

test('calls-edit: a hand edit is locked, the solver keeps it, emptying unlocks', () => {
  let state = { calls: /** @type {any[]} */ ([]), locked: /** @type {string[]} */ ([]) };
  state = setCall(state.calls, state.locked, '2026-11-03', 'reg', 'Dr Ann Test');
  assert.deepEqual(state.locked, [lockKey('2026-11-03', 'reg')]);
  assert.deepEqual(state.calls[0], { date: '2026-11-03', con: null, reg: 'Dr Ann Test', moNuh: null, moNtf: null });
  const locked = lockedMap(state.locked, state.calls);
  const res = solveCalls({ month: '2026-11', people, locked, iterations: 500 });
  assert.equal(res.assignments['2026-11-03'].reg, 'Dr Ann Test');
  const merged = mergeCalls([{ date: '2026-10-31', con: 'x', reg: null, moNuh: null, moNtf: null }], res.assignments);
  assert.equal(merged[0].date, '2026-10-31');
  assert.equal(merged.length, 31);
  state = setCall(state.calls, state.locked, '2026-11-03', 'reg', null);
  assert.deepEqual(state.locked, []);
});

test('the roster maker opens on the next job: next week once this one is built, next month from the 20th', () => {
  const built = new Set(['2026-11-02']);
  const isBuilt = (/** @type {string} */ d) => built.has(d);
  assert.equal(firstWeek('2026-11-04'), '2026-11-02');
  assert.equal(firstWeek('2026-11-07'), '2026-11-09');
  assert.equal(makerWeek('2026-11-04', isBuilt), '2026-11-09');
  assert.equal(makerWeek('2026-11-11', isBuilt), '2026-11-09');
  assert.equal(makerWeek('2026-11-07', isBuilt), '2026-11-09');
  assert.equal(firstMonth('2026-11-19', true), '2026-11');
  assert.equal(firstMonth('2026-11-20', true), '2026-12');
  assert.equal(firstMonth('2026-12-25', true), '2027-01');
  assert.equal(firstMonth('2026-11-25', false), '2026-11');
});
