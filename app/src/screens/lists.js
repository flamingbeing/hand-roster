// The Lists tab (#lists-host): the weekly template of OT lists and clinics, one row per list per session, Monday to Friday.
// The Week tab lays a week's own changes over it (a consultant away, a list closed), so this is where the usual pattern lives.
import { icon, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { SITES, KINDS, STATUSES, DAYS } from '../data/lists.js';
import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

const KIND_LABEL = Object.fromEntries(KINDS);
const STATUS_LABEL = Object.fromEntries(STATUSES);

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  const host = $('lists-host');
  const empty = emptyState(host, { title: 'No lists yet', hint: 'Add the OT lists and clinics that run each week. The Week tab is built from them.' });
  const bar = h('div', { class: 'rl-bar' });
  const body = h('div', { class: 'rl-body' });
  host.append(bar, body);
  store.on(['lists', 'people'], () => draw());
  ctx.onRole(() => draw());

  /** @returns {import('../data/lists.js').ListRow[]} */
  const rows = () => /** @type {any} */ (store.get('lists'));
  const consultants = () => /** @type {import('../data/people.js').PersonRow[]} */ (/** @type {any} */ (store.get('people')))
    .filter(p => p.grade === 'con' && p.active !== false).map(p => p.name).sort();

  /** @param {import('../data/lists.js').ListRow | null} row @param {Partial<import('../data/lists.js').ListRow>} [seed]  a new list starts from these (Copy) */
  function open(row, seed = {}) {
    const from = row ?? seed;
    sheet.open({
      title: row ? 'Edit list' : 'Add list', saveLabel: 'Save',
      values: { site: from.site ?? 'NUH', kind: from.kind ?? 'ot', name: from.name ?? '', wd: String(from.wd ?? 1), session: from.session ?? 'AM', consultant: from.consultant ?? '',
        rooms: from.rooms ?? '', patients: from.patients ?? null, need: from.need ?? 1, status: from.status ?? 'open', external: !!from.external },
      fields: [
        { key: 'site', label: 'Site', type: 'select', options: SITES.map(s => /** @type {[string, string]} */ ([s, s])) },
        { key: 'kind', label: 'Kind', type: 'select', options: KINDS },
        { key: 'name', label: 'Name', required: true, max: 40, hint: 'What the roster calls it, for example the room or the clinic name.' },
        { key: 'wd', label: 'Day', type: 'select', options: DAYS.map((d, i) => /** @type {[string, string]} */ ([String(i + 1), d])) },
        { key: 'session', label: 'Session', type: 'select', options: [['AM', 'AM'], ['PM', 'PM']] },
        { key: 'consultant', label: 'Consultant', type: 'select', options: () => {
          const list = consultants(), cur = from.consultant;
          return [['', 'Nobody'], ...(cur && !list.includes(cur) ? [cur, ...list] : list).map(n => /** @type {[string, string]} */ ([n, n]))];
        } },
        { key: 'rooms', label: 'Rooms', max: 40 },
        { key: 'patients', label: 'Patients', type: 'number', min: 0, max: 200 },
        { key: 'need', label: 'Juniors needed', type: 'number', min: 0, max: 10 },
        { key: 'status', label: 'Status', type: 'select', options: STATUSES },
        { key: 'external', label: 'Run by another team (nobody from here is placed)', type: 'check' },
      ],
      onDelete: row ? async () => { toast(await app.data.lists.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        const fields = { site: v.site, kind: v.kind, name: v.name, wd: Number(v.wd), session: v.session, consultant: v.consultant || null, rooms: v.rooms || null,
          patients: v.patients, need: v.need ?? 0, status: v.status, external: v.external };
        toast((row ? await app.data.lists.edit(row, fields) : await app.data.lists.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('lists')) return;
    const all = rows(), canWrite = ctx.canWrite();
    empty.show(!all.length && canWrite);
    fill(bar, canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'lists-add', onclick: () => open(null) }, icon(ICONS.plus), 'Add list'));
    fill(body, DAYS.map((d, i) => {
      const mine = all.filter(r => r.wd === i + 1).sort((a, b) => (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1) || a.site.localeCompare(b.site) || a.name.localeCompare(b.name));
      if (!mine.length) return null;
      return h('section', { class: 'rl-block' }, heading(d, mine.length),
        rowList(d, mine.map(r => ({
          main: `${r.session} · ${r.site} · ${r.name}`, dim: r.status === 'closed',
          sub: [KIND_LABEL[r.kind], r.consultant, r.rooms, r.need ? `${r.need} junior${r.need === 1 ? '' : 's'}` : 'no juniors', r.status === 'open' ? '' : STATUS_LABEL[r.status]].filter(Boolean).join(' · '),
          onOpen: canWrite ? () => open(r) : null,
        }))),
        canWrite && h('button', { type: 'button', class: 'rl-more', onclick: () => open(null, { wd: i + 1 }) }, icon(ICONS.plus), `Add to ${d}`));
    }));
  }
  draw();
  return { draw };
}
