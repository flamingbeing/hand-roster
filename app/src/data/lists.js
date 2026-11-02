// Lists: the weekly template of OT lists and clinics. One row is one list in one session of one weekday (wd 1 = Monday ..
// 5 = Friday), so a consultant's whole day is two rows. A week can change a row for that week only (weeks.js `overrides`).
import { cleaner, text, optText, oneOf, int, optInt, bool } from './ops.js';
import { addDays } from '../roster/dates.js';

export const COLL = 'lists';
export const SITES = ['NUH', 'NTFGH', 'Other'];
/** @type {[string, string][]} */
export const KINDS = [['ot', 'OT list'], ['msp', 'MSP'], ['clinic', 'Clinic'], ['hot', 'HOT clinic']];
export const STATUSES = /** @type {[string, string][]} */ ([['open', 'Open'], ['closed', 'Closed'], ['template', 'Template'], ['empty', 'Empty'], ['consultant-only', 'Consultant only']]);
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const clean = cleaner({
  site: text(20, true),
  kind: oneOf(['ot', 'msp', 'clinic', 'hot']),
  name: text(40, true),
  wd: int(1, 5),
  session: oneOf(['AM', 'PM']),
  consultant: optText(60),
  rooms: optText(40),
  patients: optInt(0, 200),
  need: int(0, 10),
  status: oneOf(['open', 'closed', 'template', 'empty', 'consultant-only']),
  external: bool,
});

/** @typedef {import('./ops.js').Row & { site: string, kind: 'ot' | 'msp' | 'clinic' | 'hot', name: string, wd: number, session: 'AM' | 'PM', consultant?: string | null, rooms?: string | null, patients?: number | null, need: number, status: string, external?: boolean }} ListRow */
/** @typedef {{ id: string, consultant?: string | null, need?: number, status?: string }} Override  a change to one template row for one week */

/**
 * The lists of one week: the template with the week's changes laid over, one dated slot each.
 * @param {ListRow[]} templates @param {string} monday @param {Override[]} [overrides]
 * @returns {import('../roster/model.js').ListSlot[]}
 */
export function slotsFor(templates, monday, overrides = []) {
  const by = new Map(overrides.map(o => [o.id, o]));
  return templates.filter(t => !t._deleted && t.wd >= 1 && t.wd <= 5).map(t => {
    const o = by.get(t.id);
    const consultant = o && 'consultant' in o ? o.consultant ?? null : t.consultant ?? null;
    return /** @type {import('../roster/model.js').ListSlot} */ ({
      id: t.id, site: t.site, kind: t.kind, name: t.name, day: addDays(monday, t.wd - 1), session: t.session,
      consultant, status: /** @type {any} */ (o?.status ?? t.status), need: o?.need ?? t.need,
      ...(t.rooms ? { rooms: t.rooms } : {}), ...(t.patients != null ? { patients: t.patients } : {}), ...(t.external ? { external: true } : {}),
    });
  }).sort((a, b) => a.day.localeCompare(b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1) || a.site.localeCompare(b.site) || a.name.localeCompare(b.name));
}
