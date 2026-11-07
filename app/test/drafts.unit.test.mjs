// Draft and published (roster/drafts.js): where an edit saves, Undo, Publish, Back to draft, where a record stands, and the
// preview's diffs. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_PLAN, MONTH_PLAN, asMaker, planWrite, undoOf, publishOf, backToDraftOf, planState, gridChanges, callChanges } from '../src/roster/drafts.js';
import { rosters, weeks } from '../src/data/plans.js';
import { weekBuilt } from '../src/roster/grid.js';

const row = (list, juniors, day = '2027-03-01', session = 'AM') => ({ day, session, list, juniors });
const published = { id: '2027-03-01', grid: [row('a', ['Ana'])], lists: [{ id: 'a' }], seed: 3, built: 10, overrides: [{ id: 'a', need: 2 }] };

test('a maker sees the draft laid over the record; a record without one is as it is (viewers always read the record)', () => {
  assert.equal(asMaker(published), published);
  assert.equal(asMaker(undefined), undefined);
  const d = asMaker({ ...published, draft: { grid: [row('a', ['Ben'])], seed: 4 } });
  assert.deepEqual(d.grid, [row('a', ['Ben'])]);
  assert.equal(d.seed, 4);
  assert.equal(d.built, 10, 'a field the draft lacks: the record\'s');
  assert.equal(asMaker({ ...published, draft: null }).grid, published.grid, 'a dropped draft (null) is no draft');
});

test('a hand edit saves onto the record when there is no draft, into the draft when there is one', () => {
  const fields = { grid: [row('a', ['Cy'])] };
  assert.deepEqual(planWrite(published, fields, WEEK_PLAN), fields, 'published: a quick fix reaches viewers');
  const withDraft = { ...published, draft: { grid: [row('a', ['Ben'])], seed: 4 } };
  assert.deepEqual(planWrite(withDraft, fields, WEEK_PLAN), { draft: { grid: [row('a', ['Cy'])], seed: 4 } });
});

test('a build starts a draft from the published fields; a month\'s settings stay on the record', () => {
  const out = planWrite(published, { grid: [row('a', ['Dee'])], seed: 4, built: 20 }, WEEK_PLAN, true);
  assert.deepEqual(out, { draft: { grid: [row('a', ['Dee'])], lists: [{ id: 'a' }], seed: 4, built: 20, overrides: [{ id: 'a', need: 2 }] } });
  assert.deepEqual(planWrite(undefined, { grid: [] }, WEEK_PLAN, true), { draft: { grid: [] } }, 'a week never saved');
  const month = { id: '2027-03', calls: [{ date: '2027-03-01', con: 'Eve' }], holidays: ['2027-03-05'] };
  assert.deepEqual(planWrite({ ...month, draft: { calls: [] } }, { calls: [{ date: '2027-03-02' }], holidays: [] }, MONTH_PLAN),
    { holidays: [], draft: { calls: [{ date: '2027-03-02' }] } });
});

test('Undo puts each saved field back; a draft the save started is dropped (null); no grid comes back not built', () => {
  assert.deepEqual(undoOf(published, { draft: { grid: [] } }), { draft: null });
  const withDraft = { ...published, draft: { grid: [] } };
  assert.deepEqual(undoOf(withDraft, { draft: { grid: [row('a', ['Fay'])] } }), { draft: { grid: [] } });
  assert.deepEqual(undoOf(published, { grid: [], accepted: ['x'] }), { grid: published.grid, accepted: [] });
  assert.deepEqual(undoOf({ id: 'w' }, { grid: [row('a', ['Fay'])], lists: [] }), { grid: [], lists: [], built: 0 });
});

test('Publish lays the draft over the record and drops it; Back to draft copies the record; Discard is draft: null', () => {
  const withDraft = { ...published, draft: { grid: [row('a', ['Gus'])], seed: 5, built: 30 } };
  const pub = publishOf(withDraft, WEEK_PLAN);
  assert.deepEqual(pub, { grid: [row('a', ['Gus'])], lists: [], overrides: [], built: 30, seed: 5, accepted: [], draft: null });
  const back = backToDraftOf(published, WEEK_PLAN);
  assert.deepEqual(back, { draft: { grid: published.grid, lists: published.lists, overrides: published.overrides, built: 10, seed: 3 } });
  assert.deepEqual(asMaker({ ...published, ...back }).grid, published.grid, 'Back to draft changes nothing the maker sees');
});

test('the cleaners keep a draft of the plan\'s own fields, and null; a month\'s draft holds no settings', () => {
  const w = weeks.clean({ draft: { grid: [row('a', ['Hal'])], seed: 2, owner: 'x' } });
  assert.deepEqual(w, { draft: { grid: [row('a', ['Hal'])], seed: 2 } });
  assert.deepEqual(weeks.clean({ draft: null }), { draft: null });
  assert.deepEqual(weeks.clean({ draft: 'x' }), {});
  const r = rosters.clean({ draft: { calls: [{ date: '2027-03-01', con: 'Ivy' }], holidays: ['2027-03-05'], minGap: 2 } });
  assert.deepEqual(r, { draft: { calls: [{ date: '2027-03-01', con: 'Ivy', reg: null, moNuh: null, moNtf: null }] } });
});

test('where a record stands: published, a draft never published, a draft over a published one, nothing yet', () => {
  assert.equal(planState(published, weekBuilt), 'published');
  assert.equal(planState({ id: 'w', draft: { grid: [row('a', ['Jo'])] } }, weekBuilt), 'draft');
  assert.equal(planState({ ...published, draft: { grid: [row('a', ['Jo'])] } }, weekBuilt), 'redraft');
  assert.equal(planState({ id: 'w', overrides: [] }, weekBuilt), '');
  assert.equal(planState({ id: 'w', draft: { grid: [] } }, weekBuilt), '', 'an emptied draft of an unbuilt week: nothing yet');
  assert.equal(planState({ ...published, draft: null }, weekBuilt), 'published');
});

test('the preview marks the names new on a list and the lists whose juniors changed', () => {
  const before = [row('a', ['Kai', 'Lee']), row('b', ['Max']), row('c', ['Ned'], '2027-03-02', 'PM')];
  const after = [row('a', ['Kai', 'Oz']), row('b', ['Max']), row('d', ['Pia'])];
  const { cells, lists } = gridChanges(before, after);
  assert.deepEqual([...cells], ['a|Oz', 'd|Pia']);
  assert.deepEqual([...lists].sort(), ['a', 'c', 'd'], 'c lost Ned (gone from the grid)');
  assert.deepEqual(gridChanges(before, before), { cells: new Set(), lists: new Set() });
});

test('the preview marks the calls that change, by day and tier', () => {
  const before = [{ date: '2027-03-01', con: 'Kai', reg: 'Lee' }, { date: '2027-03-02', con: 'Max' }];
  const after = [{ date: '2027-03-01', con: 'Kai', reg: 'Oz' }, { date: '2027-03-03', con: 'Pia' }];
  assert.deepEqual([...callChanges(before, after, ['con', 'reg'])].sort(), ['2027-03-01|reg', '2027-03-02|con', '2027-03-03|con']);
});
