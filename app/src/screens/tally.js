// The Fairness sheet (loaded when the Calls tab's Fairness button is tapped): per person over a month or any range, the calls
// by tier, weekend and holiday calls, list sessions and EOT lists, and one weighted score (roster/tally.js), most carried
// first, with the average at the foot. A maker also sets the weights here (Save keeps them for the space and for the Excel
// file's Fairness sheet); the table follows the numbers as they are typed. A viewer reads the same table.
import { h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { asMaker } from '../roster/drafts.js';
import { daysIn } from '../roster/dates.js';
import { TIER_LABEL } from '../roster/model.js';
import { WEIGHT_KEYS, tallyOf, weightsOf, mondaysIn } from '../roster/tally.js';
import { editSheet } from './sheet.js';

/** @param {string} month YYYY-MM @returns {string} its last day */
const lastDay = month => `${month}-${String(daysIn(month)).padStart(2, '0')}`;

/**
 * @param {import('../store.js').Store} store @param {boolean} maker @param {string} from first day @param {string} to last day
 * @param {Record<string, number>} weights @returns {ReturnType<typeof tallyOf>}
 */
export function tallyFromStore(store, maker, from, to, weights) {
  const lay = (/** @type {any} */ r) => (maker ? asMaker(r) : r);
  const rosters = /** @type {any[]} */ (store.get('rosters')).filter(r => !r._deleted).map(lay);
  const mons = new Set(mondaysIn(from, to));
  const weeks = /** @type {any[]} */ (store.get('weeks')).filter(r => !r._deleted && mons.has(r.id)).map(lay);
  return tallyOf({ calls: rosters.flatMap(r => r.calls ?? []), weeks, from, to, holidays: rosters.flatMap(r => r.holidays ?? []), weights });
}

/** @param {import('./context.js').Context} ctx @param {string} month the month the Calls tab shows */
export function openTally(ctx, month) {
  const { app, store, toast } = ctx;
  const maker = ctx.canWrite();
  const saved = /** @type {any} */ (store.row('layouts', 'tally'));
  const from = h('input', { type: 'month', id: 'ty-from', value: month, 'aria-label': 'From month' });
  const to = h('input', { type: 'month', id: 'ty-to', value: month, 'aria-label': 'To month' });
  const wInputs = new Map(WEIGHT_KEYS.map(([k, label]) => [k, h('input', { type: 'number', id: `ty-w-${k}`, min: 0, max: 20, step: 0.1,
    value: String(weightsOf(saved)[k]), 'aria-label': label })]));
  const table = h('div', { class: 'ty-table' });
  const weights = () => Object.fromEntries([...wInputs].map(([k, i]) => { const v = /** @type {HTMLInputElement} */ (i).value; return [k, v === '' ? NaN : Number(v)]; }));
  const draw = () => {
    const a = /** @type {HTMLInputElement} */ (from).value, b = /** @type {HTMLInputElement} */ (to).value;
    if (!a || !b || a > b) { fill(table, h('p', { class: 'small' }, 'Pick a first month, then a last month that is the same or later.')); return; }
    const rows = tallyFromStore(store, maker, `${a}-01`, lastDay(b), weightsOf({ weights: weights() }));
    if (!rows.length) { fill(table, h('p', { class: 'small' }, 'Nobody has a call or a list in these months yet.')); return; }
    const tiers = Object.keys(TIER_LABEL).filter(t => rows.some(r => r.tiers[t]));
    const avg = (/** @type {(r: typeof rows[0]) => number} */ f) => Math.round(rows.reduce((n, r) => n + f(r), 0) / rows.length * 10) / 10;
    fill(table, h('table', { class: 'ty-grid', id: 'ty-table' },
      h('thead', {}, h('tr', {}, ['Name', ...tiers.map(t => TIER_LABEL[/** @type {keyof typeof TIER_LABEL} */ (t)]), 'Weekend/PH', 'Lists', 'EOT', 'Score'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows.map(r => h('tr', { 'data-name': r.name }, h('th', { scope: 'row' }, r.name),
        tiers.map(t => h('td', {}, r.tiers[t] ? String(r.tiers[t]) : '·')), h('td', {}, String(r.weekend)), h('td', {}, String(r.lists)), h('td', {}, String(r.eot)),
        h('td', { class: 'ty-score' }, String(r.score))))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Average'), tiers.map(t => h('td', {}, String(avg(r => r.tiers[t] ?? 0)))),
        h('td', {}, String(avg(r => r.weekend))), h('td', {}, String(avg(r => r.lists))), h('td', {}, String(avg(r => r.eot))), h('td', { class: 'ty-score' }, String(avg(r => r.score)))))));
  };
  const node = h('div', { class: 'ty-body', oninput: draw },
    h('div', { class: 'field' }, h('label', { for: 'ty-from' }, 'From'), from), h('div', { class: 'field' }, h('label', { for: 'ty-to' }, 'To'), to),
    table,
    maker && h('details', { class: 'ty-weights' }, h('summary', {}, 'Weights (how much each counts in the score)'),
      WEIGHT_KEYS.map(([k, label]) => h('div', { class: 'field' }, h('label', { for: `ty-w-${k}` }, label), /** @type {HTMLElement} */ (wInputs.get(k))))));
  draw();
  editSheet().open({
    title: 'Fairness', saveLabel: maker ? 'Save weights' : 'Close', fields: [],
    note: 'Calls, weekend and holiday calls, lists and EOT lists carried in the months picked, and a score from the weights.',
    body: { node, read: () => ({}) },
    onSave: maker ? async () => {
      const w = weightsOf({ weights: weights() });
      toast(await app.data.layouts.upsert('tally', saved, { weights: w }) ? REFUSED : 'Saved the weights');
    } : undefined,
  });
}
