// The week's rules for a short week: public holidays, a consultant away (clinics close, OT becomes an emergency slot a
// registrar leads), the minimum before the extras, the Short panel's choices; and the call tiers (all four every day by
// default, a roster's own plan, REG 2 by hand). Invented names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleLists, minOf, EOT } from '../src/roster/model.js';
import { buildWeek } from '../src/roster/week.js';
import { gridRows } from '../src/roster/grid.js';
import { sectionsOf } from '../src/roster/sections.js';
import { shortOptions } from '../src/roster/sections.js';
import { solveCalls } from '../src/roster/calls.js';
import { checkCalls } from '../src/roster/calls-check.js';
import { weekLayout, handGrid } from '../src/roster/layout.js';
import { TIERS, dayType } from '../src/roster/model.js';
import { monthDays } from '../src/roster/dates.js';
import { rosters, weeks } from '../src/data/plans.js';
import * as listsData from '../src/data/lists.js';

const MON = '2026-11-09';
/** @param {string} id @param {Record<string, any>} o @returns {any} */
const L = (id, o) => ({ id, site: 'NUH', name: id.toUpperCase(), day: MON, session: 'AM', consultant: null, status: 'open', need: 1, kind: 'ot', ...o });

test('settle: a holiday closes the day, an away consultant closes clinics and turns OT into an emergency slot', () => {
  const lists = [
    L('ot', { consultant: 'Dr Con A', need: 2 }), L('cl', { kind: 'clinic', consultant: 'Dr Con A' }), L('hot', { kind: 'hot', consultant: 'Dr Con A' }),
    L('msp', { kind: 'msp', consultant: 'Dr Con A' }), L('ot2', { consultant: 'Dr Con B', day: '2026-11-10', away: true }),
    L('cl2', { kind: 'clinic', consultant: 'Dr Con C', day: '2026-11-10', patients: 0 }), L('ph', { day: '2026-11-11', consultant: 'Dr Con C' }),
  ];
  const leave = [{ name: 'Dr Con A', from: MON, to: MON }];
  const out = settleLists(lists, { leave, holidays: ['2026-11-11'] });
  const by = Object.fromEntries(out.map(l => [l.id, l]));
  assert.deepEqual([by.ot.emergency, by.ot.need, minOf(by.ot), by.ot.status], [true, EOT.need, 1, 'open'], 'OT on leave: an emergency slot');
  assert.deepEqual([by.cl.status, by.cl.need, by.hot.status], ['closed', 0, 'closed']);
  assert.deepEqual([by.msp.status, by.msp.emergency], ['open', undefined], 'MSP runs as usual');
  assert.equal(by.ot2.emergency, true, 'Away in the Epic check counts like leave');
  assert.equal(by.cl2.need, 0, 'no patients booked: nobody needed');
  assert.deepEqual([by.ph.status, by.ph.holiday, by.ph.need], ['closed', true, 0]);
  assert.deepEqual(settleLists(out, { leave, holidays: ['2026-11-11'] }), out, 'the same answer again');
  assert.equal(minOf(L('x', { need: 3 })), 1);
  assert.equal(minOf(L('x', { need: 3, min: 2 })), 2);
  assert.equal(minOf(L('x', { need: 1, min: 4 })), 1);
});

const people = [
  { name: 'Dr Reg One', grade: 'reg', rank: 'Reg' }, { name: 'Dr Mo One', grade: 'mo' }, { name: 'Dr Mo Two', grade: 'mo' },
  { name: 'Dr Con A', grade: 'con' }, { name: 'Dr Con B', grade: 'con' }, { name: 'Dr Con C', grade: 'con' },
];

test('week: the minimums first, then the emergency slot\'s registrar, then the extras, then its MO', () => {
  const lists = [L('ot', { consultant: 'Dr Con B', need: 2 }), L('cl', { kind: 'clinic', consultant: 'Dr Con C' }), L('eot', { consultant: 'Dr Con A', need: 1 })];
  const leave = [{ name: 'Dr Con A', from: MON, to: MON }];
  const w = buildWeek({ monday: MON, lists, people, leave, seed: 2 });
  const on = (/** @type {string} */ id) => w.grid[MON].AM.find(g => g.list === id)?.juniors ?? [];
  assert.deepEqual(on('eot'), ['Dr Reg One'], 'the only registrar leads the emergency slot; an MO does the elective OT\'s minimum');
  assert.equal(on('ot').length, 1);
  assert.equal(on('cl').length, 1);
  assert.deepEqual(w.problems.map(p => [p.list, p.got, p.min]), [['ot', 1, 1]], 'the OT is under its ideal, nothing is below a minimum');
  // one MO more: the OT's second junior comes before the emergency slot's MO
  const more = buildWeek({ monday: MON, lists, people: [...people, { name: 'Dr Mo Three', grade: 'mo' }], leave, seed: 2 });
  assert.equal(more.grid[MON].AM.find(g => g.list === 'ot')?.juniors.length, 2);
  assert.equal(more.grid[MON].AM.find(g => g.list === 'eot')?.juniors.length, 1);
  assert.deepEqual(more.problems, [], 'an emergency slot without its MO is no problem');
});

test('week: an MSP list always gets a registrar, and is short without one', () => {
  const lists = [L('ot', { consultant: 'Dr Con B' }), L('msp', { kind: 'msp', consultant: 'Dr Con C' })];
  const w = buildWeek({ monday: MON, lists, people, seed: 3 });
  const on = (/** @type {string} */ id) => w.grid[MON].AM.find(g => g.list === id)?.juniors ?? [];
  assert.deepEqual(on('msp'), ['Dr Reg One'], 'the only registrar goes to the MSP list; an MO takes the OT');
  assert.deepEqual(w.problems, []);
  const noRegs = people.filter(p => p.grade !== 'reg');
  const bare = buildWeek({ monday: MON, lists, people: noRegs, seed: 3 });
  assert.deepEqual(bare.problems.filter(p => p.list === 'msp').map(p => p.noReg), [true], 'an MSP with MOs only is short');
  const grid = [{ day: MON, session: 'AM', list: 'msp', juniors: ['Dr Mo One'] }];
  const sec = sectionsOf({ monday: MON, people, leave: [], calls: [], lists, grid });
  assert.deepEqual(sec.short.map(g => [g.list, g.noReg]), [['ot', undefined], ['msp', true]]);
  const opts = shortOptions({ gap: sec.short[1], lists, grid, people, free: [{ name: 'Dr Mo Two', when: 'FULL DAY' }, { name: 'Dr Reg One', when: 'FULL DAY' }] });
  assert.deepEqual(opts.filter(o => o.kind === 'add').map(o => o.name), ['Dr Reg One'], 'only a registrar is offered');
});

test('week: a public holiday closes its lists and nobody is free that day', () => {
  const lists = [L('a', {}), L('b', { day: '2026-11-10' })];
  const w = buildWeek({ monday: MON, lists, people, holidays: [MON], seed: 1 });
  assert.equal(w.lists.find(l => l.id === 'a')?.status, 'closed');
  assert.deepEqual(w.grid[MON].AM[0].juniors, []);
  assert.deepEqual(w.free[MON], []);
  assert.equal(w.grid['2026-11-10'].AM[0].juniors.length, 1);
  const sec = sectionsOf({ monday: MON, people, leave: [], calls: [], lists: w.lists, grid: gridRows(w.grid), holidays: [MON] });
  assert.deepEqual(sec.free[MON], []);
});

test('short: the choices for a list below its minimum, cheapest first, with their costs', () => {
  const lists = settleLists([
    L('cl', { kind: 'clinic', consultant: 'Dr Con C' }), L('ot', { consultant: 'Dr Con B', need: 2 }), L('eot', { consultant: 'Dr Con A' }),
  ], { leave: [{ name: 'Dr Con A', from: MON, to: MON }] });
  const grid = [
    { day: MON, session: /** @type {const} */ ('AM'), list: 'cl', juniors: [] },
    { day: MON, session: /** @type {const} */ ('AM'), list: 'ot', juniors: ['Dr Mo One', 'Dr Mo Two'] },
    { day: MON, session: /** @type {const} */ ('AM'), list: 'eot', juniors: ['Dr Reg One', 'Dr Mo Three'] },
  ];
  const all = [...people, { name: 'Dr Mo Three', grade: 'mo' }, { name: 'Dr Reg Two', grade: 'reg' }];
  const sec = sectionsOf({ monday: MON, people: all, leave: [], calls: [], lists, grid });
  assert.deepEqual(sec.short.map(g => g.list), ['cl']);
  const opts = shortOptions({ gap: sec.short[0], lists, grid, people: all, free: sec.free[MON] });
  assert.deepEqual(opts.map(o => o.text), ['Add Dr Reg Two', 'Move Dr Mo Three from EOT', 'Move Dr Mo One from OT', 'Move Dr Mo Two from OT', 'Run with no junior', 'Close it']);
  assert.match(opts[1].cost, /loses its MO/);
  assert.match(opts[2].cost, /drops to 1 of the 2/);
  // an emergency slot with no registrar: only registrars are offered, and never the one leading another emergency slot
  const g2 = grid.map(r => (r.list === 'eot' ? { ...r, juniors: ['Dr Mo Three'] } : r.list === 'ot' ? { ...r, juniors: ['Dr Reg One', 'Dr Mo One'] } : r));
  const sec2 = sectionsOf({ monday: MON, people: people, leave: [], calls: [], lists, grid: g2 });
  const gap = sec2.short.find(g => g.list === 'eot');
  assert.equal(gap?.noReg, true, 'one MO meets the count, but nobody leads it');
  const o2 = shortOptions({ gap: /** @type {any} */ (gap), lists, grid: g2, people, free: [] });
  assert.deepEqual(o2.filter(o => o.kind === 'move').map(o => o.name), ['Dr Reg One']);
});

test('calls: all four tiers every day by default, a roster\'s own plan, REG 2 kept and judged', () => {
  const month = '2026-11';
  const staff = [
    ...['A', 'B', 'C', 'D', 'E'].map(n => ({ name: `Dr Con ${n}`, grade: 'con' })),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map(n => ({ name: `Dr Reg ${n}`, grade: 'reg', rank: 'Reg' })),
    ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(n => ({ name: `Dr Mo ${n}`, grade: 'mo' })),
  ];
  const locked = { '2026-11-19': { reg2: 'Dr Reg F' } };
  const r = solveCalls({ month, people: staff, seed: 4, locked, iterations: 8000 });
  for (const d of monthDays(month)) assert.ok(['con', 'reg', 'moNuh', 'moNtf'].every(t => r.assignments[d][t]), `${d} has all four`);
  assert.equal(r.assignments['2026-11-19'].reg2, 'Dr Reg F');
  assert.equal('reg2' in r.assignments['2026-11-20'], false, 'no REG 2 where none was given');
  assert.equal(r.cost.hard, 0);
  // a plan of the roster's own: Sundays CON only
  const plan = { weekday: ['con', 'reg', 'moNuh', 'moNtf'], sat: ['con', 'reg', 'moNuh', 'moNtf'], sun: ['con'], ph: ['con'] };
  const s = solveCalls({ month, people: staff, seed: 4, tiers: /** @type {any} */ (plan), iterations: 2000 });
  assert.deepEqual(Object.keys(s.assignments['2026-11-01']), ['con']);
  // REG 2 is checked like any call: leave is a problem, and it counts
  const calls = [{ date: '2026-11-19', con: 'Dr Con A', reg: 'Dr Reg A', reg2: 'Dr Reg F', moNuh: 'Dr Mo A', moNtf: 'Dr Mo B' }];
  const check = checkCalls({ month, calls, people: staff, leave: [{ name: 'Dr Reg F', from: '2026-11-19', to: '2026-11-19' }] });
  assert.ok(check.problems.some(p => p.tier === 'reg2' && p.rule === 'leave'));
  assert.equal(check.counts.find(c => c.name === 'Dr Reg F')?.tiers.reg2, 1);
  assert.equal(check.empty.some(e => e.tier === 'reg2'), false, 'an empty REG 2 is not missing');
  assert.equal(TIERS.includes('reg2'), true);
  assert.equal(dayType('2026-11-01'), 'sun');
});

test('data: the tier plan, a list\'s minimum, Away and the settled flags are kept', () => {
  const c = rosters.clean({ tierPlan: { weekday: ['con', 'reg', 'bad'], sun: ['con'], odd: ['con'] }, calls: [{ date: '2026-11-02', con: 'A', reg2: 'B' }, { date: '2026-11-03', con: 'C' }] });
  assert.deepEqual(c.tierPlan, { weekday: ['con', 'reg'], sun: ['con'] });
  assert.equal(c.calls[0].reg2, 'B');
  assert.equal('reg2' in c.calls[1], false, 'no REG 2 field where nobody has it');
  assert.equal(listsData.clean({ min: 2 }).min, 2);
  assert.equal(listsData.clean({ min: 11 }).min, undefined);
  const w = weeks.clean({ overrides: [{ id: 'x', away: true, min: 0, patients: 3 }], lists: [{ id: 'x', day: MON, need: 2, min: 1, emergency: true, away: true, holiday: true }] });
  assert.deepEqual(w.overrides[0], { id: 'x', away: true, min: 0, patients: 3 });
  assert.deepEqual([w.lists[0].min, w.lists[0].emergency, w.lists[0].away, w.lists[0].holiday], [1, true, true, true]);
  const slots = listsData.slotsFor([{ id: 'x', site: 'NUH', kind: 'ot', name: 'OT', wd: 1, session: 'AM', need: 2, min: 1, status: 'open' }], MON, [{ id: 'x', away: true }]);
  assert.deepEqual([slots[0].away, slots[0].min], [true, 1]);
});

test('hand grid: an emergency slot sits in the EOT band and the EOT tally counts it', () => {
  const lists = settleLists([L('ot', { consultant: 'Dr Con A', need: 1 }), L('ot3', { consultant: 'Dr Con B' })], { leave: [{ name: 'Dr Con A', from: MON, to: MON }] });
  const grid = [{ day: MON, session: /** @type {const} */ ('AM'), list: 'ot', juniors: ['Dr Reg One'] }, { day: MON, session: /** @type {const} */ ('AM'), list: 'ot3', juniors: ['Dr Mo One'] }];
  const g = handGrid(weekLayout({ monday: MON, lists, grid, people, style: 'hand', built: true }), people);
  assert.equal(g.ranges.eot.length, 1);
  assert.equal(g.ranges.ot.length, 1);
  const head = g.cells.find(c => c.r === g.ranges.eot[0][0] && c.c === 2);
  assert.match(String(head?.v), /EOT \(consultant away\)/);
  const row = 4 + g.juniors.indexOf('Dr Reg One');
  const eotCol = 20 + 2; // T is 20; U MSP, V EOT
  assert.equal(g.cells.find(c => c.r === row && c.c === eotCol)?.v, 1);
});

test('people: "MO calls only" keeps a registrar on lists but off the REG call tiers', async () => {
  const { personOf } = await import('../src/data/people.js');
  const { canTake } = await import('../src/roster/model.js');
  const p = personOf(/** @type {any} */ ({ id: 'x', name: 'Dr Reg Two', grade: 'reg', rank: 'Reg', moCalls: true }));
  assert.equal(p.grade, 'reg');
  assert.deepEqual(['con', 'reg', 'reg2', 'moNuh', 'moNtf'].map(t => canTake(p, /** @type {any} */ (t))), [false, false, false, true, true]);
});

test('week: a HOT clinic is run by a registrar or an R3, never an MO alone', () => {
  const r3 = { name: 'Dr Res Three', grade: 'mo', rank: 'R3' };
  const lists = [L('hot', { kind: 'hot' }), L('cl', { kind: 'clinic', consultant: 'Dr Con C' })];
  const mos = people.filter(p => p.grade !== 'reg');
  const w = buildWeek({ monday: MON, lists, people: [...mos, r3], seed: 4 });
  assert.deepEqual(w.grid[MON].AM.find(g => g.list === 'hot')?.juniors, ['Dr Res Three'], 'the R3 runs it, an MO takes the clinic');
  assert.deepEqual(w.problems, []);
  const bare = buildWeek({ monday: MON, lists, people: mos, seed: 4 });
  assert.deepEqual(bare.problems.filter(p => p.list === 'hot').map(p => p.noReg), [true], 'MOs only: short of a lead');
  const grid = [{ day: MON, session: 'AM', list: 'hot', juniors: ['Dr Mo One'] }];
  const sec = sectionsOf({ monday: MON, people: [...people, r3], leave: [], calls: [], lists, grid });
  const gap = sec.short.find(g => g.list === 'hot');
  assert.equal(gap?.noReg, true);
  const opts = shortOptions({ gap: /** @type {any} */ (gap), lists, grid, people: [...people, r3], free: [{ name: 'Dr Mo Two', when: 'FULL DAY' }, { name: 'Dr Res Three', when: 'FULL DAY' }] });
  assert.deepEqual(opts.filter(o => o.kind === 'add').map(o => o.name), ['Dr Res Three']);
});

test('people: a site-only locum stays at their site, a by-hand locum is never placed but still on call', async () => {
  const { canTake } = await import('../src/roster/model.js');
  const ntf = { name: 'Dr Loc Ntf', grade: 'mo', rank: 'Locum', site: 'NTFGH', siteOnly: true };
  const hand = { name: 'Dr Loc Hand', grade: 'mo', rank: 'Locum', site: 'NUH', byHand: true };
  assert.deepEqual([canTake(/** @type {any} */ (ntf), 'moNuh'), canTake(/** @type {any} */ (ntf), 'moNtf'), canTake(/** @type {any} */ (hand), 'moNuh')], [false, true, true]);
  const lists = [L('nuh', {}), L('ntf', { site: 'NTFGH', day: MON })];
  const w = buildWeek({ monday: MON, lists, people: /** @type {any} */ ([ntf, hand]), seed: 5 });
  assert.deepEqual(w.grid[MON].AM.find(g => g.list === 'ntf')?.juniors, ['Dr Loc Ntf']);
  assert.deepEqual(w.grid[MON].AM.find(g => g.list === 'nuh')?.juniors, [], 'neither goes to NUH');
  assert.ok(!w.free[MON].some(f => f.name === 'Dr Loc Hand'), 'not listed free');
});

test('people: "Works on" days and "Clinics only" limit where the builder puts someone', async () => {
  const { personOf } = await import('../src/data/people.js');
  const p = personOf(/** @type {any} */ ({ id: 'x', name: 'Dr Loc Days', grade: 'mo', rank: 'Locum', works: ['1AM'], clinicsOnly: true }));
  const lists = [L('ot', {}), L('cl', { kind: 'clinic', consultant: 'Dr Con C' }), L('cl2', { kind: 'clinic', session: 'PM' }), L('cl3', { kind: 'clinic', day: '2026-11-10' })];
  const w = buildWeek({ monday: MON, lists, people: [p], seed: 6 });
  const on = (/** @type {string} */ day, /** @type {'AM' | 'PM'} */ s, /** @type {string} */ id) => w.grid[day][s].find(g => g.list === id)?.juniors ?? [];
  assert.deepEqual([on(MON, 'AM', 'cl'), on(MON, 'AM', 'ot'), on(MON, 'PM', 'cl2'), on('2026-11-10', 'AM', 'cl3')], [['Dr Loc Days'], [], [], []]);
  assert.ok(!w.free['2026-11-10'].some(f => f.name === 'Dr Loc Days'), 'not free on a day off');
});

test('a shared list runs while either consultant is in, and shows both names', async () => {
  const lists = [L('sh', { consultant: 'Dr Con A', consultant2: 'Dr Con B', need: 2 }), L('shc', { kind: 'clinic', consultant: 'Dr Con A', consultant2: 'Dr Con B' })];
  const oneAway = settleLists(lists, { leave: [{ name: 'Dr Con A', from: MON, to: MON }] });
  assert.deepEqual(oneAway.map(l => [l.status, !!l.emergency, l.need]), [['open', false, 2], ['open', false, 1]], 'one away: as usual');
  const bothAway = settleLists(lists, { leave: [{ name: 'Dr Con A', from: MON, to: MON }, { name: 'Dr Con B', from: MON, to: MON }] });
  assert.deepEqual(bothAway.map(l => [l.status, !!l.emergency]), [['open', true], ['closed', false]], 'both away: EOT, clinic closed');
  const { conText } = await import('../src/roster/model.js');
  assert.equal(conText(lists[0]), 'Dr Con A / Dr Con B');
  assert.equal(conText({ consultant: null, consultant2: 'Dr Con B' }), '', 'no lead: nobody shown');
  const tmpl = [{ id: 't1', site: 'NUH', kind: 'ot', name: 'OT 7', wd: 2, session: 'PM', consultant: 'Dr Con A', consultant2: 'Dr Con B', need: 1, status: 'open' }];
  assert.equal(listsData.slotsFor(/** @type {any} */ (tmpl), MON)[0].consultant2, 'Dr Con B', 'the template carries it to the week');
  assert.equal(listsData.slotsFor(/** @type {any} */ (tmpl), MON, [{ id: 't1', consultant2: null }])[0].consultant2, undefined, 'a week can drop it');
});

test('three consultants at once: the list runs while any one is in; blanks and repeats drop out', async () => {
  const away = (/** @type {string[]} */ ns) => ns.map(name => ({ name, from: MON, to: MON }));
  const lists = [L('t3', { kind: 'clinic', consultant: 'Dr Con A', consultant2: 'Dr Con B', consultant3: 'Dr Con C' })];
  assert.equal(settleLists(lists, { leave: away(['Dr Con A', 'Dr Con B']) })[0].status, 'open', 'one of three in: runs');
  assert.equal(settleLists(lists, { leave: away(['Dr Con A', 'Dr Con B', 'Dr Con C']) })[0].status, 'closed');
  const { conText } = await import('../src/roster/model.js');
  assert.equal(conText(lists[0]), 'Dr Con A / Dr Con B / Dr Con C');
  const tmpl = [{ id: 't1', site: 'NTFGH', kind: 'ot', name: 'OT 15', wd: 3, session: 'AM', consultant: 'Dr Con A', consultant2: null, consultant3: 'Dr Con C', need: 1, status: 'open' }];
  const [one] = listsData.slotsFor(/** @type {any} */ (tmpl), MON);
  assert.deepEqual([one.consultant2, one.consultant3], ['Dr Con C', undefined], 'a gap closes up');
  const [two] = listsData.slotsFor(/** @type {any} */ (tmpl), MON, [{ id: 't1', consultant2: 'Dr Con A' }]);
  assert.deepEqual([two.consultant2, two.consultant3], ['Dr Con C', undefined], 'the lead is not their own sharer');
});

test('someone running a shared list that session is not placed as a junior anywhere', () => {
  const people = [{ name: 'Dr Con A', grade: 'con' }, { name: 'Dr Ac B', grade: 'reg', rank: 'AC' }, { name: 'Dr Mo C', grade: 'mo' }];
  const lists = [L('sh', { consultant: 'Dr Con A', consultant2: 'Dr Ac B', need: 1 }), L('ot2', { consultant: 'Dr Con A', need: 2 })];
  const { grid } = buildWeek({ monday: MON, lists, people: /** @type {any} */ (people), leave: [], calls: [], seed: 1 });
  const on = gridRows(grid).filter(r => r.day === MON && r.session === 'AM').flatMap(r => r.juniors);
  assert.ok(!on.includes('Dr Ac B'), 'the AC leads, so is not a junior that session');
  assert.ok(on.includes('Dr Mo C'));
});
