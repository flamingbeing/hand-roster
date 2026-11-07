// The two plans the app builds, named by the time they cover. rosters (YYYY-MM): calls (a row per day), locked (set by hand,
// 'date|tier'), holidays, tierPlan, problems (the last Make calls'). weeks (a Monday): grid (a row per list), lists (as built),
// overrides (this week only). draft: a maker's working copy of either (roster/drafts.js); viewers see the fields themselves.
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

/** @param {(f: Record<string, unknown>) => Record<string, unknown>} clean @returns a draft's cleaner (null drops it) */
const draftOf = clean => (/** @type {unknown} */ v) => (v === null ? null : v && typeof v === 'object' && !Array.isArray(v) ? clean(/** @type {any} */ (v)) : undefined);

const monthPlan = {
  calls: callRows,
  locked: texts(200, 40),
  problems: texts(60, 160),
  seed: int(0, 1_000_000),
  built: int(0, Number.MAX_SAFE_INTEGER),
  accepted: texts(300, 160),   // warnings the maker accepted (roster/report.js hitKey)
};
const cleanRoster = cleaner({
  ...monthPlan,
  holidays: days(31),
  tierPlan,
  minGap: int(1, 7),
  draft: draftOf(cleaner(monthPlan)),
});

/** @typedef {import('./ops.js').Row & { calls?: import('../roster/model.js').CallDay[], locked?: string[], holidays?: string[], tierPlan?: Partial<import('../roster/model.js').TierPlan>, problems?: string[], minGap?: number, seed?: number, built?: number, accepted?: string[], draft?: Record<string, any> | null }} RosterRow */
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

const weekPlan = {
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
  accepted: texts(300, 160),   // warnings the maker accepted (roster/report.js hitKey)
};
const cleanWeek = cleaner({ ...weekPlan, draft: draftOf(cleaner(weekPlan)) });

/** @typedef {import('./ops.js').Row & { grid?: import('../roster/grid.js').GridRow[], lists?: import('../roster/model.js').ListSlot[], overrides?: import('./lists.js').Override[], built?: number, seed?: number, accepted?: string[], draft?: Record<string, any> | null }} WeekRow */
/** the weeks kind, as cloud.js lists it */
export const weeks = { COLL: 'weeks', clean: cleanWeek };

// rules: rule cards (roster/rule-cards.js), app-roster's shape; params plain JSON (a map)
const json = (/** @type {unknown} */ v) => (v && typeof v === 'object' && !Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : undefined);
/** app-roster 0.1.1's rule types (tests compare) */
export const RULE_TYPES = ['cover', 'away', 'oneAtATime', 'sequence', 'eligible', 'leads', 'match', 'limit', 'requests', 'keep', 'balance'];
/** @typedef {import('./ops.js').Row & Partial<import('../roster/rule-cards.js').RuleCard>} RuleRow */
export const rules = { COLL: 'rules', clean: cleaner({ type: oneOf(RULE_TYPES), words: text(200), level: oneOf(['block', 'warn', 'soft']), priority: int(1, 3), tags: texts(20, 40), on: bool, params: json, topic: oneOf(['week', 'calls']) }) };

// layouts: export layout (id export) and tally weights (id tally)
export const layouts = { COLL: 'layouts', clean: cleaner({ labels: json, order: texts(20, 20), hide: texts(20, 20), print: json, weights: json }) };
