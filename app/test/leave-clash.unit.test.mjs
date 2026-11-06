// The clash lines under the Leave and request sheets (roster/leave-clash.js): calls and built weeks a new leave or "cannot"
// request runs into. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveClashes, requestClashes, MAX_LINES } from '../src/roster/leave-clash.js';

const ANN = 'Dr Ann Test';
const rosters = [
  { id: '2026-11', calls: [
    { date: '2026-11-12', con: 'Dr Eve Test', reg: ANN, moNuh: 'Dr Cat Test', moNtf: null },
    { date: '2026-11-30', con: 'Dr Eve Test', reg: 'Dr Ben Test', moNuh: ANN, moNtf: null },
  ] },
  { id: '2026-12', calls: [{ date: '2026-12-01', con: ANN, reg: 'Dr Ben Test', moNuh: null, moNtf: null }] },
  { id: '2026-10', _deleted: true, calls: [{ date: '2026-11-13', con: ANN }] },
];
const lists = [
  { id: 'a', site: 'NUH', kind: 'ot', name: 'Hand OT', day: '2026-11-12', session: 'AM', status: 'open', need: 2 },
  { id: 'b', site: 'NUH', kind: 'clinic', name: 'CLINIC', day: '2026-11-12', session: 'PM', status: 'open', need: 1 },
];
const builtWeek = { id: '2026-11-09', built: 1, lists, grid: [
  { day: '2026-11-12', session: 'AM', list: 'a', juniors: [ANN, 'Dr Cat Test'] },
  { day: '2026-11-12', session: 'PM', list: 'b', juniors: ['Dr Cat Test'] },
  { day: '2026-11-11', session: 'PM', list: 'b', juniors: [ANN] },
] };
const base = { name: ANN, rosters, weeks: [builtWeek], leave: [] };

test('leave over a call day gives the call line', () => {
  const out = leaveClashes({ ...base, from: '2026-11-12', to: '2026-11-12', session: 'both', weeks: [] });
  assert.deepEqual(out, ['Dr Ann Test is on call (REG) on Thu 12 Nov. Change that call on the Calls tab.']);
});

test('AM-only leave: an AM placement in a built week clashes, a PM one does not', () => {
  const am = leaveClashes({ ...base, from: '2026-11-11', to: '2026-11-12', session: 'AM' });
  assert.deepEqual(am, [
    'Dr Ann Test is on call (REG) on Thu 12 Nov. Change that call on the Calls tab.',
    'Dr Ann Test is on NUH Hand OT on Thu 12 Nov AM (week built). Move them or build the week again.',
  ]);
  // the PM list on Wed 11 Nov is not covered by AM leave
  assert.ok(!am.some(l => l.includes('11 Nov')));
  const pm = leaveClashes({ ...base, from: '2026-11-11', to: '2026-11-11', session: 'PM' });
  assert.deepEqual(pm, ['Dr Ann Test is on NUH CLINIC on Wed 11 Nov PM (week built). Move them or build the week again.']);
});

test('a week not built yet gives no placement line', () => {
  const unbuilt = { id: '2026-11-09', built: 0, lists, grid: [] };
  assert.deepEqual(leaveClashes({ ...base, rosters: [], weeks: [unbuilt], from: '2026-11-09', to: '2026-11-13', session: 'both' }), []);
  // a deleted week counts as not built
  assert.deepEqual(leaveClashes({ ...base, rosters: [], weeks: [{ ...builtWeek, _deleted: true }], from: '2026-11-12', to: '2026-11-12', session: 'both' }), []);
});

test('leave across a month end reads the calls of both months (and not a deleted roster)', () => {
  const out = leaveClashes({ ...base, weeks: [], from: '2026-11-30', to: '2026-12-01', session: 'both' });
  assert.deepEqual(out, [
    'Dr Ann Test is on call (MO (NUH)) on Mon 30 Nov. Change that call on the Calls tab.',
    'Dr Ann Test is on call (CON) on Tue 1 Dec. Change that call on the Calls tab.',
  ]);
  assert.deepEqual(leaveClashes({ ...base, weeks: [], from: '2026-11-13', to: '2026-11-13', session: 'both' }), []);
});

test('others away on overlapping days are counted, the person themselves is not', () => {
  const leave = [
    { name: 'Dr Ben Test', from: '2026-11-10', to: '2026-11-11' },
    { name: 'Dr Cat Test', from: '2026-11-11', to: '2026-11-20', session: 'AM' },
    { name: 'Dr Cat Test', from: '2026-11-25', to: '2026-11-26' },
    { name: 'Dr Dan Test', from: '2026-11-01', to: '2026-11-05' },
    { name: 'Dr Dan Test', from: '2026-11-11', to: '2026-11-11', _deleted: true },
    { name: ANN, from: '2026-11-11', to: '2026-11-11' },
  ];
  assert.deepEqual(leaveClashes({ ...base, rosters: [], weeks: [], leave, from: '2026-11-11', to: '2026-11-11', session: 'both' }), ['2 others away then.']);
  assert.deepEqual(leaveClashes({ ...base, rosters: [], weeks: [], leave, from: '2026-11-25', to: '2026-11-25', session: 'both' }), ['1 other away then.']);
});

test('a name with nothing on gives no lines; unfinished dates give none', () => {
  assert.deepEqual(leaveClashes({ ...base, name: 'Dr Fay Test', from: '2026-11-01', to: '2026-12-01', session: 'both' }), []);
  assert.deepEqual(leaveClashes({ ...base, from: '2026-11-12', to: '', session: 'both' }), []);
  assert.deepEqual(leaveClashes({ ...base, from: '2026-11-13', to: '2026-11-12', session: 'both' }), []);
  assert.deepEqual(leaveClashes({ ...base, name: '', from: '2026-11-12', to: '2026-11-12', session: 'both' }), []);
});

test('only 31 days are checked, and the lines are capped with a count of the rest', () => {
  const calls = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    return { date: d, con: null, reg: ANN, moNuh: null, moNtf: null };
  });
  const many = [{ id: '2027-01', calls: calls.filter(c => c.date < '2027-02') }, { id: '2027-02', calls: calls.filter(c => c.date >= '2027-02') }];
  const out = leaveClashes({ ...base, rosters: many, weeks: [], from: '2027-01-01', to: '2027-03-01', session: 'both' });
  assert.equal(out.length, MAX_LINES + 1);
  // 31 days checked: 4 shown, 27 counted
  assert.equal(out.at(-1), 'And 27 more.');
  assert.match(out[0], /on Fri 1 Jan/);
});

test('a "cannot" request on a call day warns; "would like" and a free day do not', () => {
  assert.deepEqual(requestClashes({ name: ANN, date: '2026-12-01', type: 'cannot', rosters }),
    ['Dr Ann Test is on call (CON) on that day. Change that call on the Calls tab.']);
  assert.deepEqual(requestClashes({ name: ANN, date: '2026-12-01', type: 'want', rosters }), []);
  assert.deepEqual(requestClashes({ name: ANN, date: '2026-12-02', type: 'cannot', rosters }), []);
  assert.deepEqual(requestClashes({ name: 'Dr Fay Test', date: '2026-11-12', type: 'cannot', rosters }), []);
});
