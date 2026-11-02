// The app's rules in the Firestore emulator: the rules kit's shared cases plus the app's own.
//   firebase emulators:exec --only firestore --project demo-hand-roster "node --test app/test/rules.test.mjs"
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
  project: 'demo-hand-roster',
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  roles: ['admin', 'member', 'viewer'],
  collections: [
    { path: 'spaces/_/people/p1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { name: 'Dr Ann Test', grade: 'reg', updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/lists/l1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { site: 'NUH', kind: 'ot', name: 'OT 1', wd: 1, session: 'AM', need: 2, status: 'open', updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/leave/v1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { name: 'Dr Ann Test', from: '2026-11-02', to: '2026-11-04', updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/requests/q1', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { name: 'Dr Ann Test', date: '2026-11-10', type: 'cannot', updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/rosters/2026-11', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { calls: [], updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
    { path: 'spaces/_/weeks/2026-11-02', read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data: { grid: [], updatedAt: 1 }, stamp: 'strict', list: { roles: ['admin', 'member', 'viewer'] } },
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

const at = { serverAt: true };

test('people: a name, a grade from the list, a site from the list; no extra fields; flags are bools', async () => {
  await emu.clear();
  const base = { name: 'Dr Bea Test', grade: 'con', updatedAt: 1 };
  const put = (data, id = 'a') => as('member').set(`spaces/_/people/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, name: '' })).ok, false);
  assert.equal((await put({ ...base, name: 'x'.repeat(61) })).ok, false);
  assert.equal((await put({ name: 'Dr Bea Test', updatedAt: 1 })).ok, false, 'grade is required');
  assert.equal((await put({ ...base, grade: 'nurse' })).ok, false);
  assert.equal((await put({ ...base, rank: 'Reg', site: 'NUH', active: true, noCall: false, extra: false })).ok, true);
  assert.equal((await put({ ...base, rank: null, site: null })).ok, true, 'null clears');
  assert.equal((await put({ ...base, rank: 'x'.repeat(21) })).ok, false);
  assert.equal((await put({ ...base, site: 'Elsewhere' })).ok, false);
  assert.equal((await put({ ...base, active: 'yes' })).ok, false);
  assert.equal((await put({ ...base, email: 'a@example.com' })).ok, false, 'no field the app did not list');
  assert.equal((await put({ ...base, createdAt: 1 })).ok, true);
  assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
  assert.equal((await put({ ...base, createdAt: 'x' })).ok, false);
  const edits = { name: { by: 'Sam', device: 'Phone', at: 1 } };   // who changed each field and when (app-sync edits)
  assert.equal((await put({ ...base, _edits: edits })).ok, true, '_edits allowed');
  assert.equal((await put({ ...base, _edits: 'x' })).ok, false, '_edits is a map');
  assert.equal((await put({ name: 'Dr Bea Test', grade: 'con' })).ok, false, 'updatedAt is required');
});

test('lists: site, kind, name, weekday 1 to 5, session, juniors needed and status are checked; optional fields clear with null', async () => {
  await emu.clear();
  const base = { site: 'NUH', kind: 'ot', name: 'OT 2', wd: 3, session: 'PM', need: 1, status: 'open', updatedAt: 1 };
  const put = (data, id = 'l') => as('member').set(`spaces/_/lists/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, consultant: 'Dr Cy Test', rooms: 'Room 4', patients: 6, external: false })).ok, true);
  assert.equal((await put({ ...base, consultant: null, rooms: null, patients: null })).ok, true, 'null clears');
  assert.equal((await put({ ...base, wd: 0 })).ok, false);
  assert.equal((await put({ ...base, wd: 6 })).ok, false, 'Monday to Friday');
  assert.equal((await put({ ...base, wd: 2.5 })).ok, false);
  assert.equal((await put({ ...base, session: 'EVE' })).ok, false);
  assert.equal((await put({ ...base, kind: 'party' })).ok, false);
  assert.equal((await put({ ...base, status: 'maybe' })).ok, false);
  assert.equal((await put({ ...base, need: 11 })).ok, false);
  assert.equal((await put({ ...base, need: -1 })).ok, false);
  assert.equal((await put({ ...base, name: '' })).ok, false);
  assert.equal((await put({ ...base, name: 'x'.repeat(41) })).ok, false);
  assert.equal((await put({ ...base, patients: 201 })).ok, false);
  assert.equal((await put({ ...base, consultant: 'x'.repeat(61) })).ok, false);
  assert.equal((await put({ ...base, external: 'no' })).ok, false);
  assert.equal((await put({ site: 'NUH', kind: 'ot', name: 'OT 2', wd: 3, session: 'PM', status: 'open', updatedAt: 1 })).ok, false, 'need is required');
  assert.equal((await put({ ...base, color: 'red' })).ok, false);
  assert.equal((await put({ ...base, createdAt: 1 })).ok, true);
  assert.equal((await put({ ...base, createdAt: 2 })).ok, false, 'createdAt cannot change');
});

test('leave: a name and two days, the last not before the first; the part of the day is all, AM or PM', async () => {
  await emu.clear();
  const base = { name: 'Dr Dee Test', from: '2026-11-03', to: '2026-11-05', updatedAt: 1 };
  const put = (data, id = 'v') => as('member').set(`spaces/_/leave/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, to: '2026-11-03', session: 'AM', note: 'course' })).ok, true, 'one day, AM only');
  assert.equal((await put({ ...base, session: 'both', note: null })).ok, true);
  assert.equal((await put({ ...base, to: '2026-11-02' })).ok, false, 'ends before it starts');
  assert.equal((await put({ ...base, from: '3/11/2026' })).ok, false, 'a day is YYYY-MM-DD');
  assert.equal((await put({ ...base, session: 'EVE' })).ok, false);
  assert.equal((await put({ ...base, name: '' })).ok, false);
  assert.equal((await put({ ...base, note: 'x'.repeat(201) })).ok, false);
  assert.equal((await put({ name: 'Dr Dee Test', from: '2026-11-03', updatedAt: 1 })).ok, false, 'to is required');
  assert.equal((await put({ ...base, reason: 'x' })).ok, false);
});

test('requests: a name, a day, cannot or want, and one tier or none', async () => {
  await emu.clear();
  const base = { name: 'Dr Eve Test', date: '2026-11-12', type: 'want', updatedAt: 1 };
  const put = (data, id = 'q') => as('member').set(`spaces/_/requests/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, type: 'cannot', tier: 'moNtf' })).ok, true);
  assert.equal((await put({ ...base, tier: null })).ok, true, 'null clears');
  assert.equal((await put({ ...base, type: 'maybe' })).ok, false);
  assert.equal((await put({ ...base, tier: 'night' })).ok, false);
  assert.equal((await put({ ...base, date: 'soon' })).ok, false);
  assert.equal((await put({ ...base, name: '' })).ok, false);
  assert.equal((await put({ name: 'Dr Eve Test', type: 'want', updatedAt: 1 })).ok, false, 'date is required');
  assert.equal((await put({ ...base, why: 'x' })).ok, false);
});

test('rosters: named by month; calls, locked, holidays and problems are lists of a sensible size; gap and seed are whole numbers', async () => {
  await emu.clear();
  const base = { calls: [{ date: '2026-11-01', con: 'Dr Ann Test', reg: null, moNuh: null, moNtf: null }], updatedAt: 1 };
  const put = (data, id = '2026-11') => as('member').set(`spaces/_/rosters/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, locked: ['2026-11-01|con'], holidays: ['2026-11-08'], problems: ['x'], minGap: 2, seed: 7, built: 1700000000000 })).ok, true);
  assert.equal((await put(base, '2026-13')).ok, false, 'not a month');
  assert.equal((await put(base, 'november')).ok, false);
  assert.equal((await put({ ...base, calls: 'none' })).ok, false, 'calls is a list');
  assert.equal((await put({ ...base, calls: new Array(63).fill({ date: '2026-11-01' }) })).ok, false, 'at most 62 days');
  assert.equal((await put({ ...base, holidays: new Array(32).fill('2026-11-01') })).ok, false);
  assert.equal((await put({ ...base, minGap: 8 })).ok, false);
  assert.equal((await put({ ...base, minGap: 1.5 })).ok, false);
  assert.equal((await put({ ...base, seed: -1 })).ok, false);
  assert.equal((await put({ ...base, built: 'today' })).ok, false);
  assert.equal((await put({ ...base, extra: 1 })).ok, false);
  assert.equal((await as('viewer').set('spaces/_/rosters/2026-12', base, at)).ok, false, 'a viewer only reads');
  assert.equal((await as('viewer').get('spaces/_/rosters/2026-11')).ok, true);
});

test('weeks: named by a day; grid, lists and overrides are lists of a sensible size', async () => {
  await emu.clear();
  const base = { grid: [{ day: '2026-11-02', session: 'AM', list: 'l1', juniors: ['Dr Ann Test'] }], updatedAt: 1 };
  const put = (data, id = '2026-11-02') => as('member').set(`spaces/_/weeks/${id}`, data, at);
  assert.equal((await put(base)).ok, true);
  assert.equal((await put({ ...base, lists: [], overrides: [{ id: 'l1', need: 2 }], built: 1700000000000, seed: 3 })).ok, true);
  assert.equal((await put(base, 'week-45')).ok, false, 'not a day');
  assert.equal((await put({ ...base, grid: 'x' })).ok, false);
  assert.equal((await put({ ...base, grid: new Array(801).fill({}) })).ok, false, 'at most 800 rows');
  assert.equal((await put({ ...base, overrides: new Array(201).fill({}) })).ok, false);
  assert.equal((await put({ ...base, seed: 2000000 })).ok, false);
  assert.equal((await put({ ...base, owner: 'me' })).ok, false);
  assert.equal((await as('viewer').set('spaces/_/weeks/2026-11-09', base, at)).ok, false, 'a viewer only reads');
  assert.equal((await as('viewer').delete('spaces/_/weeks/2026-11-02')).ok, false);
  assert.equal((await as('member').delete('spaces/_/weeks/2026-11-02')).ok, true);
});

test('viewers read every kind, only admins and members write and delete; no role, no read', async () => {
  await emu.clear();
  await emu.seed('spaces/_/people/s', { name: 'Dr Fay Test', grade: 'mo', updatedAt: 1 });
  assert.equal((await as('viewer').get('spaces/_/people/s')).ok, true);
  assert.equal((await as('viewer').set('spaces/_/people/s', { name: 'x', grade: 'mo', updatedAt: 2 }, at)).ok, false);
  assert.equal((await as('viewer').delete('spaces/_/people/s')).ok, false);
  assert.equal((await emu.as('u-new', {}).get('spaces/_/people/s')).ok, false, 'no role, no read');
  assert.equal((await as('admin').set('spaces/_/people/s', { name: 'Dr Fay Test', grade: 'reg', updatedAt: 2 }, at)).ok, true);
  assert.equal((await as('member').delete('spaces/_/people/s')).ok, true);
});

test('bin entries: writers stamp them; viewers only read', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'people', data: { name: 'Dr Gus Test' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/_/bin/people:a', entry, { serverAt: true })).ok, false);
  assert.equal((await as('member').set('spaces/_/bin/people:a', entry, { serverAt: true })).ok, true);
  assert.equal((await as('viewer').get('spaces/_/bin/people:a')).ok, true);
  assert.equal((await as('member').set('spaces/_/bin/people:b', entry)).ok, false, 'unstamped');
});

test('account options: one doc per person, only theirs, only the allowed fields', async () => {
  await emu.clear();
  const mine = { profile: 'Dr Hal Test', updatedAt: 1 };
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
  assert.equal((await as('member').set('spaces/_/settings/u-member', { profile: 5, updatedAt: 1 }, at)).ok, false, 'wrong type');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
});

for (const m of mods) m.tests?.({ test, assert, emu, as });
