// The slot model: what a roster is made of, and the indexes the rules read.
//
// A slot is something that needs N people at one time: a list in a session, a call tier on a day, a clinic. A roster
// is slot id -> the ids of the people in it. People, slots and the rest are plain data; nothing here touches the DOM
// or a database, so the same code runs in a page, a Worker and node tests.

/**
 * @typedef {{ id: string, day: string, session?: string, need: number, min?: number, kind?: string, tags?: string[],
 *   [attr: string]: any }} Slot  session '' or missing = the whole day; min defaults to need
 * @typedef {{ id: string, tags?: string[], [attr: string]: any }} Person
 * @typedef {{ person: string, day: string, session?: string }} Away  leave; no session = the whole day
 * @typedef {{ person: string, day: string, session?: string, kind?: string, tags?: string[] }} Event  a duty outside
 *   the roster that rules still see (the calls when building a week, last month's calls when making this month's)
 * @typedef {{ person: string, want: boolean, slot?: string, day?: string, session?: string, kind?: string,
 *   strength?: number }} Request  want or avoid one slot (by id) or any slot that day (and session, kind)
 * @typedef {Record<string, string[]>} Roster  slot id -> person ids
 * @typedef {{ slot: string, person: string }} Pin  a placement a fill keeps whatever the rules say
 * @typedef {{ kinds?: string[], tags?: string[], sessions?: string[], days?: number[], holidays?: 'any' | 'only' | 'exclude',
 *   ids?: string[] }} Filter  which slots (or events); every condition given must hold, an empty filter takes all.
 *   days: 0 Sunday .. 6 Saturday
 * @typedef {{ tags?: string[], people?: string[], attrs?: Record<string, string[]>, not?: boolean }} Who  which people;
 *   every condition given must hold (tags: any of them), `not` turns it round; an empty Who is everyone
 * @typedef {{ slots: Slot[], people: Person[], rules: import('./rules.js').Rule[], away?: Away[], events?: Event[],
 *   requests?: Request[], holidays?: string[], sessions?: string[] }} Problem  sessions: the order inside a day
 *   (default AM, PM)
 */

const DAY_MS = 86400000;
/** @param {string} iso YYYY-MM-DD @returns {number} days since 1970-01-01 */
export const dayNumber = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS);
/** @param {number} n @returns {number} 0 Sunday .. 6 Saturday */
export const weekdayOf = n => (((n + 4) % 7) + 7) % 7;
/** @param {string} iso @param {number} n */
export const addDays = (iso, n) => new Date((dayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);

/**
 * Indexed problem plus a roster that can change in place (the fill moves people about on it).
 * @typedef {{
 *   problem: Problem,
 *   slots: Slot[], slot: Map<string, Slot>, person: Map<string, Person>, people: Person[],
 *   dn: Map<string, number>, holidays: Set<string>,
 *   roster: Map<string, string[]>, byPerson: Map<string, string[]>,
 *   away: Map<string, Map<string, Set<string>>>, events: Map<string, Event[]>, requests: Map<string, Request[]>,
 * }} State
 */

/** @param {Problem} problem @param {Roster} [roster] @returns {State} */
export function stateOf(problem, roster = {}) {
  const slots = problem.slots ?? [], people = problem.people ?? [];
  const slot = new Map(slots.map(s => [s.id, s]));
  const person = new Map(people.map(p => [p.id, p]));
  const dn = new Map();
  for (const s of slots) if (!dn.has(s.day)) dn.set(s.day, dayNumber(s.day));
  /** @type {Map<string, string[]>} */
  const r = new Map(slots.map(s => [s.id, []]));
  /** @type {Map<string, string[]>} */
  const byPerson = new Map(people.map(p => [p.id, []]));
  for (const [sid, ids] of Object.entries(roster)) {
    const list = r.get(sid);
    if (!list) continue;   // a slot that is gone
    for (const id of ids ?? []) if (person.has(id) && !list.includes(id)) { list.push(id); byPerson.get(id)?.push(sid); }
  }
  const away = new Map();
  for (const a of problem.away ?? []) {
    if (!away.has(a.person)) away.set(a.person, new Map());
    const days = away.get(a.person);
    if (!days.has(a.day)) days.set(a.day, new Set());
    days.get(a.day).add(a.session || '*');
  }
  return {
    problem, slots, slot, person, people, dn, holidays: new Set(problem.holidays ?? []), roster: r, byPerson, away,
    events: groupBy(problem.events ?? [], e => e.person), requests: groupBy(problem.requests ?? [], q => q.person),
  };
}

/** @template T @param {T[]} xs @param {(x: T) => string} key @returns {Map<string, T[]>} */
function groupBy(xs, key) {
  const m = new Map();
  for (const x of xs) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

/** @param {State} st @param {string} day */
export const dayNum = (st, day) => st.dn.get(day) ?? (st.dn.set(day, dayNumber(day)), /** @type {number} */ (st.dn.get(day)));

/** @param {State} st @param {string} sid @param {string} pid */
export function place(st, sid, pid) {
  const list = st.roster.get(sid);
  if (!list || list.includes(pid)) return false;
  list.push(pid);
  if (!st.byPerson.has(pid)) st.byPerson.set(pid, []);
  /** @type {string[]} */ (st.byPerson.get(pid)).push(sid);
  return true;
}
/** @param {State} st @param {string} sid @param {string} pid */
export function unplace(st, sid, pid) {
  const list = st.roster.get(sid), mine = st.byPerson.get(pid);
  const i = list ? list.indexOf(pid) : -1;
  if (!list || i < 0) return false;
  list.splice(i, 1);
  if (mine) { const j = mine.indexOf(sid); if (j >= 0) mine.splice(j, 1); }
  return true;
}
/** @param {State} st @returns {Roster} a plain copy, slots in input order, empty slots left out */
export function rosterOf(st) {
  /** @type {Roster} */
  const out = {};
  for (const [sid, ids] of st.roster) if (ids.length) out[sid] = [...ids];
  return out;
}

/** Whole-day items overlap every session. @param {string | undefined} a @param {string | undefined} b */
export const sameTime = (a, b) => !a || !b || a === b;

/** @param {State} st @param {string} pid @param {string} day @param {string | undefined} session */
export function isAway(st, pid, day, session) {
  const s = st.away.get(pid)?.get(day);
  if (!s) return false;
  return s.has('*') || !session || s.has(session);
}

/**
 * @param {State} st @param {Filter | undefined} f @param {{ day: string, session?: string, kind?: string, tags?: string[], id?: string }} x
 *   a slot or an event
 */
export function matches(st, f, x) {
  if (!f) return true;
  if (f.ids?.length && !(x.id && f.ids.includes(x.id))) return false;
  if (f.kinds?.length && !(x.kind && f.kinds.includes(x.kind))) return false;
  if (f.tags?.length && !(x.tags ?? []).some(t => f.tags?.includes(t))) return false;
  if (f.sessions?.length && x.session && !f.sessions.includes(x.session)) return false;
  if (f.days?.length && !f.days.includes(weekdayOf(dayNum(st, x.day)))) return false;
  if (f.holidays === 'only' && !st.holidays.has(x.day)) return false;
  if (f.holidays === 'exclude' && st.holidays.has(x.day)) return false;
  return true;
}

/** @param {Who | undefined} w @param {Person | undefined} p */
export function isWho(w, p) {
  if (!p) return false;
  if (!w) return true;
  let ok = true;
  if (w.tags?.length && !(p.tags ?? []).some(t => w.tags?.includes(t))) ok = false;
  if (ok && w.people?.length && !w.people.includes(p.id)) ok = false;
  if (ok && w.attrs) {
    for (const [k, vals] of Object.entries(w.attrs)) {
      if (!vals?.length) continue;
      const v = p[k];
      if (!(Array.isArray(v) ? v.some(x => vals.includes(x)) : vals.includes(v))) { ok = false; break; }
    }
  }
  return w.not ? !ok : ok;
}

/** Is the person someone the rule covers (its tags; none = everyone)? @param {{ tags?: string[] }} rule @param {Person | undefined} p */
export const covers = (rule, p) => !!p && (!rule.tags?.length || (p.tags ?? []).some(t => rule.tags?.includes(t)));

/** @param {Slot} s */
export const minOf = s => Math.min(s.need, s.min ?? s.need);
