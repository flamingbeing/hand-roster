// A rename's plan (roster/rename.js): the leave, requests and lists that follow a person's new name. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renamePlan, planSize, planText } from '../src/roster/rename.js';

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
    assert.deepEqual(plan, { leave: [], requests: [], lists: [] });
    assert.equal(planText(plan), '');
  }
});

test('planText: one kind, or two', () => {
  assert.equal(planText({ leave: [1], requests: [], lists: [] }), '1 leave');
  assert.equal(planText({ leave: [], requests: [1, 2], lists: [1] }), '2 requests and 1 list');
});
