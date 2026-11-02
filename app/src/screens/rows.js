// The rows the People, Lists and Leave tabs draw: a name with a line under it, a button when the person can edit it (a
// viewer, a junior on a phone, reads the same rows without the button).
import { h } from '../dom.js';

/**
 * @typedef {object} Row
 * @property {string} main
 * @property {string} [sub]
 * @property {string} [tag]  a short word at the end of the row
 * @property {boolean} [dim]  a row that does not count now (an inactive person, a closed list)
 * @property {(() => void) | null} [onOpen]
 */

/** @param {string} label @param {Row[]} rows @returns {HTMLElement} */
export function rowList(label, rows) {
  return h('ul', { class: 'ui-list rl-list', 'aria-label': label }, rows.map(r => {
    const body = [h('span', { class: 'rl-main' }, r.main), r.sub && h('span', { class: 'rl-sub small' }, r.sub), r.tag && h('span', { class: 'rl-tag small' }, r.tag)];
    return h('li', { class: r.dim ? 'rl-row is-dim' : 'rl-row' },
      r.onOpen ? h('button', { type: 'button', class: 'ui-row rl-open', onclick: r.onOpen }, body) : h('div', { class: 'ui-row' }, body));
  }));
}

/** a heading over a block of rows @param {string} title @param {number} [count] */
export const heading = (title, count) => h('h2', { class: 'rl-head' }, title, count != null && h('span', { class: 'small' }, String(count)));
