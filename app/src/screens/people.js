// The People tab (#people-host): the doctors the roster places, by grade. Add, edit and take off (inactive people stay in the
// data, so old rosters still read; delete sends one to the bin). A name is the key leave, requests and calls use.
import { icon, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { GRADES, RANKS, SITES } from '../data/people.js';
import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  const host = $('people-host');
  const empty = emptyState(host, { title: 'No people yet', hint: 'Add the consultants, registrars and medical officers the roster places.' });
  const bar = h('div', { class: 'rl-bar' });
  const body = h('div', { class: 'rl-body' });
  host.append(bar, body);
  store.on(['people'], () => draw());
  ctx.onRole(() => draw());

  /** @returns {import('../data/people.js').PersonRow[]} */
  const rows = () => /** @type {any} */ (store.get('people'));

  /** @param {import('../data/people.js').PersonRow | null} row */
  function open(row) {
    const others = rows().filter(r => r.id !== row?.id && r.active !== false).map(r => r.name.toLowerCase());
    sheet.open({
      title: row ? 'Edit person' : 'Add person', saveLabel: 'Save',
      note: 'Leave, requests and calls use the name, so changing it does not change what was entered under the old one.',
      values: { name: row?.name ?? '', grade: row?.grade ?? 'reg', rank: row?.rank ?? '', site: row?.site ?? '', active: row?.active !== false, noCall: !!row?.noCall, extra: !!row?.extra },
      fields: [
        { key: 'name', label: 'Name', required: true, max: 60 },
        { key: 'grade', label: 'Grade', type: 'select', options: GRADES },
        { key: 'rank', label: 'Rank', type: 'select', options: v => {
          const list = RANKS[v.grade] ?? [];
          return [['', 'None'], ...(row?.rank && !list.includes(row.rank) ? [row.rank, ...list] : list).map(r => /** @type {[string, string]} */ ([r, r]))];
        } },
        { key: 'site', label: 'Home site', type: 'select', options: [['', 'Any'], ...SITES.map(s => /** @type {[string, string]} */ ([s, s]))] },
        { key: 'active', label: 'On the roster now', type: 'check' },
        { key: 'noCall', label: 'Does not take calls', type: 'check' },
        { key: 'extra', label: 'Extra to a list (an outposter or a visitor), only placed when short', type: 'check' },
      ],
      warn: v => (others.includes(String(v.name).toLowerCase()) ? ['Someone on the roster already has this name.'] : []),
      onDelete: row ? async () => { toast(await app.data.people.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        if (others.includes(String(v.name).toLowerCase())) { toast('That name is taken.'); return; }
        const fields = { name: v.name, grade: v.grade, rank: v.rank || null, site: v.site || null, active: v.active, noCall: v.noCall, extra: v.extra };
        toast((row ? await app.data.people.edit(row, fields) : await app.data.people.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('people')) return;
    const all = rows(), canWrite = ctx.canWrite();
    empty.show(!all.length && canWrite);
    fill(bar, canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'people-add', onclick: () => open(null) }, icon(ICONS.plus), 'Add person'));
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    fill(body, GRADES.map(([g, label]) => {
      const mine = sorted.filter(r => r.grade === g);
      if (!mine.length) return null;
      return h('section', { class: 'rl-block' }, heading(label, mine.filter(r => r.active !== false).length),
        rowList(label, mine.map(r => ({
          main: r.name, dim: r.active === false,
          sub: [r.rank, r.site, r.noCall && 'no calls', r.extra && 'extra'].filter(Boolean).join(' · '),
          tag: r.active === false ? 'Inactive' : '',
          onOpen: canWrite ? () => open(r) : null,
        }))));
    }));
  }
  draw();
  return { draw };
}
