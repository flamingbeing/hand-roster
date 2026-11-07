// Draft and published (7 Nov 2026). A week (weeks) or a month's calls (rosters) as viewers see it is the record's own
// fields; a maker's working copy, when there is one, is the record's `draft`: the same fields, laid over them for makers
// only. So viewers sync and read exactly as before, and every week or month made before drafts counts as published.
// Build week, Build again, Reset week and Make calls save into the draft (started from the published fields when there is
// none); a hand edit goes into the draft when there is one, else onto the published fields (a quick fix reaches viewers at
// once, as before). Publish lays the draft over the published fields and drops it; Back to draft starts one from them;
// Discard draft drops it. Pure: the screens pass in the record and save what these return. Also the preview's diffs: which
// cells a build or Make calls would change.

/** @typedef {Record<string, any>} Row */

/** the fields of a week a draft holds (what the week is built from, the Lists tab, leave and calls, is shared) */
export const WEEK_PLAN = ['grid', 'lists', 'overrides', 'built', 'seed', 'accepted'];
/** the fields of a month a draft holds (holidays, the tiers per kind of day and the clear days are settings: shared) */
export const MONTH_PLAN = ['calls', 'locked', 'problems', 'built', 'seed', 'accepted'];
/** what a field is when the record lacks it */
const NONE = /** @type {Record<string, unknown>} */ ({ grid: [], lists: [], overrides: [], calls: [], locked: [], problems: [], accepted: [], built: 0, seed: 0 });

/** @template {Row | undefined} R @param {R} row @returns {R} the record as a maker sees it: its draft laid over */
export const asMaker = row => (row?.draft ? /** @type {R} */ ({ ...row, ...row.draft }) : row);

/** @param {Row | undefined} row @param {string[]} keys @returns {Row} the published fields it has (how a draft starts) */
const pick = (row, keys) => Object.fromEntries(keys.filter(k => row?.[k] != null).map(k => [k, row?.[k]]));

/**
 * What to save for an edit: into the draft when the record has one, or when `toDraft` (a build; the draft then starts from
 * the published fields); else the fields as they are. Fields a draft does not hold (a month's settings) go onto the record.
 * @param {Row | undefined} row  the record now @param {Row} fields @param {string[]} keys  WEEK_PLAN or MONTH_PLAN @param {boolean} [toDraft]
 * @returns {Row}
 */
export function planWrite(row, fields, keys, toDraft = false) {
  if (!row?.draft && !toDraft) return fields;
  /** @type {Row} */
  const draft = { ...(row?.draft ?? pick(row, keys)) };
  /** @type {Row} */
  const out = {};
  for (const [k, v] of Object.entries(fields)) if (keys.includes(k)) draft[k] = v; else out[k] = v;
  return { ...out, draft };
}

/**
 * Undo's fields: each field a save wrote, as the record had it before (a field it lacked: empty; no draft: null, which drops
 * the draft the save started). A week with no grid comes back not built.
 * @param {Row | undefined} row  the record before @param {Row} out  what was saved @returns {Row}
 */
export function undoOf(row, out) {
  /** @type {Row} */
  const was = Object.fromEntries(Object.keys(out).map(k => [k, k === 'draft' ? row?.draft ?? null : row?.[k] ?? NONE[k] ?? null]));
  if ('grid' in out && !Array.isArray(row?.grid)) was.built = 0;
  return was;
}

/** Publish: the draft laid over the published fields (a field it lacks: empty), and dropped @param {Row | undefined} row @param {string[]} keys @returns {Row} */
export const publishOf = (row, keys) => ({ ...Object.fromEntries(keys.map(k => [k, row?.draft?.[k] ?? NONE[k]])), draft: null });
/** Back to draft: a draft started from the published fields (viewers keep seeing them until Publish) @param {Row | undefined} row @param {string[]} keys @returns {Row} */
export const backToDraftOf = (row, keys) => ({ draft: pick(row, keys) });

/**
 * Where a record stands: 'published' (no draft), 'draft' (a draft and nothing published yet), 'redraft' (a draft over a
 * published version, which viewers still see), '' (nothing made yet).
 * @param {Row | undefined} row @param {(r: Row | undefined) => boolean} made  whether a record's own fields hold a built week or made calls
 * @returns {'published' | 'draft' | 'redraft' | ''}
 */
export function planState(row, made) {
  if (row?.draft) return made(row) ? 'redraft' : made(asMaker(row)) ? 'draft' : '';
  return made(row) ? 'published' : '';
}

/**
 * What a new grid changes against the grid before: the names new on a list ('list|name', as the rule marks key a cell) and
 * the lists whose juniors differ (someone added or gone).
 * @param {{ day: string, session: string, list: string, juniors: string[] }[]} before @param {{ day: string, session: string, list: string, juniors: string[] }[]} after
 * @returns {{ cells: Set<string>, lists: Set<string> }}
 */
export function gridChanges(before, after) {
  const key = (/** @type {{ day: string, session: string, list: string }} */ r) => `${r.day}|${r.session}|${r.list}`;
  const old = new Map(before.map(r => [key(r), r]));
  /** @type {Set<string>} */
  const cells = new Set(), lists = new Set();
  for (const r of after) {
    const o = old.get(key(r))?.juniors ?? [];
    old.delete(key(r));
    const added = r.juniors.filter(n => !o.includes(n));
    for (const n of added) cells.add(`${r.list}|${n}`);
    if (added.length || o.some(n => !r.juniors.includes(n))) lists.add(r.list);
  }
  for (const r of old.values()) if (r.juniors.length) lists.add(r.list);
  return { cells, lists };
}

/**
 * The calls new calls change against the calls before, as 'date|tier' (a name changed, set or gone).
 * @param {Row[]} before @param {Row[]} after @param {readonly string[]} tiers @returns {Set<string>}
 */
export function callChanges(before, after, tiers) {
  const was = new Map(before.map(c => [c.date, c])), now = new Map(after.map(c => [c.date, c]));
  /** @type {Set<string>} */
  const out = new Set();
  for (const date of new Set([...was.keys(), ...now.keys()])) {
    for (const t of tiers) if ((was.get(date)?.[t] ?? null) !== (now.get(date)?.[t] ?? null)) out.add(`${date}|${t}`);
  }
  return out;
}
