// The roster's rules as cards: every rule the week builder and the call maker keep, as data in app-roster's rule shape
// ({ id, type, words, level, priority, tags, on, params }, the package README "Rule types"), plus `topic` (week or calls)
// and `fixed` (the builder always keeps it; it cannot be turned off yet). The defaults below are what the builders did
// before rules were data, so the same seed still gives the same week and the same calls. Cards a maker saved
// (spaces/_/rules, data/rules.js) replace the default with the same id; others are added after the defaults.
//
// params hold the package's own fields (so app-roster's score, check and candidates read the same card) and, where the
// builder weighs a choice, `points`: what week.js adds to a person's score for a place (lowest wins) or what calls.js
// multiplies a cost by. Pure: no page, no package import (the package checks these cards in the unit tests).

/** @typedef {'block' | 'warn' | 'soft'} Level */
/** @typedef {{ id: string, type: string, words?: string, level: Level, priority: 1 | 2 | 3, tags?: string[], on?: boolean,
 *   params: Record<string, any>, topic?: 'week' | 'calls', fixed?: boolean }} RuleCard */


const CALL = { kinds: ['call'] };
/** @param {Partial<RuleCard> & { id: string, type: string, level: Level }} c @returns {RuleCard} */
const card = c => ({ words: '', priority: 2, tags: [], on: true, params: {}, ...c });

/** @type {RuleCard[]} */
export const DEFAULT_RULES = [
  // ---- the week ----
  card({ id: 'week-leave', topic: 'week', type: 'away', level: 'block', fixed: true, priority: 1, params: { slots: {} } }),
  card({ id: 'week-on-call', topic: 'week', type: 'sequence', level: 'block', fixed: true, priority: 1,
    words: 'Nobody on call that day is on a list (they show as free, on call)', params: { first: CALL, then: {}, from: 0, to: 0 } }),
  // then.sessions ['PM']: post-call takes the PM only; [] (any session) takes the whole day
  card({ id: 'week-post-call', topic: 'week', type: 'sequence', level: 'block', priority: 1,
    params: { first: CALL, then: { sessions: ['PM'] }, from: 1, to: 1 } }),
  card({ id: 'week-holiday', topic: 'week', type: 'limit', level: 'block', fixed: true, priority: 1,
    words: 'A public holiday closes the day\'s lists: nobody is rostered', params: { slots: { holidays: 'only' }, per: 'day', max: 0 } }),
  card({ id: 'week-one-place', topic: 'week', type: 'oneAtATime', level: 'block', fixed: true, priority: 1,
    words: 'One list a session each; a consultant running a list that session is not placed on another', params: { slots: {} } }),
  card({ id: 'week-cover', topic: 'week', type: 'cover', level: 'block', fixed: true, priority: 1,
    words: 'Every open list gets at least its minimum, then up to its need (minimums first, then a registrar for each emergency slot, then the extras, then an emergency slot\'s MO)',
    params: { slots: {} } }),
  card({ id: 'week-ac', topic: 'week', type: 'eligible', level: 'block', fixed: true, priority: 1,
    words: 'ACs are never filled in as juniors (they still take calls and are post-call)', params: { slots: {}, who: { attrs: { rank: ['AC'] }, not: true } } }),
  card({ id: 'week-own-limits', topic: 'week', type: 'eligible', level: 'block', fixed: true, priority: 1,
    words: 'People\'s own limits hold: their site only, by hand only, the sessions they work, clinics only (People tab)', params: { slots: {}, who: {} } }),
  card({ id: 'week-leads', topic: 'week', type: 'leads', level: 'warn', fixed: true, priority: 1,
    words: 'A registrar leads every MSP list and emergency slot (registrars are held back for them)', params: { slots: { tags: ['msp', 'emergency'] }, who: { tags: ['registrar'] }, count: 1 } }),
  card({ id: 'week-leads-hot', topic: 'week', type: 'leads', level: 'warn', fixed: true, priority: 1,
    words: 'A registrar or an R3 leads every HOT clinic', params: { slots: { kinds: ['hot'] }, who: { tags: ['registrar', 'r3'] }, count: 1 } }),
  card({ id: 'week-asks', topic: 'week', type: 'requests', level: 'soft', priority: 1,
    words: 'People asked for a list get it first (site, by-hand and works-on limits don\'t apply to an ask)', params: { kind: 'want' } }),
  card({ id: 'week-keep', topic: 'week', type: 'keep', level: 'soft', priority: 1,
    words: 'A list\'s PM keeps its AM juniors (same list name, site, consultant and kind)', params: { from: 'AM', to: 'PM', same: ['name', 'site', 'consultants', 'kind'] } }),
  card({ id: 'week-balance', topic: 'week', type: 'balance', level: 'soft', priority: 2,
    words: 'Sessions are shared evenly across the week', params: { slots: {}, who: { tags: ['junior'] }, points: 3 } }),
  card({ id: 'week-balance-ot', topic: 'week', type: 'balance', level: 'soft', priority: 2,
    words: 'OT and MSP lists are shared evenly', params: { slots: { kinds: ['ot', 'msp'] }, who: { tags: ['junior'] }, points: 1.5 } }),
  card({ id: 'week-balance-clinic', topic: 'week', type: 'balance', level: 'soft', priority: 2,
    words: 'Clinics are shared evenly', params: { slots: { kinds: ['clinic', 'hot'] }, who: { tags: ['junior'] }, points: 1.5 } }),
  card({ id: 'week-reg-ot', topic: 'week', type: 'eligible', level: 'soft', priority: 2,
    params: { slots: { kinds: ['ot', 'msp'] }, who: { attrs: { grade: ['reg'] } }, points: 4 } }),
  card({ id: 'week-mo-clinic', topic: 'week', type: 'eligible', level: 'soft', priority: 2,
    params: { slots: { kinds: ['clinic', 'hot'] }, who: { attrs: { grade: ['mo'] } }, points: 2 } }),
  card({ id: 'week-site', topic: 'week', type: 'match', level: 'soft', priority: 2,
    words: 'People go to lists at their own site (NUH or NTFGH)', params: { slots: {}, personKey: 'site', slotKey: 'site', points: 2 } }),
  card({ id: 'week-am-site', topic: 'week', type: 'keep', level: 'soft', priority: 3,
    words: 'In the PM, someone stays at the site they were at in the AM', params: { from: 'AM', to: 'PM', same: ['site'], points: 1.5 } }),
  card({ id: 'week-team', topic: 'week', type: 'match', level: 'soft', priority: 3,
    words: 'A junior goes with a consultant of their own team (only between people every other rule scores the same)',
    params: { slots: {}, personKey: 'team', slotKey: 'teams', points: 0.25 } }),

  // ---- the month's calls ----
  card({ id: 'calls-leave', topic: 'calls', type: 'away', level: 'block', fixed: true, priority: 1, params: { slots: CALL } }),
  card({ id: 'calls-one-tier', topic: 'calls', type: 'oneAtATime', level: 'block', fixed: true, priority: 1,
    words: 'Nobody is on two call tiers the same day', params: { slots: CALL } }),
  card({ id: 'calls-cannot', topic: 'calls', type: 'requests', level: 'block', fixed: true, priority: 1,
    words: 'Nobody is on call on a day they said they cannot', params: { kind: 'avoid' } }),
  card({ id: 'calls-tiers', topic: 'calls', type: 'eligible', level: 'block', fixed: true, priority: 1,
    words: 'Only people who may take a tier are on it (People tab: grade, MO calls only, no calls, site only)', params: { slots: CALL, who: {} } }),
  // to: the clear days between one person's calls (a month's own "Days clear" setting wins over it)
  card({ id: 'calls-gap', topic: 'calls', type: 'sequence', level: 'block', priority: 1,
    words: '', params: { first: CALL, then: CALL, from: 1, to: 2 } }),
  card({ id: 'calls-share', topic: 'calls', type: 'balance', level: 'soft', priority: 2,
    words: 'Calls are shared evenly, scaled to the days each person is around', params: { slots: CALL, who: {}, points: 1 } }),
  card({ id: 'calls-share-off', topic: 'calls', type: 'balance', level: 'soft', priority: 2,
    words: 'Weekend and public holiday calls are shared evenly', params: { slots: { kinds: ['call'], tags: ['off-day'] }, who: {}, points: 1.5 } }),
  card({ id: 'calls-tier-spread', topic: 'calls', type: 'balance', level: 'soft', priority: 3,
    words: 'Each person\'s calls are spread over the tiers they take', params: { slots: CALL, who: {}, per: 'tier', points: 0.3 } }),
  card({ id: 'calls-spacing', topic: 'calls', type: 'sequence', level: 'soft', priority: 3,
    words: 'Calls are spaced out beyond the clear days', params: { first: CALL, then: CALL, from: 1, to: 4, points: 0.4 } }),
  card({ id: 'calls-want', topic: 'calls', type: 'requests', level: 'soft', priority: 1,
    words: 'People get the call days they asked for', params: { kind: 'want', points: 5 } }),
  card({ id: 'calls-grade', topic: 'calls', type: 'eligible', level: 'soft', priority: 2,
    words: 'Registrars are kept off the MO tiers', params: { slots: { kinds: ['call'], tags: ['mo-tier'] }, who: { tags: ['registrar'], not: true }, points: 1.5 } }),
];

const BY_ID = new Map(DEFAULT_RULES.map(c => [c.id, c]));

/**
 * The cards in force: the defaults, each replaced by a saved card with its id (a fixed default keeps its type, level and
 * on), then the maker's own cards. A deleted saved card brings its default back.
 * @param {Partial<RuleCard>[]} [saved] @returns {RuleCard[]}
 */
export function rulesOf(saved = []) {
  /** @type {Map<string, Partial<RuleCard>>} */
  const mine = new Map();
  for (const r of saved) if (r && typeof r.id === 'string' && !(/** @type {any} */ (r)._deleted)) mine.set(r.id, r);
  const out = DEFAULT_RULES.map(d => {
    const s = mine.get(d.id);
    if (!s) return d;
    const merged = { ...d, ...s, params: { ...d.params, ...(s.params ?? {}) }, topic: d.topic, fixed: d.fixed };
    return d.fixed ? { ...merged, type: d.type, level: d.level, on: true } : merged;
  });
  for (const [id, s] of mine) if (!BY_ID.has(id) && typeof s.type === 'string') out.push(card(/** @type {any} */ ({ level: 'soft', ...s, id })));
  return out;
}

/** @param {RuleCard[]} rules @param {string} id */
const find = (rules, id) => rules.find(r => r.id === id) ?? /** @type {RuleCard} */ (BY_ID.get(id));
/** a card's points, 0 when it is off @param {RuleCard[]} rules @param {string} id */
const pts = (rules, id) => { const r = find(rules, id); return r.on === false ? 0 : Number(r.params?.points ?? /** @type {any} */ (BY_ID.get(id)).params.points) || 0; };
/** @param {RuleCard[]} rules @param {string} id */
const isOn = (rules, id) => find(rules, id).on !== false;

/**
 * @typedef {object} WeekRules  what buildWeek takes from the cards (week.js)
 * @property {boolean} postCall  the day after a call is post-call (week-post-call on)
 * @property {boolean} postCallAm  post-call people can still work the AM
 * @property {boolean} asks  asked-for people first
 * @property {boolean} keep  a list's PM keeps its AM juniors
 * @property {{ sessions: number, ot: number, clinic: number, regOt: number, moClinic: number, site: number, amSite: number, team: number }} points
 */

/** @param {RuleCard[]} [rules] the cards in force (rulesOf) @returns {WeekRules} */
export function weekRules(rules = DEFAULT_RULES) {
  const pc = find(rules, 'week-post-call');
  const then = pc.on === false ? null : pc.params?.then;
  return {
    // off: post-call takes nothing; then.sessions naming only PM: the PM; anything else (no sessions, or AM too): the whole day
    postCallAm: then == null ? true : Array.isArray(then.sessions) && then.sessions.length > 0 && !then.sessions.includes('AM'),
    postCall: then != null,
    asks: isOn(rules, 'week-asks'),
    keep: isOn(rules, 'week-keep'),
    points: {
      sessions: pts(rules, 'week-balance'), ot: pts(rules, 'week-balance-ot'), clinic: pts(rules, 'week-balance-clinic'),
      regOt: pts(rules, 'week-reg-ot'), moClinic: pts(rules, 'week-mo-clinic'), site: pts(rules, 'week-site'),
      amSite: pts(rules, 'week-am-site'), team: pts(rules, 'week-team'),
    },
  };
}

/**
 * @typedef {object} CallRules  what solveCalls takes from the cards (calls.js)
 * @property {number} minGap  clear days between one person's calls (a month's own setting wins)
 * @property {{ total: number, weekend: number, tier: number, spread: number, want: number, grade: number }} points
 */

/** @param {RuleCard[]} [rules] the cards in force (rulesOf) @returns {CallRules} */
export function callRules(rules = DEFAULT_RULES) {
  const gap = find(rules, 'calls-gap');
  const to = Number(gap.params?.to);
  return {
    minGap: gap.on === false ? 1 : Number.isInteger(to) && to >= 1 && to <= 7 ? to : 2,
    points: {
      total: pts(rules, 'calls-share'), weekend: pts(rules, 'calls-share-off'), tier: pts(rules, 'calls-tier-spread'),
      spread: pts(rules, 'calls-spacing'), want: pts(rules, 'calls-want'), grade: pts(rules, 'calls-grade'),
    },
  };
}
