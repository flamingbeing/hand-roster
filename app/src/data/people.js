// People: the doctors the roster places. A person's name is also the key leave, requests and calls use (roster/model.js),
// so a name is unique among the active people.
import { cleaner, text, optText, oneOf, bool } from './ops.js';

export const COLL = 'people';
/** @type {[string, string][]} */
export const GRADES = [['con', 'Consultant'], ['reg', 'Registrar or fellow'], ['mo', 'Medical officer']];
/** the sessions of People "Works on": '1AM' (Monday morning) .. '5PM' */
export const WORKS = [1, 2, 3, 4, 5].flatMap(d => [`${d}AM`, `${d}PM`]);
/** the ranks a grade offers (free text in the data, these are the suggestions) @type {Record<string, string[]>} */
export const RANKS = { con: ['Consultant'], reg: ['Reg', 'AC', 'Fellow'], mo: ['MO', 'R3', 'HC', 'Locum', 'Outposter'] };
export const SITES = ['NUH', 'NTFGH'];
/** the label for people with no team in the by-team view */
export const NO_TEAM = 'No team';

/**
 * The people in teams, for the by-team view: teams in natural order (Team 2 before Team 10), people with no team last;
 * in each team consultants first, then registrars and fellows, then medical officers, each by name.
 * @param {PersonRow[]} rows @returns {[string, PersonRow[]][]}
 */
export function byTeam(rows) {
  const order = Object.fromEntries(GRADES.map(([g], i) => [g, i]));
  /** @type {Map<string, PersonRow[]>} */ const teams = new Map();
  for (const r of rows) {
    const t = r.team?.trim() || NO_TEAM;
    teams.set(t, [...(teams.get(t) ?? []), r]);
  }
  const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;
  return [...teams].sort(([a], [b]) => (a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : cmp(a, b)))
    .map(([t, list]) => [t, list.sort((a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9) || a.name.localeCompare(b.name))]);
}

export const clean = cleaner({
  name: text(60, true),
  grade: oneOf(['con', 'reg', 'mo']),
  rank: (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim().slice(0, 20) || null : v === null ? null : undefined),
  site: oneOf(SITES, true),
  team: optText(30),
  active: bool,
  noCall: bool,
  moCalls: bool,
  siteOnly: bool,
  byHand: bool,
  works: (/** @type {unknown} */ v) => (Array.isArray(v) ? [...new Set(v.filter(s => typeof s === 'string' && WORKS.includes(s)))] : v === null ? null : undefined),
  clinicsOnly: bool,
  extra: bool,
});

/** @typedef {import('./ops.js').Row & { name: string, grade: 'con' | 'reg' | 'mo', rank?: string | null, site?: string | null, team?: string | null, active?: boolean, noCall?: boolean, moCalls?: boolean, siteOnly?: boolean, byHand?: boolean, works?: string[] | null, clinicsOnly?: boolean, extra?: boolean }} PersonRow */
// moCalls: a registrar who takes the MO call tiers only (owner, 6 Nov 2026: not REG level for calls; still a registrar on lists)

/** @param {PersonRow} r @returns {import('../roster/model.js').Person} the engine's person */
export const personOf = r => ({
  name: r.name, grade: r.grade, ...(r.rank ? { rank: r.rank } : {}), ...(r.site ? { site: r.site } : {}), ...(r.team?.trim() ? { team: r.team.trim() } : {}),
  ...(r.noCall ? { noCall: true } : {}), ...(r.siteOnly && r.site ? { siteOnly: true } : {}), ...(r.byHand ? { byHand: true } : {}), ...(r.works?.length ? { works: r.works } : {}), ...(r.clinicsOnly ? { clinicsOnly: true } : {}), ...(r.moCalls && r.grade !== 'con' ? { tiers: /** @type {import('../roster/model.js').Tier[]} */ (['moNuh', 'moNtf']) } : {}), ...(r.extra || r.rank === 'Outposter' ? { extra: true } : {}),
});
/** @param {PersonRow[]} rows @returns {import('../roster/model.js').Person[]} the active people, in name order */
export const activePeople = rows => rows.filter(r => r.active !== false && !r._deleted).map(personOf).sort((a, b) => a.name.localeCompare(b.name));
