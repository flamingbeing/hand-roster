// A roster maker's edits to a week (roster/week-edits.js): worked out from the week as it is when saved, so another maker's
// change made while a sheet was open stays; and what Undo puts back. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, mergeOverrides, undoFields } from '../src/roster/week-edits.js';
import { juniorsOn, weekBuilt } from '../src/roster/grid.js';
import { weeks } from '../src/data/plans.js';

const MON = '2026-11-09', TUE = '2026-11-10';
/** @type {import('../src/roster/grid.js').GridRow[]} */
const opened = [
  { day: MON, session: 'AM', list: 'ot1', juniors: ['Dr Ann Test', 'Dr Ben Test'] },
  { day: MON, session: 'AM', list: 'clinic1', juniors: [] },
  { day: TUE, session: 'AM', list: 'ot1', juniors: ['Dr Cat Test'] },
];

test('a move saved from the week as it is now keeps a change another maker made after the sheet opened', () => {
  // the sheet opened on `opened`; meanwhile someone else put Dr Dan Test on Tuesday's list
  const now = opened.map(r => (r.day === TUE ? { ...r, juniors: [...r.juniors, 'Dr Dan Test'] } : r));
  const edit = /** @type {const} */ ({ kind: 'move', day: MON, session: 'AM', name: 'Dr Ben Test', to: 'clinic1' });
  const saved = applyEdit(now, edit);
  assert.deepEqual(juniorsOn(saved, MON, 'AM', 'clinic1'), ['Dr Ben Test']);
  assert.deepEqual(juniorsOn(saved, MON, 'AM', 'ot1'), ['Dr Ann Test']);
  assert.deepEqual(juniorsOn(saved, TUE, 'AM', 'ot1'), ['Dr Cat Test', 'Dr Dan Test']);
  // worked out from the copy the sheet opened with, the other maker's change would be lost
  assert.deepEqual(juniorsOn(applyEdit(opened, edit), TUE, 'AM', 'ot1'), ['Dr Cat Test']);
  assert.deepEqual(opened[2].juniors, ['Dr Cat Test'], 'the input is left alone');
});

test('add, take off and clear a list', () => {
  assert.deepEqual(juniorsOn(applyEdit(opened, { kind: 'add', day: MON, session: 'AM', list: 'clinic1', name: 'Dr Cat Test' }), MON, 'AM', 'clinic1'), ['Dr Cat Test']);
  const off = applyEdit(opened, { kind: 'move', day: MON, session: 'AM', name: 'Dr Ann Test', to: null });
  assert.deepEqual(juniorsOn(off, MON, 'AM', 'ot1'), ['Dr Ben Test']);
  const cleared = applyEdit(opened, { kind: 'clear', day: MON, session: 'AM', list: 'ot1' });
  assert.deepEqual(juniorsOn(cleared, MON, 'AM', 'ot1'), []);
  assert.deepEqual(juniorsOn(cleared, TUE, 'AM', 'ot1'), ['Dr Cat Test']);
});

test('list changes are laid over the week\'s changes as they are now', () => {
  // another maker set ot1's patients after this sheet opened; this one closes clinic1
  const now = [{ id: 'ot1', patients: 12 }];
  assert.deepEqual(mergeOverrides(now, [['clinic1', { status: 'closed' }]]), [{ id: 'ot1', patients: 12 }, { id: 'clinic1', status: 'closed' }]);
  // a key set to undefined drops it; away false is no change; null drops the list's change
  assert.deepEqual(mergeOverrides([{ id: 'ot1', patients: 12, min: 2 }], [['ot1', { patients: undefined, away: false }]]), [{ id: 'ot1', min: 2 }]);
  assert.deepEqual(mergeOverrides([{ id: 'ot1', patients: 12 }], [['ot1', null]]), []);
  assert.deepEqual(mergeOverrides([{ id: 'ot1', patients: 12 }], [['ot1', { patients: undefined }]]), []);
});

test('Undo puts back the fields an edit saves, as they were; an unbuilt week comes back unbuilt', () => {
  const built = { id: MON, grid: opened, lists: [], overrides: [{ id: 'ot1', min: 1 }], seed: 3, built: 1_700_000_000_000 };
  assert.deepEqual(undoFields(built, ['grid']), { grid: opened });
  assert.deepEqual(undoFields(built, ['overrides', 'lists']), { overrides: [{ id: 'ot1', min: 1 }], lists: [] });
  assert.deepEqual(undoFields(built, ['grid', 'lists', 'seed', 'built']), { grid: opened, lists: [], seed: 3, built: 1_700_000_000_000 });
  // Build on a week with no row, or a row with no grid: Undo leaves an empty grid and no build time
  const was = undoFields(undefined, ['grid', 'lists', 'seed', 'built']);
  assert.deepEqual(was, { grid: [], lists: [], seed: 0, built: 0 });
  assert.deepEqual(undoFields({ id: MON, overrides: [] }, ['lists', 'grid']), { lists: [], grid: [], built: 0 });
  // the week's cleaner keeps those fields, and the week reads as not built
  const back = { id: MON, ...weeks.clean(was) };
  assert.deepEqual(back.grid, []);
  assert.equal(back.built, 0);
  assert.equal(weekBuilt(back), false);
  assert.equal(weekBuilt(built), true);
  assert.equal(weekBuilt(undefined), false);
  assert.equal(weekBuilt({ grid: [], built: 1_700_000_000_000 }), true, 'a built week whose lists are all closed');
});
