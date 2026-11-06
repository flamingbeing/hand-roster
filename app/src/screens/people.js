// The People tab (#people-host): the doctors the roster places, by team (the default) or by grade (a toggle anyone can use, kept on this
// device). Add, edit and take off (inactive people stay in the
// data, so old rosters still read; delete sends one to the bin). A name is the key leave, requests and calls use.
import { icon, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { GRADES, RANKS, SITES, WORKS, byTeam } from '../data/people.js';

import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
/** @param {string[]} w @returns {string} 'Mon, Wed AM' */
const worksText = w => DAY_NAMES.map((d, i) => { const am = w.includes(`${i + 1}AM`), pm = w.includes(`${i + 1}PM`); return am && pm ? d : am ? `${d} AM` : pm ? `${d} PM` : ''; }).filter(Boolean).join(', ');

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
  let view = (() => { try { return localStorage.getItem(VIEW_KEY) === 'grade' ? 'grade' : 'team'; } catch { return 'team'; } })();
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
    // "Works on": Mon to Fri, AM and PM; none ticked = every session
    const ticks = new Map(WORKS.map(k => [k, h('input', { type: 'checkbox', checked: !!row?.works?.includes(k), 'aria-label': `${DAY_NAMES[Number(k[0]) - 1]} ${k.slice(1)}` })]));
    const works = h('div', { class: 'ep-wrap' }, h('p', { class: 'small' }, 'Works on, for day lists (none ticked: every day; calls are set apart)'),
      h('table', { class: 'ep-table pp-works' }, h('thead', {}, h('tr', {}, h('th', {}), DAY_NAMES.map(d => h('th', {}, d)))),
        h('tbody', {}, ['AM', 'PM'].map(s => h('tr', {}, h('th', {}, s), [1, 2, 3, 4, 5].map(d => h('td', {}, ticks.get(`${d}${s}`))))))));
    sheet.open({
      title: row ? 'Edit person' : 'Add person', saveLabel: 'Save',
      note: 'Leave, requests and calls use the name, so changing it does not change what was entered under the old one.',
      values: { name: row?.name ?? '', grade: row?.grade ?? 'reg', rank: row?.rank ?? '', site: row?.site ?? '', team: row?.team ?? '', active: row?.active !== false, noCall: !!row?.noCall, moCalls: !!row?.moCalls, siteOnly: !!row?.siteOnly, byHand: !!row?.byHand, clinicsOnly: !!row?.clinicsOnly, extra: !!row?.extra },
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
        { key: 'moCalls', label: 'MO calls only (a registrar not at REG level for calls)', type: 'check' },
        { key: 'siteOnly', label: 'Works only at their home site (lists and calls)', type: 'check' },
        { key: 'byHand', label: 'On lists by hand only; still on call', type: 'check' },
        { key: 'clinicsOnly', label: 'Clinics only (never OT or MSP)', type: 'check' },
        { key: 'extra', label: 'Extra to a list (an outposter or a visitor), only placed when short', type: 'check' },
      ],
      body: { node: works, read: () => ({ works: WORKS.filter(k => /** @type {HTMLInputElement} */ (ticks.get(k)).checked) }) },
      warn: v => (others.includes(String(v.name).toLowerCase()) ? ['Someone on the roster already has this name.'] : []),
      onDelete: row ? async () => { toast(await app.data.people.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        if (others.includes(String(v.name).toLowerCase())) { toast('That name is taken.'); return; }
        const fields = { name: v.name, grade: v.grade, rank: v.rank || null, site: v.site || null, team: v.team || null, active: v.active, noCall: v.noCall, moCalls: v.moCalls, siteOnly: v.siteOnly, byHand: v.byHand, works: v.works?.length ? v.works : null, clinicsOnly: v.clinicsOnly, extra: v.extra };
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
    fill(bar, all.length > 0 && h('div', { class: 'pp-views', role: 'group', 'aria-label': 'Group people' }, chip('team', 'By team'), chip('grade', 'By grade')),
      canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'people-add', onclick: () => open(null) }, icon(ICONS.plus), 'Add person'));
    const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
    /** @param {import('../data/people.js').PersonRow} r @param {(string | false | null | undefined)[]} first */
    const row = (r, first) => ({
      main: r.name, dim: r.active === false,
      sub: [...first, r.rank, r.site, r.noCall && 'no calls', !r.noCall && r.moCalls && r.grade === 'reg' && 'MO calls', r.siteOnly && r.site && `${r.site} only`, r.byHand && 'by hand', r.works?.length && worksText(r.works), r.clinicsOnly && 'clinics only', r.extra && 'extra'].filter(Boolean).join(' · '),
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
