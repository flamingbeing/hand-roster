// The slot engine: score a roster against rules, check before a fill, rank who could go in a slot, and fill.
// One score for every roster, filled or edited by hand, so the report, the cell marks and the fill always agree.
//
//   score(problem, roster)                  every rule's hits with where and why, and the total cost
//   check(problem, roster?)                 slots that cannot reach their minimum, named with the rules in the way
//   candidates(problem, roster, slotId)     everyone ranked for that slot: allowed first, then cheapest, with reasons
//   fill(problem, { roster?, pins?, ... })  pins first, then hardest slots first, then swaps until nothing improves;
//                                           with a current roster it changes as few places as it can

import { BLOCK, costOf, rank } from '../levels.js';
import { stateOf, place, unplace, rosterOf, minOf } from './model.js';
import { RULE_TYPES, normalizeRule, describeRule } from './rules.js';

/**
 * @typedef {import('./model.js').Problem} Problem
 * @typedef {import('./model.js').Roster} Roster
 * @typedef {import('./model.js').Pin} Pin
 * @typedef {import('./model.js').State} State
 * @typedef {import('./rules.js').Rule} Rule
 * @typedef {import('./rules.js').Hit} Hit
 * @typedef {Hit & { cost: number }} CostedHit
 * @typedef {{ id: string, type: string, words: string, level: Rule['level'], priority: Rule['priority'], on: boolean,
 *   ok: boolean, n: number, cost: number, hits: CostedHit[] }} RuleResult  n: hits that count (balance hits under one
 *   unit are left out of n, not of cost)
 * @typedef {{ cost: number, block: number, warn: number, soft: number, rules: RuleResult[], hits: CostedHit[],
 *   byCell: Record<string, CostedHit[]>, bySlot: Record<string, CostedHit[]>, byPerson: Record<string, CostedHit[]> }} Score
 *   block, warn: how many hits at that level; soft: the soft cost; byCell keys are "slotId|personId"
 */

/** @param {Rule[]} rules */
const live = rules => rules.map(normalizeRule).filter(r => r.on && RULE_TYPES[r.type]);

/** @param {Rule} r @param {Hit} h */
const hitCost = (r, h) => costOf(h.level, r.priority, h.units, h.level === 'soft' ? Number(r.params.weight ?? 1) || 0 : 1);

/** @param {State} st @param {Rule} r @param {string} [key] one person or slot (its scope); none = all */
function runRule(st, r, key) {
  const t = RULE_TYPES[r.type];
  if (t.scope === 'global') return t.run(st, r);
  if (key !== undefined) return t.run(st, r, key);
  /** @type {Hit[]} */ const out = [];
  for (const k of t.scope === 'person' ? st.people.map(p => p.id) : st.slots.map(s => s.id)) out.push(...t.run(st, r, k));
  return out;
}

/**
 * Cost of the parts a change can touch: person rules for `people`, slot rules for `slots`, global rules whole.
 * @param {State} st @param {Rule[]} rules @param {Iterable<string>} people @param {Iterable<string>} slots
 */
function partCost(st, rules, people, slots) {
  let c = 0;
  const ps = [...people], ss = [...slots];
  for (const r of rules) {
    const scope = RULE_TYPES[r.type].scope;
    const keys = scope === 'person' ? ps : scope === 'slot' ? ss : [undefined];
    for (const k of keys) for (const h of runRule(st, r, k)) c += hitCost(r, h);
  }
  return c;
}

/** @param {State} st @param {Rule[]} rules */
const totalCost = (st, rules) => partCost(st, rules, st.people.map(p => p.id), st.slots.map(s => s.id));

/**
 * Score a roster.
 * @param {Problem} problem @param {Roster} [roster] @param {{ rules?: Rule[], all?: boolean }} [o] rules: instead of
 *   problem.rules; all: rules that are off are scored too (their results say on: false, their cost is not counted)
 * @returns {Score}
 */
export function score(problem, roster = {}, o = {}) {
  const st = stateOf(problem, roster);
  const rules = (o.rules ?? problem.rules ?? []).map(normalizeRule).filter(r => RULE_TYPES[r.type] && (r.on || o.all));
  /** @type {Score} */
  const out = { cost: 0, block: 0, warn: 0, soft: 0, rules: [], hits: [], byCell: {}, bySlot: {}, byPerson: {} };
  for (const r of rules) {
    const hits = runRule(st, r).map(h => ({ ...h, cost: hitCost(r, h) }));
    const cost = hits.reduce((a, h) => a + h.cost, 0);
    const n = hits.filter(h => r.type !== 'balance' || h.units >= 1).length;
    out.rules.push({ id: r.id, type: r.type, words: describeRule(r), level: r.level, priority: r.priority, on: r.on !== false, ok: n === 0, n, cost, hits });
    if (!r.on) continue;
    out.cost += cost;
    for (const h of hits) {
      if (h.level === 'block') out.block++;
      else if (h.level === 'warn') out.warn++;
      else out.soft += h.cost;
      out.hits.push(h);
      if (h.slot) (out.bySlot[h.slot] ??= []).push(h);
      if (h.person) (out.byPerson[h.person] ??= []).push(h);
      if (h.slot && h.person) (out.byCell[`${h.slot}|${h.person}`] ??= []).push(h);
    }
  }
  // broken first, then block, warn, soft, by priority
  out.rules.sort((a, b) => Number(a.ok) - Number(b.ok) || Number(b.on) - Number(a.on) || rank(a) - rank(b));
  return out;
}

const hitKey = (/** @type {Hit} */ h) => `${h.rule}|${h.slot ?? ''}|${h.person ?? ''}|${h.why}`;

/**
 * What putting one person in a slot does: the cost change and the hits it adds.
 * @param {State} st @param {Rule[]} rules @param {string} sid @param {string} pid @param {string} [out] someone it replaces
 */
function effect(st, rules, sid, pid, out) {
  const people = out ? [pid, out] : [pid];
  const before = hitsOf(st, rules, people, [sid]);
  if (out) unplace(st, sid, out);
  place(st, sid, pid);
  const after = hitsOf(st, rules, people, [sid]);
  unplace(st, sid, pid);
  if (out) place(st, sid, out);
  const had = new Set(before.map(x => hitKey(x.h)));
  // the breaks it adds that are about this person, and slot rules that get worse
  /** @param {{ h: Hit }[]} xs @param {string} rule */
  const slotUnits = (xs, rule) => xs.filter(x => x.h.rule === rule && !x.h.person).reduce((a, x) => a + x.h.units, 0);
  const added = after.filter(x => !had.has(hitKey(x.h)) && (x.h.person === pid || (!x.h.person && slotUnits(after, x.h.rule) > slotUnits(before, x.h.rule))));
  const sum = (/** @type {{ c: number }[]} */ xs) => xs.reduce((a, x) => a + x.c, 0);
  // blocked: some rule's block breaks grow (a slot's own shortfall shrinking does not make up for it)
  /** @param {{ h: Hit }[]} xs */
  const blockUnits = xs => { const m = new Map(); for (const x of xs) if (x.h.level === 'block') m.set(x.h.rule, (m.get(x.h.rule) ?? 0) + x.h.units); return m; };
  const b0 = blockUnits(before), b1 = blockUnits(after);
  return {
    cost: sum(after) - sum(before),
    blocked: [...b1].some(([rule, n]) => n > (b0.get(rule) ?? 0)),
    added: added.map(x => ({ ...x.h, cost: x.c })),
  };
}

/** @param {State} st @param {Rule[]} rules @param {string[]} people @param {string[]} slots */
function hitsOf(st, rules, people, slots) {
  /** @type {{ h: Hit, c: number }[]} */ const out = [];
  for (const r of rules) {
    const scope = RULE_TYPES[r.type].scope;
    const keys = scope === 'person' ? people : scope === 'slot' ? slots : [undefined];
    for (const k of keys) for (const h of runRule(st, r, k)) out.push({ h, c: hitCost(r, h) });
  }
  return out;
}

/**
 * Everyone ranked for a slot: allowed (no block rule broken by putting them there) first, then by what it costs.
 * @param {Problem} problem @param {Roster} roster @param {string} slotId
 * @param {{ replace?: string }} [o] replace: rank them as a swap for this person (who leaves the slot)
 * @returns {{ person: string, ok: boolean, cost: number, hits: CostedHit[] }[]} hits: the breaks that putting them there adds
 */
export function candidates(problem, roster, slotId, o = {}) {
  const st = stateOf(problem, roster), rules = live(problem.rules ?? []);
  const there = st.roster.get(slotId);
  if (!there) return [];
  const out = [];
  for (const p of st.people) {
    if (there.includes(p.id)) continue;
    const e = effect(st, rules, slotId, p.id, o.replace && there.includes(o.replace) ? o.replace : undefined);
    out.push({ person: p.id, ok: !e.blocked, cost: e.cost, hits: e.added });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || a.cost - b.cost);
}

/**
 * Before a fill: every slot that cannot get its minimum from the people allowed in it (named, never dropped), with
 * the rules that keep people out.
 * @param {Problem} problem @param {Roster} [roster] what is already placed (pins, hand edits)
 * @returns {{ ok: boolean, short: { slot: string, day: string, session?: string, need: number, min: number, got: number,
 *   can: number, why: { rule: string, words: string, people: number }[] }[] }}
 */
export function check(problem, roster = {}) {
  const st = stateOf(problem, roster), rules = live(problem.rules ?? []);
  const byId = new Map(rules.map(r => [r.id, r]));
  const short = [];
  for (const s of st.slots) {
    const got = st.roster.get(s.id)?.length ?? 0, min = minOf(s);
    if (got >= min) continue;
    let can = 0;
    /** @type {Map<string, number>} */
    const why = new Map();
    for (const p of st.people) {
      if (st.roster.get(s.id)?.includes(p.id)) continue;
      const e = effect(st, rules, s.id, p.id);
      if (!e.blocked) { can++; continue; }
      for (const id of new Set(e.added.filter(h => h.level === 'block').map(h => h.rule))) why.set(id, (why.get(id) ?? 0) + 1);
    }
    if (can >= min - got) continue;
    short.push({
      slot: s.id, day: s.day, ...(s.session ? { session: s.session } : {}), need: s.need, min, got, can,
      why: [...why].sort((a, b) => b[1] - a[1]).map(([rule, people]) => ({ rule, words: describeRule(/** @type {Rule} */ (byId.get(rule))), people })),
    });
  }
  return { ok: short.length === 0, short };
}

/** Seeded random numbers in [0, 1) (mulberry32). @param {number} seed */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fill the open seats.
 * - pins are placed first and never moved, even where they break a rule (a maker's call).
 * - roster: the current roster. Its places that break no block rule are kept to start from, and each of them the
 *   fill takes away costs `changeCost` (default: one priority-1 soft unit), so a refill after a hand edit moves only
 *   what it has to. Without it the fill starts empty.
 * - then slots under their minimum, hardest first (fewest allowed people), then up to need; then swaps and
 *   replacements (simulated annealing, seeded) while they lower the cost.
 * Nobody is placed where a block rule says no; a seat nobody can take stays open and is in `open`.
 * @param {Problem} problem
 * @param {{ roster?: Roster, pins?: Pin[], seed?: number, iterations?: number, timeMs?: number, changeCost?: number }} [o]
 * @returns {{ roster: Roster, cost: number, open: { slot: string, open: number }[], changed: number, kept: number,
 *   pins: Pin[], ignored: Pin[], iterations: number }} changed: places of `o.roster` not in the result; pins: those
 *   used; ignored: pins naming an unknown slot or person, or over a slot's need
 */
export function fill(problem, o = {}) {
  const rules = live(problem.rules ?? []);
  const rnd = prng(o.seed ?? 1);
  const st = stateOf(problem, {});
  const start = Date.now();
  /** @type {Set<string>} */ const pinned = new Set();
  const pins = [], ignored = [];
  for (const pn of o.pins ?? []) {
    const s = st.slot.get(pn.slot);
    if (!s || !st.person.has(pn.person) || (st.roster.get(pn.slot)?.length ?? 0) >= s.need) { ignored.push(pn); continue; }
    if (place(st, pn.slot, pn.person)) { pinned.add(`${pn.slot}|${pn.person}`); pins.push(pn); }
  }
  // the change penalty: a place of the current roster that is gone
  const current = new Set(Object.entries(o.roster ?? {}).flatMap(([sid, ids]) => (ids ?? []).map(id => `${sid}|${id}`)));
  const changeCost = o.changeCost ?? costOf('soft', 1, 1);
  const lost = () => { let n = 0; for (const k of current) { const [sid, pid] = split(k); if (!st.roster.get(sid)?.includes(pid)) n++; } return n; };
  /** @param {string} sid @param {string} pid @param {1 | -1} sign 1 taking a place away (costs if it is a current one), -1 adding one (saves) */
  const changeDelta = (sid, pid, sign) => (current.has(`${sid}|${pid}`) ? sign * changeCost : 0);

  // keep the current roster's places that are allowed, in its order (a later place that clashes with an earlier one goes)
  let kept = 0;
  for (const [sid, ids] of Object.entries(o.roster ?? {})) {
    const s = st.slot.get(sid);
    if (!s) continue;
    for (const pid of ids ?? []) {
      if (!st.person.has(pid) || (st.roster.get(sid)?.length ?? 0) >= s.need || st.roster.get(sid)?.includes(pid)) continue;
      if (!effect(st, rules, sid, pid).blocked) { place(st, sid, pid); kept++; }
    }
  }

  // greedy: under minimum first, then up to need; hardest slot first, cheapest person first (ties by the seeded random)
  for (const upTo of [minOf, (/** @type {import('./model.js').Slot} */ s) => s.need]) {
    const todo = st.slots.filter(s => (st.roster.get(s.id)?.length ?? 0) < upTo(s));
    const freedom = new Map(todo.map(s => [s.id, st.people.filter(p => !st.roster.get(s.id)?.includes(p.id) && !effect(st, rules, s.id, p.id).blocked).length]));
    todo.sort((a, b) => /** @type {number} */ (freedom.get(a.id)) - /** @type {number} */ (freedom.get(b.id)));
    for (const s of todo) {
      while ((st.roster.get(s.id)?.length ?? 0) < upTo(s)) {
        let best = null, bestCost = Infinity;
        for (const p of st.people) {
          if (st.roster.get(s.id)?.includes(p.id)) continue;
          const e = effect(st, rules, s.id, p.id);
          if (e.blocked) continue;
          const c = e.cost + changeDelta(s.id, p.id, -1) + rnd() * 1e-6;
          if (c < bestCost) { bestCost = c; best = p.id; }
        }
        if (best == null) break;
        place(st, s.id, best);
      }
    }
  }

  // annealing: swap two people between slots, or put someone else in a place; never a move onto a block break
  const iterations = o.iterations ?? Math.min(20000, 40 * st.slots.reduce((n, s) => n + s.need, 0));
  let cost = totalCost(st, rules) + lost() * changeCost;
  let best = rosterOf(st), bestCost = cost;
  const T0 = costOf('soft', 1, 1), T1 = costOf('soft', 3, 1) / 100;
  let it = 0;
  for (; it < iterations; it++) {
    if (o.timeMs != null && (it & 63) === 0 && Date.now() - start > o.timeMs) break;
    const T = T0 * Math.pow(T1 / T0, it / Math.max(1, iterations));
    const placed = [...st.roster].flatMap(([sid, ids]) => ids.filter(id => !pinned.has(`${sid}|${id}`)).map(id => [sid, id]));
    if (!placed.length) break;
    const [s1, p1] = placed[Math.floor(rnd() * placed.length)];
    /** @type {[string, string][]} */ let undo;
    let delta;
    if (rnd() < 0.5 && placed.length > 1) {   // swap with another place
      const [s2, p2] = placed[Math.floor(rnd() * placed.length)];
      if (s1 === s2 || p1 === p2 || st.roster.get(s2)?.includes(p1) || st.roster.get(s1)?.includes(p2)) continue;
      const people = [p1, p2], slots = [s1, s2];
      const before = partCost(st, rules, people, slots);
      unplace(st, s1, p1); unplace(st, s2, p2); place(st, s1, p2); place(st, s2, p1);
      delta = partCost(st, rules, people, slots) - before
        + changeDelta(s1, p1, 1) + changeDelta(s2, p2, 1) + changeDelta(s1, p2, -1) + changeDelta(s2, p1, -1);
      undo = [[s1, p2], [s2, p1], [s1, p1], [s2, p2]];
    } else {   // someone else in p1's place
      const q = st.people[Math.floor(rnd() * st.people.length)].id;
      if (st.roster.get(s1)?.includes(q)) continue;
      const people = [p1, q], slots = [s1];
      const before = partCost(st, rules, people, slots);
      unplace(st, s1, p1); place(st, s1, q);
      delta = partCost(st, rules, people, slots) - before + changeDelta(s1, p1, 1) + changeDelta(s1, q, -1);
      undo = [[s1, q], [s1, p1]];
    }
    if (delta <= 0 || (delta < BLOCK && rnd() < Math.exp(-delta / T))) {
      cost += delta;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = rosterOf(st); }
    } else {
      const half = undo.length / 2;
      for (let i = 0; i < half; i++) unplace(st, undo[i][0], undo[i][1]);
      for (let i = half; i < undo.length; i++) place(st, undo[i][0], undo[i][1]);
    }
  }

  const done = stateOf(problem, best);
  const open = done.slots.map(s => ({ slot: s.id, open: s.need - (done.roster.get(s.id)?.length ?? 0) })).filter(x => x.open > 0);
  let changed = 0;
  for (const k of current) { const [sid, pid] = split(k); if (!done.roster.get(sid)?.includes(pid)) changed++; }
  return { roster: best, cost: totalCost(done, rules) + changed * changeCost, open, changed, kept, pins, ignored, iterations: it };
}

/** "slot|person" (a slot id may hold "|"; a person id may not) @param {string} k @returns {[string, string]} */
const split = k => { const i = k.lastIndexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
