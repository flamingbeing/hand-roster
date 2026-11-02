// People: the doctors the roster places. A person's name is also the key leave, requests and calls use (roster/model.js),
// so a name is unique among the active people.
import { cleaner, text, oneOf, bool } from './ops.js';

export const COLL = 'people';
/** @type {[string, string][]} */
export const GRADES = [['con', 'Consultant'], ['reg', 'Registrar or fellow'], ['mo', 'Medical officer']];
/** the ranks a grade offers (free text in the data, these are the suggestions) @type {Record<string, string[]>} */
export const RANKS = { con: ['Consultant'], reg: ['Reg', 'AC', 'Fellow'], mo: ['MO', 'HC', 'Locum', 'Outposter'] };
export const SITES = ['NUH', 'NTFGH'];

export const clean = cleaner({
  name: text(60, true),
  grade: oneOf(['con', 'reg', 'mo']),
  rank: (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim().slice(0, 20) || null : v === null ? null : undefined),
  site: oneOf(SITES, true),
  active: bool,
  noCall: bool,
  extra: bool,
});

/** @typedef {import('./ops.js').Row & { name: string, grade: 'con' | 'reg' | 'mo', rank?: string | null, site?: string | null, active?: boolean, noCall?: boolean, extra?: boolean }} PersonRow */

/** @param {PersonRow} r @returns {import('../roster/model.js').Person} the engine's person */
export const personOf = r => ({
  name: r.name, grade: r.grade, ...(r.rank ? { rank: r.rank } : {}), ...(r.site ? { site: r.site } : {}),
  ...(r.noCall ? { noCall: true } : {}), ...(r.extra || r.rank === 'Outposter' ? { extra: true } : {}),
});
/** @param {PersonRow[]} rows @returns {import('../roster/model.js').Person[]} the active people, in name order */
export const activePeople = rows => rows.filter(r => r.active !== false && !r._deleted).map(personOf).sort((a, b) => a.name.localeCompare(b.name));
