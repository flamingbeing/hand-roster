// How a record of any kind is written: one pure helper for all the data modules (people.js, lists.js, ...). Each module
// names its collection and says which fields it allows (`cleaner`); cloud.js passes in how one record is saved (the sync
// engine's write queue). Every write resolves to '' when the save is stored or queued, or to the reason when the server
// refused it at once (app-sync rejects then; the copy waits in the refused list, so the page says so rather than fail).

/** @param {Promise<unknown>} saving @returns {Promise<string>} */
export const refusal = saving => saving.then(() => '', e => (e instanceof Error && e.message) || 'The server refused it');

/** @typedef {{ id: string, _deleted?: boolean, createdAt?: number, updatedAt?: unknown } & Record<string, any>} Row */
/** @typedef {(coll: string, record: Record<string, unknown>, base: unknown) => Promise<unknown>} Save */

/**
 * A text of at most `max` characters, trimmed; undefined (field left out) when not a string.
 * @param {number} max @param {boolean} [required]
 */
export const text = (max, required = false) => (/** @type {unknown} */ v) => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return required && !s ? undefined : s;
};
/** a text that may be cleared: '' becomes null @param {number} max */
export const optText = max => (/** @type {unknown} */ v) => (v == null ? null : typeof v === 'string' ? v.trim().slice(0, max) || null : undefined);
/** @param {readonly string[]} allowed @param {boolean} [optional] */
export const oneOf = (allowed, optional = false) => (/** @type {unknown} */ v) =>
  (optional && (v == null || v === '') ? null : typeof v === 'string' && allowed.includes(v) ? v : undefined);
export const bool = (/** @type {unknown} */ v) => (typeof v === 'boolean' ? v : undefined);
/** @param {number} min @param {number} max */
export const int = (min, max) => (/** @type {unknown} */ v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
/** a whole number that may be cleared @param {number} min @param {number} max */
export const optInt = (min, max) => (/** @type {unknown} */ v) => (v == null || v === '' ? null : int(min, max)(v));
/** a calendar day, YYYY-MM-DD */
export const day = (/** @type {unknown} */ v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
/** a list of days, at most `max`, sorted and without repeats @param {number} max */
export const days = max => (/** @type {unknown} */ v) => (Array.isArray(v) ? [...new Set(v.filter(d => day(d)))].sort().slice(0, max) : undefined);
/** a list of short texts @param {number} max @param {number} len */
export const texts = (max, len) => (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter(s => typeof s === 'string').map(s => s.slice(0, len)).slice(0, max) : undefined);

/**
 * @param {Record<string, (v: unknown) => unknown>} schema  field -> its cleaner (undefined: leave the field out)
 * @returns {(fields: Record<string, unknown>) => Record<string, unknown>} only the allowed fields, cleaned
 */
export const cleaner = schema => fields => {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, fn] of Object.entries(schema)) {
    if (!(k in fields)) continue;
    const v = fn(fields[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
};

/**
 * @param {{ save: Save, id: () => string, now?: () => number }} o  save: one record (base: the copy the change started from, null for a new one)
 * @param {string} coll @param {(fields: Record<string, unknown>) => Record<string, unknown>} clean
 */
export function kindOps({ save, id, now = Date.now }, coll, clean) {
  return {
    /** @param {Record<string, unknown>} fields @returns {Promise<string>} */
    add: fields => refusal(save(coll, { id: id(), ...clean(fields), createdAt: now() }, null)),
    /** @param {Row} row  the copy the edit started from @param {Record<string, unknown>} patch @returns {Promise<string>} */
    edit: (row, patch) => refusal(save(coll, { ...row, ...clean(patch) }, row)),
    /** a record whose id is its key (a month, a week): edit the one that exists, else make it @param {string} key @param {Row | undefined} row @param {Record<string, unknown>} fields @returns {Promise<string>} */
    upsert: (key, row, fields) => refusal(row ? save(coll, { ...row, ...clean(fields) }, row) : save(coll, { id: key, ...clean(fields), createdAt: now() }, null)),
    /** a whole record under its own id, as a new save (a restore brings one back) @param {Row} row @returns {Promise<string>} */
    put: row => refusal(save(coll, { ...row }, null)),
    /** @param {Row} row @returns {Promise<string>} */
    remove: row => refusal(save(coll, { id: row.id, _deleted: true }, row)),
  };
}
