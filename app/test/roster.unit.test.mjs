// Roster engine tests: the call solver, the weekly grid builder and the "Roster info" text parser. Invented names only
// (app/test/fixtures/hrm-week.json is a made-up copy of the shape of one week).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveCalls, prng } from '../src/roster/calls.js';
import { buildWeek } from '../src/roster/week.js';
import { parseInfo, formatInfo } from '../src/roster/parse-info.js';
import { addDays, daysIn, diffDays, isDay, mondayOf, monthDays, weekday } from '../src/roster/dates.js';
import { canTake, dayType, DEFAULT_TIER_PLAN, leaveIndex } from '../src/roster/model.js';

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
  assert.deepEqual(DEFAULT_TIER_PLAN.sun, ['con']);
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

function solve(extra = {}) {
  return solveCalls({ month, people, leave, requests, holidays, seed: 3, ...extra });
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
    assert.deepEqual(Object.keys(row).sort(), [...DEFAULT_TIER_PLAN[dayType(date, holidays)]].sort(), `${date} tiers`);
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
      const am = built.grid[d].AM.some(g => g.juniors.includes(n));
      const pm = built.grid[d].PM.some(g => g.juniors.includes(n));
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
