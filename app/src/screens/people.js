// The People tab (#people-host): the doctors the roster places, by team (the default) or by grade (a toggle anyone can use, kept on this
// device). Add, edit and take off (inactive people stay in the
// data, so old rosters still read; delete sends one to the bin). A name is the key leave, requests and calls use; a rename
// carries the person's leave, requests and lists along (roster/rename.js), while calls made and built weeks keep the old name.
// A phone number is optional; it shows as a call link beside the person's name on call, to every signed-in viewer (7 Nov 2026).
import { icon, emptyState, undoToast } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { GRADES, RANKS, SITES, WORKS, byTeam } from '../data/people.js';
import { renamePlan, planSize, planText } from '../roster/rename.js';

import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
/** @param {string[]} w @returns {string} 'Mon, Wed AM' */
const worksText = w => DAY_NAMES.map((d, i) => { const am = w.includes(`${i + 1}AM`), pm = w.includes(`${i + 1}PM`); return am && pm ? d : am ? `${d} AM` : pm ? `${d} PM` : ''; }).filter(Boolean).join(', ');

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  // the kit's Undo toast on the page's toaster (whose show hands back that toast's dismiss)
  const undo = undoToast({ show: (text, o) => { const gone = toast(text, o); return () => { if (typeof gone === 'function') gone(); }; } }, { ms: 8000 });
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

  /** @param {string} from @param {string} to  the rows a rename changes, from the store as it is now */
  const planFor = (from, to) => renamePlan({ from, to, leave: store.get('leave'), requests: store.get('requests'), lists: store.get('lists') });
  /** @typedef {'leave' | 'requests' | 'lists'} Carried */
  const CARRIED = /** @type {Carried[]} */ (['leave', 'requests', 'lists']);

  /**
   * Edits each row of a rename's plan. -> the edits that went through, and whether any was refused.
   * @param {ReturnType<typeof planFor>} plan
   */
  async function carry(plan) {
    const all = CARRIED.flatMap(kind => plan[kind].map(([r, patch]) => /** @type {[Carried, import('../data/ops.js').Row, Record<string, string>]} */ ([kind, r, patch])));
    const said = await Promise.all(all.map(([kind, r, patch]) => app.data[kind].edit(r, patch)));
    return { done: all.filter((_, i) => !said[i]), refused: said.some(Boolean) };
  }

  /**
   * Undo of a rename: the old name back on the person and on each row it changed, on the rows as they are by then (a row
   * deleted since is left alone). The person's other fields from the same save stay.
   * @param {import('../data/people.js').PersonRow} was @param {Awaited<ReturnType<typeof carry>>['done']} done
   */
  async function unrename(was, done) {
    const now = store.row('people', was.id);
    const said = await Promise.all([
      now ? app.data.people.edit(now, { name: was.name }) : '',
      ...done.map(([kind, r, patch]) => {
        const cur = store.row(kind, r.id);
        return cur ? app.data[kind].edit(cur, Object.fromEntries(Object.keys(patch).map(k => [k, r[k]]))) : '';
      }),
    ]);
    if (said.some(Boolean)) toast(REFUSED);
  }

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
      note: 'Leave, requests and lists can change with the name; calls already made and built weeks keep the old one.',
      values: { name: row?.name ?? '', carry: true, grade: row?.grade ?? 'reg', rank: row?.rank ?? '', site: row?.site ?? '', team: row?.team ?? '', phone: row?.phone ?? '', active: row?.active !== false, noCall: !!row?.noCall, moCalls: !!row?.moCalls, siteOnly: !!row?.siteOnly, byHand: !!row?.byHand, clinicsOnly: !!row?.clinicsOnly, extra: !!row?.extra },
      fields: [
        { key: 'name', label: 'Name', required: true, max: 60 },
        ...(row ? [{ key: 'carry', label: 'Also change it in their leave, requests and lists', type: /** @type {const} */ ('check') }] : []),
        { key: 'grade', label: 'Grade', type: 'select', options: GRADES },
        { key: 'rank', label: 'Rank', type: 'select', options: v => {
          const list = RANKS[v.grade] ?? [];
          return [['', 'None'], ...(row?.rank && !list.includes(row.rank) ? [row.rank, ...list] : list).map(r => /** @type {[string, string]} */ ([r, r]))];
        } },
        { key: 'site', label: 'Home site', type: 'select', options: [['', 'Any'], ...SITES.map(s => /** @type {[string, string]} */ ([s, s]))] },
        { key: 'team', label: 'Team', max: 30, list: 'people-teams' },
        { key: 'phone', label: 'Phone (optional)', type: 'tel', max: 20, hint: 'A call link beside their name when on call; everyone signed in sees it.' },
        { key: 'active', label: 'On the roster now', type: 'check' },
        { key: 'noCall', label: 'Does not take calls', type: 'check' },
        { key: 'moCalls', label: 'MO calls only (a registrar not at REG level for calls)', type: 'check' },
        { key: 'siteOnly', label: 'Works only at their home site (lists and calls)', type: 'check' },
        { key: 'byHand', label: 'On lists by hand only; still on call', type: 'check' },
        { key: 'clinicsOnly', label: 'Clinics only (never OT or MSP)', type: 'check' },
        { key: 'extra', label: 'Extra to a list (an outposter or a visitor), only placed when short', type: 'check' },
      ],
      body: { node: works, read: () => ({ works: WORKS.filter(k => /** @type {HTMLInputElement} */ (ticks.get(k)).checked) }) },
      warn: v => {
        const name = String(v.name);
        const plan = row && name && name !== row.name ? planText(planFor(row.name, name)) : '';
        return [others.includes(name.toLowerCase()) && 'Someone on the roster already has this name.',
          plan && (v.carry ? `Also changes the name in ${plan}.` : `The old name stays on ${plan}.`),
          /[^\d +]/.test(String(v.phone ?? '')) && 'Only digits, spaces and + are kept in the phone.'].filter(s => !!s).map(String);
      },
      onDelete: row ? async () => {
        if (await app.data.people.remove(row)) { toast(REFUSED); return; }
        // Undo puts the same record back, under its own id
        undo.show(`Deleted ${row.name}`, async () => { if (await app.data.people.put(row)) toast(REFUSED); });
      } : undefined,
      onSave: async v => {
        if (others.includes(String(v.name).toLowerCase())) { toast('That name is taken.'); return; }
        const fields = { name: v.name, grade: v.grade, rank: v.rank || null, site: v.site || null, team: v.team || null, phone: v.phone || null, active: v.active, noCall: v.noCall, moCalls: v.moCalls, siteOnly: v.siteOnly, byHand: v.byHand, works: v.works?.length ? v.works : null, clinicsOnly: v.clinicsOnly, extra: v.extra };
        if (!row) { toast(await app.data.people.add(fields) ? REFUSED : 'Saved'); return; }
        // the rows under the old name first, then the person (as the store holds them at Save)
        const plan = v.carry && v.name !== row.name ? planFor(row.name, v.name) : null;
        const { done, refused } = plan && planSize(plan) ? await carry(plan) : { done: [], refused: false };
        if (await app.data.people.edit(row, fields) || refused) { toast(REFUSED); return; }
        if (!done.length) { toast('Saved'); return; }
        undo.show(`Saved. Name changed in ${done.length} ${done.length === 1 ? 'row' : 'rows'}.`, () => unrename(row, done));
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
      sub: [...first, r.rank, r.site, r.phone, r.noCall && 'no calls', !r.noCall && r.moCalls && r.grade === 'reg' && 'MO calls', r.siteOnly && r.site && `${r.site} only`, r.byHand && 'by hand', r.works?.length && worksText(r.works), r.clinicsOnly && 'clinics only', r.extra && 'extra'].filter(Boolean).join(' · '),
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
