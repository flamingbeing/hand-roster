// The page's records (store.js): loaded and ready, which Make calls, Build week and Check against Epic wait on until the
// records they work from have all arrived. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';

/** @type {import('../src/cloud.js').Kind[]} */
const NEEDS = ['people', 'leave', 'requests', 'rosters'];

test('ready: false until every named kind has had its first rows', () => {
  const store = createStore();
  assert.equal(store.ready(NEEDS), false);
  store.set('people', [{ id: 'p1', name: 'Dr Ann Test' }]);
  store.set('leave', [{ id: 'l1', name: 'Dr Ann Test', from: '2026-11-09', to: '2026-11-13' }]);
  store.set('rosters', [{ id: '2026-11' }]);
  assert.equal(store.ready(NEEDS), false, 'requests not in yet');
  assert.equal(store.loaded('requests'), false);
  store.set('requests', [{ id: 'r1', name: 'Dr Ann Test', date: '2026-11-20', type: 'cannot' }]);
  assert.equal(store.ready(NEEDS), true);
});

test('ready: a kind with no rows counts once it is heard', () => {
  const store = createStore();
  for (const k of NEEDS) store.set(k, []);
  assert.equal(store.ready(NEEDS), true);
  assert.deepEqual(store.get('requests'), []);
});

test('ready: kinds outside the list do not matter, and an empty list is ready at once', () => {
  const store = createStore();
  assert.equal(store.ready([]), true);
  store.set('weeks', []);
  assert.equal(store.ready(['weeks']), true);
  assert.equal(store.ready(['weeks', 'lists']), false);
});

test('ready: stays true when a kind changes again', () => {
  const store = createStore();
  for (const k of NEEDS) store.set(k, []);
  store.set('leave', [{ id: 'l1', name: 'Dr Bob Test', from: '2026-11-02', to: '2026-11-02' }]);
  assert.equal(store.ready(NEEDS), true);
});
