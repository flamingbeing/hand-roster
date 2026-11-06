// What is true of a month's calls as they stand (after a "Make calls" or a hand edit): how many each person has, what breaks a
// rule, and which tiers have nobody. The rules are the solver's (calls.js), asked to judge the calls as they are, not to change them. Pure.
import { solveCalls, zeroTiers } from './calls.js';
import { callMapIn } from './sections.js';
import { monthDays } from './dates.js';
import { DEFAULT_TIER_PLAN, TIERS, canTake, dayType, isOffDay } from './model.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Tier} Tier */

/**
 * @param {{ month: string, calls: import('./model.js').CallDay[], people: Person[], leave?: import('./model.js').Leave[], requests?: import('./model.js').CallRequest[],
 *   holidays?: string[], minGap?: number, prior?: import('./model.js').CallMap, tiers?: import('./model.js').TierPlan }} o
 * @returns {{ counts: { name: string, grade: string, total: number, weekend: number, tiers: Record<Tier, number> }[],
 *   problems: { date: string, tier: Tier, name?: string | null, rule: string, text: string }[], empty: { date: string, tier: Tier }[] }}
 */
export function checkCalls(o) {
  const plan = o.tiers ?? DEFAULT_TIER_PLAN, holidays = o.holidays ?? [];
  const map = callMapIn(o.calls, o.month);
  // judge the entered calls only: an empty tier is reported as empty, not filled in
  const res = solveCalls({ month: o.month, people: o.people, leave: o.leave, requests: o.requests, holidays, minGap: o.minGap, prior: o.prior, tiers: plan, locked: map, iterations: 0, fill: false });
  const problems = res.problems.filter(p => p.rule !== 'unfilled' && p.rule !== 'want' && !!p.name && map[p.date]?.[p.tier] === p.name);
  /** @type {{ date: string, tier: Tier }[]} */
  const empty = [];
  /** @type {Map<string, { total: number, weekend: number, tiers: Record<Tier, number> }>} */
  const by = new Map();
  for (const p of o.people) if (TIERS.some(t => canTake(p, t))) by.set(p.name, { total: 0, weekend: 0, tiers: zeroTiers() });
  for (const date of monthDays(o.month)) {
    const type = dayType(date, holidays);
    for (const t of TIERS) {
      const name = map[date]?.[t];
      if (!name) { if (plan[type].includes(t)) empty.push({ date, tier: t }); continue; }
      const c = by.get(name);
      if (!c) continue;
      c.total++; c.tiers[t]++; if (isOffDay(type)) c.weekend++;
    }
  }
  const order = { con: 0, reg: 1, mo: 2 };
  const counts = [...by].map(([name, c]) => ({ name, grade: o.people.find(p => p.name === name)?.grade ?? 'mo', ...c }))
    .sort((a, b) => (order[/** @type {'con'} */ (a.grade)] ?? 3) - (order[/** @type {'con'} */ (b.grade)] ?? 3) || a.name.localeCompare(b.name));
  return { counts, problems, empty };
}
