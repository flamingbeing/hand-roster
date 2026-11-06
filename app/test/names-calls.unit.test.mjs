// Name matching (a pasted name to a person) and the calls check (what is true of calls as they stand). Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchName } from '../src/roster/names.js';
import { checkCalls } from '../src/roster/calls-check.js';
import { applyDayEdit, callChoices, dayLabel, handCount, keepGoodCalls, setCall } from '../src/roster/calls-edit.js';
import { solveCalls } from '../src/roster/calls.js';

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

test('checkCalls: a call given to someone off the calls roster is reported, counted, and sorted last', () => {
  const people = [...staff, { name: 'Dr Di Test', grade: 'mo', rank: 'MO', noCall: true }, { name: 'Dr Ed Test', grade: 'mo', rank: 'MO', tiers: /** @type {const} */ (['moNtf']) }];
  // Dr Gone Test was made inactive (or deleted) after the month was made: not among the people passed in
  const calls = [
    { date: '2026-11-02', con: 'Dr Ann Test', reg: 'Dr Bea Test', moNuh: 'Dr Gone Test', moNtf: null },
    { date: '2026-11-06', con: null, reg: null, moNuh: 'Dr Di Test', moNtf: null },
    { date: '2026-11-10', con: null, reg: null, moNuh: 'Dr Ed Test', moNtf: null },
  ];
  const r = checkCalls({ month: '2026-11', calls, people });
  for (const [name, date] of [['Dr Gone Test', '2026-11-02'], ['Dr Di Test', '2026-11-06'], ['Dr Ed Test', '2026-11-10']]) {
    const p = r.problems.find(x => x.rule === 'roster' && x.name === name);
    assert.ok(p, name);
    assert.equal(p.date, date);
    assert.equal(p.tier, 'moNuh');
    assert.equal(r.counts.find(c => c.name === name)?.total, 1, name);
  }
  assert.match(r.problems.find(p => p.name === 'Dr Ed Test')?.text ?? '', /does not take MO \(NUH\) calls on 2026-11-10/);
  assert.match(r.problems.find(p => p.name === 'Dr Gone Test')?.text ?? '', /is not on the roster for calls on 2026-11-02/);
  // one line per call, not the solver's own 'tier' line as well
  assert.equal(r.problems.filter(p => p.name === 'Dr Ed Test').length, 1);
  // off the roster: grade '?', after everyone on it; Dr Ed Test is on it (for MO NTFGH)
  const names = r.counts.map(c => c.name);
  assert.deepEqual(names.slice(-2), ['Dr Di Test', 'Dr Gone Test']);
  assert.ok(r.counts.slice(-2).every(c => c.grade === '?' && c.offRoster));
  assert.ok(!r.counts.find(c => c.name === 'Dr Ed Test')?.offRoster);
});

test('callChoices: free people first, with their month total and why the others may not be free', () => {
  const people = [
    { name: 'Dr Ann Test', grade: 'mo', rank: 'MO' }, { name: 'Dr Bea Test', grade: 'mo', rank: 'MO' }, { name: 'Dr Cy Test', grade: 'mo', rank: 'MO' },
    { name: 'Dr Di Test', grade: 'mo', rank: 'MO' }, { name: 'Dr Ed Test', grade: 'mo', rank: 'MO' }, { name: 'Dr Fay Test', grade: 'mo', rank: 'MO' },
    { name: 'Dr Gil Test', grade: 'mo', rank: 'MO' }, { name: 'Dr Con Test', grade: 'con' },
  ];
  const calls = [
    { date: '2026-12-01', con: null, reg: null, moNuh: 'Dr Bea Test', moNtf: 'Dr Fay Test' },
    { date: '2026-12-03', con: null, reg: null, moNuh: 'Dr Ann Test', moNtf: null },
    { date: '2026-12-20', con: null, reg: null, moNuh: 'Dr Ann Test', moNtf: 'Dr Fay Test' },
  ];
  const o = /** @type {const} */ ({ date: '2026-12-01', tier: 'moNuh', people, calls, minGap: 2, current: 'Dr Bea Test',
    prior: { '2026-11-30': { moNtf: 'Dr Cy Test' } },
    leave: [{ name: 'Dr Di Test', from: '2026-11-28', to: '2026-12-02' }],
    requests: [{ name: 'Dr Ed Test', date: '2026-12-01', type: 'cannot' }, { name: 'Dr Bea Test', date: '2026-12-01', type: 'want' }] });
  const out = callChoices(o);
  assert.deepEqual(out[0], ['', 'Nobody']);
  // values are the plain names; a consultant is not offered an MO tier
  assert.ok(out.every(([v]) => v === '' || v.startsWith('Dr ')));
  assert.ok(!out.some(([v]) => v === 'Dr Con Test'));
  const label = Object.fromEntries(out);
  assert.equal(label['Dr Bea Test'], 'Dr Bea Test · 1 call (wants this day)');
  assert.equal(label['Dr Ann Test'], 'Dr Ann Test · 2 calls (on call 2 days after)');
  assert.equal(label['Dr Cy Test'], 'Dr Cy Test · 0 calls (on call 1 day before)');
  assert.equal(label['Dr Di Test'], 'Dr Di Test · 0 calls (on leave)');
  assert.equal(label['Dr Ed Test'], 'Dr Ed Test · 0 calls (asked not to)');
  assert.equal(label['Dr Fay Test'], 'Dr Fay Test · 2 calls (on call that day)');
  assert.equal(label['Dr Gil Test'], 'Dr Gil Test · 0 calls');
  // the one who wants the day, then the free, then the rest, each by name
  assert.deepEqual(out.slice(1).map(([v]) => v), ['Dr Bea Test', 'Dr Gil Test', 'Dr Ann Test', 'Dr Cy Test', 'Dr Di Test', 'Dr Ed Test', 'Dr Fay Test']);
});

test('checkCalls and callChoices: a call on 30 Nov is checked against December\'s calls once December is made', () => {
  const calls = [{ date: '2026-11-30', con: 'Dr Ann Test', reg: null, moNuh: null, moNtf: null }];
  const after = { '2026-12-01': { con: 'Dr Ann Test' } };
  const r = checkCalls({ month: '2026-11', calls, people: staff, after });
  const gap = r.problems.find(p => p.rule === 'gap');
  assert.ok(gap);
  assert.equal(gap.date, '2026-11-30');
  assert.equal(gap.name, 'Dr Ann Test');
  // two clear days needed: 28 Nov is fine, 29 Nov is not
  assert.ok(checkCalls({ month: '2026-11', calls: [{ ...calls[0], date: '2026-11-29' }], people: staff, after }).problems.some(p => p.rule === 'gap' && p.date === '2026-11-29'));
  assert.deepEqual(checkCalls({ month: '2026-11', calls: [{ ...calls[0], date: '2026-11-28' }], people: staff, after }).problems, []);
  // no December yet: nothing to say (the old behaviour)
  assert.deepEqual(checkCalls({ month: '2026-11', calls, people: staff }).problems, []);
  // the day sheet: on call the day after, and December's call is not counted in November's total
  const label = Object.fromEntries(callChoices({ date: '2026-11-30', tier: 'con', people: staff, calls: [], after, minGap: 2 }));
  assert.equal(label['Dr Ann Test'], 'Dr Ann Test · 0 calls (on call 1 day after)');
});

test('dayLabel: a calendar day reads its calls aloud, with a problem and a call set by hand said in words', () => {
  const text = dayLabel('2026-11-02', false, [
    { t: 'con', name: 'Dr Ann Test', bad: false, hand: true }, { t: 'reg', name: 'Dr Bea Test', bad: true, hand: false },
    { t: 'moNuh', name: null, bad: false, hand: false }]);
  assert.equal(text, 'Mon 2 Nov: CON Dr Ann Test (set by hand), REG Dr Bea Test (problem), MO (NUH) nobody.');
  assert.equal(dayLabel('2026-12-25', true, []), 'Fri 25 Dec, public holiday: no calls.');
});

test('callChoices: the one holding the call now stays a choice when off the roster', () => {
  const out = callChoices({ date: '2026-12-05', tier: 'con', people: [{ name: 'Dr Ann Test', grade: 'con' }], calls: [{ date: '2026-12-05', con: 'Dr Gone Test' }], current: 'Dr Gone Test' });
  assert.deepEqual(out.map(([v]) => v), ['', 'Dr Ann Test', 'Dr Gone Test']);
  assert.match(out[2][1], /not on the roster/);
});

test('applyDayEdit: a day sheet saves onto the month as it is now, not as it was when the sheet opened', () => {
  // the sheet opened on 2 Dec with CON Dr Ann Test and REG Dr Bea Test
  const before = { con: 'Dr Ann Test', reg: 'Dr Bea Test', reg2: null };
  // meanwhile another maker set 9 Dec's CON and changed 2 Dec's REG
  let now = setCall([{ date: '2026-12-02', con: 'Dr Ann Test', reg: 'Dr Bea Test' }], [], '2026-12-09', 'con', 'Dr Cy Test');
  now = setCall(now.calls, now.locked, '2026-12-02', 'reg', 'Dr Di Test');
  // this sheet changes only CON
  const out = applyDayEdit(now.calls, now.locked, '2026-12-02', before, { con: 'Dr Ed Test', reg: 'Dr Bea Test', reg2: null });
  const day = out.calls.find(c => c.date === '2026-12-02');
  assert.equal(day?.con, 'Dr Ed Test');
  assert.equal(day?.reg, 'Dr Di Test', 'a tier left alone keeps the other maker\'s name');
  assert.equal(out.calls.find(c => c.date === '2026-12-09')?.con, 'Dr Cy Test', 'another day\'s call stays');
  assert.deepEqual([...out.locked].sort(), ['2026-12-02|con', '2026-12-02|reg', '2026-12-09|con']);
  // emptying a tier unlocks it; nothing changed gives the month back as it is
  assert.deepEqual(applyDayEdit(out.calls, out.locked, '2026-12-02', { con: 'Dr Ed Test' }, { con: '' }).locked.sort(), ['2026-12-02|reg', '2026-12-09|con']);
  assert.equal(applyDayEdit(out.calls, out.locked, '2026-12-02', before, before).calls, out.calls);
});

test('handCount: counts the calls set by hand that still hold a name', () => {
  const calls = [{ date: '2026-12-02', con: 'Dr Ann Test', reg: 'Dr Bea Test', moNuh: null }];
  assert.equal(handCount(['2026-12-02|con', '2026-12-02|reg', '2026-12-02|moNuh', '2026-12-03|con'], calls), 2);
  assert.equal(handCount([], calls), 0);
});

test('keepGoodCalls: keeps the fine calls and the hand-set ones, frees the problem calls; empty tiers and other months stay out', () => {
  const month = '2026-12';
  const cons = [{ name: 'Dr Ann Test', grade: 'con' }, { name: 'Dr Dan Test', grade: 'con' }, { name: 'Dr Eve Test', grade: 'con' }];
  const only = /** @type {any} */ ({ weekday: ['con'], sat: ['con'], sun: ['con'], ph: ['con'] });
  const calls = [
    { date: '2026-11-30', con: 'Dr Eve Test' },   // last month's row: left out
    { date: '2026-12-01', con: 'Dr Ann Test' },
    { date: '2026-12-02', con: 'Dr Ann Test' },   // too soon after the 1st: a problem
    { date: '2026-12-05', con: 'Dr Dan Test' },
    { date: '2026-12-09', con: 'Dr Eve Test' },   // set by hand, and on leave: still kept
  ];
  const locked = ['2026-12-09|con'];
  const leave = [{ name: 'Dr Eve Test', from: '2026-12-09', to: '2026-12-09' }];
  const check = checkCalls({ month, calls, people: cons, leave, tiers: only });
  assert.ok(check.problems.some(p => p.date === '2026-12-02' && p.tier === 'con'));
  assert.ok(check.problems.some(p => p.date === '2026-12-09' && p.rule === 'leave'));
  assert.ok(check.empty.some(e => e.date === '2026-12-03'));
  const keep = keepGoodCalls(month, calls, locked, check);
  assert.deepEqual(keep, { '2026-12-01': { con: 'Dr Ann Test' }, '2026-12-05': { con: 'Dr Dan Test' }, '2026-12-09': { con: 'Dr Eve Test' } });
  // nothing broken: every call kept
  assert.deepEqual(keepGoodCalls(month, calls, [], { problems: [] })['2026-12-02'], { con: 'Dr Ann Test' });
  // the solver keeps those exactly and fills the rest around them (the freed 2nd goes to someone else)
  const res = solveCalls({ month, people: cons, leave, tiers: only, locked: keep, seed: 3, iterations: 2000 });
  for (const [date, row] of Object.entries(keep)) assert.equal(res.assignments[date].con, row.con);
  assert.notEqual(res.assignments['2026-12-02'].con, 'Dr Ann Test');
  assert.ok(res.assignments['2026-12-03'].con);
});
