// Rules for the slot model, as data. A rule is
//   { id, type, words, level: 'block'|'warn'|'soft', priority: 1|2|3, tags, on, params }
// words: the maker's own wording (empty = describeRule's); tags: the people it covers (none = everyone); on: false keeps
// it but skips it; params: per type, below.
//
// Each rule type has a scope, which says what one run of it looks at:
//   person  one person's places (and their leave, events and requests): a move only reruns the people it moves
//   slot    one slot's people
//   global  the whole roster (fair shares)
// run(st, rule, key) returns the rule's hits for that person or slot (key) or for everything (global). A hit is one
// break with where (slot, person, day), why in plain words and units (how much; cost = units x the level's weight).
//
// To add a type: give it label, scope, level (default), params (for the rule builder), describe, check (problems
// with the params, in words) and run. Keep run pure and local to its scope, or the fill's move scoring goes wrong.

import { LEVELS, levelOf, priorityOf } from '../levels.js';
import { matches, isWho, covers, isAway, sameTime, dayNum, minOf } from './model.js';

/**
 * @typedef {import('../levels.js').Level} Level
 * @typedef {import('../levels.js').Priority} Priority
 * @typedef {import('./model.js').State} State
 * @typedef {import('./model.js').Filter} Filter
 * @typedef {import('./model.js').Who} Who
 * @typedef {{ id: string, type: string, words?: string, level: Level, priority: Priority, tags?: string[], on?: boolean,
 *   params: Record<string, any> }} Rule
 * @typedef {{ rule: string, level: Level, units: number, why: string, slot?: string, person?: string, day?: string }} Hit
 * @typedef {{ key: string, kind: 'slots' | 'who' | 'int' | 'number' | 'choice' | 'keys' | 'text', label: string,
 *   choices?: string[], default?: any }} ParamSpec
 * @typedef {{ label: string, scope: 'person' | 'slot' | 'global', level: Level, params: ParamSpec[],
 *   describe: (r: Rule) => string, check: (r: Rule) => string[], run: (st: State, r: Rule, key?: string) => Hit[] }} RuleType
 */

// ---------- words ----------
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const or = (/** @type {string[]} */ xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
/** @param {Filter | undefined} f @param {string} [noun] */
export function slotWords(f, noun = 'slot') {
  if (!f) return `any ${noun}`;
  const bits = [];
  if (f.ids?.length) bits.push(or(f.ids));
  else bits.push(`${f.kinds?.length ? or(f.kinds) : 'any'} ${noun}`);
  if (f.tags?.length) bits.push(`tagged ${or(f.tags)}`);
  if (f.sessions?.length) bits.push(`in the ${or(f.sessions)}`);
  if (f.days?.length) bits.push(`on ${or(f.days.map(d => DAY_NAMES[d] ?? String(d)))}`);
  if (f.holidays === 'only') bits.push('on public holidays');
  if (f.holidays === 'exclude') bits.push('except public holidays');
  return bits.join(' ');
}
/** @param {Who | undefined} w */
export function whoWords(w) {
  if (!w) return 'anyone';
  const bits = [];
  if (w.tags?.length) bits.push(`tagged ${or(w.tags)}`);
  if (w.people?.length) bits.push(or(w.people));
  for (const [k, v] of Object.entries(w.attrs ?? {})) if (v?.length) bits.push(`${k} ${or(v)}`);
  const s = bits.length ? `people ${bits.join(', ')}` : 'anyone';
  return w.not ? `anyone but ${s.replace(/^people /, '')}` : s;
}
/** why a person can't go where only `w` may: "Ann is rank AC" (a not-rule), "Ann is not tagged registrar" @param {string} name @param {Who | undefined} w */
export function whyNot(name, w) {
  const s = whoWords(w && { ...w, not: false }).replace(/^people /, '');
  return w?.not ? `${name} is ${s}, so can't go here` : `${name} is not ${w?.people?.length && !w.tags?.length ? 'one of ' : ''}${s}`;
}
const plural = (/** @type {number} */ n, /** @type {string} */ w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** @param {State} st @param {string} sid */
const slotName = (st, sid) => { const s = st.slot.get(sid); return s ? (s.name ? `${s.name} (${s.day}${s.session ? ' ' + s.session : ''})` : sid) : sid; };
/** @param {State} st @param {string} pid */
const personName = (st, pid) => st.person.get(pid)?.name ?? pid;

/** @param {Rule} r @param {Hit[]} out @param {Partial<Hit> & { units: number, why: string }} h */
const hit = (r, out, h) => { out.push({ rule: r.id, level: r.level, ...h }); };

/** @param {State} st @param {string} pid @param {Filter | undefined} f the person's slots that match */
const mine = (st, pid, f) => (st.byPerson.get(pid) ?? []).map(sid => /** @type {import('./model.js').Slot} */ (st.slot.get(sid))).filter(s => s && matches(st, f, s));

/** @param {number | undefined} v @param {number} min @param {number} max */
const intIn = (v, min, max) => Number.isInteger(v) && /** @type {number} */ (v) >= min && /** @type {number} */ (v) <= max;

// ---------- the types ----------
/** @type {Record<string, RuleType>} */
export const RULE_TYPES = {
  cover: {
    label: 'Fill every slot',
    scope: 'slot',
    level: 'block',
    params: [{ key: 'slots', kind: 'slots', label: 'Which slots' }],
    describe: r => `Every ${slotWords(r.params.slots)} gets at least its minimum, and up to its need`,
    check: () => [],
    // under the minimum: at the rule's level; between minimum and need: a soft cost per open seat (the rule's priority); over need: the rule's level
    run(st, r, sid) {
      /** @type {Hit[]} */ const out = [];
      const s = sid ? st.slot.get(sid) : undefined;
      if (!s || !matches(st, r.params.slots, s)) return out;
      const got = st.roster.get(s.id)?.length ?? 0, min = minOf(s);
      if (got < min) hit(r, out, { slot: s.id, day: s.day, units: min - got, why: `${slotName(st, s.id)} has ${got} of at least ${min}` });
      else if (got < s.need) out.push({ rule: r.id, level: 'soft', slot: s.id, day: s.day, units: s.need - got, why: `${slotName(st, s.id)} has ${got} of ${s.need}` });
      if (got > s.need) hit(r, out, { slot: s.id, day: s.day, units: got - s.need, why: `${slotName(st, s.id)} has ${got}, more than its ${s.need}` });
      return out;
    },
  },

  away: {
    label: 'Nobody on leave',
    scope: 'person',
    level: 'block',
    params: [{ key: 'slots', kind: 'slots', label: 'Which slots' }],
    describe: r => `Nobody on leave is put on ${slotWords(r.params.slots)}`,
    check: () => [],
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      for (const s of mine(st, pid, r.params.slots)) {
        if (isAway(st, pid, s.day, s.session)) hit(r, out, { slot: s.id, person: pid, day: s.day, units: 1, why: `${personName(st, pid)} is on leave` });
      }
      return out;
    },
  },

  oneAtATime: {
    label: 'One place at a time',
    scope: 'person',
    level: 'block',
    params: [{ key: 'slots', kind: 'slots', label: 'Which slots' }],
    describe: r => `Nobody is in two ${slotWords(r.params.slots, 'slot')}s at the same time`,
    check: () => [],
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      const ss = mine(st, pid, r.params.slots);
      for (let i = 1; i < ss.length; i++) {
        const b = ss[i];
        const a = ss.slice(0, i).find(x => x.day === b.day && sameTime(x.session, b.session));
        if (a) hit(r, out, { slot: b.id, person: pid, day: b.day, units: 1, why: `${personName(st, pid)} is also in ${slotName(st, a.id)}` });
      }
      return out;
    },
  },

  sequence: {
    label: 'Rest after',
    scope: 'person',
    level: 'block',
    params: [
      { key: 'first', kind: 'slots', label: 'After' },
      { key: 'then', kind: 'slots', label: 'No' },
      { key: 'from', kind: 'int', label: 'From day', default: 1 },
      { key: 'to', kind: 'int', label: 'To day', default: 1 },
    ],
    describe(r) {
      const { from = 1, to = 1 } = r.params;
      const when = from === 0 && to === 0 ? 'the same day' : from === to ? `${from === 1 ? 'the next day' : `on day ${from}`}` : `from day ${from} to day ${to}`;
      return `After ${slotWords(r.params.first, 'duty')}, no ${slotWords(r.params.then)} ${when}`;
    },
    check: r => [
      ...(intIn(r.params.from ?? 1, -14, 14) && intIn(r.params.to ?? 1, -14, 14) ? [] : ['Days must be whole numbers from -14 to 14']),
      ...((r.params.from ?? 1) > (r.params.to ?? 1) ? ['"From day" is after "To day"'] : []),
    ],
    // pairs (first, then) of the person's places and events with then - first in [from, to] days; two events alone are
    // never a break (neither is the roster's). Each pair is one hit, on the later-placed slot (the "then" if it is a slot)
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      const from = r.params.from ?? 1, to = r.params.to ?? 1;
      const slots = (st.byPerson.get(pid) ?? []).map(sid => st.slot.get(sid)).filter(s => !!s).map(s => ({ x: /** @type {any} */ (s), slot: true }));
      const items = [...slots, ...(st.events.get(pid) ?? []).map(e => ({ x: /** @type {any} */ (e), slot: false }))];
      const firsts = items.filter(i => matches(st, r.params.first, i.x)), thens = items.filter(i => matches(st, r.params.then, i.x));
      for (const t of thens) {
        const tn = dayNum(st, t.x.day);
        for (const f of firsts) {
          if (f === t || (!f.slot && !t.slot)) continue;
          const gap = tn - dayNum(st, f.x.day);
          if (gap < from || gap > to) continue;
          const at = t.slot ? t.x : f.x, other = t.slot ? f.x : t.x;
          const otherName = f.slot && t.slot ? slotName(st, other.id) : `${other.kind ?? 'a duty'} on ${other.day}${other.session ? ' ' + other.session : ''}`;
          hit(r, out, { slot: at.id, person: pid, day: at.day, units: 1, why: `${personName(st, pid)}: too close to ${otherName}` });
          break;
        }
      }
      return out;
    },
  },

  eligible: {
    label: 'Who may take',
    scope: 'person',
    level: 'block',
    params: [
      { key: 'slots', kind: 'slots', label: 'Which slots' },
      { key: 'who', kind: 'who', label: 'Only' },
      { key: 'weight', kind: 'number', label: 'Weight (soft)', default: 1 },
    ],
    describe: r => (r.level === 'soft'
      ? `Prefer ${whoWords(r.params.who)} on ${slotWords(r.params.slots)}`
      : `Only ${whoWords(r.params.who)} on ${slotWords(r.params.slots)}`),
    check: () => [],
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      const p = pid ? st.person.get(pid) : undefined;
      if (!pid || !covers(r, p) || isWho(r.params.who, p)) return out;
      for (const s of mine(st, pid, r.params.slots)) hit(r, out, { slot: s.id, person: pid, day: s.day, units: 1, why: whyNot(personName(st, pid), r.params.who) });
      return out;
    },
  },

  leads: {
    label: 'Needs one of',
    scope: 'slot',
    level: 'warn',
    params: [
      { key: 'slots', kind: 'slots', label: 'Which slots' },
      { key: 'who', kind: 'who', label: 'Needs' },
      { key: 'count', kind: 'int', label: 'How many', default: 1 },
    ],
    describe: r => `Each ${slotWords(r.params.slots)} has ${r.params.count > 1 ? `${r.params.count} of ` : ''}${whoWords(r.params.who)}`,
    check: r => (intIn(r.params.count ?? 1, 1, 99) ? [] : ['"How many" must be a whole number from 1']),
    run(st, r, sid) {
      /** @type {Hit[]} */ const out = [];
      const s = sid ? st.slot.get(sid) : undefined;
      if (!s || s.need < 1 || !matches(st, r.params.slots, s)) return out;
      const want = Math.min(r.params.count ?? 1, s.need);
      const got = (st.roster.get(s.id) ?? []).filter(id => isWho(r.params.who, st.person.get(id))).length;
      if (got < want) hit(r, out, { slot: s.id, day: s.day, units: want - got, why: `${slotName(st, s.id)} has no${want > 1 ? ` ${want}` : ''} ${whoWords(r.params.who)}` });
      return out;
    },
  },

  match: {
    label: 'Same as the slot',
    scope: 'person',
    level: 'soft',
    params: [
      { key: 'slots', kind: 'slots', label: 'Which slots' },
      { key: 'personKey', kind: 'text', label: "Person's field", default: 'site' },
      { key: 'slotKey', kind: 'text', label: "Slot's field", default: 'site' },
      { key: 'weight', kind: 'number', label: 'Weight (soft)', default: 1 },
    ],
    describe: r => `People go to ${slotWords(r.params.slots)} with the same ${r.params.slotKey || 'site'} as their ${r.params.personKey || 'site'}`,
    check: r => (r.params.personKey && r.params.slotKey ? [] : ['Pick both fields']),
    // a break only when both sides have a value (an empty field matches anything); a slot's list value matches any of it
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      const p = pid ? st.person.get(pid) : undefined;
      if (!pid || !p || !covers(r, p)) return out;
      const pv = p[r.params.personKey];
      if (pv == null || pv === '') return out;
      for (const s of mine(st, pid, r.params.slots)) {
        const sv = s[r.params.slotKey];
        if (sv == null || sv === '' || (Array.isArray(sv) ? !sv.length || sv.includes(pv) : sv === pv)) continue;
        hit(r, out, { slot: s.id, person: pid, day: s.day, units: 1, why: `${personName(st, pid)} (${pv}) on ${slotName(st, s.id)} (${sv})` });
      }
      return out;
    },
  },

  limit: {
    label: 'How many each',
    scope: 'person',
    level: 'block',
    params: [
      { key: 'slots', kind: 'slots', label: 'Which slots' },
      { key: 'per', kind: 'choice', label: 'Per', choices: ['day', 'week', 'month', 'all'], default: 'week' },
      { key: 'min', kind: 'int', label: 'At least' },
      { key: 'max', kind: 'int', label: 'At most' },
    ],
    describe(r) {
      const { min, max, per = 'week' } = r.params, what = slotWords(r.params.slots);
      const span = per === 'all' ? 'in all' : `a ${per}`;
      if (min != null && max != null) return `Each person gets ${min} to ${max} of ${what} ${span}`;
      if (max != null) return `Each person gets at most ${max} of ${what} ${span}`;
      return `Each person gets at least ${min ?? 0} of ${what} ${span}`;
    },
    check: r => [
      ...(r.params.min == null && r.params.max == null ? ['Give "At least" or "At most"'] : []),
      ...(r.params.min != null && r.params.max != null && r.params.min > r.params.max ? ['"At least" is more than "At most"'] : []),
    ],
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      const per = r.params.per ?? 'week', { min, max } = r.params;
      /** @type {Map<string, import('./model.js').Slot[]>} */
      const groups = new Map();
      const keyOf = (/** @type {string} */ day) => (per === 'day' ? day : per === 'month' ? day.slice(0, 7) : per === 'all' ? '' : String(dayNum(st, day) - ((dayNum(st, day) + 3) % 7)));
      for (const s of mine(st, pid, r.params.slots)) { const k = keyOf(s.day); if (!groups.has(k)) groups.set(k, []); groups.get(k)?.push(s); }
      if (min != null) {   // "at least" counts over the periods the roster has slots in
        for (const s of st.slots) { if (!matches(st, r.params.slots, s)) continue; const k = keyOf(s.day); if (!groups.has(k)) groups.set(k, []); }
      }
      for (const [, ss] of groups) {
        const n = ss.length;
        if (max != null && n > max) {
          const at = ss[ss.length - 1];
          hit(r, out, { slot: at.id, person: pid, day: at.day, units: n - max, why: `${personName(st, pid)} has ${n}, more than ${max}` });
        }
        if (min != null && n < min) hit(r, out, { person: pid, ...(ss[0] ? { day: ss[0].day } : {}), units: min - n, why: `${personName(st, pid)} has ${n}, fewer than ${min}` });
      }
      return out;
    },
  },

  requests: {
    label: 'Requests',
    scope: 'person',
    level: 'soft',
    params: [{ key: 'kind', kind: 'choice', label: 'Which requests', choices: ['want', 'avoid'], default: 'want' }],
    describe: r => (r.params.kind === 'avoid' ? 'Nobody is put where they asked not to be' : 'People get the places they asked for'),
    check: () => [],
    // units = the request's strength (default 1); a want is kept by any place that matches it
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      const want = r.params.kind !== 'avoid';
      const ss = (st.byPerson.get(pid) ?? []).map(sid => st.slot.get(sid)).filter(s => !!s);
      for (const q of st.requests.get(pid) ?? []) {
        if (!!q.want !== want) continue;
        const fits = (/** @type {import('./model.js').Slot} */ s) => (q.slot ? s.id === q.slot
          : (!q.day || s.day === q.day) && (!q.session || !s.session || s.session === q.session) && (!q.kind || s.kind === q.kind));
        const where = q.slot ? slotName(st, q.slot) : [q.kind, q.day, q.session].filter(Boolean).join(' ');
        const units = q.strength ?? 1;
        if (want && !ss.some(s => fits(/** @type {import('./model.js').Slot} */ (s)))) {
          hit(r, out, { person: pid, ...(q.slot ? { slot: q.slot } : {}), ...(q.day ? { day: q.day } : {}), units, why: `${personName(st, pid)} asked for ${where}` });
        }
        if (!want) for (const s of ss) if (s && fits(s)) hit(r, out, { slot: s.id, person: pid, day: s.day, units, why: `${personName(st, pid)} asked not to have ${where}` });
      }
      return out;
    },
  },

  keep: {
    label: 'Keep together',
    scope: 'person',
    level: 'soft',
    params: [
      { key: 'from', kind: 'text', label: 'From session', default: 'AM' },
      { key: 'to', kind: 'text', label: 'To session', default: 'PM' },
      { key: 'same', kind: 'keys', label: 'Same', default: ['name'] },
      { key: 'weight', kind: 'number', label: 'Weight (soft)', default: 1 },
    ],
    describe: r => `Someone on a slot in the ${r.params.from || 'AM'} stays on the same one (same ${or(r.params.same ?? ['name'])}) in the ${r.params.to || 'PM'}`,
    check: r => ((r.params.same ?? []).length ? [] : ['Pick at least one field to match']),
    // a break: in the "to" session the person is on a slot other than the one matching their "from" slot, which exists
    run(st, r, pid) {
      /** @type {Hit[]} */ const out = [];
      if (!pid || !covers(r, st.person.get(pid))) return out;
      const from = r.params.from || 'AM', to = r.params.to || 'PM', same = r.params.same ?? ['name'];
      const ss = (st.byPerson.get(pid) ?? []).map(sid => st.slot.get(sid)).filter(s => !!s);
      for (const b of ss) {
        if (!b || b.session !== to) continue;
        const a = ss.find(x => x && x.day === b.day && x.session === from);
        if (!a) continue;
        const twin = (/** @type {any} */ x) => same.every((/** @type {string} */ k) => JSON.stringify(x[k] ?? null) === JSON.stringify(a[k] ?? null));
        if (twin(b)) continue;
        if (!st.slots.some(x => x.day === b.day && x.session === to && twin(x))) continue;
        hit(r, out, { slot: b.id, person: pid, day: b.day, units: 1, why: `${personName(st, pid)} moves from ${slotName(st, a.id)}` });
      }
      return out;
    },
  },

  balance: {
    label: 'Share fairly',
    scope: 'global',
    level: 'soft',
    params: [
      { key: 'slots', kind: 'slots', label: 'Which slots' },
      { key: 'who', kind: 'who', label: 'Among' },
      { key: 'weekend', kind: 'number', label: 'A weekend counts', default: 1 },
      { key: 'holiday', kind: 'number', label: 'A public holiday counts', default: 1 },
      { key: 'weight', kind: 'number', label: 'Weight (soft)', default: 1 },
    ],
    describe: r => `Share ${slotWords(r.params.slots)}s fairly among ${whoWords(r.params.who)}${(r.params.weekend ?? 1) !== 1 || (r.params.holiday ?? 1) !== 1 ? ' (weekends and holidays count more)' : ''}`,
    check: () => [],
    // units per person = (their count - the average)^2; a person's `share` (0-1, default 1) scales what is fair for them
    run(st, r) {
      /** @type {Hit[]} */ const out = [];
      const among = st.people.filter(p => covers(r, p) && isWho(r.params.who, p));
      if (among.length < 2) return out;
      const we = r.params.weekend ?? 1, ho = r.params.holiday ?? 1;
      const worth = (/** @type {import('./model.js').Slot} */ s) => {
        if (st.holidays.has(s.day)) return ho;
        const wd = (dayNum(st, s.day) + 4) % 7;
        return wd === 0 || wd === 6 ? we : 1;
      };
      const count = among.map(p => mine(st, p.id, r.params.slots).reduce((n, s) => n + worth(s), 0));
      const shares = among.map(p => (typeof p.share === 'number' && p.share >= 0 ? p.share : 1));
      const total = count.reduce((a, b) => a + b, 0), shareSum = shares.reduce((a, b) => a + b, 0) || 1;
      among.forEach((p, i) => {
        const fair = (total * shares[i]) / shareSum, d = count[i] - fair;
        if (Math.abs(d) < 1e-9) return;
        hit(r, out, { person: p.id, units: d * d, why: `${personName(st, p.id)} has ${round(count[i])}, fair is ${round(fair)}` });
      });
      return out;
    },
  },
};
const round = (/** @type {number} */ n) => Math.round(n * 10) / 10;

// ---------- rule data ----------
let seq = 0;
const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** A fresh rule of a type with its defaults. @param {string} type @param {Partial<Rule>} [over] @returns {Rule} */
export function newRule(type, over = {}) {
  const t = RULE_TYPES[type];
  if (!t) throw new Error(`unknown rule type ${type}`);
  /** @type {Record<string, any>} */
  const params = {};
  for (const p of t.params) if (p.default !== undefined) params[p.key] = JSON.parse(JSON.stringify(p.default));
  return normalizeRule({ id: newId(), type, words: '', level: t.level, priority: 2, tags: [], on: true, params, ...over, ...(over.params ? { params: { ...params, ...over.params } } : {}) });
}

/** Any stored rule into the full shape (unknown fields kept). @param {any} r @returns {Rule} */
export function normalizeRule(r) {
  const t = RULE_TYPES[r?.type];
  return {
    ...r,
    id: String(r?.id ?? newId()),
    type: String(r?.type ?? ''),
    words: typeof r?.words === 'string' ? r.words : '',
    level: LEVELS.includes(r?.level) ? r.level : t?.level ?? 'soft',
    priority: priorityOf(r?.priority),
    tags: Array.isArray(r?.tags) ? r.tags.map(String) : [],
    on: r?.on !== false,
    params: r?.params && typeof r.params === 'object' ? r.params : {},
  };
}

/** The rule in plain words: the maker's own, else the type's. @param {Rule} r */
export function describeRule(r) {
  if (r.words) return r.words;
  const t = RULE_TYPES[r.type];
  if (!t) return `Unknown rule (${r.type})`;
  const base = t.describe(r);
  return r.tags?.length ? `${base} (for people tagged ${or(r.tags)})` : base;
}

/** Problems with a rule, in words (empty = fine). @param {Rule} r @returns {string[]} */
export function validateRule(r) {
  const t = RULE_TYPES[r.type];
  if (!t) return [`Unknown rule type "${r.type}"`];
  return [
    ...(LEVELS.includes(levelOf(r.level)) && r.level === levelOf(r.level) ? [] : ['Level must be block, warn or soft']),
    ...([1, 2, 3].includes(r.priority) ? [] : ['Priority must be 1, 2 or 3']),
    ...t.check(r),
  ];
}
