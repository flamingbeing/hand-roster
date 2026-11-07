// The saved export layout (spaces/_/layouts/export, one for the space; makers set it, every export reads it): the tally
// columns' order and which are shown, the words on the hand-made grid (its row names, tally heads, call tiers), and what the
// printed sheet carries. Pure: layout.js and xlsx.js call these with whatever was saved; nothing saved = today's sheet.
// Label keys: `tally.<kind>` (a tally column's head), `tally.total`, `tally.who`, `row.<SECTION>` (a grid row's name, the
// section as layout.js SECTIONS writes it), `tier.<tier>` (a call tier in the calls file).

/**
 * @typedef {object} ExportLayout
 * @property {Record<string, string>} labels  key -> the maker's words
 * @property {string[]} order  tally kinds in the order wanted (kinds left out follow, in the default order)
 * @property {string[]} hide  tally kinds not shown
 * @property {{ patients?: boolean }} print  what the printed sheet carries (patients unset = this device's option)
 */

/** @param {any} saved the saved record (or undefined) @returns {ExportLayout} */
export function layoutOf(saved) {
  /** @type {Record<string, string>} */
  const labels = {};
  if (saved?.labels && typeof saved.labels === 'object') {
    for (const [k, v] of Object.entries(saved.labels)) if (typeof v === 'string' && v.trim() && k.length <= 60) labels[k] = v.trim().slice(0, 60);
  }
  const list = (/** @type {any} */ v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  const print = saved?.print && typeof saved.print.patients === 'boolean' ? { patients: saved.print.patients } : {};
  return { labels, order: list(saved?.order), hide: list(saved?.hide), print };
}

/** @param {ExportLayout | undefined} xl @param {string} key @param {string} dflt @returns {string} the maker's words, else the default */
export const labelOf = (xl, key, dflt) => xl?.labels[key] ?? dflt;

/**
 * The tally columns as exported: the saved order, hidden ones left out, heads as labelled.
 * @template {string} K
 * @param {ExportLayout | undefined} xl @param {[K, string][]} all  the default columns @returns {[K, string][]}
 */
export function tallyColumns(xl, all) {
  const rank = (/** @type {K} */ k) => { const i = xl?.order.indexOf(k) ?? -1; return i < 0 ? 1000 + all.findIndex(a => a[0] === k) : i; };
  return all.filter(([k]) => !xl?.hide.includes(k)).sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, head]) => [k, labelOf(xl, `tally.${k}`, head)]);
}
