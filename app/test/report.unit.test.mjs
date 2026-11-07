// The rule check (roster/report.js) on app-roster's score of a built week and a made month: marks on the slots and cells
// that break block and warn rules, an accepted warning loses its mark, the report puts broken rules first with readable
// days, and the slots nobody can take are named. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from 'app-roster';
import { DEFAULT_RULES } from '../src/roster/rule-cards.js';
import { weekProblem, callsProblem } from '../src/roster/problem.js';
import { buildWeek } from '../src/roster/week.js';
import { solveCalls } from '../src/roster/calls.js';
import { gridRows } from '../src/roster/grid.js';
import { DEFAULT_TIER_PLAN } from '../src/roster/model.js';
import { checkSaid, hitKey, marksOf, readable, reportOf, shortLines } from '../src/roster/report.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));
const leave = fx.leave.map((/** @type {any} */ { name, from, to }) => ({ name, from, to }));
const dayName = (/** @type {string} */ d) => `D${d.slice(8)}`;
const words = (/** @type {string} */ _id, /** @type {string} */ w) => w;

/** a week built with too few people: lists short (cover, block) and without a registrar (leads, warn) */
function shortWeek() {
  let mos = 0;
  const people = fx.people.filter((/** @type {any} */ p) => p.grade === 'con' || (p.grade === 'mo' && mos++ < 7));
  const res = buildWeek({ monday: fx.week.from, lists: fx.lists, people, leave, calls: fx.calls, seed: 1 });
  return weekProblem({ monday: fx.week.from, lists: res.lists, grid: gridRows(res.grid), people, leave, calls: fx.calls, rules: DEFAULT_RULES });
}

test('report: marks follow the block and warn hits; an accepted warning loses its mark', () => {
  const { problem, roster } = shortWeek();
  const sc = R.score(/** @type {any} */ (problem), roster);
  const m = marksOf(sc);
  const blocks = new Set(sc.hits.filter(h => h.level === 'block' && !h.person).map(h => h.slot));
  assert.ok(blocks.size > 0);
  for (const s of blocks) assert.equal(m.slots.get(/** @type {string} */ (s))?.level, 'block', `${s} is red`);
  const warn = sc.hits.find(h => h.level === 'warn' && h.slot && !blocks.has(h.slot));
  assert.ok(warn, 'a list only short of a registrar');
  assert.equal(m.slots.get(/** @type {string} */ (warn.slot))?.level, 'warn');
  const others = sc.hits.filter(h => h.level === 'warn' && h.slot === warn.slot).map(hitKey);
  assert.equal(marksOf(sc, others).slots.get(/** @type {string} */ (warn.slot)), undefined, 'accepted: no mark');
  assert.ok(!sc.hits.some(h => h.level === 'soft' && marksOf(sc).cells.has(`${h.slot}|${h.person}`) && !sc.hits.some(x => x !== h && x.level !== 'soft' && x.slot === h.slot && x.person === h.person)), 'soft hits make no mark');
});

test('report: a person who breaks a block rule is marked on their cell, and the report puts that rule first', () => {
  const people = fx.people;
  const res = buildWeek({ monday: fx.week.from, lists: fx.lists, people, leave, calls: fx.calls, seed: 1 });
  const grid = gridRows(res.grid);
  // someone on leave that day put on a list by hand
  const away = leave.find((/** @type {any} */ l) => l.from <= fx.week.from && fx.week.from <= l.to && people.some((/** @type {any} */ p) => p.name === l.name && p.grade !== 'con'));
  assert.ok(away, 'the fixture has someone away on the Monday');
  const row = grid.find(r => r.day === fx.week.from && r.juniors.length > 0);
  assert.ok(row);
  row.juniors = [...row.juniors, away.name];
  const { problem, roster } = weekProblem({ monday: fx.week.from, lists: res.lists, grid, people, leave, calls: fx.calls, rules: DEFAULT_RULES });
  const sc = R.score(/** @type {any} */ (problem), roster);
  assert.equal(marksOf(sc).cells.get(`${row.list}|${away.name}`)?.level, 'block');
  const rows = reportOf(sc, { words, dayName });
  assert.equal(rows[0].id, 'week-leave');
  assert.ok(rows[0].broken >= 1 && rows[0].hits.some(h => h.text.includes(away.name)));
  assert.ok(rows.every((r, i) => i === 0 || !r.broken || rows[i - 1].broken), 'broken rules first');
  assert.ok(!rows.some(r => r.hits.some(h => /\d{4}-\d{2}-\d{2}/.test(h.text))), 'days read as words');
  assert.match(checkSaid(rows, []), /1 rule broken|rules broken/);
});

test('report: an accepted warning is counted apart, and checkSaid leaves it out', () => {
  const { problem, roster } = shortWeek();
  const sc = R.score(/** @type {any} */ (problem), roster);
  const leads = sc.rules.find(r => r.id === 'week-leads');
  assert.ok(leads && leads.n > 0);
  const rows = reportOf(sc, { words, dayName, accepted: leads.hits.map(hitKey) });
  const row = rows.find(r => r.id === 'week-leads');
  assert.equal(row?.broken, 0); assert.equal(row?.accepted, leads.n);
  assert.ok(row?.hits.every(h => h.accepted));
});

test('report: the slots nobody can take are named with the rules that keep people out', () => {
  const people = [{ name: 'Dr Mo Ann', grade: 'mo' }, { name: 'Dr Mo Ben', grade: 'mo' }];
  const month = '2026-11';
  const res = solveCalls({ month, people, seed: 1, iterations: 500 });
  const calls = Object.entries(res.assignments).map(([date, r]) => ({ date, ...r }));
  // both away on the 3rd: nobody can take that day's calls
  const away = people.map(p => ({ name: p.name, from: '2026-11-03', to: '2026-11-03' }));
  const { problem } = callsProblem({ month, calls, people, leave: away, tiers: DEFAULT_TIER_PLAN, rules: DEFAULT_RULES });
  const short = R.check(/** @type {any} */ (problem), {}).short;
  const lines = shortLines(short, id => id.replace('|', ' '), words);
  const third = lines.filter(l => l.slot.startsWith('2026-11-03|'));
  assert.ok(third.length > 0, 'the 3rd is named');
  assert.match(third[0].text, /^2026-11-03 \w+: nobody can take it/);
  assert.match(checkSaid([], lines), /^Can't be filled: /);
  assert.equal(readable('on 2026-11-03', dayName), 'on D03');
});

test('report: a call too soon after another is marked on that call', () => {
  const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo'];
  const people = [
    ...NAMES.slice(0, 6).map(n => ({ name: `Dr Con ${n}`, grade: 'con' })),
    ...NAMES.slice(0, 6).map(n => ({ name: `Dr Reg ${n}`, grade: 'reg' })),
    ...NAMES.map(n => ({ name: `Dr Mo ${n}`, grade: 'mo' })),
  ];
  const month = '2026-11';
  const res = solveCalls({ month, people, seed: 2, iterations: 8000 });
  const calls = Object.entries(res.assignments).map(([date, r]) => ({ date, ...r }));
  const first = calls[0].moNuh;
  const near = calls.map(c => (c.date === '2026-11-02' ? { ...c, moNuh: first, ...(c.moNtf === first ? { moNtf: c.moNuh } : {}) } : c));
  const { problem, roster } = callsProblem({ month, calls: near, people, tiers: DEFAULT_TIER_PLAN, rules: DEFAULT_RULES });
  const cells = marksOf(R.score(/** @type {any} */ (problem), roster)).cells;
  const mk = cells.get(`2026-11-02|moNuh|${first}`) ?? cells.get(`2026-11-01|moNuh|${first}`);
  assert.ok(mk, 'the clash is marked on one of the two calls');
  assert.ok(mk.why.some(w => w.includes('MO (NUH)')), 'calls are named by their tier');
});

test('report: a list past its minimum but short of its need is not a broken must-hold rule', () => {
  const rule = { id: 'week-cover', type: 'cover', words: 'Every open list gets at least its minimum', level: /** @type {const} */ ('block'), priority: 1, on: true, ok: false, n: 1, cost: 1,
    hits: [{ rule: 'week-cover', level: /** @type {const} */ ('soft'), units: 1, slot: 's1', day: '2026-11-12', why: 'KRWOT 3 (2026-11-12 AM) has 1 of 2' }] };
  const pref = { id: 'week-even', type: 'balance', words: 'Sessions are shared evenly', level: /** @type {const} */ ('soft'), priority: 2, on: true, ok: true, n: 0, cost: 0, hits: [] };
  const rows = reportOf({ rules: [pref, rule] }, { words, dayName });
  assert.equal(rows[0].id, 'week-cover', 'still listed before the rules that hold');
  assert.equal(rows[0].broken, 0);
  assert.equal(rows[0].below, 1);
  assert.equal(checkSaid(rows, []), '', 'the toast says nothing is broken');
  assert.deepEqual(marksOf({ hits: rule.hits }).slots.size, 0, 'and no mark');
});
