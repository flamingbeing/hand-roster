// tasks.js and task-ops.js: which tab a task is on, the order and grouping, the words for a day, what a save stores.
// node --test app/test/tasks.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, addDays, isDay, isTime, dueOf, timeOf, listOf, isOverdue, todayTasks, upcomingGroups, doneTasks, inList, openCounts,
  orderedLists, dayLabel, dueText, cleanFields } from '../src/tasks.js';
import { taskOps, refusal } from '../src/task-ops.js';

const T = '2026-10-29';
const t = (id, o = {}) => ({ id, text: id, done: false, createdAt: Number(id.replace(/\D/g, '')) || 0, ...o });

test('days are local YYYY-MM-DD text; addDays crosses months, years and leap days', () => {
  assert.equal(dayKey(new Date(2026, 9, 29, 23, 59)), T);
  assert.equal(addDays(T, 3), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays(T, -29), '2026-09-30');
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(isDay('2026-2-3'), false);
  assert.equal(isDay(T), true);
  assert.equal(isTime('24:00'), false);
  assert.equal(isTime('09:05'), true);
});

test('a time counts only with a day; a bad day is no day', () => {
  assert.equal(timeOf(t('a1', { dueTime: '09:00' })), null);
  assert.equal(timeOf(t('a1', { due: T, dueTime: '09:00' })), '09:00');
  assert.equal(dueOf(t('a1', { due: 'soon' })), null);
});

test('a task shows under its list while it exists, else Inbox', () => {
  const lists = [{ id: 'w', name: 'Work' }];
  assert.equal(listOf(t('a1', { listId: 'w' }), lists), 'w');
  assert.equal(listOf(t('a1', { listId: 'gone' }), lists), 'inbox');
  assert.equal(listOf(t('a1'), lists), 'inbox');
  assert.equal(listOf(t('a1', { listId: null }), lists), 'inbox');
});

test('overdue: a day before today, or today with the time gone; never a done task', () => {
  const now = new Date(2026, 9, 29, 10, 30);
  assert.equal(isOverdue(t('a1', { due: '2026-10-28' }), now), true);
  assert.equal(isOverdue(t('a1', { due: T }), now), false);
  assert.equal(isOverdue(t('a1', { due: T, dueTime: '10:29' }), now), true);
  assert.equal(isOverdue(t('a1', { due: T, dueTime: '10:30' }), now), false);
  assert.equal(isOverdue(t('a1', { due: '2026-10-28', done: true }), now), false);
  assert.equal(isOverdue(t('a1'), now), false);
});

test('Today: due today or earlier, overdue first and oldest first, then today by the sort; no done, no later', () => {
  const tasks = [
    t('a1', { due: T, dueTime: '15:00' }), t('a2', { due: '2026-10-27' }), t('a3', { due: T }), t('a4', { due: '2026-10-28' }),
    t('a5', { due: addDays(T, 1) }), t('a6'), t('a7', { due: T, done: true }), t('a8', { due: T, dueTime: '08:00' }),
  ];
  assert.deepEqual(todayTasks(tasks, T).map(x => x.id), ['a2', 'a4', 'a3', 'a8', 'a1']);
  assert.deepEqual(todayTasks(tasks, T, 'newest').map(x => x.id), ['a2', 'a4', 'a8', 'a3', 'a1']);
  assert.deepEqual(todayTasks(tasks, T, 'title').map(x => x.id), ['a2', 'a4', 'a1', 'a3', 'a8']);
});

test('Upcoming: later days in order, grouped; undated last', () => {
  const tasks = [
    t('a1', { due: '2026-11-03' }), t('a2', { due: '2026-10-30', dueTime: '17:00' }), t('a3'), t('a4', { due: '2026-10-30', dueTime: '09:00' }),
    t('a5', { due: T }), t('a6', { due: '2026-11-03', done: true }),
  ];
  const g = upcomingGroups(tasks, T);
  assert.deepEqual(g.map(x => x.key), ['2026-10-30', '2026-11-03', '']);
  assert.deepEqual(g[0].tasks.map(x => x.id), ['a4', 'a2']);
  assert.deepEqual(g[2].tasks.map(x => x.id), ['a3']);
  assert.deepEqual(upcomingGroups([], T), []);
});

test('Done: newest first; a missing doneAt sorts last', () => {
  const tasks = [t('a1', { done: true, doneAt: 5 }), t('a2', { done: true, doneAt: 9 }), t('a3', { done: true }), t('a4')];
  assert.deepEqual(doneTasks(tasks).map(x => x.id), ['a2', 'a1', 'a3']);
});

test('by list, and counts of the open ones', () => {
  const lists = [{ id: 'w', name: 'Work' }];
  const tasks = [t('a1', { listId: 'w' }), t('a2'), t('a3', { listId: 'w', done: true }), t('a4', { listId: 'gone' })];
  assert.deepEqual(inList(tasks, 'w', lists).map(x => x.id), ['a1', 'a3']);
  assert.deepEqual(inList(tasks, 'inbox', lists).map(x => x.id), ['a2', 'a4']);
  assert.equal(inList(tasks, 'all', lists).length, 4);
  assert.deepEqual([...openCounts(tasks, lists)], [['w', 1], ['inbox', 2]]);
  assert.deepEqual(orderedLists([{ id: 'b', name: 'B', order: 2 }, { id: 'a', name: 'A', order: 2 }, { id: 'c', name: 'C', order: 1 }]).map(l => l.id), ['c', 'a', 'b']);
});

test('words for a day', () => {
  assert.equal(dayLabel(T, T), 'Today');
  assert.equal(dayLabel('2026-10-30', T), 'Tomorrow');
  assert.equal(dayLabel('2026-10-28', T), 'Yesterday');
  assert.match(dayLabel('2026-11-05', T), /5/);
  assert.match(dayLabel('2027-01-05', T), /2027/);
  assert.equal(dueText(t('a1', { due: T, dueTime: '14:30' }), T), 'Today 14:30');
  assert.equal(dueText(t('a1'), T), '');
});

test('what a save stores: trimmed text, nulls for empty or bad fields, no time without a day', () => {
  assert.deepEqual(cleanFields({ text: '  hi ', notes: '  ', listId: 'inbox', due: 'x', dueTime: '09:00' }), { text: 'hi', notes: null, listId: null, due: null, dueTime: null });
  assert.deepEqual(cleanFields({ due: T, dueTime: '25:00' }), { due: T, dueTime: null });
  assert.deepEqual(cleanFields({ listId: 'w' }), { listId: 'w' });
  assert.deepEqual(cleanFields({}), {});
});

test('task-ops: add, edit, tick, remove and the lists save the right records', async () => {
  const saved = [];
  let n = 0;
  const ops = taskOps({ save: async (coll, rec, base) => { saved.push([coll, rec, base]); }, id: () => `id${++n}`, now: () => 1000 + n });
  assert.equal(await ops.add({ text: ' buy milk ', due: T }), '');
  assert.deepEqual(saved[0], ['tasks', { id: 'id1', done: false, text: 'buy milk', due: T, createdAt: 1001 }, null]);
  const task = { id: 'id1', text: 'buy milk', done: false };
  await ops.edit(task, { text: 'buy oat milk', listId: 'w' });
  assert.deepEqual(saved[1], ['tasks', { id: 'id1', text: 'buy oat milk', done: false, listId: 'w' }, task]);
  await ops.tick(task, true);
  assert.deepEqual(saved[2][1], { id: 'id1', text: 'buy milk', done: true, doneAt: 1001 });
  await ops.tick({ ...task, done: true, doneAt: 5 }, false);
  assert.deepEqual(saved[3][1], { id: 'id1', text: 'buy milk', done: false, doneAt: null });
  await ops.removeTask(task);
  assert.deepEqual(saved[4], ['tasks', { id: 'id1', _deleted: true }, task]);
  await ops.addList(' Home ');
  assert.deepEqual(saved[5], ['lists', { id: 'id2', name: 'Home', order: 1002, createdAt: 1002 }, null]);
  const list = { id: 'id2', name: 'Home', order: 1 };
  await ops.renameList(list, 'House');
  assert.deepEqual(saved[6], ['lists', { ...list, name: 'House' }, list]);
  await ops.removeList(list);
  assert.deepEqual(saved[7], ['lists', { id: 'id2', _deleted: true }, list]);
  // a whole task under its own id (a restore), as a new save
  assert.equal(await ops.put({ id: 'old1', text: 'kept', done: true }), '');
  assert.deepEqual(saved[8], ['tasks', { id: 'old1', text: 'kept', done: true }, null]);
});

test('a refused save is a reason, not a throw', async () => {
  assert.equal(await refusal(Promise.reject(new Error('permission-denied'))), 'permission-denied');
  assert.equal(await refusal(Promise.reject('x')), 'The server refused it');
  const ops = taskOps({ save: async () => { throw new Error('nope'); }, id: () => 'i' });
  assert.equal(await ops.add({ text: 'a' }), 'nope');
});
