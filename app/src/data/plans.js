// The two plans the app builds, each a document named by the time it covers.
// rosters: a month's on-call roster, named YYYY-MM: the calls as rows (one per day, a name per tier), the entries a person
//   fixed by hand (`locked`, 'date|tier': the solver keeps them), the month's public holidays (an input, never built in), which
//   call tiers each kind of day has (`tierPlan`, the default when left out) and
//   what the last "Make calls" found wrong. Counts are worked out from the rows when shown.
// weeks: a week's daily roster, named by its Monday (YYYY-MM-DD): the grid (who is on which list, one row per list), a
//   snapshot of the week's lists as they were built (so a later change to the template does not rewrite the past), and the
//   changes to the template for this week only (`overrides`). Leave, post-call, on-call and free are worked out from the grid
//   when shown (roster/sections.js).
import { cleaner, text, optText, oneOf, int, optInt, days, texts, bool } from './ops.js';
import { DAY_TYPES, TIERS } from '../roster/model.js';

/** @param {unknown} v */
const callRows = v => (Array.isArray(v)
  ? v.filter(r => r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice(0, 62).map(r => ({
    date: r.date, ...Object.fromEntries(TIERS.map(t => [t, typeof r[t] === 'string' && r[t] ? r[t].slice(0, 60) : null]).filter(([t, n]) => t !== 'reg2' || n)),
  }))
  : undefined);

/** @param {unknown} v @returns {import('../roster/model.js').TierPlan | undefined} a tier list per kind of day, known tiers only */
const tierPlan = v => (v && typeof v === 'object' && !Array.isArray(v)
  ? /** @type {any} */ (Object.fromEntries(DAY_TYPES.map(([d]) => [d, /** @type {any} */ (v)[d]]).filter(([, t]) => Array.isArray(t))
    .map(([d, t]) => [d, TIERS.filter(x => t.includes(x))])))
  : undefined);

const cleanRoster = cleaner({
  calls: callRows,
  locked: texts(200, 40),
  holidays: days(31),
  tierPlan,
  problems: texts(60, 160),
  minGap: int(1, 7),
  seed: int(0, 1_000_000),
  built: int(0, Number.MAX_SAFE_INTEGER),
});

/** @typedef {import('./ops.js').Row & { calls?: import('../roster/model.js').CallDay[], locked?: string[], holidays?: string[], tierPlan?: Partial<import('../roster/model.js').TierPlan>, problems?: string[], minGap?: number, seed?: number, built?: number }} RosterRow */
/** the rosters kind, as cloud.js lists it */
export const rosters = { COLL: 'rosters', clean: cleanRoster };

/** @param {number} max @param {(r: any) => any} one */
const rows = (max, one) => (/** @type {unknown} */ v) => (Array.isArray(v) ? v.slice(0, max).map(one).filter(Boolean) : undefined);
const dayOk = (/** @type {unknown} */ d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** @param {unknown} v @returns {string[]} */
const names = v => (Array.isArray(v) ? v : []).filter((/** @type {unknown} */ n) => typeof n === 'string').map((/** @type {string} */ n) => n.slice(0, 60)).slice(0, 10);
/** @param {any} r */
function gridRow(r) {
  const juniors = names(r.juniors), pinned = names(r.pinned).filter(n => juniors.includes(n));
  return { day: r.day, session: r.session, list: r.list.slice(0, 64), juniors, ...(pinned.length ? { pinned } : {}) };
}

const cleanWeek = cleaner({
  grid: rows(800, r => (r && dayOk(r.day) && (r.session === 'AM' || r.session === 'PM') && typeof r.list === 'string'
    ? gridRow(r) : null)),
  lists: rows(400, r => (r && dayOk(r.day) && typeof r.id === 'string' ? {
    id: r.id.slice(0, 64), site: text(20)(r.site) ?? '', kind: oneOf(['ot', 'msp', 'clinic', 'hot'])(r.kind) ?? 'ot', name: text(40)(r.name) ?? '', day: r.day,
    session: r.session === 'PM' ? 'PM' : 'AM', consultant: optText(60)(r.consultant) ?? null, ...(optText(60)(r.consultant2) ? { consultant2: optText(60)(r.consultant2) } : {}), ...(optText(60)(r.consultant3) ? { consultant3: optText(60)(r.consultant3) } : {}), rooms: optText(40)(r.rooms) ?? null,
    patients: optInt(0, 200)(r.patients) ?? null, status: oneOf(['open', 'closed', 'template', 'empty', 'consultant-only'])(r.status) ?? 'open',
    need: int(0, 10)(r.need) ?? 0, ...(int(0, 10)(r.min) !== undefined ? { min: r.min } : {}), consultantOnLeave: r.consultantOnLeave === true,
    ...(r.away === true ? { away: true } : {}), ...(r.emergency === true ? { emergency: true } : {}), ...(r.holiday === true ? { holiday: true } : {}),
    ...(r.external === true ? { external: true } : {}),   // run by another team: the Week tab settles from this snapshot
  } : null)),
  overrides: rows(200, r => (r && typeof r.id === 'string' ? {
    id: r.id.slice(0, 64), ...(r.consultant !== undefined ? { consultant: optText(60)(r.consultant) ?? null } : {}),
    ...(r.consultant2 !== undefined ? { consultant2: optText(60)(r.consultant2) ?? null } : {}),
    ...(r.consultant3 !== undefined ? { consultant3: optText(60)(r.consultant3) ?? null } : {}),
    ...(int(0, 10)(r.need) !== undefined ? { need: int(0, 10)(r.need) } : {}),
    ...(int(0, 10)(r.min) !== undefined ? { min: int(0, 10)(r.min) } : {}),
    ...(r.away === true ? { away: true } : {}),
    ...(r.patients !== undefined && optInt(0, 200)(r.patients) !== undefined ? { patients: optInt(0, 200)(r.patients) } : {}),
    ...(oneOf(['open', 'closed', 'template', 'empty', 'consultant-only'])(r.status) ? { status: r.status } : {}),
  } : null)),
  built: int(0, Number.MAX_SAFE_INTEGER),
  seed: int(0, 1_000_000),
});

/** @typedef {import('./ops.js').Row & { grid?: import('../roster/grid.js').GridRow[], lists?: import('../roster/model.js').ListSlot[], overrides?: import('./lists.js').Override[], built?: number, seed?: number }} WeekRow */
/** the weeks kind, as cloud.js lists it */
export const weeks = { COLL: 'weeks', clean: cleanWeek };

// rules: rule cards (roster/rule-cards.js), app-roster's shape; params plain JSON up to 4000 characters
const json = (/** @type {unknown} */ v) => { const t = v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : ''; return t && t.length <= 4000 ? JSON.parse(t) : undefined; };
/** app-roster 0.1.0's rule types (tests compare) */
export const RULE_TYPES = ['cover', 'away', 'oneAtATime', 'sequence', 'eligible', 'leads', 'match', 'limit', 'requests', 'keep', 'balance'];
/** @typedef {import('./ops.js').Row & Partial<import('../roster/rule-cards.js').RuleCard>} RuleRow */
export const rules = { COLL: 'rules', clean: cleaner({ type: oneOf(RULE_TYPES), words: text(200), level: oneOf(['block', 'warn', 'soft']), priority: int(1, 3), tags: texts(20, 40), on: bool, params: json, topic: oneOf(['week', 'calls']) }) };
