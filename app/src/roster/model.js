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
 * @property {string} [rank]  'Reg', 'AC', 'Fellow', 'MO', 'HC', 'Locum', 'Outposter', 'Consultant'
 * @property {string} [site]  home site, 'NUH' or 'NTFGH' (a soft preference)
 * @property {boolean} [extra]  outposter: shown on a list when added by hand, never placed or put on call
 * @property {boolean} [noCall]  never on call
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
