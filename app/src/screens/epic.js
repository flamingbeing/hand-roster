// "Check against Epic" on the Week tab, apart from week.js so the first screen loads less: the week's consultants by Mon
// to Fri AM and PM, each box the patients Epic has booked or A for away. Loaded on first use. Only the boxes typed in are
// saved, so an untouched box keeps that week's changes; a box that can't be read stops the save (7 Nov 2026).
import { h } from '../dom.js';
import { addDays, rangeDays, weekdayName } from '../roster/dates.js';
import { slotsFor } from '../data/lists.js';
import { epicBoxText, epicChanges, readEpicBox } from '../roster/week-edits.js';
import { weekTitle } from './week.js';

/**
 * "Check against Epic": the week's consultants by Mon to Fri AM and PM. A box takes the patients Epic has booked (0 greys
 * the list out) or A for away; a box with no list is a dash. "Away all week" fills a row. Saved as this week's changes.
 * @template M
 * @param {{ m: M & { templates: import('../data/lists.js').ListRow[], wk?: import('../data/plans.js').WeekRow }, monday: string,
 *   sheet: ReturnType<typeof import('./sheet.js').editSheet>, toast: (text: string) => void,
 *   saveOverrides: (changes: [string, Partial<import('../data/lists.js').Override> | null][]) => Promise<void> }} o  saveOverrides: laid
 *   over the week's changes as they are when saved
 */
export function epicSheet({ m, monday, sheet, toast, saveOverrides }) {
  const raw = slotsFor(m.templates, monday, m.wk?.overrides);
  const cons = [...new Set(raw.map(l => l.consultant).filter(/** @returns {c is string} */ c => !!c))].sort();
  if (!cons.length) { toast('No lists have a consultant this week.'); return; }
  const days = rangeDays(monday, addDays(monday, 4));
  /** @type {Map<string, { input: HTMLInputElement, lists: import('../roster/model.js').ListSlot[], label: string, was: string }>} */
  const boxes = new Map();
  const table = h('table', { class: 'ep-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Consultant'), days.map(d => h('th', { scope: 'col', colspan: 2 }, `${weekdayName(d)} ${Number(d.slice(8))}`))),
      h('tr', {}, h('th', {}), days.map(() => [h('th', { class: 'small' }, 'AM'), h('th', { class: 'small' }, 'PM')]))),
    h('tbody', {}, cons.map(c => {
      const rowBoxes = /** @type {HTMLInputElement[]} */ ([]);
      const cells = days.flatMap(d => /** @type {const} */ (['AM', 'PM']).map(s => {
        const lists = raw.filter(l => l.consultant === c && l.day === d && l.session === s);
        if (!lists.length) return h('td', { class: 'ep-none', 'aria-label': 'no list' }, '–');
        const value = epicBoxText(lists), label = `${weekdayName(d)} ${Number(d.slice(8))} ${s}, ${c}`;
        const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'text', maxlength: 3, size: 3, value, autocomplete: 'off',
          'aria-label': `${c}, ${weekdayName(d)} ${s}: patients, or A for away`, title: lists.map(l => l.name).join(', ') }));
        // the browser holds Save back (and points at the box) while it can't be read
        input.addEventListener('input', () => input.setCustomValidity(readEpicBox(input.value) ? '' : `${label}: type a number or A`));
        boxes.set(`${c}|${d}|${s}`, { input, lists, label, was: value });
        rowBoxes.push(input);
        return h('td', {}, input);
      }));
      return h('tr', {}, h('th', { scope: 'row' }, h('span', {}, c),
        h('button', { type: 'button', class: 'ep-away small', onclick: () => { for (const b of rowBoxes) { b.value = 'A'; b.dispatchEvent(new Event('input', { bubbles: true })); } } }, 'Away all week')), cells);
    })));
  /** @param {Record<string, any>} v  the boxes as the sheet read them */
  const read = v => epicChanges([...boxes].map(([k, b]) => ({ label: b.label, was: b.was, now: String(v[k] ?? ''), lists: b.lists.map(l => l.id) })));
  sheet.open({
    title: 'Check against Epic', saveLabel: 'Save',
    note: `${weekTitle(monday)}. Type the patients Epic has booked (0 = none, the list is greyed out) or A when the consultant is away: their clinics close and their OT list becomes an emergency slot a registrar leads. Empty keeps the usual; a box left as it opened changes nothing.`,
    fields: [],
    body: { node: h('div', { class: 'ep-wrap' }, table), read: () => Object.fromEntries([...boxes].map(([k, b]) => [k, b.input.value.trim()])) },
    warn: v => read(v).bad,
    onSave: v => {
      const { changes, bad } = read(v);
      if (bad.length) { toast(bad[0]); return; }
      return changes.length ? saveOverrides(changes) : undefined;
    },
  });
}
