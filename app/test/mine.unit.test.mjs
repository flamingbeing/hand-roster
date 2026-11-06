// "This is me": one person's week (roster/mine.js) and the name check the Week and Calls marks use (data/people.js meOf).
// Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, myWeek, nextCall } from '../src/roster/mine.js';
import { sectionsOf } from '../src/roster/sections.js';
import { activePeople, meOf } from '../src/data/people.js';

const people = [
  { name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'mo' }, { name: 'Dr Cat Test', grade: 'mo' },
  { name: 'Dr Eve Test', grade: 'con' },
];
const MON = '2026-11-02', TUE = '2026-11-03', WED = '2026-11-04';
/** @type {import('../src/roster/model.js').ListSlot[]} */
const lists = [
  { id: 'a', site: 'NUH', kind: 'ot', name: 'KRWOT 3', day: MON, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 1 },
  { id: 'b', site: 'NTFGH', kind: 'clinic', name: 'CLINIC', day: MON, session: 'PM', consultant: 'Dr Eve Test', status: 'open', need: 1 },
  { id: 'c', site: 'NUH', kind: 'ot', name: 'MCOT 2', day: TUE, session: 'AM', consultant: null, status: 'open', need: 1 },
];
/** @type {import('../src/roster/grid.js').GridRow[]} */
const grid = [
  { day: MON, session: 'AM', list: 'a', juniors: ['Dr Ann Test'] },
  { day: MON, session: 'PM', list: 'b', juniors: ['Dr Ben Test'] },
  { day: TUE, session: 'AM', list: 'c', juniors: ['Dr Cat Test'] },
];
const calls = [
  { date: MON, con: 'Dr Eve Test', reg: 'Dr Ann Test', moNuh: 'Dr Ben Test', moNtf: null },
  { date: '2026-11-07', con: 'Dr Eve Test', reg: null, moNuh: 'Dr Cat Test', moNtf: null },
];
/** @type {import('../src/roster/model.js').Leave[]} */
const leave = [{ name: 'Dr Cat Test', from: WED, to: WED, session: 'AM' }];
/** @param {string} name @param {boolean} built */
const weekOf = (name, built) => {
  const sec = sectionsOf({ monday: MON, people, leave, calls, lists, grid: built ? grid : [] });
  return Object.fromEntries(myWeek({ name, days: sec.days, lists, grid: built ? grid : [], sec, calls, leave, built }).map(d => [d.day, d.facts]));
};

test('my week: an on-call day gives the list and the tier; the next day is post-call', () => {
  const w = weekOf('Dr Ann Test', true);
  assert.deepEqual(w[MON], ['AM NUH KRWOT 3 (Dr Eve Test)', 'On call (REG)']);
  assert.ok(w[TUE].includes('Post-call (PM)'));
  assert.ok(w[TUE].includes('Free (AM)'), 'the morning after a call is open');
});

test('my week: a list shows its site and consultant; a consultant sees their own lists', () => {
  const ben = weekOf('Dr Ben Test', true);
  assert.deepEqual(ben[MON], ['PM NTFGH CLINIC (Dr Eve Test)', 'On call (MO (NUH))']);
  const eve = weekOf('Dr Eve Test', true);
  assert.deepEqual(eve[MON], ['AM NUH KRWOT 3', 'PM NTFGH CLINIC', 'On call (CON)']);
});

test('my week: leave in the morning, and a weekend call joins the week', () => {
  const w = weekOf('Dr Cat Test', true);
  assert.ok(w[WED].includes('Leave (AM)'));
  assert.ok(w[WED].includes('Free (PM)'));
  assert.deepEqual(w[TUE], ['AM NUH MCOT 2', 'Free (PM)']);
  assert.deepEqual(w['2026-11-07'], ['On call (MO (NUH))'], 'Saturday shows only because of the call');
  assert.equal(w['2026-11-08'], undefined);
});

test('my week: an unbuilt week shows only calls, post-call and leave', () => {
  const ann = weekOf('Dr Ann Test', false);
  assert.deepEqual(ann[MON], ['On call (REG)']);
  assert.deepEqual(ann[TUE], ['Post-call (PM)']);
  assert.deepEqual(ann[WED], []);
  assert.deepEqual(weekOf('Dr Cat Test', false)[WED], ['Leave (AM)']);
  assert.deepEqual(weekOf('Dr Eve Test', false)[MON], ['On call (CON)'], 'no lists, not even a consultant\'s own');
});

test('next call: the first on or after today, across a month end and from any stored month', () => {
  const rosters = [
    { id: '2026-12', calls: [{ date: '2026-12-02', reg: 'Dr Ann Test' }, { date: '2026-12-05', reg: 'Dr Ann Test' }] },
    { id: '2026-11', calls: [{ date: '2026-11-20', reg: 'Dr Ann Test' }, { date: '2026-11-28', moNuh: 'Dr Ben Test' }] },
  ];
  assert.equal(nextCall('Dr Ann Test', rosters, '2026-11-25'), 'Next call: Wed 2 Dec (REG)');
  assert.equal(nextCall('Dr Ann Test', rosters, '2026-11-20'), 'Next call: today (REG)');
  assert.equal(nextCall('Dr Ben Test', rosters, '2026-11-29'), '');
  assert.equal(nextCall('Dr Ben Test', [{ id: '2026-11' }], '2026-11-01'), '', 'a month with no calls made');
  assert.equal(dayLabel('2026-11-09'), 'Mon 9');
});

test('this is me: only an active person counts, so a renamed or deleted name drops out', () => {
  const rows = /** @type {import('../src/data/people.js').PersonRow[]} */ (/** @type {unknown} */ ([
    { id: '1', name: 'Dr Ann Test', grade: 'reg' }, { id: '2', name: 'Dr Old Test', grade: 'mo', active: false },
    { id: '3', name: 'Dr Gone Test', grade: 'mo', _deleted: true },
  ]));
  const active = activePeople(rows);
  assert.equal(meOf('Dr Ann Test', active), 'Dr Ann Test');
  assert.equal(meOf('Dr Old Test', active), '');
  assert.equal(meOf('Dr Gone Test', active), '');
  assert.equal(meOf('Dr Nobody Test', active), '');
  assert.equal(meOf(42, active), '');
  assert.equal(meOf('', active), '');
});
