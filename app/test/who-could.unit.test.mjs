// The cell sheet's "Who could go here?" (roster/who-could.js) and Build again as a refill (buildWeek `keep`, pins.js keepOf):
// on a real-shaped week (fixtures/hrm-week.json, invented names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from 'app-roster';
import { DEFAULT_RULES } from '../src/roster/rule-cards.js';
import { weekProblem } from '../src/roster/problem.js';
import { buildWeek } from '../src/roster/week.js';
import { gridRows, listOf } from '../src/roster/grid.js';
import { changedRows, keepOf, pinsOf, withPins } from '../src/roster/pins.js';
import { applyEdit } from '../src/roster/week-edits.js';
import { whoCould } from '../src/roster/who-could.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));
const leave = fx.leave.map((/** @type {any} */ { name, from, to }) => ({ name, from, to }));
const base = { monday: fx.week.from, lists: fx.lists, people: fx.people, leave, calls: fx.calls };
const built = buildWeek({ ...base, seed: 1 });
const grid = gridRows(built.grid);
const juniors = fx.people.filter((/** @type {any} */ p) => p.grade !== 'con').map((/** @type {any} */ p) => p.name);
const key = (/** @type {any} */ r) => `${r.day}|${r.session}|${r.list}`;

test('refill: after one hand edit, Build again keeps every other placement and fills the gap', () => {
  const row = grid.find(r => r.juniors.length >= 1 && !built.lists.find(l => l.id === r.list)?.emergency);
  assert.ok(row);
  const gone = row.juniors[0];
  const edited = applyEdit(grid, { kind: 'move', day: row.day, session: row.session, name: gone, to: null });
  const pins = pinsOf(edited), keep = keepOf(edited);
  assert.equal(keep.length, edited.reduce((n, r) => n + r.juniors.length, 0), 'nothing pinned: all of it kept');
  for (const seed of [2, 3, 4]) {
    const next = withPins(gridRows(buildWeek({ ...base, seed, pins, keep }).grid), pins);
    const by = new Map(next.map(r => [key(r), r.juniors]));
    for (const r of edited) for (const n of r.juniors) assert.ok(by.get(key(r))?.includes(n), `seed ${seed}: ${n} stays on ${key(r)}`);
    assert.equal(by.get(key(row))?.length, row.juniors.length, `seed ${seed}: the gap is filled`);
    // only the edited list changes (anyone free can fill the gap; nobody else moves for it)
    assert.equal(changedRows(edited, next), 1, `seed ${seed}`);
    // without keep, a new seed moves far more
    assert.ok(changedRows(edited, gridRows(buildWeek({ ...base, seed, pins }).grid)) > 1);
  }
});

test('refill: a kept placement that no longer holds (leave since) is dropped and its place refilled', () => {
  const row = grid.find(r => r.juniors.length >= 1);
  assert.ok(row);
  const who = row.juniors[0];
  const more = [...leave, { name: who, from: row.day, to: row.day }];
  const next = gridRows(buildWeek({ ...base, leave: more, seed: 2, keep: keepOf(grid) }).grid);
  assert.equal(listOf(next, row.day, row.session, who), null);
  assert.ok(changedRows(grid, next) >= 1);
});

test('who could go here: ranked by the package score, must-hold breaks last with the rule; a free person takes the place, a busy one swaps', () => {
  const { problem } = weekProblem({ ...base, lists: built.lists, grid, rules: DEFAULT_RULES });
  const row = grid.find(r => r.juniors.length >= 1 && grid.some(x => x.day === r.day && x.session === r.session && x.list !== r.list && x.juniors.length));
  assert.ok(row);
  const name = row.juniors[0];
  const opts = whoCould({ score: /** @type {any} */ (R.score), problem, grid, day: row.day, session: row.session, list: row.list, name, people: juniors });
  assert.ok(opts.length > 0);
  assert.ok(!opts.some(o => row.juniors.includes(o.person)), 'nobody already there');
  const firstBad = opts.findIndex(o => !o.ok);
  if (firstBad >= 0) assert.ok(opts.slice(firstBad).every(o => !o.ok), 'ok first');
  for (let i = 1; i < opts.length; i++) if (opts[i].ok === opts[i - 1].ok) assert.ok(opts[i].delta >= opts[i - 1].delta, 'then by cost');
  // someone on leave that day can't, and the leave rule says why
  const away = leave.find((/** @type {any} */ l) => l.from <= row.day && row.day <= l.to && juniors.includes(l.name));
  if (away) {
    const o = opts.find(x => x.person === away.name);
    assert.equal(o?.ok, false);
    assert.equal(o?.level, 'block');
    assert.ok(o?.rules.includes('week-leave'), JSON.stringify(o?.rules));
  }
  // a busy one swaps: the person there now goes to their list
  const busy = opts.find(o => o.from);
  assert.ok(busy);
  const after = applyEdit(grid, busy.edit);
  assert.equal(listOf(after, row.day, row.session, busy.person), row.list);
  assert.equal(listOf(after, row.day, row.session, name), busy.from);
  // a free one takes the place: the person there now is free
  const free = opts.find(o => !o.from);
  if (free) assert.equal(listOf(applyEdit(grid, free.edit), row.day, row.session, name), null);
});
