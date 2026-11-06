// The Leave tab's pure helpers (roster/leave-view.js): a run of request days, their clash lines, and the month groups.
// Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDays, groupByMonth, requestRangeClashes } from '../src/roster/leave-view.js';
import { MAX_DAYS, MAX_LINES } from '../src/roster/leave-clash.js';

const ANN = 'Dr Ann Test';

test('a five-day run gives five days', () => {
  assert.deepEqual(expandDays('2026-12-28', '2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
});

test('a run past the cap stops at the cap', () => {
  const days = expandDays('2026-12-01', '2027-03-01', MAX_DAYS);
  assert.equal(days.length, MAX_DAYS);
  assert.equal(days[0], '2026-12-01');
  assert.equal(days.at(-1), '2026-12-31');
  assert.deepEqual(expandDays('2026-12-01', '2026-12-10', 3), ['2026-12-01', '2026-12-02', '2026-12-03']);
});

test('a last day before the first, the same or missing gives the first day alone', () => {
  assert.deepEqual(expandDays('2026-12-10', '2026-12-05'), ['2026-12-10']);
  assert.deepEqual(expandDays('2026-12-10', '2026-12-10'), ['2026-12-10']);
  assert.deepEqual(expandDays('2026-12-10', ''), ['2026-12-10']);
  assert.deepEqual(expandDays('2026-12-10', null), ['2026-12-10']);
  assert.deepEqual(expandDays('', '2026-12-10'), []);
});

test('rows group by month across a year end, in the order they come', () => {
  const rows = [{ d: '2026-12-30' }, { d: '2026-12-31' }, { d: '2027-01-01' }, { d: '2027-02-14' }];
  const out = groupByMonth(rows, r => r.d);
  assert.deepEqual(out.map(g => [g.month, g.label, g.rows.length]), [['2026-12', 'December 2026', 2], ['2027-01', 'January 2027', 1], ['2027-02', 'February 2027', 1]]);
  assert.equal(out[1].rows[0], rows[2]);
  assert.deepEqual(groupByMonth([], r => r), []);
});

test('the clash lines of a run name each day, and past the cap are counted', () => {
  const calls = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-12'].map(date => ({ date, con: null, reg: ANN, moNuh: null, moNtf: null }));
  const rosters = [{ id: '2026-11', calls }];
  const one = requestRangeClashes({ name: ANN, from: '2026-11-02', to: '2026-11-02', type: 'cannot', rosters });
  assert.deepEqual(one, ['Dr Ann Test is on call (REG) on that day. Change that call on the Calls tab.']);
  const two = requestRangeClashes({ name: ANN, from: '2026-11-01', to: '2026-11-04', type: 'cannot', rosters });
  assert.deepEqual(two, ['Dr Ann Test is on call (REG) on Mon 2 Nov. Change that call on the Calls tab.', 'Dr Ann Test is on call (REG) on Wed 4 Nov. Change that call on the Calls tab.']);
  const all = requestRangeClashes({ name: ANN, from: '2026-11-01', to: '2026-11-30', type: 'cannot', rosters });
  assert.equal(all.length, MAX_LINES + 1);
  assert.equal(all.at(-1), `And ${calls.length - MAX_LINES} more.`);
  assert.deepEqual(requestRangeClashes({ name: ANN, from: '2026-11-01', to: '2026-11-30', type: 'want', rosters }), []);
});
