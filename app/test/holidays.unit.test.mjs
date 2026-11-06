// Singapore public holidays suggested per month (roster/holidays.js) and the Calls Settings holidays field read for one
// month: typos, days that do not exist and days of another month are ignored and named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysIn, readHolidays } from '../src/roster/holidays.js';

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
