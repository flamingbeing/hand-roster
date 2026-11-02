// The page's copy of the roster's records: cloud.js hands each kind's rows here (onData), the screens read them and ask to be
// told when a kind changes. Nothing is stored beyond the page; the sync engine keeps the device copy.

/** @typedef {import('./cloud.js').Kind} Kind */
/** @typedef {import('./data/ops.js').Row} Row */

export function createStore() {
  /** @type {Partial<Record<Kind, Row[]>>} */
  const rows = {};
  /** @type {Set<Kind>} */
  const heard = new Set();
  /** @type {Set<(kind: Kind, changed: Set<string>) => void>} */
  const subs = new Set();
  return {
    /** @template {Row} [R=Row] @param {Kind} kind @returns {R[]} */
    get: kind => /** @type {any} */ (rows[kind] ?? []),
    /** @param {Kind} kind @param {string} id @returns {Row | undefined} */
    row: (kind, id) => rows[kind]?.find(r => r.id === id),
    /** whether the first rows of a kind have arrived @param {Kind} kind */
    loaded: kind => heard.has(kind),
    /** @param {Kind} kind @param {Row[]} list @param {Set<string>} [changed] */
    set(kind, list, changed = new Set()) { rows[kind] = list; heard.add(kind); for (const fn of [...subs]) fn(kind, changed); },
    /** tell me when any of these kinds changes -> stop @param {Kind[]} kinds @param {(kind: Kind, changed: Set<string>) => void} fn */
    on(kinds, fn) {
      /** @type {(kind: Kind, changed: Set<string>) => void} */
      const f = (kind, changed) => { if (kinds.includes(kind)) fn(kind, changed); };
      subs.add(f);
      return () => { subs.delete(f); };
    },
  };
}
/** @typedef {ReturnType<typeof createStore>} Store */
