// The two plans the app builds, each a document named by the time it covers.
// rosters: a month's on-call roster, named YYYY-MM: the calls as rows (one per day, a name per tier), the entries a person
//   fixed by hand (`locked`, 'date|tier': the solver keeps them), the month's public holidays (an input, never built in) and
//   what the last "Make calls" found wrong. Counts are worked out from the rows when shown.
// weeks: a week's daily roster, named by its Monday (YYYY-MM-DD): the grid (who is on which list, one row per list), a
//   snapshot of the week's lists as they were built (so a later change to the template does not rewrite the past), and the
//   changes to the template for this week only (`overrides`). Leave, post-call, on-call and free are worked out from the grid
//   when shown (roster/sections.js).
import { cleaner, text, optText, oneOf, int, optInt, days, texts } from './ops.js';

const TIERS = ['con', 'reg', 'moNuh', 'moNtf'];

/** @param {unknown} v */
const callRows = v => (Array.isArray(v)
  ? v.filter(r => r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice(0, 62).map(r => ({
    date: r.date, ...Object.fromEntries(TIERS.map(t => [t, typeof r[t] === 'string' && r[t] ? r[t].slice(0, 60) : null])),
  }))
  : undefined);

const cleanRoster = cleaner({
  calls: callRows,
  locked: texts(200, 40),
  holidays: days(31),
  problems: texts(60, 160),
  minGap: int(1, 7),
  seed: int(0, 1_000_000),
  built: int(0, Number.MAX_SAFE_INTEGER),
});

/** @typedef {import('./ops.js').Row & { calls?: import('../roster/model.js').CallDay[], locked?: string[], holidays?: string[], problems?: string[], minGap?: number, seed?: number, built?: number }} RosterRow */
/** the rosters kind, as cloud.js lists it */
export const rosters = { COLL: 'rosters', clean: cleanRoster };

/** @param {number} max @param {(r: any) => any} one */
const rows = (max, one) => (/** @type {unknown} */ v) => (Array.isArray(v) ? v.slice(0, max).map(one).filter(Boolean) : undefined);
const dayOk = (/** @type {unknown} */ d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

const cleanWeek = cleaner({
  grid: rows(800, r => (r && dayOk(r.day) && (r.session === 'AM' || r.session === 'PM') && typeof r.list === 'string'
    ? { day: r.day, session: r.session, list: r.list.slice(0, 64), juniors: (Array.isArray(r.juniors) ? r.juniors : []).filter((/** @type {unknown} */ n) => typeof n === 'string').map((/** @type {string} */ n) => n.slice(0, 60)).slice(0, 10) } : null)),
  lists: rows(400, r => (r && dayOk(r.day) && typeof r.id === 'string' ? {
    id: r.id.slice(0, 64), site: text(20)(r.site) ?? '', kind: oneOf(['ot', 'msp', 'clinic', 'hot'])(r.kind) ?? 'ot', name: text(40)(r.name) ?? '', day: r.day,
    session: r.session === 'PM' ? 'PM' : 'AM', consultant: optText(60)(r.consultant) ?? null, rooms: optText(40)(r.rooms) ?? null,
    patients: optInt(0, 200)(r.patients) ?? null, status: oneOf(['open', 'closed', 'template', 'empty', 'consultant-only'])(r.status) ?? 'open',
    need: int(0, 10)(r.need) ?? 0, consultantOnLeave: r.consultantOnLeave === true,
  } : null)),
  overrides: rows(200, r => (r && typeof r.id === 'string' ? {
    id: r.id.slice(0, 64), ...(r.consultant !== undefined ? { consultant: optText(60)(r.consultant) ?? null } : {}),
    ...(int(0, 10)(r.need) !== undefined ? { need: int(0, 10)(r.need) } : {}),
    ...(r.patients !== undefined && optInt(0, 200)(r.patients) !== undefined ? { patients: optInt(0, 200)(r.patients) } : {}),
    ...(oneOf(['open', 'closed', 'template', 'empty', 'consultant-only'])(r.status) ? { status: r.status } : {}),
  } : null)),
  built: int(0, Number.MAX_SAFE_INTEGER),
  seed: int(0, 1_000_000),
});

/** @typedef {import('./ops.js').Row & { grid?: import('../roster/grid.js').GridRow[], lists?: import('../roster/model.js').ListSlot[], overrides?: import('./lists.js').Override[], built?: number, seed?: number }} WeekRow */
/** the weeks kind, as cloud.js lists it */
export const weeks = { COLL: 'weeks', clean: cleanWeek };
