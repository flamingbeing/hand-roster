// Roster engine tests: the call solver, the weekly grid builder and the "Roster info" text parser. Invented names only
// (app/test/fixtures/hrm-week.json is a made-up copy of the shape of one week).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveCalls, prng } from '../src/roster/calls.js';
import { buildWeek } from '../src/roster/week.js';
import { parseInfo, formatInfo } from '../src/roster/parse-info.js';
import { addDays, daysIn, diffDays, isDay, mondayOf, monthDays, weekday } from '../src/roster/dates.js';
import { gridRows } from '../src/roster/grid.js';
import { canTake, dayType, DEFAULT_TIER_PLAN, leaveIndex, settleLists, tierPlanOf } from '../src/roster/model.js';
import { clashesOf, sectionsOf } from '../src/roster/sections.js';
import { keptAsks, keptCount, listChange } from '../src/roster/week-edits.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hrm-week.json', import.meta.url), 'utf8'));

test('dates: UTC-safe weekday, month and week maths', () => {
  assert.equal(weekday('2026-10-12'), 1); // a Monday
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-12', '2026-10-16'), 4);
  assert.equal(daysIn('2026-02'), 28);
  assert.equal(daysIn('2028-02'), 29);
  assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // a Sunday belongs to the week before
  assert.equal(monthDays('2026-11').length, 30);
  assert.equal(isDay('2026-02-30'), false);
});

test('model: tiers per day type, tier eligibility, session-aware leave', () => {
  assert.equal(dayType('2026-10-17'), 'sat');
  assert.equal(dayType('2026-10-18'), 'sun');
  assert.equal(dayType('2026-10-14', ['2026-10-14']), 'ph');
  assert.deepEqual(DEFAULT_TIER_PLAN.sun, ['con', 'reg', 'moNuh', 'moNtf'], 'all four tiers every day, as the HRM roster has');
  assert.deepEqual(tierPlanOf({ sun: ['con'] }), { ...DEFAULT_TIER_PLAN, sun: ['con'] }, "a roster's own plan, the default for the rest");
  assert.equal(canTake({ name: 'a', grade: 'reg', rank: 'Reg' }, 'reg2'), true);
  assert.equal(canTake({ name: 'a', grade: 'mo' }, 'reg2'), false);
  assert.equal(canTake({ name: 'a', grade: 'reg', rank: 'Fellow' }, 'reg'), false);
  assert.equal(canTake({ name: 'a', grade: 'reg', rank: 'Fellow' }, 'moNuh'), true);
  assert.equal(canTake({ name: 'a', grade: 'mo' }, 'reg'), false);
  assert.equal(canTake({ name: 'a', grade: 'mo', extra: true }, 'moNuh'), false);
  const lv = leaveIndex([{ name: 'a', from: '2026-10-12', to: '2026-10-13', session: 'AM' }]);
  assert.equal(lv.blocks('a', '2026-10-12', 'AM'), true);
  assert.equal(lv.blocks('a', '2026-10-12', 'PM'), false);
  assert.equal(lv.blocks('a', '2026-10-12'), true);
  assert.equal(lv.full('a', '2026-10-12'), false);
});

test('prng: same seed, same sequence', () => {
  const a = prng(7); const b = prng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

// a 30-day month: 4 consultants, 4 registrars, 8 MOs
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const people = [
  ...NAMES.slice(0, 4).map(n => ({ name: `Dr Con ${n}`, grade: 'con' })),
  ...NAMES.slice(0, 4).map(n => ({ name: `Dr Reg ${n}`, grade: 'reg', rank: 'Reg' })),
  ...NAMES.map(n => ({ name: `Dr Mo ${n}`, grade: 'mo', rank: 'MO' })),
];
const month = '2026-11';
const leave = [
  { name: 'Dr Reg Ann', from: '2026-11-10', to: '2026-11-14' },
  { name: 'Dr Mo Ben', from: '2026-11-01', to: '2026-11-08' },
  { name: 'Dr Con Cal', from: '2026-11-20', to: '2026-11-22' },
];
const requests = [
  { name: 'Dr Mo Cal', date: '2026-11-05', type: 'cannot' },
  { name: 'Dr Reg Dee', date: '2026-11-17', type: 'cannot' },
  { name: 'Dr Mo Dee', date: '2026-11-20', type: 'want' },
];
const holidays = ['2026-11-08'];

/** fewer tiers at the weekend (the app's first default): the weekend cases below are about a plan's shape */
const OLD_PLAN = { weekday: ['con', 'reg', 'moNuh', 'moNtf'], sat: ['con', 'reg'], sun: ['con'], ph: ['con', 'reg'] };
function solve(extra = {}) {
  return solveCalls({ month, people, leave, requests, holidays, seed: 3, tiers: OLD_PLAN, ...extra });
}

test('calls: every slot filled, hard rules hold on a 30-day month', () => {
  const r = solve();
  assert.deepEqual(r.problems, []);
  assert.equal(r.cost.hard, 0);
  const days = monthDays(month);
  const lv = leaveIndex(leave);
  /** @type {Map<string, string[]>} */
  const byPerson = new Map();
  for (const date of days) {
    const row = r.assignments[date];
    assert.deepEqual(Object.keys(row).sort(), [...OLD_PLAN[dayType(date, holidays)]].sort(), `${date} tiers`);
    const names = Object.values(row);
    assert.ok(names.every(Boolean), `${date} filled`);
    assert.equal(new Set(names).size, names.length, `${date}: nobody on two tiers`);
    for (const [tier, name] of Object.entries(row)) {
      const p = people.find(x => x.name === name);
      assert.ok(canTake(p, tier), `${name} may take ${tier}`);
      assert.ok(!lv.blocks(name, date), `${name} is on leave ${date}`);
      byPerson.set(name, [...(byPerson.get(name) ?? []), date]);
    }
  }
  assert.equal(r.assignments['2026-11-17'].reg === 'Dr Reg Dee', false, 'cannot request kept');
  assert.notEqual(r.assignments['2026-11-05'].moNuh, 'Dr Mo Cal');
  assert.notEqual(r.assignments['2026-11-05'].moNtf, 'Dr Mo Cal');
  for (const [name, ds] of byPerson) {
    for (let i = 1; i < ds.length; i++) assert.ok(diffDays(ds[i - 1], ds[i]) >= 3, `${name}: ${ds[i - 1]} then ${ds[i]} is under the 2-day gap`);
  }
  // the weekend rows: Saturday CON + REG, Sunday CON only, the holiday (a Sunday) CON + REG
  assert.equal(weekday('2026-11-07'), 6);
  assert.deepEqual(Object.keys(r.assignments['2026-11-07']).sort(), ['con', 'reg']);
  assert.deepEqual(Object.keys(r.assignments['2026-11-15']), ['con']);
  assert.deepEqual(Object.keys(r.assignments['2026-11-08']).sort(), ['con', 'reg']);
});

test('calls: totals are fair within each grade and the wanted day is given', () => {
  const r = solve();
  for (const grade of ['con', 'reg', 'mo']) {
    const totals = people.filter(p => p.grade === grade).map(p => r.counts[p.name].total);
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 2, `${grade} totals ${totals}`);
  }
  const off = people.filter(p => p.grade === 'con').map(p => r.counts[p.name].weekend);
  assert.ok(Math.max(...off) - Math.min(...off) <= 2, `weekend calls ${off}`);
  const slots = Object.values(r.assignments).reduce((n, row) => n + Object.keys(row).length, 0);
  assert.equal(Object.values(r.counts).reduce((n, c) => n + c.total, 0), slots);
  assert.ok(Object.values(r.assignments['2026-11-20']).includes('Dr Mo Dee'), 'want honoured');
});

test('calls: a request from another month is left out; an unmet want in the month is still reported', () => {
  // another month's want has no slot here: no problem, and the month comes out as without it
  const other = solve({ requests: [...requests, { name: 'Dr Mo Eli', date: '2026-12-05', type: 'want' }, { name: 'Dr Con Ann', date: '2026-10-30', type: 'cannot' }] });
  assert.ok(!other.problems.some(p => p.date.slice(0, 7) !== month), other.problems.map(p => p.text).join('; '));
  assert.deepEqual(other.assignments, solve().assignments);
  // on leave that day, so the want cannot be met
  const unmet = solve({ requests: [...requests, { name: 'Dr Reg Ann', date: '2026-11-12', type: 'want' }] });
  assert.ok(unmet.problems.some(p => p.rule === 'want' && p.name === 'Dr Reg Ann' && p.date === '2026-11-12'));
});

test('calls: same seed gives the same roster, locked entries stay, prior calls count for the gap', () => {
  assert.deepEqual(solve().assignments, solve().assignments);
  const locked = { '2026-11-03': { con: 'Dr Con Ann', reg: 'Dr Reg Ben' } };
  const r = solve({ locked });
  assert.equal(r.assignments['2026-11-03'].con, 'Dr Con Ann');
  assert.equal(r.assignments['2026-11-03'].reg, 'Dr Reg Ben');
  const prior = { '2026-10-31': { con: 'Dr Con Dee' }, '2026-10-30': { reg: 'Dr Reg Cal' } };
  const p = solve({ prior });
  assert.deepEqual(p.problems, []);
  assert.notEqual(p.assignments['2026-11-01'].con, 'Dr Con Dee');
  assert.notEqual(p.assignments['2026-11-01'].reg, 'Dr Reg Cal');
});

test('calls: next month\'s calls (after) count for the gap at the month\'s end; none, the old roster', () => {
  const base = solve();
  // whoever the month gave the last two days is put on call on 1 Dec, as if December were made first
  const con = base.assignments['2026-11-29'].con, reg = base.assignments['2026-11-30'].reg;   // (29 Nov is a Sunday: CON only)
  assert.ok(con && reg);
  const after = { '2026-12-01': { con, reg } };
  const r = solve({ after });
  assert.deepEqual(r.problems, []);
  assert.equal(r.cost.hard, 0);
  // minGap 2: neither on 29 or 30 Nov (two clear days before the 1st)
  for (const d of ['2026-11-29', '2026-11-30']) {
    const names = Object.values(r.assignments[d]);
    assert.ok(!names.includes(con), `${con} on ${d}`);
    assert.ok(!names.includes(reg), `${reg} on ${d}`);
  }
  // no after, an empty one, or calls far past the month's end: the same roster as before
  assert.deepEqual(solve({ after: {} }).assignments, base.assignments);
  assert.deepEqual(solve({ after: { '2026-12-28': { con } } }).assignments, base.assignments);
  // judged as made (fill false): a call on the 30th with one on the 1st is a gap problem dated the 30th
  const judged = solveCalls({ month, people, tiers: OLD_PLAN, locked: { '2026-11-30': { con } }, after, fill: false, iterations: 0 });
  const gap = judged.problems.find(x => x.rule === 'gap');
  assert.ok(gap);
  assert.equal(gap.date, '2026-11-30');
  assert.equal(gap.tier, 'con');
  assert.equal(gap.name, con);
  assert.match(gap.text, /on call again on 2026-12-01, 0 clear day\(s\) after 2026-11-30/);
});

test('calls: an impossible month reports what it could not do instead of breaking a rule silently', () => {
  // one registrar for a 30-day REG tier: the gap rule cannot hold
  const small = [
    { name: 'Dr Con A', grade: 'con' }, { name: 'Dr Con B', grade: 'con' }, { name: 'Dr Con C', grade: 'con' },
    { name: 'Dr Reg A', grade: 'reg', rank: 'Reg' },
    { name: 'Dr Mo A', grade: 'mo' }, { name: 'Dr Mo B', grade: 'mo' }, { name: 'Dr Mo C', grade: 'mo' }, { name: 'Dr Mo D', grade: 'mo' },
  ];
  const r = solveCalls({ month: '2026-11', people: small, seed: 1, iterations: 3000 });
  assert.ok(r.problems.some(x => x.rule === 'gap' || x.rule === 'unfilled'));
  // a day nobody can cover is 'unfilled'
  const gone = solveCalls({ month: '2026-11', people: small, leave: [{ name: 'Dr Reg A', from: '2026-11-04', to: '2026-11-04' }], seed: 1, iterations: 500 });
  assert.equal(gone.assignments['2026-11-04'].reg, null);
  assert.ok(gone.problems.some(x => x.rule === 'unfilled' && x.date === '2026-11-04' && x.tier === 'reg'));
});

// ---- weekly grid ----
test('calls: a gap of 0 is lifted to 1, so nobody is on call on two days running (the day after a call is post-call)', () => {
  const r = solve({ minGap: 0, iterations: 3000 });
  const days = Object.keys(r.assignments).sort();
  for (let k = 1; k < days.length; k++) {
    for (const t of ['con', 'reg', 'moNuh', 'moNtf']) {
      const n = r.assignments[days[k]][t];
      if (!n) continue;
      const before = Object.values(r.assignments[days[k - 1]]);
      assert.equal(before.includes(n), false, `${n} on ${days[k - 1]} and ${days[k]}`);
    }
  }
});

const week = fx.week;
const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
// make the lists as a roster maker would enter them: closed clinics of consultants on leave start out open
const fxLeave = fx.leave.map(({ name, from, to }) => ({ name, from, to }));
const fxLv = leaveIndex(fxLeave);
const inputLists = fx.lists.map(l => (l.kind === 'clinic' && l.status === 'closed' && l.consultant && fxLv.blocks(l.consultant, l.day) ? { ...l, status: 'open', need: 1 } : l));
const fxPeople = fx.people.map(p => (p.name === 'Dr Sigma Tham' ? p : p));
const fxLeave2 = [...fxLeave, { name: 'Dr Sigma Tham', from: week.from, to: week.to }]; // the sample's "not around" locum
const built = buildWeek({ monday: week.from, lists: inputLists, people: fxPeople, leave: fxLeave2, calls: fx.calls });

const nameSet = new Set(fx.people.map(p => p.name));

test('week: Mon-Fri, AM and PM, every list present once', () => {
  assert.deepEqual(built.days, days);
  for (const d of days) for (const s of ['AM', 'PM']) {
    const want = fx.lists.filter(l => l.day === d && l.session === s).map(l => l.id).sort();
    assert.deepEqual(built.grid[d][s].map(g => g.list).sort(), want, `${d} ${s}`);
  }
});

test('week: consultants on leave close their clinics, other lists keep their juniors', () => {
  for (const l of fx.lists.filter(x => x.kind === 'clinic' && x.consultant && fxLv.blocks(x.consultant, x.day))) {
    const out = built.lists.find(x => x.id === l.id);
    assert.equal(out.status, 'closed', l.id);
    assert.equal(out.need, 0);
    assert.deepEqual(built.grid[l.day][l.session].find(g => g.list === l.id).juniors, []);
  }
  const krw = built.lists.find(x => x.id === 'mon-am-nuh-krwot3');
  assert.equal(krw.consultantOnLeave, true);
  assert.equal(krw.status, 'open');
  assert.ok(built.grid['2026-10-12'].AM.find(g => g.list === krw.id).juniors.length > 0);
});

test('week: nobody is double-booked, on leave, on call, or on a post-call PM', () => {
  const callOn = (d, n) => fx.calls.some(c => c.date === d && ['con', 'reg', 'moNuh', 'moNtf'].some(t => c[t] === n));
  for (const d of days) {
    for (const s of ['AM', 'PM']) {
      const seen = new Set();
      for (const g of built.grid[d][s]) for (const n of g.juniors) {
        assert.ok(nameSet.has(n));
        assert.ok(!seen.has(n), `${n} twice on ${d} ${s}`);
        seen.add(n);
        assert.ok(!fxLv.blocks(n, d, s) && n !== 'Dr Sigma Tham', `${n} on leave ${d}`);
        assert.ok(!callOn(d, n), `${n} on call ${d}`);
        if (s === 'PM') assert.ok(!callOn(addDays(d, -1), n), `${n} post-call PM ${d}`);
      }
    }
  }
});

test('week: post-call, leave and free sections follow the sheet', () => {
  // post-call = the people on call the day before, as in the sample
  assert.deepEqual([...built.postCall['2026-10-13']].sort(), [fx.calls[1].reg, fx.calls[1].moNuh, fx.calls[1].moNtf].sort());
  for (const d of days) {
    const want = fx.leave.filter(l => l.from <= d && d <= l.to && !['hand'].includes(l.src)).map(l => l.name);
    for (const n of want) assert.ok(built.leave[d].includes(n), `${n} listed on leave ${d}`);
    // every junior is in exactly one place per half-day: placed, free, on leave or post-call PM
    for (const p of fx.people.filter(p => p.grade !== 'con' && !p.extra)) {
      const n = p.name;
      // (running a list counts as placed: a registrar named as a list's consultant)
      const runs = s => fx.lists.some(l => l.day === d && l.session === s && l.status === 'open' && l.consultant === n);
      const am = built.grid[d].AM.some(g => g.juniors.includes(n)) || runs('AM');
      const pm = built.grid[d].PM.some(g => g.juniors.includes(n)) || runs('PM');
      const f = built.free[d].find(x => x.name === n);
      const away = fxLv.full(n, d) || n === 'Dr Sigma Tham';
      if (away) { assert.ok(!am && !pm && !f, `${n} ${d} away`); continue; }
      const onCall = fx.calls.some(c => c.date === d && ['reg', 'moNuh', 'moNtf'].some(t => c[t] === n));
      if (onCall) { assert.equal(f?.when, 'FULL DAY'); assert.equal(f.why, 'on call'); continue; }
      const postPm = built.postCall[d].includes(n);
      const amFree = !am && (f?.when === 'AM' || f?.when === 'FULL DAY');
      const pmFree = !pm && !postPm && (f?.when === 'PM' || f?.when === 'FULL DAY');
      assert.equal(!am, amFree, `${n} ${d} AM accounted for`);
      assert.equal(!pm && !postPm, pmFree, `${n} ${d} PM accounted for`);
    }
  }
});

test('week: lists get their juniors when people are around, sessions are balanced', () => {
  assert.ok(built.problems.length <= 6, `${built.problems.length} lists short: ${JSON.stringify(built.problems.slice(0, 3))}`);
  const counts = fx.people.filter(p => p.grade !== 'con' && !p.extra && p.name !== 'Dr Sigma Tham' && !fxLv.full(p.name, '2026-10-12')).map(p => built.stats[p.name].sessions);
  assert.ok(counts.length > 10);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 7, `sessions ${counts}`);
  // OT-type lists lean on registrars, clinics on MOs
  const grade = Object.fromEntries(fx.people.map(p => [p.name, p.grade]));
  let otReg = 0; let otAll = 0; let clMo = 0; let clAll = 0;
  for (const d of days) for (const s of ['AM', 'PM']) for (const g of built.grid[d][s]) {
    const l = built.lists.find(x => x.id === g.list);
    for (const n of g.juniors) {
      if (l.kind === 'ot' || l.kind === 'msp') { otAll++; if (grade[n] === 'reg') otReg++; } else { clAll++; if (grade[n] === 'mo') clMo++; }
    }
  }
  assert.ok(otReg / otAll > 0.5, `OT registrars ${otReg}/${otAll}`);
  assert.ok(clMo / clAll > 0.5, `clinic MOs ${clMo}/${clAll}`);
});

test('week: leave for one session only, a requested list, a PM that keeps the AM juniors', () => {
  const lists = [
    { id: 'a-am', site: 'NUH', kind: 'ot', name: 'OT 1', day: '2026-10-12', session: 'AM', consultant: 'Dr C', status: 'open', need: 2 },
    { id: 'a-pm', site: 'NUH', kind: 'ot', name: 'OT 1', day: '2026-10-12', session: 'PM', consultant: 'Dr C', status: 'open', need: 2 },
    { id: 'c-am', site: 'NUH', kind: 'clinic', name: 'CLINIC', day: '2026-10-12', session: 'AM', consultant: 'Dr D', status: 'open', need: 1 },
  ];
  const pp = ['R1', 'R2', 'R3', 'M1'].map((n, i) => ({ name: `Dr ${n}`, grade: i < 3 ? 'reg' : 'mo' }));
  const r = buildWeek({
    monday: '2026-10-12', lists, people: pp,
    leave: [{ name: 'Dr R1', from: '2026-10-12', to: '2026-10-12', session: 'AM' }],
    requests: [{ type: 'list-person', person: 'Dr R2', list: 'OT 1', day: '2026-10-12', session: 'both' }],
    calls: [{ date: '2026-10-11', reg: 'Dr R3' }],
  });
  const am = r.grid['2026-10-12'].AM.find(g => g.list === 'a-am').juniors;
  const pm = r.grid['2026-10-12'].PM.find(g => g.list === 'a-pm').juniors;
  assert.ok(!am.includes('Dr R1'));
  assert.ok(am.includes('Dr R2') && pm.includes('Dr R2'));
  assert.ok(pm.includes('Dr R1'), 'back from the AM leave, free for the PM');
  assert.ok(!pm.includes('Dr R3'), 'post-call PM');
  assert.ok(r.free['2026-10-12'].every(f => f.name !== 'Dr R1' || f.when !== 'AM'));
  const whole = buildWeek({ monday: '2026-10-12', lists, people: pp, calls: [{ date: '2026-10-11', reg: 'Dr R3' }], postCallAm: false });
  assert.ok(!whole.grid['2026-10-12'].AM.some(g => g.juniors.includes('Dr R3')));
});

test('week: a junior goes with a consultant of their team only when all else is equal', () => {
  // two OT lists, one registrar each; every seed puts each registrar with their own team's consultant
  const lists = [
    { id: 'x', site: 'NUH', kind: 'ot', name: 'OT 1', day: '2026-10-12', session: 'AM', consultant: 'Dr C1', status: 'open', need: 1 },
    { id: 'y', site: 'NUH', kind: 'ot', name: 'OT 2', day: '2026-10-12', session: 'AM', consultant: 'Dr C9', consultant2: 'Dr C2', status: 'open', need: 1 },
  ];
  const pp = [
    { name: 'Dr C1', grade: 'con', team: 'Team 1' }, { name: 'Dr C2', grade: 'con', team: 'team 2 ' }, { name: 'Dr C9', grade: 'con' },
    { name: 'Dr R1', grade: 'reg', team: 'Team 1' }, { name: 'Dr R2', grade: 'reg', team: 'Team 2' },
  ];
  for (let seed = 1; seed <= 20; seed++) {
    const am = buildWeek({ monday: '2026-10-12', lists, people: pp, seed }).grid['2026-10-12'].AM;
    assert.deepEqual(am.find(g => g.list === 'x').juniors, ['Dr R1'], `seed ${seed}`);
    assert.deepEqual(am.find(g => g.list === 'y').juniors, ['Dr R2'], `seed ${seed}`);
  }
  // any other rule wins: a registrar on the wrong site goes to their own site's list, not their team's consultant
  const split = lists.map(l => (l.id === 'y' ? { ...l, site: 'NTFGH' } : l));
  const sited = pp.map(p => (p.name === 'Dr R1' ? { ...p, site: 'NTFGH' } : p.name === 'Dr R2' ? { ...p, site: 'NUH' } : p));
  for (let seed = 1; seed <= 20; seed++) {
    const am = buildWeek({ monday: '2026-10-12', lists: split, people: sited, seed }).grid['2026-10-12'].AM;
    assert.deepEqual(am.find(g => g.list === 'x').juniors, ['Dr R2'], `seed ${seed}`);
  }
});

// ---- roster info text ----
const CALLS_TEXT = fx.calls.filter(c => c.date >= '2026-10-12' && c.date <= '2026-10-16');

test('parse-info: leave and calls lines', () => {
  const t = `Leave
- Dr Uniform Seah 12 to 16 Oct (away Mon to Fri)
Dr Zeta Soh 12 Oct to 13 Oct
Dr Xray Yap 14 Oct (away Wed AM)
Dr Lima Ho 30 Oct to 2 Nov
Calls (Reg / NUH MO / NTF MO)
Mon 12 Oct (Dr Zulu Neo / Dr Eta Aw / Dr Tango Quek)
Sat 17 Oct (Dr Sierra Heng / - / -)
`;
  const r = parseInfo(t, { year: 2026 });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.leave, [
    { name: 'Dr Uniform Seah', from: '2026-10-12', to: '2026-10-16' },
    { name: 'Dr Zeta Soh', from: '2026-10-12', to: '2026-10-13' },
    { name: 'Dr Xray Yap', from: '2026-10-14', to: '2026-10-14', session: 'AM' },
    { name: 'Dr Lima Ho', from: '2026-10-30', to: '2026-11-02' },
  ]);
  assert.deepEqual(r.calls[0], { date: '2026-10-12', con: null, reg: 'Dr Zulu Neo', moNuh: 'Dr Eta Aw', moNtf: 'Dr Tango Quek' });
  assert.deepEqual(r.calls[1], { date: '2026-10-17', con: null, reg: 'Dr Sierra Heng', moNuh: null, moNtf: null });
});

test('parse-info: a changed column order, and lines it cannot read are reported', () => {
  const r = parseInfo('Calls (NUH MO / NTF MO / Reg)\nTue 13 Oct (A / B / C)\nWed 13 Oct (A / B / C)\nnonsense\nLeave\nDr Q 31 Feb (away)\nDr R 16 to 12 Oct', { year: 2026 });
  assert.deepEqual(r.calls, [{ date: '2026-10-13', con: null, reg: 'C', moNuh: 'A', moNtf: 'B' }]);
  assert.equal(r.problems.length, 4);
  assert.match(r.problems[0].reason, /Wed/);
  assert.equal(r.problems[1].line, 4);
  assert.match(r.problems[2].reason, /real date/);
  assert.match(r.problems[3].reason, /before the start/);
});

test('parse-info: the sample week round-trips through the text form', () => {
  const info = { leave: fx.leave.filter(l => l.src === 'docx').map(({ name, from, to }) => ({ name, from, to })), calls: CALLS_TEXT.map(c => ({ ...c, con: null })) };
  const text = formatInfo(info);
  assert.match(text, /^Leave\nDr Uniform Seah 12 to 16 Oct \(away Mon to Fri\)/);
  assert.match(text, /Mon 12 Oct \(Dr Zulu Neo \/ Dr Eta Aw \/ Dr Tango Quek\)/);
  const back = parseInfo(text, { year: 2026 });
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.leave, info.leave);
  assert.deepEqual(back.calls, info.calls);
  // the parsed calls feed the week builder directly
  const r = buildWeek({ monday: week.from, lists: inputLists, people: fxPeople, leave: back.leave, calls: back.calls });
  assert.equal(r.days.length, 5);
});

// Lists a week closes (a holiday, the consultant on leave or away, no patients): 'Change for this week' saves only what was
// typed, from the list unsettled; juniors left on a closed list are flagged and count as free (7 Nov 2026).
const CW = '2026-11-09';   // a Monday
const cwSlot = (/** @type {Record<string, unknown>} */ o) => ({ id: 'c1', site: 'NUH', kind: 'clinic', name: 'CLINIC 1', day: CW, session: 'AM',
  consultant: 'Dr Con Test', status: 'open', need: 2, patients: 18, ...o });
/** the sheet's values as it opens on a list (screens/week-list.js) */
const cwValues = (/** @type {any} */ l) => ({ consultant: l.consultant ?? '', consultant2: l.consultant2 ?? '', consultant3: l.consultant3 ?? '',
  patients: l.patients ?? null, need: l.need, min: Math.min(l.need, l.min ?? (l.need > 0 ? 1 : 0)), status: l.status, away: !!l.away });

test('week list change: only the fields typed differently from the list unsettled', () => {
  const raw = cwSlot({});
  // a holiday closes it this week; only the patients are changed: nothing about the holiday is saved
  const [ph] = settleLists([raw], { holidays: [CW] });
  assert.equal(ph.status, 'closed');
  assert.deepEqual(listChange(raw, { ...cwValues(raw), patients: 12 }), { patients: 12 });
  // no patients: need 0 this week; typed to 20, only the patients
  const none = cwSlot({ patients: 0 });
  assert.equal(settleLists([none], {})[0].need, 0);
  assert.deepEqual(listChange(none, { ...cwValues(none), patients: 20 }), { patients: 20 });
  // the consultant on leave closes the clinic; only the patients change: no status written
  const leave = [{ name: 'Dr Con Test', from: CW, to: CW }];
  assert.equal(settleLists([raw], { leave })[0].status, 'closed');
  const c = listChange(raw, { ...cwValues(raw), patients: 9 });
  assert.deepEqual(c, { patients: 9 });
  assert.ok(!('status' in c) && !('need' in c));
  // nothing typed: no change at all; each field on its own when typed
  assert.deepEqual(listChange(raw, cwValues(raw)), {});
  assert.deepEqual(listChange(raw, { ...cwValues(raw), status: 'closed', need: 1, min: 0, away: true }), { status: 'closed', need: 1, min: 0, away: true });
  // a sharer written only when it changes; one who becomes the lead drops out as sharer
  const shared = cwSlot({ consultant2: 'Dr Two Test' });
  assert.deepEqual(listChange(shared, cwValues(shared)), {});
  assert.deepEqual(listChange(shared, { ...cwValues(shared), consultant2: '' }), { consultant2: null });
  assert.deepEqual(listChange(shared, { ...cwValues(shared), consultant: 'Dr Two Test' }), { consultant: 'Dr Two Test', consultant2: null });
  assert.deepEqual(listChange(raw, { ...cwValues(raw), consultant: '' }), { consultant: null });
  // an empty number other than patients changes nothing; emptied patients is "not known"
  assert.deepEqual(listChange(raw, { ...cwValues(raw), need: null, min: null }), {});
  assert.deepEqual(listChange(raw, { ...cwValues(raw), patients: null }), { patients: null });
  // an OT list with its consultant away is an emergency slot this week; its usual need untouched is not saved
  const ot = cwSlot({ id: 'o1', kind: 'ot', name: 'OT 1', need: 3 });
  assert.equal(settleLists([ot], { leave })[0].emergency, true);
  assert.deepEqual(listChange(ot, cwValues(ot)), {});
  // unticking away writes away false (mergeOverrides drops it from the week's change)
  const away = cwSlot({ away: true });
  assert.deepEqual(listChange(away, { ...cwValues(away), away: false }), { away: false });
});

test('week clashes: juniors on a list closed this week are flagged and free', () => {
  const people = [{ name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'mo' }, { name: 'Dr Cat Test', grade: 'mo' }, { name: 'Dr Con Test', grade: 'con' }];
  const raw = [cwSlot({}), cwSlot({ id: 'o1', kind: 'ot', name: 'OT 1', consultant: 'Dr Other Test' })];
  const grid = [{ day: CW, session: 'AM', list: 'c1', juniors: ['Dr Ann Test', 'Dr Ben Test'] }, { day: CW, session: 'AM', list: 'o1', juniors: ['Dr Cat Test'] }];
  const leave = [{ name: 'Dr Con Test', from: CW, to: CW }];
  // the clinic's consultant on leave since the build: one clash per junior on it, and they are free that morning
  const lists = settleLists(raw, { leave });
  const clashes = clashesOf({ grid, lists, leave, calls: [] });
  assert.deepEqual(clashes.map(c => [c.list, c.name, c.why.join()]),
    [['c1', 'Dr Ann Test', 'the list is closed (consultant on leave)'], ['c1', 'Dr Ben Test', 'the list is closed (consultant on leave)']]);
  const sec = sectionsOf({ monday: CW, people, leave, calls: [], lists, grid });
  const free = sec.free[CW].map(f => [f.name, f.when]);
  assert.deepEqual(free.filter(([n]) => n !== 'Dr Cat Test'), [['Dr Ann Test', 'FULL DAY'], ['Dr Ben Test', 'FULL DAY']]);
  assert.deepEqual(free.find(([n]) => n === 'Dr Cat Test'), ['Dr Cat Test', 'PM'], 'the open list still takes its morning');
  // marked away in the Epic check
  const away = settleLists([{ ...raw[0], away: true }, raw[1]], {});
  assert.deepEqual(clashesOf({ grid, lists: away, leave: [], calls: [] }).map(c => c.why.join()), ['the list is closed (consultant away)', 'the list is closed (consultant away)']);
  // a public holiday: every list's juniors, said once each, and nothing else checked that day
  const ph = settleLists(raw, { holidays: [CW] });
  assert.deepEqual(clashesOf({ grid, lists: ph, leave, calls: [], holidays: [CW] }).map(c => [c.name, c.why]),
    [['Dr Ann Test', ['the list is closed (public holiday)']], ['Dr Ben Test', ['the list is closed (public holiday)']], ['Dr Cat Test', ['the list is closed (public holiday)']]]);
  // closed by the week's own change
  const shut = settleLists([{ ...raw[0], status: 'closed' }, raw[1]], {});
  assert.deepEqual(clashesOf({ grid, lists: shut, leave: [], calls: [] }).map(c => c.why.join()), ['the list is closed', 'the list is closed']);
  // open lists: none
  assert.deepEqual(clashesOf({ grid, lists: settleLists(raw, {}), leave: [], calls: [] }), []);
  // leave of a junior on a closed list: both said
  const both = clashesOf({ grid, lists, leave: [...leave, { name: 'Dr Ann Test', from: CW, to: CW }], calls: [] });
  assert.deepEqual(both[0].why, ['the list is closed (consultant on leave)', 'on leave then']);
});

test('build again: hand placements kept as asks, unless the person is away now', () => {
  const day = '2026-10-12';
  const lists = [
    { id: 'ot1', site: 'NUH', kind: 'ot', name: 'OT 1', day, session: 'AM', consultant: 'Dr Con Test', status: 'open', need: 1 },
    { id: 'ot2', site: 'NUH', kind: 'ot', name: 'OT 1', day, session: 'PM', consultant: 'Dr Con Test', status: 'open', need: 2 },
    { id: 'cl1', site: 'NTFGH', kind: 'clinic', name: 'CLINIC', day, session: 'AM', consultant: 'Dr Con Two', status: 'open', need: 2 },
  ];
  const people = [
    { name: 'Dr Ann Test', grade: 'reg' }, { name: 'Dr Ben Test', grade: 'mo' }, { name: 'Dr Cy Test', grade: 'mo' }, { name: 'Dr Dee Test', grade: 'reg' },
  ];
  const built = [
    { day, session: 'AM', list: 'ot1', juniors: ['Dr Ann Test'] },
    { day, session: 'AM', list: 'cl1', juniors: ['Dr Ben Test', 'Dr Cy Test'] },
    { day, session: 'PM', list: 'ot2', juniors: ['Dr Ann Test'] },
  ];
  // by hand: Dr Cy Test moved to OT 1 in the AM (swapped with Dr Ann Test), Dr Dee Test added to the PM; Dr Ben Test unchanged
  const now = [
    { day, session: 'AM', list: 'ot1', juniors: ['Dr Cy Test'] },
    { day, session: 'AM', list: 'cl1', juniors: ['Dr Ben Test', 'Dr Ann Test'] },
    { day, session: 'PM', list: 'ot2', juniors: ['Dr Ann Test', 'Dr Dee Test'] },
  ];
  const asks = keptAsks(built, now);
  assert.deepEqual(asks, [
    { type: 'list-person', person: 'Dr Cy Test', list: 'ot1', day, session: 'AM' },
    { type: 'list-person', person: 'Dr Ann Test', list: 'cl1', day, session: 'AM' },
    { type: 'list-person', person: 'Dr Dee Test', list: 'ot2', day, session: 'PM' },
  ]);
  assert.deepEqual(keptAsks(built, built), [], 'nothing changed by hand');
  // the builder places them first, on the list by id
  for (const seed of [1, 2, 3]) {
    const rows = gridRows(buildWeek({ monday: day, lists, people, seed, requests: asks }).grid);
    assert.equal(keptCount(asks, rows), 3, `seed ${seed}`);
  }
  // a kept person on leave now is not placed, nor counted as kept
  const leave = [{ name: 'Dr Dee Test', from: day, to: day }];
  const rows = gridRows(buildWeek({ monday: day, lists, people, leave, seed: 1, requests: asks }).grid);
  assert.ok(!rows.some(r => r.juniors.includes('Dr Dee Test')));
  assert.equal(keptCount(asks, rows), 2);
  // an ask above the list's need is dropped by the builder: not kept
  const over = [...asks, { type: 'list-person', person: 'Dr Ben Test', list: 'ot1', day, session: 'AM' }];
  assert.equal(keptCount(over, gridRows(buildWeek({ monday: day, lists, people, seed: 1, requests: /** @type {any} */ (over) }).grid)), 3);
});
