// Leave and call requests. Leave: a person away for a run of days, all day or only AM or PM. Leave blocks calls and lists; a consultant's leave closes
// their clinics.
// Call requests: a day a person cannot do (kept as a hard rule) or would like (tried for), for all tiers or one.
import { cleaner, text, optText, oneOf, day } from './ops.js';

export const COLL = 'leave';
export const SESSIONS = /** @type {[string, string][]} */ ([['both', 'All day'], ['AM', 'AM only'], ['PM', 'PM only']]);

export const clean = cleaner({
  name: text(60, true),
  from: day,
  to: day,
  session: oneOf(['AM', 'PM', 'both']),
  note: optText(200),
});

/** @typedef {import('./ops.js').Row & { name: string, from: string, to: string, session?: 'AM' | 'PM' | 'both', note?: string | null }} LeaveRow */

/** @param {LeaveRow[]} rows @returns {import('../roster/model.js').Leave[]} */
export const leaveOf = rows => rows.filter(r => !r._deleted && r.from && r.to).map(r => ({
  name: r.name, from: r.from, to: r.to < r.from ? r.from : r.to, ...(r.session && r.session !== 'both' ? { session: r.session } : {}), ...(r.note ? { note: r.note } : {}),
}));

// ---- call requests (the requests collection) ----
export const REQUESTS = 'requests';
export const TYPES = /** @type {[string, string][]} */ ([['cannot', 'Cannot'], ['want', 'Would like']]);

const cleanRequest = cleaner({
  name: text(60, true),
  date: day,
  type: oneOf(['cannot', 'want']),
  tier: oneOf(['con', 'reg', 'moNuh', 'moNtf'], true),
});

/** @typedef {import('./ops.js').Row & { name: string, date: string, type: 'cannot' | 'want', tier?: import('../roster/model.js').Tier | null }} RequestRow */

/** @param {RequestRow[]} rows @returns {import('../roster/model.js').CallRequest[]} */
export const requestsOf = rows => rows.filter(r => !r._deleted && r.date).map(r => ({ name: r.name, date: r.date, type: r.type, ...(r.tier ? { tier: r.tier } : {}) }));
/** the requests kind, as cloud.js lists it beside leave */
export const requests = { COLL: REQUESTS, clean: cleanRequest };
