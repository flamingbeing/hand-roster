// The People tab (#people-host): the doctors the roster places, by grade or by team (a toggle anyone can use, kept on this
// device). Add, edit and take off (inactive people stay in the
// data, so old rosters still read; delete sends one to the bin). A name is the key leave, requests and calls use.
import { icon, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { GRADES, RANKS, SITES, byTeam } from '../data/people.js';
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
  const teamList = h('datalist', { id: 'people-teams' });
  host.append(bar, body, teamList);
  const VIEW_KEY = 'people-view';
  /** @type {'grade' | 'team'} */
  let view = (() => { try { return localStorage.getItem(VIEW_KEY) === 'team' ? 'team' : 'grade'; } catch { return 'grade'; } })();
  /** @param {'grade' | 'team'} v */
  const setView = v => { view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window: not kept */ } draw(); };
  const gradeLabel = Object.fromEntries(GRADES);
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
      values: { name: row?.name ?? '', grade: row?.grade ?? 'reg', rank: row?.rank ?? '', site: row?.site ?? '', team: row?.team ?? '', active: row?.active !== false, noCall: !!row?.noCall, extra: !!row?.extra },
      fields: [
        { key: 'name', label: 'Name', required: true, max: 60 },
        { key: 'grade', label: 'Grade', type: 'select', options: GRADES },
        { key: 'rank', label: 'Rank', type: 'select', options: v => {
          const list = RANKS[v.grade] ?? [];
          return [['', 'None'], ...(row?.rank && !list.includes(row.rank) ? [row.rank, ...list] : list).map(r => /** @type {[string, string]} */ ([r, r]))];
        } },
        { key: 'site', label: 'Home site', type: 'select', options: [['', 'Any'], ...SITES.map(s => /** @type {[string, string]} */ ([s, s]))] },
        { key: 'team', label: 'Team', max: 30, list: 'people-teams' },
        { key: 'active', label: 'On the roster now', type: 'check' },
        { key: 'noCall', label: 'Does not take calls', type: 'check' },
        { key: 'extra', label: 'Extra to a list (an outposter or a visitor), only placed when short', type: 'check' },
      ],
      warn: v => (others.includes(String(v.name).toLowerCase()) ? ['Someone on the roster already has this name.'] : []),
      onDelete: row ? async () => { toast(await app.data.people.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        if (others.includes(String(v.name).toLowerCase())) { toast('That name is taken.'); return; }
        const fields = { name: v.name, grade: v.grade, rank: v.rank || null, site: v.site || null, team: v.team || null, active: v.active, noCall: v.noCall, extra: v.extra };
        toast((row ? await app.data.people.edit(row, fields) : await app.data.people.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('people')) return;
    const all = rows(), canWrite = ctx.canWrite();
    empty.show(!all.length && canWrite);
    const teams = /** @type {string[]} */ ([...new Set(all.map(r => r.team?.trim()).filter(Boolean))]).sort(new Intl.Collator('en', { numeric: true }).compare);
    fill(teamList, teams.map(t => h('option', { value: t })));
    const chip = (/** @type {'grade' | 'team'} */ v, /** @type {string} */ label) =>
      h('button', { type: 'button', class: 'wk-daychip pp-view', 'aria-pressed': String(view === v), onclick: () => setView(v) }, label);
    fill(bar, all.length > 0 && h('div', { class: 'pp-views', role: 'group', 'aria-label': 'Group people' }, chip('grade', 'By grade'), chip('team', 'By team')),
      canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'people-add', onclick: () => open(null) }, icon(ICONS.plus), 'Add person'));
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    /** @param {import('../data/people.js').PersonRow} r @param {(string | false | null | undefined)[]} first */
    const row = (r, first) => ({
      main: r.name, dim: r.active === false,
      sub: [...first, r.rank, r.site, r.noCall && 'no calls', r.extra && 'extra'].filter(Boolean).join(' · '),
      tag: r.active === false ? 'Inactive' : '',
      onOpen: canWrite ? () => open(r) : null,
    });
    /** @param {string} label @param {import('../data/people.js').PersonRow[]} mine @param {(r: import('../data/people.js').PersonRow) => (string | false | null | undefined)[]} first */
    const block = (label, mine, first) => h('section', { class: 'rl-block' }, heading(label, mine.filter(r => r.active !== false).length),
      rowList(label, mine.map(r => row(r, first(r)))));
    if (view === 'team') {
      fill(body, byTeam(sorted).map(([t, mine]) => block(t, mine, r => [r.grade !== 'con' && !r.rank && gradeLabel[r.grade]])));
      return;
    }
    fill(body, GRADES.map(([g, label]) => {
      const mine = sorted.filter(r => r.grade === g);
      return mine.length ? block(label, mine, r => [r.team]) : null;
    }));
  }
  draw();
  return { draw };
}
