// Name matching (a pasted name to a person) and the calls check (what is true of calls as they stand). Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchName } from '../src/roster/names.js';
import { checkCalls } from '../src/roster/calls-check.js';

const people = [{ name: 'Ann Test' }, { name: 'Bea Sample' }, { name: 'Bea Other' }, { name: 'Cy Example Long' }];

test('matchName: exact, with Dr and dots, a start, and all the words', () => {
  assert.equal(matchName('Ann Test', people), 'Ann Test');
  assert.equal(matchName('Dr. ann test', people), 'Ann Test');
  assert.equal(matchName('cy example', people), 'Cy Example Long');
  assert.equal(matchName('long cy', people), 'Cy Example Long');
});

test('matchName: nothing or two fitting gives null, never a guess', () => {
  assert.equal(matchName('', people), null);
  assert.equal(matchName('Dr', people), null);
  assert.equal(matchName('Bea', people), null);
  assert.equal(matchName('Zed Nobody', people), null);
});

const staff = [
  { name: 'Dr Ann Test', grade: 'con' },
  { name: 'Dr Bea Test', grade: 'reg', rank: 'Reg' },
  { name: 'Dr Cy Test', grade: 'mo', rank: 'MO' },
];

test('checkCalls: counts each person, reports empty tiers, and flags a call on leave', () => {
  const calls = [{ date: '2026-11-02', con: 'Dr Ann Test', reg: 'Dr Bea Test', moNuh: null, moNtf: null }];
  const r = checkCalls({ month: '2026-11', calls, people: staff, leave: [{ name: 'Dr Ann Test', from: '2026-11-02', to: '2026-11-02' }] });
  assert.ok(r.problems.some(p => p.rule === 'leave' && p.name === 'Dr Ann Test' && p.date === '2026-11-02'));
  assert.equal(r.counts.find(c => c.name === 'Dr Bea Test')?.total, 1);
  assert.equal(r.counts.find(c => c.name === 'Dr Cy Test')?.total, 0);
  assert.ok(r.empty.some(e => e.date === '2026-11-02' && e.tier === 'moNuh'));
  assert.ok(!r.empty.some(e => e.date === '2026-11-02' && e.tier === 'con'));
});

test('checkCalls: calls with nothing wrong report no problems', () => {
  const calls = [{ date: '2026-11-02', con: 'Dr Ann Test', reg: 'Dr Bea Test', moNuh: 'Dr Cy Test', moNtf: null }];
  const r = checkCalls({ month: '2026-11', calls, people: staff });
  assert.deepEqual(r.problems, []);
});
