// A roster maker's edits to a week (roster/week-edits.js): worked out from the week as it is when saved, so another maker's
// change made while a sheet was open stays; and what Undo puts back. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, epicBoxText, epicChanges, mergeOverrides, readEpicBox, undoFields } from '../src/roster/week-edits.js';
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

test('Epic check: a box reads as patients, away or empty; anything else can\'t be read', () => {
  assert.deepEqual(readEpicBox('12'), { away: false, patients: 12 });
  assert.deepEqual(readEpicBox('0'), { away: false, patients: 0 });
  assert.deepEqual(readEpicBox('200'), { away: false, patients: 200 });
  for (const t of ['a', ' A ', 'away', 'Away']) assert.deepEqual(readEpicBox(t), { away: true, patients: undefined }, t);
  assert.deepEqual(readEpicBox(''), { away: false, patients: undefined });
  assert.deepEqual(readEpicBox('  '), { away: false, patients: undefined });
  for (const t of ['1.5', 'O', '250', 'Aw', '-1', '1 2']) assert.equal(readEpicBox(t), null, t);
});

test('Epic check: only the boxes typed in are saved; a box that can\'t be read stops the save', () => {
  // a list set to "patients not known" this week opens empty: left alone it keeps that change
  assert.equal(epicBoxText([{ patients: null }]), '');
  assert.equal(epicBoxText([{ patients: 12 }]), '12');
  assert.equal(epicBoxText([{ patients: 12 }, { away: true }]), 'A');
  // two lists in one session with different numbers: empty, and left alone unless typed in
  assert.equal(epicBoxText([{ patients: 12 }, { patients: 8 }]), '');
  assert.equal(epicBoxText([{ patients: 12 }, {}]), '');
  const box = (/** @type {string} */ was, /** @type {string} */ now, lists = ['ot1']) => ({ label: 'Mon 9 AM, Dr Ann Test', was, now, lists });
  assert.deepEqual(epicChanges([box('', ''), box('12', '12'), box('A', ' A '), box('', '', ['ot2', 'clinic2'])]), { changes: [], bad: [] });
  assert.deepEqual(epicChanges([box('12', '9'), box('', '7', ['ot2', 'clinic2'])]).changes,
    [['ot1', { away: false, patients: 9 }], ['ot2', { away: false, patients: 7 }], ['clinic2', { away: false, patients: 7 }]]);
  // cleared by hand: back to the usual
  assert.deepEqual(epicChanges([box('12', '')]).changes, [['ot1', { away: false, patients: undefined }]]);
  assert.deepEqual(epicChanges([box('A', 'O'), box('', '1.5')]).bad, ['Mon 9 AM, Dr Ann Test: type a number or A', 'Mon 9 AM, Dr Ann Test: type a number or A']);
});
