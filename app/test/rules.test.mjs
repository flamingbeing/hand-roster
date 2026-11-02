// The app's rules in the Firestore emulator: the rules kit's shared cases plus the app's own.
//   firebase emulators:exec --only firestore --project demo-starter-app "node --test app/test/rules.test.mjs"
// (from the repo root, after setup-tools or with .devkit/ copied from app-devkit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { suite } from '../../.devkit/rules/suite.mjs';

// The optional modules' cases (app/test/rules/<module>.mjs, written by tools/add.mjs): each exports `collections`
// (more rows for the shared cases) and `tests({ test, assert, emu, as })`.
const dir = new URL('./rules/', import.meta.url);
const mods = existsSync(dir)
  ? await Promise.all(readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().map(f => import(new URL(f, dir).href)))
  : [];

const emu = suite({
  project: 'demo-starter-app',
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  roles: ['admin', 'member', 'viewer'],
  collections: [
    { path: 'spaces/_/tasks/t1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { text: 'hello', done: false, updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/lists/l1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { name: 'Work', order: 1, updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    ...mods.flatMap(m => m.collections ?? []),
  ],
});

const as = role => emu.as(`u-${role}`, { g: { _: role }, v: 1 });

test('people read their own role doc, not others’; nobody writes or deletes one from a page (the Worker does)', async () => {
  await emu.clear();
  await emu.seed('members/u-member', { role: 'member', v: 1 });
  await emu.seed('members/u-other', { role: 'member', v: 1 });
  assert.equal((await as('member').get('members/u-member')).ok, true);
  assert.equal((await emu.as('u-new', {}).get('members/u-new')).ok, true, 'no role yet: may still read (absent) own doc');
  assert.equal((await as('member').get('members/u-other')).ok, false);
  assert.equal((await as('member').set('members/u-member', { role: 'admin', v: 2 })).ok, false, 'no self-promotion');
  assert.equal((await as('admin').get('members/u-other')).ok, true, 'admins read every role doc');
  assert.equal((await as('admin').set('members/u-other', { role: 'viewer', v: 2 })).ok, false, 'role changes: /api/members/');
  assert.equal((await as('admin').set('members/u-new', { role: 'member', v: 1 })).ok, false);
  assert.equal((await as('admin').delete('members/u-other')).ok, false, 'removal: /api/members/ (it also revokes)');
  assert.equal((await as('member').delete('members/u-member')).ok, false);
});

test('tasks: text required and at most 500 characters; no extra fields; done is a bool', async () => {
  await emu.clear();
  const at = { serverAt: true };
  const base = { text: 'ok', done: false, updatedAt: 1 };
  const put = (data, id = 'a') => as('member').set(`spaces/_/tasks/${id}`, data, at);
  assert.equal((await put({ ...base, text: '' })).ok, false);
  assert.equal((await put({ ...base, text: 'x'.repeat(501) })).ok, false);
  assert.equal((await put({ ...base, owner: 'me' })).ok, false);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ text: 'ok', updatedAt: 1 })).ok, false, 'done is required');
  assert.equal((await put({ ...base, done: 'no' })).ok, false, 'done is a bool');
  assert.equal((await put({ ...base, done: true, doneAt: 5 })).ok, true);
  assert.equal((await put({ ...base, done: false, doneAt: null })).ok, true, 'null clears doneAt');
  assert.equal((await put({ ...base, doneAt: 'x' })).ok, false);
  assert.equal((await put({ ...base, createdAt: 1 })).ok, true, 'createdAt allowed');
  assert.equal((await put({ ...base, createdAt: 'x' })).ok, false, 'createdAt is a number');
  assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
  const edits = { text: { by: 'Sam', device: 'Phone', at: 1 } };   // who changed each field and when (app-sync edits)
  assert.equal((await put({ ...base, _edits: edits })).ok, true, '_edits allowed');
  assert.equal((await put({ ...base, _edits: 'x' })).ok, false, '_edits is a map');
});

test('tasks: notes, list, day and time are checked; null clears an optional field', async () => {
  await emu.clear();
  const at = { serverAt: true };
  const base = { text: 'ok', done: false, updatedAt: 1 };
  const put = data => as('member').set('spaces/_/tasks/n', data, at);
  assert.equal((await put({ ...base, notes: 'a\nb', listId: 'l1', due: '2026-10-29', dueTime: '09:30' })).ok, true);
  assert.equal((await put({ ...base, notes: null, listId: null, due: null, dueTime: null })).ok, true, 'null clears');
  assert.equal((await put({ ...base, notes: 'x'.repeat(5001) })).ok, false);
  assert.equal((await put({ ...base, notes: 5 })).ok, false);
  assert.equal((await put({ ...base, listId: '' })).ok, false);
  assert.equal((await put({ ...base, listId: 'x'.repeat(65) })).ok, false);
  assert.equal((await put({ ...base, due: '29/10/2026' })).ok, false, 'a day is YYYY-MM-DD');
  assert.equal((await put({ ...base, due: 20261029 })).ok, false);
  assert.equal((await put({ ...base, due: '2026-10-29', dueTime: '24:00' })).ok, false, 'a time is HH:MM');
  assert.equal((await put({ ...base, due: '2026-10-29', dueTime: '9:30' })).ok, false);
  assert.equal((await put({ ...base, dueTime: '09:30' })).ok, false, 'no time without a day');
  assert.equal((await put({ ...base, due: null, dueTime: '09:30' })).ok, false);
});

test('tasks: viewers read, only admins and members write and delete', async () => {
  await emu.clear();
  await emu.seed('spaces/_/tasks/s', { text: 'seed', done: false, updatedAt: 1 });
  assert.equal((await as('viewer').get('spaces/_/tasks/s')).ok, true);
  assert.equal((await as('viewer').set('spaces/_/tasks/s', { text: 'x', done: true, updatedAt: 2 }, { serverAt: true })).ok, false);
  assert.equal((await as('viewer').delete('spaces/_/tasks/s')).ok, false);
  assert.equal((await emu.as('u-new', {}).get('spaces/_/tasks/s')).ok, false, 'no role, no read');
  assert.equal((await as('member').delete('spaces/_/tasks/s')).ok, true);
});

test('lists: a name of 1 to 60 characters and an order; no extra fields', async () => {
  await emu.clear();
  const at = { serverAt: true };
  const base = { name: 'Home', order: 1, updatedAt: 1 };
  const put = (data, id = 'l') => as('member').set(`spaces/_/lists/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, name: '' })).ok, false);
  assert.equal((await put({ ...base, name: 'x'.repeat(61) })).ok, false);
  assert.equal((await put({ name: 'Home', updatedAt: 1 })).ok, false, 'order is required');
  assert.equal((await put({ ...base, order: 'first' })).ok, false);
  assert.equal((await put({ ...base, color: 'red' })).ok, false);
  assert.equal((await put({ ...base, createdAt: 1 })).ok, true);
  assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
  assert.equal((await as('viewer').set('spaces/_/lists/v', base, at)).ok, false);
  assert.equal((await as('viewer').delete('spaces/_/lists/l')).ok, false);
  assert.equal((await as('member').delete('spaces/_/lists/l')).ok, true);
});

test('bin entries: writers stamp them; viewers only read', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'tasks', data: { text: 'ok' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/_/bin/tasks:a', entry, { serverAt: true })).ok, false);
  assert.equal((await as('member').set('spaces/_/bin/tasks:a', entry, { serverAt: true })).ok, true);
  assert.equal((await as('viewer').get('spaces/_/bin/tasks:a')).ok, true);
  assert.equal((await as('member').set('spaces/_/bin/tasks:b', entry)).ok, false, 'unstamped');
});

test('account options: one doc per person, only theirs, only the allowed fields', async () => {
  await emu.clear();
  const at = { serverAt: true };
  const mine = { showCounts: true, defaultList: 'l1', updatedAt: 1 };
  for (const role of ['admin', 'member', 'viewer']) {
    assert.equal((await as(role).set(`spaces/_/settings/u-${role}`, mine, at)).ok, true, `${role} saves their own`);
    assert.equal((await as(role).get(`spaces/_/settings/u-${role}`)).ok, true);
  }
  assert.equal((await as('member').set('spaces/_/settings/u-admin', mine, at)).ok, false, 'not someone else’s doc');
  assert.equal((await as('member').get('spaces/_/settings/u-admin')).ok, true, 'the group can read it (a list listen cannot ask for one doc)');
  assert.equal((await emu.as('u-new', {}).get('spaces/_/settings/u-member')).ok, false, 'no role, no read');
  assert.equal((await emu.as('u-new', {}).set('spaces/_/settings/u-new', mine, at)).ok, false, 'no role, no access');
  assert.equal((await as('member').set('spaces/_/settings/u-member', mine)).ok, false, 'unstamped');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { ...mine, other: 1 }, at)).ok, false, 'an option the app did not list');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: 'yes', updatedAt: 1 }, at)).ok, false, 'wrong type');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { defaultList: 'x'.repeat(65), updatedAt: 1 }, at)).ok, false, 'a list id is at most 64 characters');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: null, defaultList: null, profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
});

for (const m of mods) m.tests?.({ test, assert, emu, as });
