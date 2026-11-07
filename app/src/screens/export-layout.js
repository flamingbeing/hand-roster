// The export layout sheet (the Rules tab's "Export layout", makers only): what the printed sheet, the hand-grid Excel and the
// calls Excel say. Words for the grid's rows, the tally heads and the call tiers; which tally columns show and in what order
// (position 1 = first; columns left blank follow in the usual order); whether the print carries patient counts. Saved for the
// space (spaces/_/layouts/export, roster/export-layout.js); every export reads it, so a changed word is in the next file.
import { REFUSED } from '../items.js';
import { TIERS, TIER_LABEL } from '../roster/model.js';
import { HAND_NAMES, TALLY } from '../roster/layout.js';
import { labelOf, layoutOf } from '../roster/export-layout.js';
import { editSheet } from './sheet.js';

/** @typedef {import('./sheet.js').Field} Field */

/** @param {import('./context.js').Context} ctx */
export function openExportLayout(ctx) {
  const { app, store, toast } = ctx;
  const row = /** @type {any} */ (store.row('layouts', 'export'));
  const xl = layoutOf(row);
  /** @type {Field[]} */
  const fields = [];
  /** @type {Record<string, any>} */
  const values = { patients: xl.print.patients === undefined ? '' : xl.print.patients ? 'yes' : 'no' };
  /** @type {[string, string, string][]} */
  const words = [
    ...Object.entries(HAND_NAMES).map(([sec, name]) => /** @type {[string, string, string]} */ ([`row.${sec}`, `Grid row: ${name}`, name])),
    ...TALLY.map(([k, head]) => /** @type {[string, string, string]} */ ([`tally.${k}`, `Tally column: ${head}`, head])),
    ['tally.who', 'Tally names heading', 'Sessions'], ['tally.total', 'Tally total heading', 'Total'],
    ...TIERS.map(t => /** @type {[string, string, string]} */ ([`tier.${t}`, `Call tier: ${TIER_LABEL[t]}`, TIER_LABEL[t]])),
  ];
  for (const [key, label, dflt] of words) {
    fields.push({ key: `lbl.${key}`, label, max: 60, hint: `Empty: ${dflt}` });
    values[`lbl.${key}`] = xl.labels[key] ?? '';
  }
  const order = [...TALLY.map(a => a[0])].sort((a, b) => (xl.order.indexOf(a) + 1 || 99) - (xl.order.indexOf(b) + 1 || 99));
  TALLY.forEach(([k, head]) => {
    fields.push({ key: `show.${k}`, label: `Show tally column: ${labelOf(xl, `tally.${k}`, head)}`, type: 'check' });
    fields.push({ key: `pos.${k}`, label: `Position of ${labelOf(xl, `tally.${k}`, head)}`, type: 'number', min: 1, max: 20 });
    values[`show.${k}`] = !xl.hide.includes(k);
    values[`pos.${k}`] = xl.order.length ? order.indexOf(k) + 1 : null;
  });
  fields.push({ key: 'patients', label: 'Print: patient counts', type: 'select',
    options: [['', 'As this device is set'], ['yes', 'Always show'], ['no', 'Never show']] });
  editSheet().open({
    title: 'Export layout', saveLabel: 'Save', fields, values,
    note: 'The words and columns the print and the Excel files use, for everyone. Empty words are the standard ones.',
    onSave: async v => {
      /** @type {Record<string, string>} */
      const labels = {};
      for (const [key, , dflt] of words) { const t = String(v[`lbl.${key}`] ?? '').trim(); if (t && t !== dflt) labels[key] = t; }
      const kinds = TALLY.map(a => a[0]);
      const ordered = kinds.filter(k => v[`pos.${k}`] != null).sort((a, b) => v[`pos.${a}`] - v[`pos.${b}`]);
      const print = v.patients === 'yes' ? { patients: true } : v.patients === 'no' ? { patients: false } : {};
      toast(await app.data.layouts.upsert('export', row, { labels, order: ordered, hide: kinds.filter(k => !v[`show.${k}`]), print }) ? REFUSED : 'Saved the export layout');
    },
  });
}
