// A built week's own copy of the lists against the Lists tab now (roster/lists-drift.js). The copy is stored as the
// weeks kind cleans it, as a real build saves it. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listsDrift } from '../src/roster/lists-drift.js';
import { slotsFor } from '../src/data/lists.js';
import { weeks } from '../src/data/plans.js';

const MON = '2026-11-02';
const templates = [
  { id: 'a', site: 'NUH', kind: 'ot', name: 'OT 1', wd: 1, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 2 },
  { id: 'b', site: 'NUH', kind: 'clinic', name: 'CLINIC', wd: 1, session: 'PM', consultant: 'Dr Eve Test', status: 'open', need: 1, rooms: '3, 4' },
  { id: 'c', site: 'NTFGH', kind: 'ot', name: 'OT 2', wd: 3, session: 'AM', consultant: null, status: 'open', need: 1, min: 1 },
];
/** @param {any[]} t @param {any[]} [overrides] the week's lists as a build stores them */
const stored = (t, overrides) => weeks.clean({ lists: slotsFor(/** @type {any} */ (t), MON, overrides) }).lists;
/** @param {any[]} t @param {any[]} [overrides] */
const fresh = (t, overrides) => slotsFor(/** @type {any} */ (t), MON, overrides);
/** @param {ReturnType<typeof listsDrift>} d */
const ids = d => ({ added: d.added.map(l => l.id), removed: d.removed.map(l => l.id), changed: d.changed.map(l => l.id) });
const NONE = { added: [], removed: [], changed: [] };

test('lists drift: nothing changed since the build, nothing to say', () => {
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(templates))), NONE);
});

test('lists drift: a consultant, a need or a closed list on the Lists tab is a change', () => {
  const later = templates.map(t => (t.id === 'a' ? { ...t, consultant: 'Dr Fay Test' } : t.id === 'b' ? { ...t, status: 'closed' } : t));
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(later))), { ...NONE, changed: ['a', 'b'] });
  const more = templates.map(t => (t.id === 'c' ? { ...t, need: 2 } : t));
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(more))), { ...NONE, changed: ['c'] });
});

test('lists drift: a list added on the Lists tab is added, one deleted is removed', () => {
  const added = [...templates, { id: 'd', site: 'NUH', kind: 'hot', name: 'HOT', wd: 2, session: 'AM', consultant: 'Dr Eve Test', status: 'open', need: 1 }];
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(added))), { ...NONE, added: ['d'] });
  const deleted = templates.map(t => (t.id === 'b' ? { ...t, _deleted: true } : t));
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(deleted))), { ...NONE, removed: ['b'] });
  assert.deepEqual(ids(listsDrift(stored(templates), fresh(templates.filter(t => t.id !== 'c')))), { ...NONE, removed: ['c'] });
});

test('lists drift: none is none (undefined, null and \'\' rooms), and a minimum equal to the default is no change', () => {
  const was = stored(templates);
  assert.equal(was.find(l => l.id === 'a')?.rooms, null);   // stored as null, fresh leaves it out
  const blank = templates.map(t => (t.id === 'a' ? { ...t, rooms: '' } : t.id === 'c' ? { ...t, min: undefined } : t));
  assert.deepEqual(ids(listsDrift(was, fresh(blank))), NONE);
  const lower = templates.map(t => (t.id === 'a' ? { ...t, min: 0 } : t));
  assert.deepEqual(ids(listsDrift(was, fresh(lower))), { ...NONE, changed: ['a'] });
});

test('lists drift: the week\'s own changes on both sides are no drift; settle-time flags are left out', () => {
  const overrides = [{ id: 'a', consultant: 'Dr Gus Test' }, { id: 'b', status: 'closed', away: true }];
  assert.deepEqual(ids(listsDrift(stored(templates, overrides), fresh(templates, overrides))), NONE);
  const settled = stored(templates).map(l => (l.id === 'b' ? { ...l, consultantOnLeave: true, emergency: true, holiday: true } : l));
  assert.deepEqual(ids(listsDrift(settled, fresh(templates))), NONE);
});
