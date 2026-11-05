// The data modules (src/data/): what each kind allows, and how a write reaches the sync engine's save. A fake save stands in
// for the write queue. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOps, refusal, cleaner, int, day } from '../src/data/ops.js';
import * as people from '../src/data/people.js';
import * as lists from '../src/data/lists.js';
import * as leave from '../src/data/leave.js';
import { rosters, weeks } from '../src/data/plans.js';

/** @param {{ fail?: string }} [o] */
function fake(o = {}) {
  /** @type {any[]} */
  const saved = [];
  let n = 0;
  const save = async (/** @type {string} */ coll, /** @type {any} */ record, /** @type {any} */ base) => { if (o.fail) throw new Error(o.fail); saved.push({ coll, record, base }); };
  return { saved, ops: (/** @type {string} */ coll, /** @type {any} */ clean) => kindOps({ save, id: () => `id${++n}`, now: () => 1000 }, coll, clean) };
}

test('refusal: empty when stored, the reason when refused', async () => {
  assert.equal(await refusal(Promise.resolve()), '');
  assert.equal(await refusal(Promise.reject(new Error('no'))), 'no');
  assert.equal(await refusal(Promise.reject('x')), 'The server refused it');
});

test('cleaner: only the listed fields, typed; a bad value is left out', () => {
  const c = cleaner({ n: int(1, 5), d: day });
  assert.deepEqual(c({ n: '3', d: '2026-11-02', other: 1 }), { n: 3, d: '2026-11-02' });
  assert.deepEqual(c({ n: 9, d: '2/11' }), {});
});

test('people: name trimmed and required, grade checked, site may be cleared', () => {
  assert.deepEqual(people.clean({ name: '  Dr Alpha Test ', grade: 'reg', rank: 'AC', site: 'NUH', active: true, x: 1 }),
    { name: 'Dr Alpha Test', grade: 'reg', rank: 'AC', site: 'NUH', active: true });
  assert.deepEqual(people.clean({ name: '   ', grade: 'doctor' }), {});
  assert.equal(people.clean({ site: '' }).site, null);
  assert.equal(people.clean({ team: ' Team 2 ' }).team, 'Team 2');
  assert.equal(people.clean({ team: '' }).team, null);
  assert.deepEqual(people.activePeople([
    { id: 'a', name: 'Dr Bravo Test', grade: 'mo', rank: 'Outposter' }, { id: 'b', name: 'Dr Alpha Test', grade: 'con', active: false },
    { id: 'c', name: 'Dr Charlie Test', grade: 'reg', rank: 'Fellow', site: 'NTFGH' }]).map(p => [p.name, !!p.extra]), [['Dr Bravo Test', true], ['Dr Charlie Test', false]]);
});

test('people by team: teams in natural order, no team last, consultants first in each', () => {
  const rows = [
    { id: '1', name: 'Dr Mo Test', grade: 'mo', team: 'Team 10' }, { id: '2', name: 'Dr Con Test', grade: 'con', team: 'Team 10' },
    { id: '3', name: 'Dr Reg Test', grade: 'reg', team: 'Team 2' }, { id: '4', name: 'Dr Lone Test', grade: 'mo' },
    { id: '5', name: 'Dr Blank Test', grade: 'reg', team: '  ' }];
  assert.deepEqual(people.byTeam(/** @type {any} */ (rows)).map(([t, l]) => [t, l.map(r => r.id)]),
    [['Team 2', ['3']], ['Team 10', ['2', '1']], [people.NO_TEAM, ['5', '4']]]);
});

test('lists: a template row is one list, one weekday, one session; a week override changes it for that week', () => {
  assert.deepEqual(lists.clean({ site: 'NUH', kind: 'ot', name: 'OT 3', wd: '2', session: 'AM', need: 2, status: 'open', consultant: ' ' }),
    { site: 'NUH', kind: 'ot', name: 'OT 3', wd: 2, session: 'AM', need: 2, status: 'open', consultant: null });
  assert.equal('wd' in lists.clean({ wd: 6 }), false);
  const t = [
    { id: 'l1', site: 'NUH', kind: 'ot', name: 'OT 3', wd: 2, session: 'AM', consultant: 'Dr Delta Test', need: 2, status: 'open' },
    { id: 'l2', site: 'NUH', kind: 'clinic', name: 'CLINIC', wd: 1, session: 'PM', consultant: 'Dr Echo Test', rooms: 'G03', patients: 12, need: 1, status: 'open' },
    { id: 'l3', site: 'NUH', kind: 'ot', name: 'gone', wd: 3, session: 'AM', need: 1, status: 'open', _deleted: true },
  ];
  const plain = lists.slotsFor(/** @type {any} */ (t), '2026-11-02');
  assert.deepEqual(plain.map(s => [s.id, s.day, s.session, s.need]), [['l2', '2026-11-02', 'PM', 1], ['l1', '2026-11-03', 'AM', 2]]);
  assert.equal(plain[0].rooms, 'G03');
  const over = lists.slotsFor(/** @type {any} */ (t), '2026-11-02', [{ id: 'l1', consultant: null, need: 3, status: 'closed' }]);
  assert.deepEqual(over.find(s => s.id === 'l1'), { id: 'l1', site: 'NUH', kind: 'ot', name: 'OT 3', day: '2026-11-03', session: 'AM', consultant: null, status: 'closed', need: 3 });
});

test('leave and requests: days checked, an end before the start is mended', () => {
  assert.deepEqual(leave.clean({ name: 'Dr Foxtrot Test', from: '2026-11-03', to: '2026-11-05', session: 'AM', note: '' }),
    { name: 'Dr Foxtrot Test', from: '2026-11-03', to: '2026-11-05', session: 'AM', note: null });
  assert.equal('from' in leave.clean({ from: 'tomorrow' }), false);
  assert.deepEqual(leave.leaveOf(/** @type {any} */ ([{ id: 'x', name: 'a', from: '2026-11-05', to: '2026-11-03' }, { id: 'y', name: 'b', from: '2026-11-03', to: '2026-11-03', session: 'both' }])),
    [{ name: 'a', from: '2026-11-05', to: '2026-11-05' }, { name: 'b', from: '2026-11-03', to: '2026-11-03' }]);
  assert.deepEqual(leave.requests.clean({ name: 'Dr Golf Test', date: '2026-11-09', type: 'cannot', tier: '' }), { name: 'Dr Golf Test', date: '2026-11-09', type: 'cannot', tier: null });
  assert.equal('type' in leave.requests.clean({ type: 'maybe' }), false);
  assert.deepEqual(leave.requestsOf(/** @type {any} */ ([{ id: 'r', name: 'a', date: '2026-11-09', type: 'want', tier: 'reg' }])), [{ name: 'a', date: '2026-11-09', type: 'want', tier: 'reg' }]);
});

test('rosters: calls rows, locked entries, holidays; the month document keeps only what is listed', () => {
  const c = rosters.clean({
    calls: [{ date: '2026-11-02', con: 'Dr A', reg: '', moNuh: null, extra: 1 }, { date: 'x' }], locked: ['2026-11-02|con'],
    holidays: ['2026-11-08', '2026-11-08', 'bad'], minGap: 9, seed: 4, other: 1,
  });
  assert.deepEqual(c.calls, [{ date: '2026-11-02', con: 'Dr A', reg: null, moNuh: null, moNtf: null }]);
  assert.deepEqual(c.holidays, ['2026-11-08']);
  assert.equal('minGap' in c, false, 'a gap of 9 days is refused');
  assert.equal(c.seed, 4);
  assert.equal('other' in c, false);
});

test('weeks: grid rows, the lists snapshot and overrides are cleaned', () => {
  const c = weeks.clean({
    grid: [{ day: '2026-11-02', session: 'AM', list: 'l1', juniors: ['Dr A', 5] }, { day: 'nope', session: 'AM', list: 'l1', juniors: [] }],
    lists: [{ id: 'l1', site: 'NUH', kind: 'ot', name: 'OT 3', day: '2026-11-02', session: 'AM', need: 2, status: 'open', consultant: 'Dr B' }],
    overrides: [{ id: 'l1', need: 3, consultant: '' }, { nope: 1 }],
  });
  assert.deepEqual(c.grid, [{ day: '2026-11-02', session: 'AM', list: 'l1', juniors: ['Dr A'] }]);
  assert.equal(/** @type {any} */ (c.lists)[0].consultant, 'Dr B');
  assert.deepEqual(c.overrides, [{ id: 'l1', consultant: null, need: 3 }]);
});

test('kindOps: add stamps createdAt and an id, edit lays the patch over the copy it started from, remove writes a delete', async () => {
  const { saved, ops } = fake();
  const p = ops(people.COLL, people.clean);
  assert.equal(await p.add({ name: ' Dr H Test ', grade: 'mo', active: true }), '');
  assert.deepEqual(saved[0], { coll: 'people', record: { id: 'id1', name: 'Dr H Test', grade: 'mo', active: true, createdAt: 1000 }, base: null });
  const row = { id: 'id1', name: 'Dr H Test', grade: 'mo', updatedAt: 5 };
  assert.equal(await p.edit(row, { grade: 'reg', hack: 1 }), '');
  assert.deepEqual(saved[1].record, { ...row, grade: 'reg' });
  assert.equal(saved[1].base, row);
  await p.remove(/** @type {any} */ (row));
  assert.deepEqual(saved[2], { coll: 'people', record: { id: 'id1', _deleted: true }, base: row });
});

test('kindOps: upsert makes the month the first time, edits it after', async () => {
  const { saved, ops } = fake();
  const r = ops(rosters.COLL, rosters.clean);
  await r.upsert('2026-11', undefined, { holidays: ['2026-11-08'] });
  assert.deepEqual(saved[0], { coll: 'rosters', record: { id: '2026-11', holidays: ['2026-11-08'], createdAt: 1000 }, base: null });
  const row = { id: '2026-11', holidays: ['2026-11-08'], updatedAt: 3 };
  await r.upsert('2026-11', row, { seed: 7 });
  assert.deepEqual(saved[1].record, { ...row, seed: 7 });
  assert.equal(saved[1].base, row);
});

test('kindOps: a refused save comes back as its reason', async () => {
  const { ops } = fake({ fail: 'permission-denied' });
  assert.equal(await ops(people.COLL, people.clean).add({ name: 'x', grade: 'mo' }), 'permission-denied');
});
