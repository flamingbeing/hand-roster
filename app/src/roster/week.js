// The weekly grid builder. From one week's list templates, the month's calls and the leave it fills every list's juniors
// for each weekday's AM and PM and works out the rest of the CORE sheet's sections: LEAVE, POST-CALL and FREE.
// Rules (from the sample roster): someone on leave is out for the leave's session; a call makes the person FREE the whole
// day ("on call"); the day after a call is post-call, which takes the PM only (the AM can still be rostered, `postCallAm:
// false` takes the whole day); a public holiday closes the day's lists and a consultant away closes their clinics but keeps
// their OT as an emergency slot (settle.js); only 'open' lists take juniors. When there are too few juniors the order is the
// owner's (6 Nov 2026): every list's minimum first (elective OT, MSP, HOT and clinics alike: none can be left; an MSP's
// minimum includes a registrar), then a
// registrar for each emergency slot, then the lists' extras (a second OT or MSP junior), then an emergency slot's MO.
// Registrars are preferred on OT and MSP lists, MOs on clinics; sessions are balanced across the week; a list's PM keeps
// its AM juniors. Deterministic from the seed. Pure: no page, no clock.
import { addDays, mondayOf, rangeDays } from './dates.js';
import { TIERS, callMapOf, canWork, conText, consOf, isJunior, worksOn, leaveIndex, leads, minOf, regLed, settleLists } from './model.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').Leave} Leave */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./model.js').CallDay} CallDay */
/** @typedef {import('./model.js').Session} Session */

/**
 * @typedef {object} WeekOptions
 * @property {string} [monday]  the week's Monday (default: the Monday of the first list's day)
 * @property {ListSlot[]} lists  every list of the week, any order (one row per day and session)
 * @property {Person[]} people
 * @property {Leave[]} [leave]
 * @property {CallDay[]} [calls]  the month's calls; the day before the week counts for post-call
 * @property {{ type: 'list-person', person: string, list: string, day: string, session: Session | 'both' }[]} [requests]  a person asked for a list
 * @property {{ type: 'list-need', list: string, day: string, session: Session | 'both', need: number }[]} [needs]  a list wants a different number of juniors
 * @property {string[]} [holidays]  public holidays: their lists close and nobody is free or rostered
 * @property {boolean} [postCallAm]  post-call people can still work the AM (default true)
 * @property {number} [seed]
 *
 * @typedef {{ list: string, juniors: string[] }} Placement
 * @typedef {{ name: string, when: 'AM' | 'PM' | 'FULL DAY', why?: string }} FreeEntry
 * @typedef {{ list: string, day: string, session: Session, need: number, min: number, got: number, noReg?: boolean }} Shortfall  got < min
 *   or noReg (an emergency slot with no registrar): short; else fewer than it wants (an emergency slot's missing MO is not one)
 * @typedef {object} WeekResult
 * @property {string[]} days  the weekdays Mon..Fri
 * @property {Record<string, Record<Session, Placement[]>>} grid
 * @property {ListSlot[]} lists  the input lists with closed clinics and juniors-needed settled
 * @property {Record<string, string[]>} leave  who is on leave each day
 * @property {Record<string, string[]>} postCall
 * @property {Record<string, FreeEntry[]>} free
 * @property {Record<string, string[]>} onCall
 * @property {Record<string, { sessions: number, ot: number, clinic: number }>} stats
 * @property {Shortfall[]} problems
 */

/** @param {number} a */
function rng(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const KIND_ORDER = { ot: 0, msp: 1, hot: 2, clinic: 3 };

/**
 * @param {WeekOptions} o
 * @returns {WeekResult}
 */
export function buildWeek(o) {
  const rnd = rng(o.seed ?? 1);
  const monday = o.monday ?? mondayOf([...o.lists].map(l => l.day).sort()[0] ?? '1970-01-05');
  const days = rangeDays(monday, addDays(monday, 4));
  const lv = leaveIndex(o.leave ?? []);
  const calls = callMapOf(o.calls ?? []);
  const postCallAm = o.postCallAm ?? true;
  const juniors = o.people.filter(isJunior);
  const holidays = o.holidays ?? [];
  /** @param {string} day @returns {string[]} */
  const onCallOn = day => TIERS.map(t => calls[day]?.[t]).filter(/** @returns {n is string} */ n => !!n);

  // lists: a request for a different number first, then status, need and minimum settled (settle.js)
  const lists = settleLists(o.lists.filter(l => days.includes(l.day)).map(l => {
    const ask = (o.needs ?? []).find(n => n.day === l.day && sameName(n.list, l) && (n.session === 'both' || n.session === l.session));
    return ask ? { ...l, need: ask.need, ...(l.min != null && l.min > ask.need ? { min: ask.need } : {}) } : l;
  }), { leave: o.leave, holidays });

  /** @type {Record<string, Record<Session, Placement[]>>} */
  const grid = {};
  /** @type {Record<string, string[]>} */ const leaveOut = {};
  /** @type {Record<string, string[]>} */ const postCall = {};
  /** @type {Record<string, import('./week.js').FreeEntry[]>} */ const free = {};
  /** @type {Record<string, string[]>} */ const onCall = {};
  /** @type {Record<string, { sessions: number, ot: number, clinic: number }>} */
  const stats = Object.fromEntries(juniors.map(p => [p.name, { sessions: 0, ot: 0, clinic: 0 }]));
  /** @type {import('./week.js').Shortfall[]} */
  const problems = [];

  for (const day of days) {
    const prev = onCallOn(addDays(day, -1));
    const today = onCallOn(day);
    onCall[day] = today.filter(n => juniors.some(p => p.name === n));
    postCall[day] = prev.filter(n => juniors.some(p => p.name === n));
    leaveOut[day] = o.people.filter(p => lv.blocks(p.name, day)).map(p => p.name);
    /** @type {Record<Session, Set<string>>} */
    const taken = { AM: new Set(), PM: new Set() };
    grid[day] = { AM: [], PM: [] };
    // someone running a list that session (an AC is graded as a registrar but can lead a list) is not placed on another
    for (const l of lists) if (l.day === day && l.status === 'open') for (const n of consOf(l)) taken[l.session].add(n);

    /** @param {Person} p @param {Session} s @returns {boolean} */
    const available = (p, s) => !lv.blocks(p.name, day, s) && !today.includes(p.name) && !taken[s].has(p.name)
      && !(prev.includes(p.name) && (s === 'PM' || !postCallAm));

    for (const session of /** @type {Session[]} */ (['AM', 'PM'])) {
      const todays = lists.filter(l => l.day === day && l.session === session);
      const order = [...todays].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || b.need - a.need);
      /** @type {Map<string, string[]>} */
      const placed = new Map(todays.map(l => [l.id, []]));
      /** @param {ListSlot} l @param {string} name */
      const put = (l, name) => { placed.get(l.id)?.push(name); taken[session].add(name); const st = stats[name]; st.sessions++; if (l.kind === 'clinic' || l.kind === 'hot') st.clinic++; else st.ot++; };

      // 1. asked-for people first (an ask is by hand: site, by-hand, works-on and clinics-only limits don't apply)
      for (const r of o.requests ?? []) {
        if (r.type !== 'list-person' || r.day !== day || (r.session !== 'both' && r.session !== session)) continue;
        const l = order.find(x => sameName(r.list, x) && x.need > (placed.get(x.id)?.length ?? 0));
        const p = juniors.find(x => x.name === r.person);
        if (l && p && available(p, session)) put(l, p.name);
      }
      // 2. the rest in the owner's order, each step: the PM keeps the AM's juniors on the same list (same name, site and
      // consultant), then the hardest lists first
      const plain = order.filter(l => !l.emergency), eot = order.filter(l => l.emergency);
      // MSP lists and HOT clinics: their lead first (a registrar; a HOT clinic also an R3)
      const led = plain.filter(regLed), msp = led.filter(l => l.kind !== 'hot');
      const lacksLead = (/** @type {ListSlot} */ x) => !(placed.get(x.id) ?? []).some(n => leads(x, juniors.find(p => p.name === n)));
      /** @type {[ListSlot[], (l: ListSlot) => number, (p: Person, l: ListSlot) => boolean][]} */
      const steps = [
        [led, () => 1, (p, l) => leads(l, p)],
        [plain, minOf, () => true],
        [eot, minOf, (p, l) => leads(l, p)],
        [plain, l => l.need, () => true],
        [eot, l => l.need, () => true],
      ];
      for (const [mine, upTo, may] of steps) {
        if (session === 'PM') {
          for (const l of mine) {
            const am = grid[day].AM.find(g => { const a = lists.find(x => x.id === g.list); return a && a.name === l.name && a.site === l.site && conText(a) === conText(l) && a.kind === l.kind; });
            for (const name of am?.juniors ?? []) {
              const p = juniors.find(x => x.name === name);
              if (p && may(p, l) && canWork(p, l) && available(p, session) && upTo(l) > (placed.get(l.id)?.length ?? 0)) put(l, name);
            }
          }
        }
        for (const l of mine) fillTo(l, upTo(l), may);
      }

      /** @param {ListSlot} l @param {number} upTo @param {(p: Person, l: ListSlot) => boolean} may */
      function fillTo(l, upTo, may) {
        while ((placed.get(l.id)?.length ?? 0) < upTo) {
          let best = null;
          let bestScore = Infinity;
          // registrars go last (the slot is still filled when nobody else is free) while there are no more of them than MSP
          // lists and emergency slots still without one (an MO does elsewhere what only a registrar does there)
          const regsLeft = regLed(l) && lacksLead(l) ? Infinity : juniors.filter(p => p.grade === 'reg' && available(p, session)).length;
          const keepRegs = regsLeft <= [...msp, ...eot].filter(e => regLed(e) && lacksLead(e)).length;
          for (const p of juniors) {
            if (!may(p, l) || !canWork(p, l) || !available(p, session)) continue;
            const st = stats[p.name];
            const wantsOt = l.kind === 'ot' || l.kind === 'msp';
            let v = st.sessions * 3 + (wantsOt ? st.ot : st.clinic) * 1.5 + rnd() * 0.5;
            v += wantsOt ? (p.grade === 'reg' ? 0 : 4) : (p.grade === 'mo' ? 0 : 2);
            if (p.site && (l.site === 'NUH' || l.site === 'NTFGH') && p.site !== l.site) v += 2;
            if (keepRegs && p.grade === 'reg') v += 20;
            const amSite = session === 'PM' ? grid[day].AM.find(g => g.juniors.includes(p.name)) : undefined;
            if (amSite && lists.find(x => x.id === amSite.list)?.site !== l.site) v += 1.5;
            if (v < bestScore) { bestScore = v; best = p; }
          }
          if (!best) break;
          put(l, best.name);
        }
      }
      for (const l of todays) {
        const got = placed.get(l.id) ?? [], min = minOf(l);
        grid[day][session].push({ list: l.id, juniors: got });
        const noReg = regLed(l) && lacksLead(l);
        if (got.length < (l.emergency ? min : l.need) || noReg) problems.push({ list: l.id, day, session, need: l.need, min, got: got.length, ...(noReg ? { noReg } : {}) });
      }
    }

    // FREE: unplaced juniors who are around (leave goes under LEAVE, the post-call PM under POST-CALL)
    free[day] = [];
    if (holidays.includes(day)) continue;
    for (const p of juniors) {
      if (lv.full(p.name, day)) continue;
      if (today.includes(p.name)) { free[day].push({ name: p.name, when: 'FULL DAY', why: 'on call' }); continue; }
      if (p.byHand) continue;   // around only on the days someone puts them on a list
      const open = /** @type {Session[]} */ (['AM', 'PM']).filter(s => worksOn(p, day, s) && !taken[s].has(p.name) && !lv.blocks(p.name, day, s)
        && !(prev.includes(p.name) && (s === 'PM' || !postCallAm)));
      if (open.length === 2) free[day].push({ name: p.name, when: 'FULL DAY' });
      else if (open.length === 1) free[day].push({ name: p.name, when: open[0] });
    }
  }
  return { days, grid, lists, leave: leaveOut, postCall, free, onCall, stats, problems };
}

/** @param {string} name a request's list name @param {ListSlot} l  matches by id or by name, ignoring case */
function sameName(name, l) {
  const n = name.trim().toLowerCase();
  return n === l.id.toLowerCase() || n === l.name.trim().toLowerCase();
}
