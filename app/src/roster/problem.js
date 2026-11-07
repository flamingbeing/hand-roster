// A week or a month in app-roster's slot model, so the package's score, check and candidates (@core/roster) read the same
// roster and the same rule cards as the builders: a list-session or a call tier on a day is a slot, a person's key is their
// name, leave is `away`, the calls around a week are `events`, asks and call requests are `requests`. Derived fields the
// default cards name (rule-cards.js): a slot's tags (its kind, 'emergency', a call's tier, 'off-day', 'mo-tier'), its
// `teams` (its consultants' teams) and `consultants`; a person's tags ('junior', 'registrar', 'r3').
// Pure: no page, no package import (whoever scores passes the result to @core/roster; the unit tests do today).
import { addDays, monthDays, rangeDays } from './dates.js';
import { TIERS, TIER_LABEL, callMapOf, consOf, conText, dayType, isJunior, isOffDay, minOf } from './model.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./rule-cards.js').RuleCard} RuleCard */
/** @typedef {{ slots: Record<string, any>[], people: Record<string, any>[], rules: RuleCard[], away: { person: string, day: string, session?: 'AM' | 'PM' }[],
 *   events: { person: string, day: string, kind: string }[], requests: Record<string, any>[], holidays: string[] }} Problem */

/** @param {Person} p @returns {Record<string, any>} */
const personOf = p => ({
  id: p.name, grade: p.grade, rank: p.rank ?? '', site: p.site ?? '', team: p.team?.trim().toLowerCase() ?? '',
  tags: [...(isJunior(p) ? ['junior'] : []), ...(p.grade === 'reg' ? ['registrar'] : []), ...(p.rank === 'R3' ? ['r3'] : [])],
});

/** leave as away entries, one per day in `days` @param {import('./model.js').Leave[]} leave @param {string[]} days */
function awayOf(leave, days) {
  /** @type {Problem['away']} */
  const out = [];
  for (const l of leave) for (const day of days) {
    if (l.from <= day && day <= l.to) out.push({ person: l.name, day, ...(l.session === 'AM' || l.session === 'PM' ? { session: l.session } : {}) });
  }
  return out;
}

/** the cards of one topic @param {RuleCard[]} rules @param {'week' | 'calls'} topic */
const cardsOf = (rules, topic) => rules.filter(r => (r.topic ?? topic) === topic);

/**
 * A built week (buildWeek's settled lists and grid) as a problem and a roster.
 * @param {{ monday: string, lists: import('./model.js').ListSlot[], grid: import('./grid.js').GridRow[], people: Person[], leave?: import('./model.js').Leave[],
 *   calls?: import('./model.js').CallDay[], requests?: { type: string, person: string, list: string, day: string, session: string }[], holidays?: string[], rules: RuleCard[] }} o
 * @returns {{ problem: Problem, roster: Record<string, string[]> }}
 */
export function weekProblem(o) {
  const days = rangeDays(o.monday, addDays(o.monday, 4));
  const teamOf = new Map(o.people.map(p => [p.name, p.team?.trim().toLowerCase()]));
  const lists = o.lists.filter(l => days.includes(l.day));
  const slots = lists.map(l => ({
    id: l.id, day: l.day, session: l.session, need: l.status === 'open' ? l.need : 0, min: l.status === 'open' ? minOf(l) : 0, kind: l.kind,
    name: l.name, site: l.site, consultants: conText(l), teams: [...new Set(consOf(l).map(n => teamOf.get(n)).filter(t => !!t))],
    tags: [l.kind, ...(l.emergency ? ['emergency'] : [])],
  }));
  const calls = callMapOf(o.calls ?? []);
  /** @type {Problem['events']} */
  const events = [];
  for (const day of [addDays(o.monday, -1), ...days]) for (const t of TIERS) { const n = calls[day]?.[t]; if (n) events.push({ person: n, day, kind: 'call' }); }
  /** @type {Problem['requests']} */
  const requests = [];
  for (const r of o.requests ?? []) {
    if (r.type !== 'list-person') continue;
    const name = r.list.trim().toLowerCase();
    for (const l of lists) {
      if (l.day === r.day && (r.session === 'both' || r.session === l.session) && (l.id.toLowerCase() === name || l.name.trim().toLowerCase() === name)) {
        requests.push({ person: r.person, want: true, slot: l.id });
        break;
      }
    }
  }
  /** @type {Record<string, string[]>} */
  const roster = {};
  for (const g of o.grid) if (lists.some(l => l.id === g.list)) roster[g.list] = [...g.juniors];
  return {
    problem: { slots, people: o.people.map(personOf), rules: cardsOf(o.rules, 'week'), away: awayOf(o.leave ?? [], days), events, requests, holidays: o.holidays ?? [] },
    roster,
  };
}

/**
 * A month's calls as a problem and a roster: a slot per day and tier the plan has (or a call names).
 * @param {{ month: string, calls: import('./model.js').CallDay[], people: Person[], leave?: import('./model.js').Leave[], requests?: import('./model.js').CallRequest[],
 *   holidays?: string[], tiers: import('./model.js').TierPlan, prior?: import('./model.js').CallMap, after?: import('./model.js').CallMap, rules: RuleCard[] }} o
 * @returns {{ problem: Problem, roster: Record<string, string[]> }}
 */
export function callsProblem(o) {
  const days = monthDays(o.month), holidays = o.holidays ?? [];
  const calls = callMapOf(o.calls.filter(c => c.date.startsWith(`${o.month}-`)));
  /** @type {Problem['slots']} */
  const slots = [];
  /** @type {Record<string, string[]>} */
  const roster = {};
  for (const day of days) {
    const type = dayType(day, holidays);
    for (const tier of TIERS) {
      const name = calls[day]?.[tier];
      if (!o.tiers[type].includes(tier) && !name) continue;
      const id = `${day}|${tier}`;
      slots.push({ id, day, kind: 'call', tier, name: TIER_LABEL[tier], need: 1, min: 1, tags: [tier, ...(isOffDay(type) ? ['off-day'] : []), ...(tier === 'moNuh' || tier === 'moNtf' ? ['mo-tier'] : [])] });
      roster[id] = name ? [name] : [];
    }
  }
  /** @type {Problem['events']} */
  const events = [];
  for (const map of [o.prior ?? {}, o.after ?? {}]) for (const [day, row] of Object.entries(map)) for (const t of TIERS) { const n = row?.[t]; if (n) events.push({ person: n, day, kind: 'call' }); }
  const requests = (o.requests ?? []).filter(r => r.date.startsWith(`${o.month}-`))
    .map(r => (r.type === 'cannot' ? { person: r.name, want: false, day: r.date } : { person: r.name, want: true, ...(r.tier ? { slot: `${r.date}|${r.tier}` } : { day: r.date }) }));
  // a registrar on MO call tiers only is balanced with the MOs (calls.js poolOf): not tagged a registrar here either
  const people = o.people.map(p => {
    const x = personOf(p);
    if (p.grade === 'reg' && p.tiers && !p.tiers.some(t => t === 'reg' || t === 'reg2')) x.tags = x.tags.filter((/** @type {string} */ t) => t !== 'registrar');
    return x;
  });
  return { problem: { slots, people, rules: cardsOf(o.rules, 'calls'), away: awayOf((o.leave ?? []).map(l => ({ ...l, session: undefined })), days), events, requests, holidays }, roster };
}
