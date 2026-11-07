// The rule cards (roster/rule-cards.js): each default card is a valid app-roster rule, the builders read their settings
// from the cards and the defaults give the same week and calls as before, a saved card replaces its default, and the
// package's score of a built week or month agrees with what the builder reports. Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from 'app-roster';
import { DEFAULT_RULES, rulesOf, weekRules, callRules } from '../src/roster/rule-cards.js';
import { weekProblem, callsProblem } from '../src/roster/problem.js';
import { buildWeek } from '../src/roster/week.js';
import { solveCalls } from '../src/roster/calls.js';
import { checkCalls } from '../src/roster/calls-check.js';
import { gridRows } from '../src/roster/grid.js';
import { DEFAULT_TIER_PLAN } from '../src/roster/model.js';
import { RULE_TYPES, rules as rulesKind } from '../src/data/plans.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));
const leave = fx.leave.map(({ name, from, to }) => ({ name, from, to }));
const week = (/** @type {any} */ extra) => buildWeek({ monday: fx.week.from, lists: fx.lists, people: fx.people, leave, calls: fx.calls, requests: fx.requests, ...extra });
/** @param {any[]} rules @param {string} id @param {any} patch */
const edit = (rules, id, patch) => rules.map(r => (r.id === id ? { ...r, ...patch, params: { ...r.params, ...(patch.params ?? {}) } } : r));

test('rule cards: every default is a valid app-roster rule with its own id, in words', () => {
  assert.equal(new Set(DEFAULT_RULES.map(r => r.id)).size, DEFAULT_RULES.length, 'ids are unique');
  assert.deepEqual([...RULE_TYPES].sort(), Object.keys(R.RULE_TYPES).sort(), "the cleaner's types are the package's");
  for (const r of DEFAULT_RULES) {
    assert.ok(RULE_TYPES.includes(r.type), r.id);
    assert.ok(r.topic === 'week' || r.topic === 'calls', r.id);
    assert.deepEqual(R.validateRule(R.normalizeRule(r)), [], r.id);
    assert.deepEqual(R.normalizeRule(r), r, `${r.id} is already in the full shape`);
    assert.ok(R.describeRule(r).length > 10, r.id);
  }
  assert.equal(rulesKind.COLL, 'rules');
});

test('rule cards: the defaults are the numbers the builders always used', () => {
  assert.deepEqual(weekRules(), {
    postCallAm: true, postCall: true, asks: true, keep: true,
    points: { sessions: 3, ot: 1.5, clinic: 1.5, regOt: 4, moClinic: 2, site: 2, amSite: 1.5, team: 0.25 },
  });
  assert.deepEqual(callRules(), { minGap: 2, points: { total: 1, weekend: 1.5, tier: 0.3, spread: 0.4, want: 5, grade: 1.5 } });
  assert.deepEqual(weekRules(rulesOf([])), weekRules());
});

test('rule cards: the default cards build the same week and the same calls, seed for seed', () => {
  const wr = weekRules(rulesOf([])), cr = callRules(rulesOf([]));
  for (let seed = 0; seed < 12; seed++) {
    assert.deepEqual(week({ seed, rules: wr }), week({ seed }), `week, seed ${seed}`);
    assert.deepEqual(week({ seed, rules: wr, postCallAm: false }), week({ seed, postCallAm: false }), `week, whole-day post-call, seed ${seed}`);
  }
  for (let seed = 1; seed < 5; seed++) {
    const o = { month: '2026-10', people: fx.people, leave, seed, iterations: 3000 };
    assert.deepEqual(solveCalls({ ...o, rules: cr }), solveCalls(o), `calls, seed ${seed}`);
  }
});

test('rule cards: a saved card replaces its default; a fixed one stays on with its type; a maker\'s own is added', () => {
  const saved = [
    { id: 'week-team', on: false },
    { id: 'week-leave', on: false, type: 'limit', level: 'soft' },
    { id: 'calls-gap', params: { to: 3 } },
    { id: 'mine-1', type: 'limit', level: 'warn', params: { per: 'week', max: 4 } },
    { id: 'week-site', on: false, _deleted: true },
  ];
  const rules = rulesOf(saved);
  const by = Object.fromEntries(rules.map(r => [r.id, r]));
  assert.equal(by['week-team'].on, false);
  assert.equal(by['week-team'].params.points, 0.25, 'params merge over the default\'s');
  assert.deepEqual([by['week-leave'].on, by['week-leave'].type, by['week-leave'].level], [true, 'away', 'block'], 'a fixed card cannot be turned off yet');
  assert.equal(by['calls-gap'].params.to, 3);
  assert.deepEqual(by['calls-gap'].params.first, { kinds: ['call'] });
  assert.equal(by['week-site'].on, true, 'a deleted copy brings the default back');
  assert.equal(rules.at(-1)?.id, 'mine-1');
  assert.equal(weekRules(rules).points.team, 0, 'off: no points');
  assert.equal(callRules(rules).minGap, 3);
});

test('rule cards: the builders follow a changed card', () => {
  const pcWhole = edit(DEFAULT_RULES, 'week-post-call', { params: { then: {} } });
  assert.equal(weekRules(pcWhole).postCallAm, false);
  assert.deepEqual(week({ seed: 2, rules: weekRules(pcWhole) }), week({ seed: 2, postCallAm: false }), 'post-call the whole day = postCallAm false');
  const noPc = week({ seed: 2, rules: weekRules(edit(DEFAULT_RULES, 'week-post-call', { on: false })) });
  assert.ok(Object.values(noPc.postCall).every(n => n.length === 0), 'post-call off: nobody post-call');
  // asks off: an ask is no longer placed first
  const ask = fx.requests.find((/** @type {any} */ r) => r.type === 'list-person');
  const noAsks = week({ seed: 1, rules: weekRules(edit(DEFAULT_RULES, 'week-asks', { on: false })) });
  assert.deepEqual(noAsks, week({ seed: 1, requests: [] }), 'asks off = no asks');
  assert.ok(ask);
  // the gap card is the solver's minGap when the month sets none
  const o = { month: '2026-10', people: fx.people, leave, seed: 3, iterations: 2000 };
  assert.deepEqual(solveCalls({ ...o, rules: callRules(edit(DEFAULT_RULES, 'calls-gap', { params: { to: 3 } })) }), solveCalls({ ...o, minGap: 3 }));
  assert.deepEqual(solveCalls({ ...o, minGap: 2, rules: callRules(edit(DEFAULT_RULES, 'calls-gap', { params: { to: 3 } })) }), solveCalls({ ...o, minGap: 2 }), "the month's own wins");
  // a soft card off: its weight is 0
  assert.equal(callRules(edit(DEFAULT_RULES, 'calls-want', { on: false })).points.want, 0);
});

test('rules kind: cards are cleaned to the rule shape', () => {
  const c = rulesKind.clean({ type: 'limit', words: ' At most four ', level: 'warn', priority: 2, tags: ['a', 3], on: false, topic: 'week',
    params: { per: 'week', max: 4, f: () => 1 }, extra: 'x' });
  assert.deepEqual(c, { type: 'limit', words: 'At most four', level: 'warn', priority: 2, tags: ['a'], on: false, params: { per: 'week', max: 4 }, topic: 'week' });
  assert.deepEqual(rulesKind.clean({ type: 'nope', level: 'hard', priority: 5, params: [1] }), {}, 'unknown type, level, priority and non-object params left out');
  assert.equal(rulesKind.clean({ params: { t: 'x'.repeat(5000) } }).params, undefined, 'params over 4000 characters left out');
});

test('package score: a built week breaks no block rule but the builder\'s own shortfalls, and its leads warnings are its no-registrar lists', () => {
  // the fixture's people, and too few: no registrars and only some MOs, so lists go short and lose their lead
  let mos = 0;
  const few = fx.people.filter((/** @type {any} */ p) => p.grade === 'con' || (p.grade === 'mo' && mos++ < 7));
  let shortSeen = 0, noRegSeen = 0;
  for (const [people, seed] of [[fx.people, 1], [fx.people, 4], [few, 1], [few, 5]]) {
    const res = week({ seed, people });
    shortSeen += res.problems.filter(p => p.got < p.min).length; noRegSeen += res.problems.filter(p => p.noReg).length;
    const { problem, roster } = weekProblem({ monday: fx.week.from, lists: res.lists, grid: gridRows(res.grid), people, leave, calls: fx.calls, requests: fx.requests, rules: DEFAULT_RULES });
    const sc = R.score(problem, roster);
    const blocks = sc.hits.filter(h => h.level === 'block');
    const short = new Set(res.problems.filter(p => p.got < p.min).map(p => p.list));
    assert.deepEqual(blocks.filter(h => h.rule !== 'week-cover'), [], `seed ${seed}: only cover may break`);
    assert.deepEqual(new Set(blocks.map(h => h.slot)), short, `seed ${seed}: the cover breaks are the lists below their minimum`);
    const noReg = new Set(res.problems.filter(p => p.noReg).map(p => p.list));
    assert.deepEqual(new Set(sc.hits.filter(h => h.level === 'warn').map(h => h.slot)), noReg, `seed ${seed}: leads warnings = no registrar`);
  }
  assert.ok(shortSeen > 0 && noRegSeen > 0, 'the short case has both');
});

test('package score: a made month breaks no block rule when the solver reports no problem, and finds a gap it reports', () => {
  const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo'];
  const people = [
    ...NAMES.slice(0, 6).map(n => ({ name: `Dr Con ${n}`, grade: 'con' })),
    ...NAMES.slice(0, 6).map(n => ({ name: `Dr Reg ${n}`, grade: 'reg' })),
    ...NAMES.map(n => ({ name: `Dr Mo ${n}`, grade: 'mo' })),
  ];
  const month = '2026-11';
  const res = solveCalls({ month, people, seed: 2, iterations: 8000 });
  assert.equal(res.problems.length, 0);
  const calls = Object.entries(res.assignments).map(([date, r]) => ({ date, ...r }));
  const { problem, roster } = callsProblem({ month, calls, people, tiers: DEFAULT_TIER_PLAN, rules: DEFAULT_RULES });
  assert.equal(problem.slots.length, 30 * 4);
  assert.deepEqual(R.score(problem, roster).hits.filter(h => h.level === 'block'), []);
  // two calls too close: the solver's check and the package's gap card both see it
  const first = calls[0].moNuh;   // on call 1 Nov, put on again 2 Nov
  const near = calls.map(c => (c.date === '2026-11-02' ? { ...c, moNuh: first, ...(c.moNtf === first ? { moNtf: c.moNuh } : {}) } : c));
  const check = checkCalls({ month, calls: near, people });
  const gaps = check.problems.filter(p => p.rule === 'gap' || p.rule === 'double').length;
  const pk = callsProblem({ month, calls: near, people, tiers: DEFAULT_TIER_PLAN, rules: DEFAULT_RULES });
  const hits = R.score(pk.problem, pk.roster).hits.filter(h => h.rule === 'calls-gap' || h.rule === 'calls-one-tier');
  assert.ok(gaps > 0 && hits.length > 0, 'both find the clash');
});
