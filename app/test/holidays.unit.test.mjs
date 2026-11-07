// Singapore public holidays suggested per month (roster/holidays.js) and the Calls Settings holidays field read for one
// month: typos, days that do not exist and days of another month are ignored and named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayTable, holidaysIn, inLieuStands, readHolidays, weekendHolidays } from '../src/roster/holidays.js';
import { addDays, isWeekend, weekday } from '../src/roster/dates.js';

test('a month with a weekday holiday suggests it', () => {
  assert.deepEqual(holidaysIn('2026-12'), { suggest: [{ day: '2026-12-25', name: 'Christmas Day' }], weekendNames: [] });
  assert.deepEqual(holidaysIn('2026-02').suggest.map(h => h.day), ['2026-02-17', '2026-02-18']);
});

test('a Sunday holiday suggests its Monday in lieu and names the Sunday', () => {
  assert.deepEqual(holidaysIn('2026-11'), { suggest: [{ day: '2026-11-09', name: 'Deepavali (in lieu)' }], weekendNames: ['8 Nov Deepavali'] });
  // 2027: Chinese New Year on Saturday and Sunday, the Monday off
  assert.deepEqual(holidaysIn('2027-02'), {
    suggest: [{ day: '2027-02-08', name: 'Chinese New Year (in lieu)' }],
    weekendNames: ['6 Feb Chinese New Year', '7 Feb Chinese New Year (day 2)'],
  });
  // a Saturday one has no day in lieu
  assert.deepEqual(holidaysIn('2026-03'), { suggest: [], weekendNames: ['21 Mar Hari Raya Puasa'] });
});

test('a month with no public holiday, and a year not in the table, suggest nothing', () => {
  assert.deepEqual(holidaysIn('2026-07'), { suggest: [], weekendNames: [] });
  assert.deepEqual(holidaysIn('2028-01'), { suggest: [], weekendNames: [] });
  assert.deepEqual(holidaysIn('2025-12'), { suggest: [], weekendNames: [] });
});

test('the holidays field keeps real days of the month, sorted without repeats, and names the rest', () => {
  assert.deepEqual(readHolidays('2026-11-09\n2026-11-02, 2026-11-09', '2026-11'), { days: ['2026-11-02', '2026-11-09'], ignored: [] });
  assert.deepEqual(readHolidays('8 Nov\n2026-11-8\n2026-12-01\n2026-11-30', '2026-11'), { days: ['2026-11-30'], ignored: ['8 Nov', '2026-11-8', '2026-12-01'] });
  assert.deepEqual(readHolidays('2026-02-31\n2026-02-17', '2026-02'), { days: ['2026-02-17'], ignored: ['2026-02-31'] });
  // days split by spaces on one line are read one by one
  assert.deepEqual(readHolidays('2026-02-17 2026-02-18 2026-03-01', '2026-02'), { days: ['2026-02-17', '2026-02-18'], ignored: ['2026-03-01'] });
  assert.deepEqual(readHolidays('', '2026-11'), { days: [], ignored: [] });
});

// Owner decision 7 Nov 2026: public holidays follow MOM's official Singapore list (mom.gov.sg, checked 7 Nov 2026); a
// weekend holiday counts as the weekend for calls; a day in lieu only for a Sunday holiday, never a Saturday one.
test('the table matches MOM’s published 2026 and 2027 lists', () => {
  assert.deepEqual(holidayTable(2026).map(([d]) => d), ['2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03',
    '2026-05-01', '2026-05-27', '2026-05-31', '2026-06-01', '2026-08-09', '2026-08-10', '2026-11-08', '2026-11-09', '2026-12-25']);
  assert.deepEqual(holidayTable(2027).map(([d]) => d), ['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-03-10',
    '2027-03-26', '2027-05-01', '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25']);
});

test('every day in lieu follows a Sunday holiday, every Sunday holiday has one, and no Saturday holiday does', () => {
  for (const year of [2026, 2027]) {
    const rows = holidayTable(year);
    for (const [day, name] of rows) {
      if (/in lieu/.test(name)) assert.ok(inLieuStands(day), `${day} ${name} follows a Sunday holiday`);
      if (weekday(day) === 0 && !/in lieu/.test(name)) assert.ok(rows.some(([d, n]) => /in lieu/.test(n) && d > day && d <= addDays(day, 3)), `${day} ${name} has a day in lieu`);
      // a Saturday holiday on its own (not the first of a Saturday and Sunday pair) has no day in lieu after it
      if (weekday(day) === 6 && !rows.some(([d]) => d === addDays(day, 1))) assert.ok(!rows.some(([d, n]) => /in lieu/.test(n) && d > day && d <= addDays(day, 3)), `${day}: no day in lieu for a Saturday`);
    }
  }
  // the guard itself: a Monday after a Saturday-only holiday, a Monday after a plain Sunday, and a weekend day never stand
  assert.equal(inLieuStands('2026-03-23'), false, 'Hari Raya Puasa 2026 is a Saturday: no Monday off');
  assert.equal(inLieuStands('2027-05-03'), false, 'Labour Day 2027 is a Saturday: no Monday off');
  assert.equal(inLieuStands('2027-12-27'), false, 'Christmas 2027 is a Saturday: no Monday off');
  assert.equal(inLieuStands('2026-11-16'), false, 'a Monday after an ordinary Sunday');
  assert.equal(inLieuStands('2026-11-09'), true);
  assert.equal(inLieuStands('2026-11-08'), false, 'a weekend day is never a day in lieu');
});

test('Suggest never adds a Saturday or Sunday, nor a day in lieu for a Saturday holiday', () => {
  for (const year of [2026, 2027]) for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    for (const { day } of holidaysIn(month).suggest) assert.ok(!isWeekend(day), `${day} is a weekday`);
  }
  assert.deepEqual(holidaysIn('2027-05').suggest.map(h => h.day), ['2027-05-17', '2027-05-20'], 'Labour Day on Sat 1 May: named, no Monday 3 May');
  assert.deepEqual(holidaysIn('2027-05').weekendNames, ['1 May Labour Day']);
  assert.deepEqual(holidaysIn('2027-12'), { suggest: [], weekendNames: ['25 Dec Christmas Day'] });
});

test('typed holidays on a weekend are picked out (they count as the weekend for calls)', () => {
  assert.deepEqual(weekendHolidays(['2026-11-08', '2026-11-09', '2026-03-21', '2026-12-25']), ['2026-11-08', '2026-03-21']);
});
