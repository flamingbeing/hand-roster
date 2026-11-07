// Pins on the week grid (owner 7 Nov 2026): Build again always keeps a pinned junior where they are; Reset drops them.
// ACs are not filled into lists. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeek } from '../src/roster/week.js';
import { gridRows, isPinned } from '../src/roster/grid.js';
import { pin, pinsOf, withPins } from '../src/roster/pins.js';
import { isJunior } from '../src/roster/model.js';
import { applyEdit, applyEdits } from '../src/roster/week-edits.js';
import { weeks } from '../src/data/plans.js';
import { renameRow } from '../src/roster/rename.js';

const day = '2026-10-12';
const lists = [
  { id: 'ot1', site: 'NUH', kind: 'ot', name: 'OT 1', day, session: 'AM', consultant: 'Dr Con Test', status: 'open', need: 1 },
  { id: 'cl1', site: 'NUH', kind: 'clinic', name: 'CLINIC', day, session: 'AM', consultant: 'Dr Con Two', status: 'open', need: 1 },
  { id: 'cl2', site: 'NUH', kind: 'clinic', name: 'CLINIC', day, session: 'PM', consultant: 'Dr Con Two', status: 'closed', need: 1 },
];
const people = [
  { name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'mo' }, { name: 'Dr Cy Test', grade: 'mo' },
  { name: 'Dr Ace Test', grade: 'reg', rank: 'AC' },
];

test('an AC is not a junior: never filled into a list, still pinnable', () => {
  assert.equal(isJunior({ name: 'a', grade: 'reg', rank: 'AC' }), false);
  assert.equal(isJunior({ name: 'a', grade: 'reg', rank: 'Fellow' }), true);
  for (const seed of [1, 2, 3, 4, 5]) {
    const rows = gridRows(buildWeek({ monday: day, lists, people, seed }).grid);
    assert.ok(!rows.some(r => r.juniors.includes('Dr Ace Test')), `seed ${seed}`);
  }
  const rows = gridRows(buildWeek({ monday: day, lists, people, seed: 1, pins: [{ person: 'Dr Ace Test', list: 'cl1', day, session: 'AM' }] }).grid);
  assert.ok(rows.find(r => r.list === 'cl1')?.juniors.includes('Dr Ace Test'), 'a pin puts an AC on a list all the same');
});

test('pins: placed first whatever else holds, dropped only on a list not open', () => {
  const pins = [
    { person: 'Dr Ben Test', list: 'ot1', day, session: /** @type {const} */ ('AM') },
    { person: 'Dr Cy Test', list: 'ot1', day, session: /** @type {const} */ ('AM') },   // over the list's need of 1
    { person: 'Dr Ann Test', list: 'cl2', day, session: /** @type {const} */ ('PM') },  // closed that session
  ];
  const leave = [{ name: 'Dr Ben Test', from: day, to: day }];   // on leave: kept all the same (Clashes says so)
  for (const seed of [1, 2, 3]) {
    const rows = withPins(gridRows(buildWeek({ monday: day, lists, people, leave, seed, pins }).grid), pins);
    assert.deepEqual(rows.find(r => r.list === 'ot1')?.juniors, ['Dr Ben Test', 'Dr Cy Test'], `seed ${seed}`);
    assert.deepEqual(pinsOf(rows).map(p => p.person), ['Dr Ben Test', 'Dr Cy Test'], 'the closed list loses its pin');
  }
});

test('grid edits: added or moved by hand is pinned; taken off loses the pin; pin and unpin in place', () => {
  const g0 = [
    { day, session: /** @type {const} */ ('AM'), list: 'ot1', juniors: ['Dr Ann Test'] },
    { day, session: /** @type {const} */ ('AM'), list: 'cl1', juniors: ['Dr Ben Test'] },
  ];
  const added = applyEdit(g0, { kind: 'add', day, session: 'AM', list: 'ot1', name: 'Dr Cy Test' });
  assert.equal(isPinned(added, day, 'AM', 'ot1', 'Dr Cy Test'), true);
  assert.equal(isPinned(added, day, 'AM', 'ot1', 'Dr Ann Test'), false, 'the builder\'s placement is not');
  const swapped = applyEdit(g0, { kind: 'move', day, session: 'AM', name: 'Dr Ann Test', to: 'cl1', swapWith: 'Dr Ben Test' });
  assert.deepEqual(pinsOf(swapped).map(p => `${p.person}@${p.list}`).sort(), ['Dr Ann Test@cl1', 'Dr Ben Test@ot1']);
  const off = applyEdit(swapped, { kind: 'move', day, session: 'AM', name: 'Dr Ann Test', to: null });
  assert.deepEqual(pinsOf(off).map(p => p.person), ['Dr Ben Test']);
  const cleared = applyEdit(off, { kind: 'clear', day, session: 'AM', list: 'ot1' });
  assert.deepEqual(pinsOf(cleared), []);
  assert.ok(!('pinned' in (cleared.find(r => r.list === 'ot1') ?? {})));
  // the move sheet unticked: moved but not pinned
  const loose = applyEdits(g0, [{ kind: 'move', day, session: 'AM', name: 'Dr Ann Test', to: 'cl1' }, { kind: 'pin', day, session: 'AM', list: 'cl1', name: 'Dr Ann Test', on: false }]);
  assert.deepEqual(pinsOf(loose), []);
  assert.deepEqual(pinsOf(pin(g0, day, 'AM', 'ot1', 'Dr Ann Test', true)).map(p => p.person), ['Dr Ann Test']);
  assert.deepEqual(pin(g0, day, 'AM', 'ot1', 'Dr Ben Test', true), g0, 'nobody pinned on a list they are not on');
});

test('pins are stored in the grid rows (only juniors on the row) and follow a rename', () => {
  const clean = weeks.clean({ grid: [{ day, session: 'AM', list: 'ot1', juniors: ['Dr Ann Test'], pinned: ['Dr Ann Test', 'Dr Gone Test', 3] }, { day, session: 'AM', list: 'cl1', juniors: [] }] });
  assert.deepEqual(clean.grid, [{ day, session: 'AM', list: 'ot1', juniors: ['Dr Ann Test'], pinned: ['Dr Ann Test'] }, { day, session: 'AM', list: 'cl1', juniors: [] }]);
  const r = renameRow('weeks', { grid: clean.grid }, 'Dr Ann Test', 'Dr Anne Test');
  assert.deepEqual(r?.patch.grid[0], { day, session: 'AM', list: 'ot1', juniors: ['Dr Anne Test'], pinned: ['Dr Anne Test'] });
});
