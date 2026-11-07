// A rename's plan (roster/rename.js): the leave, requests, lists, calls and built weeks that follow a person's new name
// (owner, 7 Nov 2026: everywhere, past months too), and its Undo. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renamePlan, planSize, planText, undoPatch } from '../src/roster/rename.js';

const ANN = 'Dr Ann Test', NEW = 'Dr Ann Tester', SIMILAR = 'Dr Ann Testa';
const leave = [
  { id: 'l1', name: ANN, from: '2026-11-09', to: '2026-11-13' },
  { id: 'l2', name: ANN, from: '2026-09-01', to: '2026-09-02' },   // in the past: renamed too
  { id: 'l3', name: SIMILAR, from: '2026-11-09', to: '2026-11-10' },
  { id: 'l4', name: ANN, from: '2026-12-01', to: '2026-12-01', _deleted: true },
];
const requests = [
  { id: 'r1', name: ANN, date: '2026-11-20', type: 'cannot' },
  { id: 'r2', name: SIMILAR, date: '2026-11-21', type: 'want' },
];
const lists = [
  { id: 'a', name: 'Hand OT', consultant: ANN, consultant2: null },
  { id: 'b', name: 'CLINIC', consultant: 'Dr Eve Test', consultant2: ANN, consultant3: SIMILAR },
  { id: 'c', name: 'MSP', consultant: SIMILAR },
  { id: 'd', name: 'HOT', consultant: ANN, _deleted: true },
];

test('renamePlan: leave, requests and the consultant fields under the exact name', () => {
  const plan = renamePlan({ from: ANN, to: NEW, leave, requests, lists });
  assert.deepEqual(plan.leave.map(([r, p]) => [r.id, p]), [['l1', { name: NEW }], ['l2', { name: NEW }]]);
  assert.deepEqual(plan.requests.map(([r, p]) => [r.id, p]), [['r1', { name: NEW }]]);
  assert.deepEqual(plan.lists.map(([r, p]) => [r.id, p]), [['a', { consultant: NEW }], ['b', { consultant2: NEW }]]);
  assert.equal(planSize(plan), 5);
  assert.equal(planText(plan), '2 leave, 1 request and 2 lists');
});

test('renamePlan: a similar name and deleted rows are left alone', () => {
  const plan = renamePlan({ from: ANN, to: NEW, leave, requests, lists });
  const ids = [...plan.leave, ...plan.requests, ...plan.lists].map(([r]) => r.id);
  for (const id of ['l3', 'l4', 'r2', 'c', 'd']) assert.ok(!ids.includes(id), id);
  assert.ok(!('consultant3' in plan.lists[1][1]));
});

test('renamePlan: the same name, or none, plans nothing', () => {
  for (const to of [ANN, '']) {
    const plan = renamePlan({ from: ANN, to, leave, requests, lists });
    assert.deepEqual(plan, { leave: [], requests: [], lists: [], rosters: [], weeks: [] });
    assert.equal(planText(plan), '');
  }
});

test('planText: one kind, or two', () => {
  assert.equal(planText({ leave: [1], requests: [], lists: [] }), '1 leave');
  assert.equal(planText({ leave: [], requests: [1, 2], lists: [1] }), '2 requests and 1 list');
});

// a past month and this month, with a call set by hand (locked) under the old name
const rosters = [
  { id: '2026-09', calls: [{ date: '2026-09-01', con: 'Dr Eve Test', reg: ANN, moNuh: null, moNtf: SIMILAR }, { date: '2026-09-02', con: null, reg: SIMILAR, moNuh: ANN, moNtf: null }], locked: ['2026-09-02|moNuh'], problems: [] },
  { id: '2026-11', calls: [{ date: '2026-11-03', con: null, reg: 'Dr Bob Test', reg2: ANN, moNuh: null, moNtf: null }] },
  { id: '2026-12', calls: [{ date: '2026-12-01', con: null, reg: SIMILAR, moNuh: null, moNtf: null }] },
  { id: '2026-10', calls: [{ date: '2026-10-01', reg: ANN }], _deleted: true },
];
const weeks = [
  { id: '2026-09-07', grid: [{ day: '2026-09-07', session: 'AM', list: 'a', juniors: ['Dr Bob Test', ANN] }, { day: '2026-09-07', session: 'PM', list: 'b', juniors: [SIMILAR] }],
    lists: [{ id: 'a', day: '2026-09-07', session: 'AM', consultant: ANN, consultant2: SIMILAR }, { id: 'b', day: '2026-09-07', session: 'PM', consultant: 'Dr Eve Test' }],
    overrides: [{ id: 'b', consultant2: ANN }, { id: 'c', consultant: SIMILAR }] },
  { id: '2026-11-09', grid: [{ day: '2026-11-09', session: 'AM', list: 'a', juniors: ['Dr Bob Test'] }], lists: [], overrides: [] },
];

test('renamePlan: every month of calls, past ones and hand-set calls too, exact name only', () => {
  const plan = renamePlan({ from: ANN, to: NEW, leave: [], requests: [], lists: [], rosters, weeks: [] });
  assert.deepEqual(plan.rosters.map(([r]) => r.id), ['2026-09', '2026-11']);
  const [[, sep], [, nov]] = plan.rosters;
  assert.deepEqual(Object.keys(sep), ['calls']);   // locked holds 'date|tier' only, so it stays
  assert.deepEqual(sep.calls, [{ date: '2026-09-01', con: 'Dr Eve Test', reg: NEW, moNuh: null, moNtf: SIMILAR }, { date: '2026-09-02', con: null, reg: SIMILAR, moNuh: NEW, moNtf: null }]);
  assert.equal(/** @type {any} */ (nov).calls[0].reg2, NEW);
  assert.equal(rosters[0].calls[0].reg, ANN, 'the stored row is not changed in place');
  assert.equal(planText(plan), '2 months of calls');
});

test('renamePlan: every built week: the grid\'s juniors, the lists snapshot and the overrides', () => {
  const plan = renamePlan({ from: ANN, to: NEW, leave: [], requests: [], lists: [], weeks });
  assert.deepEqual(plan.weeks.map(([r]) => r.id), ['2026-09-07']);
  const [[, p]] = plan.weeks;
  assert.deepEqual(/** @type {any} */ (p).grid.map((/** @type {any} */ g) => g.juniors), [['Dr Bob Test', NEW], [SIMILAR]]);
  assert.deepEqual(/** @type {any} */ (p).lists.map((/** @type {any} */ l) => [l.consultant, l.consultant2 ?? null]), [[NEW, SIMILAR], ['Dr Eve Test', null]]);
  assert.deepEqual(/** @type {any} */ (p).overrides, [{ id: 'b', consultant2: NEW }, { id: 'c', consultant: SIMILAR }]);
  assert.equal(planText(plan), '1 built week');
});

test('renamePlan: a week with the name only in its grid patches only the grid', () => {
  const plan = renamePlan({ from: 'Dr Bob Test', to: 'Dr Bob Tester', leave: [], requests: [], lists: [], weeks });
  assert.deepEqual(plan.weeks.map(([r, p]) => [r.id, Object.keys(p)]), [['2026-09-07', ['grid']], ['2026-11-09', ['grid']]]);
});

test('renamePlan: the new name is trimmed; all five kinds in words', () => {
  const plan = renamePlan({ from: ANN, to: ` ${NEW} `, leave, requests, lists, rosters, weeks });
  assert.equal(plan.leave[0][1].name, NEW);
  assert.equal(planSize(plan), 8);
  assert.equal(planText(plan), '2 leave, 1 request, 2 lists, 2 months of calls and 1 built week');
});

test('undoPatch: the old name back on the spots the rename changed, where the new name still stands', () => {
  const plan = renamePlan({ from: ANN, to: NEW, leave, requests, lists, rosters, weeks });
  // the month as saved, then someone moved the new name off one call; a call of a person since renamed to the new name is not touched
  const [sepWas, sepPatch] = plan.rosters[0];
  const sepNow = { ...sepWas, ...sepPatch, calls: /** @type {any[]} */ (sepPatch.calls).map(c => (c.date === '2026-09-02' ? { ...c, moNuh: 'Dr Bob Test' } : c)) };
  sepNow.calls.push({ date: '2026-09-03', con: null, reg: NEW, moNuh: null, moNtf: null });
  assert.deepEqual(undoPatch('rosters', sepWas, sepNow, ANN, NEW), { calls: [
    { date: '2026-09-01', con: 'Dr Eve Test', reg: ANN, moNuh: null, moNtf: SIMILAR },
    { date: '2026-09-02', con: null, reg: SIMILAR, moNuh: 'Dr Bob Test', moNtf: null },
    { date: '2026-09-03', con: null, reg: NEW, moNuh: null, moNtf: null }] });
  // a week, unchanged since: back to exactly what it was
  const [wkWas, wkPatch] = plan.weeks[0];
  const back = /** @type {any} */ (undoPatch('weeks', wkWas, { ...wkWas, ...wkPatch }, ANN, NEW));
  assert.deepEqual({ ...wkWas, ...back }, wkWas);
  // leave and lists: only where the new name still stands
  const [lvWas, lvPatch] = plan.leave[0];
  assert.deepEqual(undoPatch('leave', lvWas, { ...lvWas, ...lvPatch }, ANN, NEW), { name: ANN });
  assert.equal(undoPatch('leave', lvWas, { ...lvWas, name: 'Dr Bob Test' }, ANN, NEW), null);
  const [bWas, bPatch] = plan.lists[1];
  assert.deepEqual(undoPatch('lists', bWas, { ...bWas, ...bPatch }, ANN, NEW), { consultant2: ANN });
  // nothing the rename changed: nothing to put back
  assert.equal(undoPatch('rosters', rosters[2], rosters[2], ANN, NEW), null);
});
