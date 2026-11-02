import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binLabel, daysLeft, isExpired, itemOf, sortBin, BIN_DAYS } from '../src/bin.js';

const DAY = 864e5, now = Date.UTC(2026, 9, 27);
const entry = (id, days, extra = {}) => ({ id: `tasks:${id}`, kind: 'tasks', deletedAt: now - days * DAY, data: { id, text: id, done: false, updatedAt: 5, serverAt: 6 }, ...extra });

test('30 days: days left and expiry', () => {
  assert.equal(daysLeft(now, now), BIN_DAYS);
  assert.equal(daysLeft(now - 29.5 * DAY, now), 1);
  assert.equal(daysLeft(now - 40 * DAY, now), 0);
  assert.equal(isExpired(entry('a', 29), now), false);
  assert.equal(isExpired(entry('a', 31), now), true);
});

test('an entry with no date, or one in the future, is never purged', () => {
  assert.equal(isExpired({}, now), false);
  assert.equal(isExpired({ deletedAt: 0 }, now), false);
  assert.equal(isExpired({ deletedAt: now + 1e9 }, now), false);
});

test('label', () => {
  assert.equal(binLabel(entry('a', 0), now), 'deleted today · 30 days left');
  assert.equal(binLabel(entry('a', 1), now), 'deleted 1 day ago · 29 days left');
  assert.equal(binLabel(entry('a', 29), now), 'deleted 29 days ago · 1 day left');
});

test('itemOf drops stamps, refuses other kinds and broken data', () => {
  assert.deepEqual(itemOf(entry('a', 1), 'tasks'), { id: 'a', text: 'a', done: false });
  assert.equal(itemOf(entry('a', 1), 'lists'), null);
  assert.equal(itemOf({ kind: 'tasks', data: { text: 't' } }, 'tasks'), null);
  assert.equal(itemOf(null, 'tasks'), null);
});

test('sortBin: newest first, other kinds hidden, expired to purge', () => {
  const r = sortBin([entry('old', 5), entry('new', 1), entry('gone', 40), entry('l', 2, { kind: 'lists' })], 'tasks', now);
  assert.deepEqual(r.show.map(e => e.data.id), ['new', 'old']);
  assert.deepEqual(r.purge.map(e => e.data.id), ['gone']);
});
