// The Leave tab's pure helpers (roster/leave-view.js): a run of request days, their clash lines, the month groups, and
// which pasted leave lines are new.
// Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDays, groupByMonth, requestRangeClashes, newLeaveRows, pastePreview, leaveKey, MAX_BAD } from '../src/roster/leave-view.js';
import { parseInfo, yearFor } from '../src/roster/parse-info.js';
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

const BO = 'Dr Bo Test';

test('pasted leave: rows already there and repeats inside the paste are skipped', () => {
  const existing = [{ id: 'a', name: ANN, from: '2026-10-12', to: '2026-10-16', session: 'both' }, { id: 'b', name: BO, from: '2026-10-20', to: '2026-10-20', session: 'both', _deleted: true }];
  const parsed = [
    { name: ANN, from: '2026-10-12', to: '2026-10-16' },
    { name: BO, from: '2026-10-20', to: '2026-10-20' },
    { name: BO, from: '2026-10-20', to: '2026-10-20' },
    { name: ` ${ANN} `, from: '2026-10-19', to: '2026-10-19', note: 'Course' },
  ];
  const { rows, dup } = newLeaveRows(parsed, existing);
  assert.equal(dup, 2, 'the kept row and the repeat; a deleted row does not count');
  assert.deepEqual(rows, [
    { name: BO, from: '2026-10-20', to: '2026-10-20', session: 'both', note: null },
    { name: ANN, from: '2026-10-19', to: '2026-10-19', session: 'both', note: 'Course' },
  ]);
});

test('pasted leave: AM and PM of the same day are kept apart, and all day is its own row', () => {
  const existing = [{ id: 'a', name: BO, from: '2026-10-14', to: '2026-10-14', session: 'AM' }];
  const { rows, dup } = newLeaveRows([
    { name: BO, from: '2026-10-14', to: '2026-10-14', session: 'AM' },
    { name: BO, from: '2026-10-14', to: '2026-10-14', session: 'PM' },
    { name: BO, from: '2026-10-14', to: '2026-10-14' },
  ], existing);
  assert.equal(dup, 1);
  assert.deepEqual(rows.map(r => r.session), ['PM', 'both']);
  // a kept row with no part of the day is all day
  assert.equal(leaveKey({ name: BO, from: '2026-10-14', to: '2026-10-14' }), leaveKey({ name: BO, from: '2026-10-14', to: '2026-10-14', session: 'both' }));
});

test('pasted leave: a range over a month end and over the year end is read and kept whole', () => {
  const info = parseInfo(`${ANN} 30 Oct to 2 Nov (away Fri to Mon)\n${BO} 30 Dec to 2 Jan`, { year: 2026, start: 'leave' });
  assert.deepEqual(info.problems, []);
  const { rows } = newLeaveRows(info.leave, [{ id: 'x', name: ANN, from: '2026-10-30', to: '2026-10-31' }]);
  assert.deepEqual(rows.map(r => [r.name, r.from, r.to]), [[ANN, '2026-10-30', '2026-11-02'], [BO, '2026-12-30', '2027-01-02']]);
});

test('pasted leave: read late or early in the year, a date takes the year around today', () => {
  const leave = (/** @type {string} */ text, /** @type {string} */ today) => parseInfo(text, { today, start: 'leave' }).leave.map(l => [l.from, l.to]);
  // January pasted in December is next year's, December pasted in January last year's
  assert.deepEqual(leave(`${BO} 4 to 8 Jan (away Mon to Fri)`, '2026-12-21'), [['2027-01-04', '2027-01-08']]);
  assert.deepEqual(leave(`${ANN} 28 Dec`, '2027-01-03'), [['2026-12-28', '2026-12-28']]);
  // a range over the year end starts this year, read either side of it
  assert.deepEqual(leave(`${BO} 30 Dec to 2 Jan`, '2026-12-21'), [['2026-12-30', '2027-01-02']]);
  assert.deepEqual(leave(`${BO} 30 Dec to 2 Jan`, '2027-01-01'), [['2026-12-30', '2027-01-02']]);
  // the recent past stays this year
  assert.deepEqual(leave(`${ANN} 12 Nov\n${ANN} 3 Oct\n${ANN} 3 Aug`, '2026-11-07'), [['2026-11-12', '2026-11-12'], ['2026-10-03', '2026-10-03'], ['2026-08-03', '2026-08-03']]);
  // calls in the same block take the same year: 4 Jan 2027 is a Monday
  const info = parseInfo('Calls (Reg / NUH MO / NTF MO)\nMon 4 Jan (A / B / C)', { today: '2026-12-21' });
  assert.deepEqual(info.problems, []);
  assert.equal(info.calls[0].date, '2027-01-04');
  // the window runs from 3 months before today's month to 8 after
  assert.deepEqual([8, 7, 12].map(m => yearFor(m, '2026-11-07')), [2026, 2027, 2026]);
  assert.deepEqual([9, 10, 12].map(m => yearFor(m, '2027-01-15')), [2027, 2026, 2026]);
});

test('pasted leave: lines with no heading read as leave; the preview counts and names what it could not read', () => {
  const text = `${ANN} 12 to 16 Oct (away Mon to Fri)\n${BO} 14 Oct (away Wed AM)\nnonsense\nDr Cy Test 31 Feb\nCalls (Reg / NUH MO / NTF MO)\nMon 12 Oct (A / B / C)\nTue 12 Oct (A / B / C)`;
  const info = parseInfo(text, { year: 2026, start: 'leave' });
  assert.equal(info.leave.length, 2);
  assert.equal(info.leave[1].session, 'AM');
  const picked = newLeaveRows(info.leave, [{ id: 'a', name: ANN, from: '2026-10-12', to: '2026-10-16', session: 'both' }]);
  assert.deepEqual(pastePreview(info, picked), [
    '1 leave row to add, 1 already there.',
    'Line 3 not read: not a leave line (Name 12 to 16 Oct).',
    'Line 4 not read: not a real date.',
    'Calls go on the Calls tab.',
  ]);
  // without the start option the same lines are before any heading
  assert.equal(parseInfo(`${ANN} 12 Oct`, { year: 2026 }).problems[0].reason, 'before a Leave or Calls heading');
  assert.deepEqual(pastePreview(parseInfo('', { year: 2026, start: 'leave' }), { rows: [], dup: 0 }), []);
});

test('pasted leave: past MAX_BAD unread lines the rest are counted', () => {
  const info = parseInfo(Array.from({ length: MAX_BAD + 2 }, (_, i) => `junk ${i}`).join('\n'), { year: 2026, start: 'leave' });
  const lines = pastePreview(info, newLeaveRows(info.leave, []));
  assert.equal(lines[0], '0 leave rows to add.');
  assert.equal(lines.length, 1 + MAX_BAD + 1);
  assert.equal(lines.at(-1), 'And 2 more lines not read.');
});
