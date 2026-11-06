// The roster's plain data shapes and the few rules about them that every engine file shares. Pure: no page, no clock.
// A person is named by `name`, which is also the key every leave, request and call uses (the app can store an id there).
import { weekday } from './dates.js';

/**
 * @typedef {'con' | 'reg' | 'reg2' | 'moNuh' | 'moNtf'} Tier  the on-call tiers (consultant, registrar, a second registrar on
 *   some days, MO at NUH, MO at NTFGH)
 * @typedef {'weekday' | 'sat' | 'sun' | 'ph'} DayType
 * @typedef {'AM' | 'PM'} Session
 *
 * @typedef {object} Person
 * @property {string} name  unique; the key for leave, requests and calls
 * @property {'con' | 'reg' | 'mo'} grade  juniors are 'reg' (registrars, ACs, fellows) and 'mo'
 * @property {string} [rank]  'Reg', 'AC', 'Fellow', 'MO', 'R3' (third-year resident: an MO who can run a HOT clinic), 'HC', 'Locum', 'Outposter', 'Consultant'
 * @property {string} [site]  home site, 'NUH' or 'NTFGH' (a soft preference)
 * @property {string} [team]  free text ('Team 1'); a junior is put with a consultant of their own team when all else is equal
 * @property {boolean} [extra]  outposter: shown on a list when added by hand, never placed or put on call
 * @property {boolean} [noCall]  never on call
 * @property {boolean} [siteOnly]  works only at their home site: lists and calls (a locum hired by one hospital)
 * @property {boolean} [byHand]  put on lists by hand only (a locum on some days and clinics); still on call
 * @property {string[]} [works]  the sessions they work, '1AM' (Monday morning) .. '5PM'; none: every session
 * @property {boolean} [clinicsOnly]  placed on clinics and HOT clinics only, never OT or MSP
 * @property {Tier[]} [tiers]  call tiers this person may take, overriding the grade default
 *
 * @typedef {object} Leave
 * @property {string} name
 * @property {string} from  first day
 * @property {string} to  last day (same as `from` for one day)
 * @property {'AM' | 'PM' | 'both'} [session]  default both
 * @property {string} [note]
 *
 * @typedef {object} CallRequest
 * @property {string} name
 * @property {string} date
 * @property {'cannot' | 'want'} type  cannot = a hard rule; want = tried for
 * @property {Tier} [tier]  a want for one tier only
 *
 * @typedef {{ date: string, con?: string | null, reg?: string | null, reg2?: string | null, moNuh?: string | null, moNtf?: string | null }} CallDay
 * @typedef {Record<string, Partial<Record<Tier, string | null>>>} CallMap  date -> tier -> name
 * @typedef {Record<DayType, Tier[]>} TierPlan  which tiers are on call on each kind of day
 *
 * @typedef {object} ListSlot  one OT list or clinic in one session of one day (the shape of a weekly template row)
 * @property {string} id
 * @property {string} site  'NUH', 'NTFGH', ...
 * @property {'ot' | 'msp' | 'clinic' | 'hot'} kind
 * @property {string} name  'KRWOT 3', 'MCOT 2', 'CLINIC', ...
 * @property {string} day
 * @property {Session} session
 * @property {string | null} [consultant]
 * @property {string | null} [consultant2]  a second consultant sharing the list (owner, 6 Nov 2026: it runs while any of them is in)
 * @property {string | null} [consultant3]  a third (NTFGH OT 15 has three at once)
 * @property {'open' | 'closed' | 'template' | 'empty' | 'consultant-only'} status  only 'open' lists take juniors
 * @property {number} need  juniors wanted (the ideal)
 * @property {number} [min]  juniors it cannot run without (default: 1 when it wants any); filled before any list's extras
 * @property {string} [rooms]
 * @property {number} [patients]
 * @property {boolean} [external]  run by another hospital's team, never staffed from here
 * @property {boolean} [consultantOnLeave]
 * @property {boolean} [away]  the consultant is away this week at this session (the Epic check), as if on leave
 * @property {boolean} [emergency]  an OT list whose consultant is away, kept as an emergency (EOT) slot: a registrar must lead
 *   it, an MO joins only when nobody else needs them
 * @property {boolean} [holiday]  closed for a public holiday
 */

export const TIERS = /** @type {Tier[]} */ (['con', 'reg', 'reg2', 'moNuh', 'moNtf']);
export const TIER_LABEL = /** @type {Record<Tier, string>} */ ({ con: 'CON', reg: 'REG', reg2: 'REG 2', moNuh: 'MO (NUH)', moNtf: 'MO (NTFGH)' });
export const DAY_TYPES = /** @type {[DayType, string][]} */ ([['weekday', 'Weekdays'], ['sat', 'Saturdays'], ['sun', 'Sundays'], ['ph', 'Public holidays']]);

/** the HRM roster has all four main tiers every day, weekends and holidays too; REG 2 only on the days it is entered.
 * A roster can change any part (its `tierPlan`) */
export const DEFAULT_TIER_PLAN = /** @type {TierPlan} */ ({
  weekday: ['con', 'reg', 'moNuh', 'moNtf'],
  sat: ['con', 'reg', 'moNuh', 'moNtf'],
  sun: ['con', 'reg', 'moNuh', 'moNtf'],
  ph: ['con', 'reg', 'moNuh', 'moNtf'],
});
/** @param {Partial<TierPlan> | null | undefined} saved  a roster's own plan @returns {TierPlan} with the default for any day type it leaves out */
export const tierPlanOf = saved => /** @type {TierPlan} */ (Object.fromEntries(DAY_TYPES.map(([t]) => [t, saved?.[t] ?? DEFAULT_TIER_PLAN[t]])));
/** @param {TierPlan} plan @param {CallDay[]} calls @returns {Tier[]} the tiers a month shows: the plan's, and any entered outside it */
export const tiersShown = (plan, calls) => TIERS.filter(t => DAY_TYPES.some(([d]) => plan[d].includes(t)) || calls.some(c => c[t]));

/** @param {string} day @param {string[]} [holidays] @returns {DayType} a public holiday wins over the weekday */
export function dayType(day, holidays = []) {
  if (holidays.includes(day)) return 'ph';
  const w = weekday(day);
  return w === 6 ? 'sat' : w === 0 ? 'sun' : 'weekday';
}
/** @param {DayType} t @returns {boolean} counts toward the weekend/holiday balance */
export const isOffDay = t => t !== 'weekday';

/** @param {Person} p @returns {boolean} a junior doctor: filled into lists */
export const isJunior = p => p.grade !== 'con' && !p.extra;

/**
 * Who may take a call tier. Consultants only CON; the REG tier goes to registrars and ACs (not fellows); the MO tiers
 * to MOs, locums, fellows and registrars (seen in the sample roster). `person.tiers` overrides; outposters never.
 * @param {Person} p @param {Tier} tier @returns {boolean}
 */
export function canTake(p, tier) {
  if (p.noCall || p.extra) return false;
  if (p.siteOnly && ((tier === 'moNuh' && p.site === 'NTFGH') || (tier === 'moNtf' && p.site === 'NUH'))) return false;
  if (p.tiers) return p.tiers.includes(tier);
  if (tier === 'con') return p.grade === 'con';
  if (tier === 'reg' || tier === 'reg2') return p.grade === 'reg' && p.rank !== 'Fellow';
  return p.grade !== 'con';
}

/**
 * Leave lookups by person. A leave with no session blocks both; 'AM' or 'PM' blocks that half only.
 * @param {Leave[]} leave
 */
export function leaveIndex(leave) {
  /** @type {Map<string, Leave[]>} */
  const by = new Map();
  for (const l of leave) { const a = by.get(l.name); if (a) a.push(l); else by.set(l.name, [l]); }
  /** @param {string} name @param {string} day @param {Session | 'any'} [session] */
  const blocks = (name, day, session = 'any') => (by.get(name) ?? []).some(l =>
    l.from <= day && day <= l.to && (session === 'any' || !l.session || l.session === 'both' || l.session === session));
  /** @param {string} name @param {string} day  gone for the whole day */
  const full = (name, day) => (by.get(name) ?? []).some(l => l.from <= day && day <= l.to && (!l.session || l.session === 'both'));
  return { blocks, full };
}

/** @param {CallDay[]} calls @returns {CallMap} */
export function callMapOf(calls) {
  /** @type {CallMap} */
  const out = {};
  for (const c of calls) out[c.date] = callRow(c);
  return out;
}
/** @param {CallMap} map @returns {CallDay[]} rows in date order, every tier present (null = nobody) */
export function callRowsOf(map) {
  return Object.keys(map).sort().map(date => ({ date, ...callRow(map[date]) }));
}
/** @param {Partial<Record<Tier, string | null>>} c @returns {Partial<Record<Tier, string | null>>} every main tier (null for nobody), REG 2 only when someone has it */
export const callRow = c => Object.fromEntries(TIERS.filter(t => t !== 'reg2' || c[t]).map(t => [t, c[t] ?? null]));

// How a week's lists stand once the week's facts are in, before anyone is placed. A public holiday closes every list of
// that day. A consultant away (on leave, or marked Away in the Epic check) closes their clinics, but their OT list stays as
// an emergency (EOT) slot: a registrar must lead it, an MO joins only when nobody else needs them (owner, 6 Nov 2026). A
// list with no patients booked (Epic says 0) needs nobody, except an emergency slot, which is there for cases not booked;
// an MSP list runs as usual, as if it had no consultant (it always needs a registrar, and a HOT clinic a registrar or an R3: regLed). Each list wants `need` juniors and cannot run with fewer than its minimum (an emergency
// slot's is 1 unless the week sets it lower). Pure, and the same answer when run again on its own output.


const isName = /** @type {(n: string | null | undefined) => n is string} */ (n => !!n);
/** @param {Pick<ListSlot, 'consultant' | 'consultant2' | 'consultant3'>} l @returns {string[]} everyone running the list, lead first (none without a lead) */
export const consOf = l => (l.consultant ? [l.consultant, l.consultant2, l.consultant3].filter(isName) : []);
/** @param {Pick<ListSlot, 'consultant' | 'consultant2' | 'consultant3'>} l @returns {string} the consultant as shown: 'Soumen / Sarah Huan' for a shared list */
export const conText = l => consOf(l).join(' / ');
/** @param {string} lead @param {...(string | null | undefined)} more @returns {string[]} the others sharing a list: no blanks, no repeats, not the lead */
export const coOf = (lead, ...more) => (lead ? [...new Set(more.filter(isName).filter(n => n !== lead))] : []);

/** an emergency slot: one registrar, and an MO when spare */
export const EOT = { need: 2, min: 1 };

/** @param {ListSlot} l @returns {number} the juniors a list cannot run without: its own `min`, else 1 when it wants any; never above `need` */
export const minOf = l => Math.min(l.need, l.min ?? (l.need > 0 ? 1 : 0));

/** @param {ListSlot} l @returns {boolean} someone able to lead it must be among its juniors (leads): an emergency slot, every MSP
 *   list and every HOT clinic (owner, 6 Nov 2026), unless the week lets it run with none */
export const regLed = l => (!!l.emergency || l.kind === 'msp' || l.kind === 'hot') && minOf(l) > 0;

/** @param {Person} p @param {ListSlot} l @returns {boolean} the builder may put p on l (by hand anyone goes anywhere) */
export const canWork = (p, l) => !p.byHand && (!p.siteOnly || !p.site || p.site === l.site) && worksOn(p, l.day, l.session)
  && (!p.clinicsOnly || l.kind === 'clinic' || l.kind === 'hot');

/** @param {Person} p @param {string} day @param {'AM' | 'PM'} session @returns {boolean} the session is one of theirs (People "Works on") */
export const worksOn = (p, day, session) => !p.works?.length || p.works.includes(`${weekday(day)}${session}`);

/** @param {ListSlot} l @param {Person | undefined} p @returns {boolean} p can lead l: a registrar; a HOT clinic also an R3
 *   (third-year resident, a year before registrar; owner, 6 Nov 2026) */
export const leads = (l, p) => !!p && (p.grade === 'reg' || (l.kind === 'hot' && p.rank === 'R3'));

/** @param {ListSlot} l  a settled list (settleLists) @returns {string} why it is not open this week ('' when open): 'public holiday',
 *   'consultant away' (the Epic check), 'consultant on leave', else its status ('closed', 'consultant only', ...) */
export const shutBy = l => (l.status === 'open' ? '' : l.holiday ? 'public holiday'
  : l.consultantOnLeave ? (l.away ? 'consultant away' : 'consultant on leave') : l.status.replace('-', ' '));

/**
 * @param {ListSlot[]} lists
 * @param {{ leave?: Leave[], holidays?: string[] }} o
 * @returns {ListSlot[]} new slots: status, need and min settled, and the flags `holiday`, `consultantOnLeave`, `emergency`
 */
export function settleLists(lists, { leave = [], holidays = [] }) {
  const lv = leaveIndex(leave);
  return lists.map(l => {
    const x = { ...l };
    if (holidays.includes(x.day)) {
      x.holiday = true;
      if (x.status === 'open') x.status = 'closed';
    }
    const gone = !!x.consultant && (!!x.away || lv.blocks(x.consultant, x.day, x.session)) && consOf(x).slice(1).every(n => lv.blocks(n, x.day, x.session));
    if (gone) x.consultantOnLeave = true;
    if (gone && x.status === 'open') {
      if (x.kind === 'clinic' || x.kind === 'hot') x.status = 'closed';
      else if (x.kind === 'ot' && !x.external) { x.emergency = true; x.need = EOT.need; x.min = Math.min(EOT.min, x.min ?? EOT.min); }
    }
    if (x.status !== 'open' || x.external || (x.patients === 0 && !x.emergency)) { x.need = 0; delete x.min; delete x.emergency; }
    if (x.min != null && x.min > x.need) x.min = x.need;
    return x;
  });
}
