// Page lookups shared by the shell and the screens.
import { icon } from '@core/ui';
import { ICONS } from './icons.js';

/** @param {string} id @returns {HTMLElement} */
export const $ = id => { const el = document.getElementById(id); if (!el) throw new Error(`#${id} is missing`); return el; };
/** @param {string} id */
export const input = id => /** @type {HTMLInputElement} */ ($(id));
/** @param {string} id */
export const dialog = id => /** @type {HTMLDialogElement} */ ($(id));

/** @typedef {import('./items.js').State} State */
/** @typedef {{ show: (s: State) => void, hide: () => void }} Screen */

/**
 * A screen that is one section of the page (index.html), shown and hidden with it.
 * @param {string} id  the section's id
 * @param {(s: State) => void} [fill]  brings the section up to date before it shows
 * @returns {Screen}
 */
export function sectionScreen(id, fill = () => {}) {
  const section = $(id);
  return {
    show(s) { fill(s); section.hidden = false; },
    hide() { section.hidden = true; },
  };
}

// A small element builder for the screens: h('button', { class: 'x', onclick: fn }, 'text', child). Properties set classes,
// data-*, ARIA and events; a false or null value leaves the attribute out. Never an inline style (the page's CSP forbids
// it): a look is a class in app.css.

/**
 * @param {string} tag
 * @param {Record<string, any>} [props]  class, dataset ({ id: 'x' }), on<event> handlers, anything else as an attribute
 * @param {...any} kids  nodes, texts, or arrays of them (null, false and undefined are skipped)
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids.flat(2).filter(x => x != null && x !== false));
  return el;
}

/** @param {HTMLElement} node @returns {HTMLElement} the same node, emptied and refilled @param {...any} kids */
export function fill(node, ...kids) { node.replaceChildren(...kids.flat(2).filter(x => x != null && x !== false)); return node; }

/** A phone icon that calls the person (tel:), beside their name where on-call names show; nothing without a number (owner,
 * 7 Nov 2026: every signed-in viewer sees it) @param {Map<string, string>} phones (phonesOf) @param {string | null | undefined} name */
export const telLink = (phones, name) => { const p = name && phones.get(name);
  return p ? h('a', { class: 'tel', href: `tel:${p.replace(/ /g, '')}`, title: p, 'aria-label': `Call ${name}, ${p}` }, icon(ICONS.phone)) : null; };
