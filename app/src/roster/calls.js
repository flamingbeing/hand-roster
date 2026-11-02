// The monthly on-call solver. For every day it fills the tiers that day has (CON, REG, MO NUH, MO NTFGH) from the people
// who may take them. Hard rules: nobody on leave, nobody on two tiers in a day, a minimum gap between a person's calls,
// "cannot" requests, locked entries kept. Soft: even call totals (scaled to the days a person is around), even weekend and
// public holiday calls, even spread of tiers, calls spaced out, "want" requests, juniors on their own grade's tiers.
// Method (the idea of flamingbeing's roster-core solver, much smaller): greedy construction hardest slot first, then
// simulated annealing with swap and reassign moves, hard and soft costs kept apart. Deterministic from the seed and
// capped by an iteration budget. Pure: no page, no clock.
import { addDays, diffDays, monthDays } from './dates.js';
import { DEFAULT_TIER_PLAN, TIERS, canTake, dayType, isOffDay, leaveIndex } from './model.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Tier} Tier */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').CallRequest} CallRequest */
/** @typedef {import('./model.js').CallMap} CallMap */
/** @typedef {import('./model.js').TierPlan} TierPlan */

/**
 * @typedef {object} SolveOptions
 * @property {string} month  YYYY-MM
 * @property {Person[]} people
 * @property {Leave[]} [leave]
 * @property {CallRequest[]} [requests]
 * @property {string[]} [holidays]  public holiday days (an input, never built in)
 * @property {TierPlan} [tiers]  which tiers each kind of day has (default DEFAULT_TIER_PLAN)
 * @property {number} [minGap]  days a person must be clear between two calls (default 2: call Mon, next Thu at the earliest)
 * @property {number} [seed]
 * @property {number} [iterations]  annealing budget (default 30000)
 * @property {boolean} [fill]  false: fill nothing, only judge the locked entries (the calls check; default true)
 * @property {CallMap} [prior]  the weeks before the month, for the gap rule at its start
 * @property {CallMap} [locked]  entries to keep exactly (a hand edit, or a call already given)
 *
 * @typedef {{ date: string, tier: Tier, name?: string | null, rule: 'unfilled' | 'gap' | 'leave' | 'cannot' | 'double' | 'tier' | 'locked' | 'want', text: string }} CallProblem
 * @typedef {{ total: number, weekend: number, tiers: Record<Tier, number> }} CallCount
 * @typedef {{ assignments: CallMap, counts: Record<string, CallCount>, problems: CallProblem[], cost: { hard: number, soft: number } }} SolveResult
 */

/** @param {number} a @returns {() => number} mulberry32: a seeded random in [0, 1), the same sequence for the same seed */
export function prng(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HARD = 1000;
const W = { total: 1, weekend: 1.5, tier: 0.3, spread: 0.4, want: 5, grade: 1.5 };

/**
 * @param {SolveOptions} o
 * @returns {SolveResult}
 */
export function solveCalls(o) {
  const plan = o.tiers ?? DEFAULT_TIER_PLAN;
  // at least 1 clear day: the day after a call is post-call (off), so back-to-back calls would clash with it
  const minGap = Math.max(1, o.minGap ?? 2);
  const rnd = prng(o.seed ?? 1);
  const days = monthDays(o.month);
  const lv = leaveIndex(o.leave ?? []);
  const holidays = o.holidays ?? [];
  const requests = o.requests ?? [];

  const people = o.people.filter(p => TIERS.some(t => canTake(p, t)));
  const idx = new Map(people.map((p, i) => [p.name, i]));
  const P = people.length;
  const spreadTarget = minGap + 3;

  /** @type {{ date: string, di: number, tier: Tier, off: boolean, cands: number[], locked: number }[]} */
  const slots = [];
  /** @type {Map<string, number>} */
  const cannot = new Map();
  for (const r of requests) if (r.type === 'cannot') cannot.set(`${r.name}|${r.date}`, 1);
  days.forEach((date, di) => {
    const type = dayType(date, holidays);
    for (const tier of TIERS) {
      if (!plan[type].includes(tier)) continue;
      const cands = [];
      for (let i = 0; i < P; i++) {
        const p = people[i];
        if (canTake(p, tier) && !lv.blocks(p.name, date) && !cannot.has(`${p.name}|${date}`)) cands.push(i);
      }
      const lockName = o.locked?.[date]?.[tier];
      const locked = lockName ? (idx.get(lockName) ?? -2) : -1;
      slots.push({ date, di, tier, off: isOffDay(type), cands: o.fill === false && !lockName ? [] : cands, locked });
    }
  });
  const S = slots.length;

  // per person: availability (days not on leave), weekend availability, the grade pool they share totals with
  const poolOf = people.map(p => p.grade);
  const avail = people.map(p => days.filter(d => !lv.blocks(p.name, d)).length);
  const availOff = people.map(p => days.filter((d, i) => isOffDay(dayType(d, holidays)) && !lv.blocks(p.name, d)).length);
  const pools = [...new Set(poolOf)];
  const poolAvail = pools.map(g => people.reduce((s, p, i) => s + (poolOf[i] === g ? avail[i] : 0), 0));
  const poolAvailOff = pools.map(g => people.reduce((s, p, i) => s + (poolOf[i] === g ? availOff[i] : 0), 0));

  // prior calls, as day offsets before the month's first day
  /** @type {number[][]} */
  const priorDays = people.map(() => []);
  if (o.prior) {
    for (const date of Object.keys(o.prior).sort()) {
      const off = diffDays(days[0], date);
      if (off >= 0 || off < -(minGap + 8)) continue;
      for (const t of TIERS) { const n = o.prior[date]?.[t]; const i = n ? idx.get(n) : undefined; if (i !== undefined) priorDays[i].push(off); }
    }
  }
  // wanted: person -> day -> tier or '*'
  /** @type {Map<string, string>} */
  const wants = new Map();
  for (const r of requests) if (r.type === 'want') wants.set(`${r.name}|${r.date}`, r.tier ?? '*');

  const tierIx = /** @type {Record<Tier, number>} */ ({ con: 0, reg: 1, moNuh: 2, moNtf: 3 });
  /** @param {Int16Array} a @returns {{ hard: number, soft: number }} */
  function cost(a) {
    let hard = 0;
    let soft = 0;
    const total = new Float64Array(P);
    const off = new Float64Array(P);
    const perTier = new Float64Array(P * 4);
    /** @type {number[][]} */
    const dd = people.map((_, i) => priorDays[i].slice());
    for (let s = 0; s < S; s++) {
      const p = a[s];
      if (p < 0) { hard++; continue; }
      const sl = slots[s];
      total[p]++;
      if (sl.off) off[p]++;
      perTier[p * 4 + tierIx[sl.tier]]++;
      dd[p].push(sl.di);
      if (poolOf[p] === 'reg' && sl.tier !== 'reg') soft += W.grade; // a registrar on an MO tier
    }
    for (let p = 0; p < P; p++) {
      const d = dd[p];
      for (let k = 1; k < d.length; k++) {
        const gap = d[k] - d[k - 1];
        if (gap <= minGap) hard += gap === 0 ? 2 : 1;
        else if (gap < spreadTarget) soft += W.spread * (spreadTarget - gap) ** 2;
      }
      for (let t = 0; t < 4; t++) soft += W.tier * perTier[p * 4 + t] ** 2;
    }
    pools.forEach((g, gi) => {
      let tt = 0;
      let to = 0;
      for (let p = 0; p < P; p++) if (poolOf[p] === g) { tt += total[p]; to += off[p]; }
      for (let p = 0; p < P; p++) {
        if (poolOf[p] !== g) continue;
        const share = poolAvail[gi] ? (tt * avail[p]) / poolAvail[gi] : 0;
        const shareOff = poolAvailOff[gi] ? (to * availOff[p]) / poolAvailOff[gi] : 0;
        soft += W.total * (total[p] - share) ** 2 + W.weekend * (off[p] - shareOff) ** 2;
      }
    });
    if (wants.size) {
      /** @type {Set<string>} */
      const met = new Set();
      for (let s = 0; s < S; s++) {
        if (a[s] < 0) continue;
        const k = `${people[a[s]].name}|${slots[s].date}`;
        const w = wants.get(k);
        if (w === '*' || w === slots[s].tier) met.add(k);
      }
      for (const k of wants.keys()) if (!met.has(k) && idx.has(k.split('|')[0])) soft += W.want;
    }
    return { hard, soft };
  }
  /** @param {Int16Array} a */
  const score = a => { const c = cost(a); return c.hard * HARD + c.soft; };

  // slots of one day sit side by side, so a day's slots are a small range
  /** @type {number[][]} */
  const byDay = days.map(() => []);
  slots.forEach((sl, s) => byDay[sl.di].push(s));

  // construction: hardest slots (fewest candidates) first; each takes the person that raises the cost least
  const a = new Int16Array(S).fill(-1);
  for (let s = 0; s < S; s++) if (slots[s].locked !== -1) a[s] = slots[s].locked === -2 ? -1 : slots[s].locked;
  const order = [...Array(S).keys()].filter(s => slots[s].locked === -1).sort((x, y) => slots[x].cands.length - slots[y].cands.length || x - y);
  for (const s of order) {
    let best = -1;
    let bestScore = Infinity;
    for (const p of slots[s].cands) {
      if (sameDay(a, s, p)) continue;
      a[s] = p;
      const v = score(a) + rnd() * 0.01;
      if (v < bestScore) { bestScore = v; best = p; }
    }
    a[s] = best;
  }

  /** @param {Int16Array} arr @param {number} s @param {number} p @param {number} [skip] */
  function sameDay(arr, s, p, skip = -1) {
    for (const t of byDay[slots[s].di]) if (t !== s && t !== skip && arr[t] === p) return true;
    return false;
  }

  // annealing
  const movable = [...Array(S).keys()].filter(s => slots[s].locked === -1 && slots[s].cands.length > 0);
  let cur = score(a);
  let best = Int16Array.from(a);
  let bestScore = cur;
  const iters = movable.length > 1 ? (o.iterations ?? 30000) : 0;
  const t0 = 4;
  const t1 = 0.05;
  for (let it = 0; it < iters && bestScore > 0; it++) {
    const temp = t0 * (t1 / t0) ** (it / iters);
    const s1 = movable[(rnd() * movable.length) | 0];
    const p1 = a[s1];
    if (rnd() < 0.4) {
      const c = slots[s1].cands;
      const p = c[(rnd() * c.length) | 0];
      if (p === p1 || sameDay(a, s1, p)) continue;
      a[s1] = p;
      const v = score(a);
      if (v <= cur || rnd() < Math.exp((cur - v) / temp)) { cur = v; if (v < bestScore) { bestScore = v; best = Int16Array.from(a); } } else a[s1] = p1;
    } else {
      const s2 = movable[(rnd() * movable.length) | 0];
      const p2 = a[s2];
      if (s1 === s2 || p1 === p2 || p1 < 0 || p2 < 0) continue;
      if (!slots[s1].cands.includes(p2) || !slots[s2].cands.includes(p1)) continue;
      if (sameDay(a, s1, p2, s2) || sameDay(a, s2, p1, s1)) continue;
      a[s1] = p2; a[s2] = p1;
      const v = score(a);
      if (v <= cur || rnd() < Math.exp((cur - v) / temp)) { cur = v; if (v < bestScore) { bestScore = v; best = Int16Array.from(a); } } else { a[s1] = p1; a[s2] = p2; }
    }
  }

  return report(best);

  /** @param {Int16Array} fin @returns {SolveResult} */
  function report(fin) {
    /** @type {CallMap} */
    const assignments = {};
    /** @type {Record<string, CallCount>} */
    const counts = {};
    for (const p of people) counts[p.name] = { total: 0, weekend: 0, tiers: { con: 0, reg: 0, moNuh: 0, moNtf: 0 } };
    /** @type {CallProblem[]} */
    const problems = [];
    /** @type {Map<string, number[]>} */
    const mine = new Map(people.map(p => [p.name, []]));
    slots.forEach((sl, s) => {
      const row = assignments[sl.date] ?? (assignments[sl.date] = {});
      const p = fin[s];
      const name = p >= 0 ? people[p].name : (o.locked?.[sl.date]?.[sl.tier] ?? null);
      row[sl.tier] = name;
      if (!name) { problems.push({ date: sl.date, tier: sl.tier, name: null, rule: 'unfilled', text: `no one available for ${sl.tier} on ${sl.date}` }); return; }
      if (p < 0) return;
      const c = counts[name];
      c.total++; c.tiers[sl.tier]++; if (sl.off) c.weekend++;
      mine.get(name)?.push(sl.di);
      if (lv.blocks(name, sl.date)) problems.push({ date: sl.date, tier: sl.tier, name, rule: 'leave', text: `${name} is on leave on ${sl.date}` });
      if (cannot.has(`${name}|${sl.date}`)) problems.push({ date: sl.date, tier: sl.tier, name, rule: 'cannot', text: `${name} asked not to be on call on ${sl.date}` });
      if (!canTake(people[p], sl.tier)) problems.push({ date: sl.date, tier: sl.tier, name, rule: 'tier', text: `${name} cannot take ${sl.tier}` });
    });
    for (const [name, list] of mine) {
      const all = [...priorDays[idx.get(name) ?? 0], ...list];
      for (let k = 1; k < all.length; k++) {
        if (all[k] - all[k - 1] <= minGap) {
          const date = addDays(days[0], all[k]);
          const tier = slots.find(sl => sl.di === all[k] && assignments[sl.date][sl.tier] === name)?.tier ?? 'con';
          problems.push({ date, tier, name, rule: all[k] === all[k - 1] ? 'double' : 'gap', text: `${name} is on call again after ${all[k] - all[k - 1] - 1} clear day(s) on ${date}` });
        }
      }
    }
    for (const r of requests) {
      if (r.type !== 'want' || !idx.has(r.name)) continue;
      const row = assignments[r.date];
      const ok = row && (r.tier ? row[r.tier] === r.name : TIERS.some(t => row[t] === r.name));
      if (!ok) problems.push({ date: r.date, tier: r.tier ?? 'con', name: r.name, rule: 'want', text: `${r.name} wanted to be on call on ${r.date}` });
    }
    const c = cost(fin);
    return { assignments, counts, problems, cost: c };
  }
}
