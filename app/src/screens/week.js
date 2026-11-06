// The Week tab (#week-page, the first screen): a week's daily roster. Mon to Fri, AM and PM, each by site, each list with the
// juniors on it; then who is on call, on leave, post-call and free. A phone shows one day at a time (day chips); from 900 px
// wide the five days sit side by side, and printing always shows all five on one landscape page. "Build week" fills the grid
// from the lists, leave and calls (roster/week.js, loaded when first used); a tap on a junior moves, swaps or removes them.
// The grid is stored per week; leave, post-call, on-call and free are worked out each time (roster/sections.js). The lists are
// settled each time too (roster/settle.js): a public holiday closes them, a consultant away closes their clinics and turns
// their OT into an emergency slot. "Check against Epic" takes the week's booked patients and who is away, consultant by
// consultant (their leave is not in the junior leave calendar); the Short panel offers ways to fill a list below its minimum.
import { icon, loadState, confirmModal, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, sectionScreen, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { addDays, mondayOf, nextWorkday, rangeDays, shortDay, weekday, weekdayName, MONTHS, todayKey } from '../roster/dates.js';
import { TIERS, TIER_LABEL, dayType, leads, minOf, regLed, settleLists, tierPlanOf } from '../roster/model.js';
import { callsAround } from '../roster/sections.js';
import { listName, sectionsOf, shortOptions, whyNot } from '../roster/sections.js';
import { gridRows, juniorsOn, move, place } from '../roster/grid.js';
import { firstWeek, makerWeek } from '../roster/sections.js';
import { slotsFor, STATUSES } from '../data/lists.js';
import { activePeople } from '../data/people.js';
import { leaveOf } from '../data/leave.js';
import { editSheet } from './sheet.js';

const SESSIONS = /** @type {const} */ ([['AM', 'Morning'], ['PM', 'Afternoon']]);
const SITE_ORDER = ['NUH', 'NTFGH'];
/** names as small chips, each with an optional note (AM, PM, on call); commas kept for copy and screen readers
 * @param {(string | [string, string])[]} list */
const names = list => h('p', { class: 'wk-names' }, list.map((x, i) => {
  const [n, note] = Array.isArray(x) ? x : [x, ''];
  return h('span', { class: 'wk-name' }, n, note && h('i', {}, ` ${note}`), i < list.length - 1 && h('span', { class: 'visually-hidden' }, ','));
}));

/** @param {string} monday @returns {string} '2 – 6 Nov 2026' */
export function weekTitle(monday) {
  const fri = addDays(monday, 4), [y, m, d] = monday.split('-').map(Number), [fy, fm, fd] = fri.split('-').map(Number);
  return m === fm ? `${d} – ${fd} ${MONTHS[fm - 1]} ${fy}` : `${d} ${MONTHS[m - 1]}${y === fy ? '' : ` ${y}`} – ${fd} ${MONTHS[fm - 1]} ${fy}`;
}

/**
 * @param {import('./context.js').Context} ctx
 */
export function weekScreen(ctx) {
  const { app, store, toast } = ctx;
  let monday = firstWeek(todayKey());
  let selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday;
  let site = 'all';
  let building = false;
  let placed = false;   // the roster maker's first week chosen (makerWeek), or the person has moved off the first week
  const sheet = editSheet();
  const loading = loadState($('week-state'));
  const empty = emptyState($('week-empty'), { title: 'No lists yet', hint: 'Add the weekly lists on the Lists tab, then build the week.' });
  if (!store.loaded('lists')) loading.loading();

  const view = sectionScreen('week-view');
  /** @type {import('../cloud.js').Kind[]} */
  const kinds = ['people', 'lists', 'leave', 'rosters', 'weeks'];
  store.on(kinds, () => draw());
  ctx.onRole(() => draw());
  app.settings.watch('defaultSite', () => { site = String(app.settings.get('defaultSite') || 'all'); draw(); });
  app.settings.watch('showPatients', () => draw());
  site = String(app.settings.get('defaultSite') || 'all');

  /** @param {number} n */
  const step = n => { placed = true; monday = addDays(monday, 7 * n); selected = monday; draw(); };
  $('week-prev').replaceChildren(icon(ICONS.chevronLeft)); $('week-next').replaceChildren(icon(ICONS.chevronRight));
  $('week-prev').addEventListener('click', () => step(-1));
  $('week-next').addEventListener('click', () => step(1));
  $('week-today').addEventListener('click', () => { placed = true; monday = firstWeek(todayKey()); selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday; draw(); });
  $('week-site').addEventListener('change', e => { site = /** @type {HTMLSelectElement} */ (e.target).value; draw(); });
  $('week-print').replaceChildren(icon(ICONS.printer), 'Print');
  $('week-print').addEventListener('click', () => printWeek());
  $('week-xlsx').replaceChildren(icon(ICONS.download), 'Excel (CORE)');
  $('week-xlsx').addEventListener('click', () => exportXlsx('core'));
  $('week-hand-xlsx').replaceChildren(icon(ICONS.download), 'Excel (hand grid)');
  $('week-hand-xlsx').addEventListener('click', () => exportXlsx('hand'));
  $('week-copy').replaceChildren(icon(ICONS.clipboardCopy), 'Copy for WhatsApp');
  $('week-copy').addEventListener('click', () => copyTomorrow());
  // Ctrl+P and the browser's own print draw the same sheet, once the export code has been loaded by a button or the idle load below
  /** @type {typeof import('./export.js') | null} */
  let exporter = null;
  /** @returns {Promise<typeof import('./export.js')>} */
  const exportCode = async () => (exporter ??= await import('./export.js'));
  window.addEventListener('beforeprint', () => { if (exporter && !$('week-page').hidden) exporter.renderPrint($('week-print-sheet'), layoutInput(model(), monday)); });
  $('week-epic').replaceChildren(icon(ICONS.listChecks), 'Check against Epic');
  $('week-epic').addEventListener('click', () => epicSheet(model()));
  $('week-build').replaceChildren(icon(ICONS.sparkles), 'Build week');
  $('week-build').addEventListener('click', () => build());

  /** everything a week is drawn from, as of now @param {string} [mon] a Monday (default: the week on screen) */
  function model(mon = monday) {
    const wk = /** @type {import('../data/plans.js').WeekRow | undefined} */ (store.row('weeks', mon));
    const templates = /** @type {import('../data/lists.js').ListRow[]} */ (store.get('lists'));
    const built = Array.isArray(wk?.grid);
    const grid = wk?.grid ?? [];
    const people = activePeople(/** @type {any} */ (store.get('people')));
    const leave = leaveOf(/** @type {any} */ (store.get('leave')));
    const rosters = /** @type {import('../data/plans.js').RosterRow[]} */ (store.get('rosters'));
    const calls = callsAround(/** @type {any} */ (rosters), mon);
    const holidays = rosters.flatMap(r => r.holidays ?? []);
    const lists = settleLists(built && wk?.lists?.length ? wk.lists : slotsFor(templates, mon, wk?.overrides), { leave, holidays });
    /** @param {string} day @returns {import('../roster/model.js').TierPlan} the call tiers of that day's month */
    const planOn = day => tierPlanOf(rosters.find(r => r.id === day.slice(0, 7))?.tierPlan);
    return { wk, templates, built, lists, grid, people, leave, calls, holidays, planOn };
  }

  /** @param {ReturnType<typeof model>} m @param {string} mon @returns {import('../roster/model.js').TierPlan} both months' tiers when the week crosses a month end */
  const weekPlan = (m, mon) => {
    const a = m.planOn(mon), b = m.planOn(addDays(mon, 6));
    return /** @type {any} */ (Object.fromEntries(Object.entries(a).map(([d, ts]) => [d, [...new Set([...ts, ...b[/** @type {keyof typeof b} */ (d)]])]])));
  };
  /** @param {ReturnType<typeof model>} m @param {string} mon @returns {import('../roster/layout.js').WeekLayoutInput} what the sheet, the print and the chat text are made from */
  const layoutInput = (m, mon) => ({
    monday: mon, lists: m.lists, grid: m.grid, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, tierPlan: weekPlan(m, mon),
    built: m.built, patients: !!app.settings.get('showPatients'),
  });

  /** @param {() => Promise<unknown>} job @param {string} failed */
  async function guarded(job, failed) {
    try { await job(); } catch (e) { toast(e instanceof Error && e.message ? e.message : failed); }
  }
  async function printWeek() {
    await guarded(async () => {
      const x = await exportCode();
      x.renderPrint($('week-print-sheet'), layoutInput(model(), monday));
      window.print();
    }, 'Could not prepare the print.');
  }
  /** @param {'core' | 'hand'} style  the CORE sheet, or the hand-made grid with its formulas */
  async function exportXlsx(style) {
    await guarded(async () => {
      const m = model();
      if (!m.lists.length) { toast('Nothing to export yet.'); return; }
      const x = await exportCode();
      const o = layoutInput(m, monday);
      toast(`Saved ${await (style === 'hand' ? x.exportHandGrid(o) : x.exportWeek(o))}`);
    }, 'Could not make the Excel file.');
  }
  /** copies the next working day's roster as chat text */
  async function copyTomorrow() {
    await guarded(async () => {
      const day = nextWorkday(todayKey()), mon = mondayOf(day);
      const m = model(mon);
      if (!m.built) { toast(`${shortDay(day)} is not built yet. Build that week first.`); return; }
      const x = await exportCode();
      const text = x.whatsappText(day, layoutInput(m, mon));
      toast(await x.copyText(text) ? `Copied ${weekdayName(day)} ${shortDay(day)}. Paste it into WhatsApp.` : 'Could not copy. Allow the clipboard and try again.');
    }, 'Could not copy.');
  }

  async function build() {
    if (building || !ctx.canWrite()) return;
    const m = model();
    if (!m.lists.length) { toast('Add the weekly lists first (Lists tab).'); return; }
    const { buildWeek } = await import('../roster/week.js');
    const raw = slotsFor(m.templates, monday, m.wk?.overrides);
    // ask only when the grid differs from what its last build would make now: a hand change (or leave or calls changed since)
    const asBuilt = () => JSON.stringify(gridRows(buildWeek({ monday, lists: raw, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, seed: m.wk?.seed ?? 0 }).grid)) === JSON.stringify(m.grid.map(r => ({ day: r.day, session: r.session, list: r.list, juniors: r.juniors })));
    if (m.built && m.grid.some(r => r.juniors.length) && !asBuilt() && !await confirmModal('Build this week again? Changes made by hand to its grid are replaced.', { title: 'Build week', yes: 'Build again' })) return;
    building = true; $('week-build').setAttribute('disabled', '');
    try {
      const seed = (m.wk?.seed ?? 0) + 1;
      const res = buildWeek({ monday, lists: raw, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, seed });
      // the lists are kept as the template stood, unsettled, so a holiday or leave taken away later reopens them
      const refused = await app.data.weeks.upsert(monday, m.wk, { grid: gridRows(res.grid), lists: raw, seed, built: Date.now() });
      const short = res.problems.filter(p => p.got < p.min || p.noReg).length;
      toast(refused ? REFUSED : short ? `Built. ${short} list${short === 1 ? ' is' : 's are'} below the minimum: see Short.` : 'Built');
    } finally { building = false; $('week-build').removeAttribute('disabled'); }
  }

  /** @param {Record<string, unknown>} fields the week's grid and lists, saved */
  async function saveGrid(fields) {
    const m = model();
    toast(await app.data.weeks.upsert(monday, m.wk, { lists: m.built && m.wk?.lists?.length ? m.wk.lists : slotsFor(m.templates, monday, m.wk?.overrides), ...fields }) ? REFUSED : 'Saved');
  }

  /** @param {ReturnType<typeof model>} m @param {string} day @param {'AM' | 'PM'} session @param {string} name @param {string} list */
  function moveSheet(m, day, session, name, list) {
    const here = m.lists.filter(l => l.day === day && l.session === session && l.status === 'open');
    const label = (/** @type {any} */ l) => `${l.site} ${l.name}${l.consultant ? ` – ${l.consultant}` : ''}`;
    sheet.open({
      title: name, note: `${shortDay(day)}, ${session === 'AM' ? 'morning' : 'afternoon'}. Now on ${label(m.lists.find(l => l.id === list) ?? { site: '', name: 'no list' })}.`,
      values: { to: list }, saveLabel: 'Move', deleteLabel: 'Take off the list', 
      fields: [
        { key: 'to', label: 'Move to', type: 'select', options: () => [['', 'Free (no list)'], ...here.map(l => /** @type {[string, string]} */ ([l.id, `${label(l)} (${juniorsOn(m.grid, day, session, l.id).length}/${l.need})`]))] },
        { key: 'swap', label: 'Swap with', type: 'select', hint: 'The other person goes to the list this one leaves.',
          options: v => [['', 'Nobody'], ...(v.to ? juniorsOn(m.grid, day, session, v.to).filter(n => n !== name).map(n => /** @type {[string, string]} */ ([n, n])) : [])] },
      ],
      warn: v => (v.to && v.to !== list ? whyNot({ name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: v.to }).filter(w => !w.includes('already on another')) : []),
      onSave: v => saveGrid({ grid: move(m.grid, { day, session, name, to: v.to || null, swapWith: v.swap || null }) }),
      onDelete: () => saveGrid({ grid: move(m.grid, { day, session, name, to: null }) }),
    });
  }

  /** @param {ReturnType<typeof model>} m @param {string} day @param {'AM' | 'PM'} session @param {import('../roster/model.js').ListSlot} l */
  function addSheet(m, day, session, l) {
    const juniors = m.people.filter(p => p.grade !== 'con');
    const sec = sectionsOf({ monday, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid, holidays: m.holidays });
    const freeNames = new Set((sec.free[day] ?? []).filter(f => f.when === 'FULL DAY' || f.when === session).map(f => f.name));
    const ordered = [...juniors.filter(p => freeNames.has(p.name)), ...juniors.filter(p => !freeNames.has(p.name))];
    if (!ordered.length) { toast('Add people first (People tab).'); return; }
    sheet.open({
      title: `Add to ${l.name}`, note: `${l.site}${l.consultant ? ` – ${l.consultant}` : ''}, ${shortDay(day)} ${session === 'AM' ? 'morning' : 'afternoon'}. Free people are listed first.`,
      values: { name: ordered[0].name }, saveLabel: 'Add',
      fields: [{ key: 'name', label: 'Junior', type: 'select', options: ordered.map(p => /** @type {[string, string]} */ ([p.name, `${p.name}${freeNames.has(p.name) ? '' : ' (not free)'}`])) }],
      warn: v => whyNot({ name: v.name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: l.id }).filter(w => !w.includes('already on another')),
      onSave: v => saveGrid({ grid: place(m.grid, day, session, l.id, v.name) }),
    });
  }

  /**
   * A list's changes for this week only (consultant, patients, juniors needed, status): kept in the week's `overrides`, so
   * the Lists tab keeps the usual pattern; "Back to the usual" drops them.
   * @param {ReturnType<typeof model>} m @param {import('../roster/model.js').ListSlot} l
   */
  function weekListSheet(m, l) {
    const cons = m.people.filter(p => p.grade === 'con').map(p => p.name).sort();
    const had = (m.wk?.overrides ?? []).some(o => o.id === l.id);
    sheet.open({
      title: `${l.name}, this week`, saveLabel: 'Save',
      note: `${l.site}, ${shortDay(l.day)} ${l.session === 'AM' ? 'morning' : 'afternoon'}. For this week only; the Lists tab keeps the usual.`,
      values: { consultant: l.consultant ?? '', patients: l.patients ?? null, need: l.need, min: minOf(l), status: l.status, away: !!l.away },
      fields: [
        { key: 'consultant', label: 'Consultant', type: 'select',
          options: [['', 'Nobody'], ...(l.consultant && !cons.includes(l.consultant) ? [l.consultant, ...cons] : cons).map(n => /** @type {[string, string]} */ ([n, n]))] },
        { key: 'patients', label: 'Patients', type: 'number', min: 0, max: 200, hint: 'Shown on the print and the hand grid as "(21 pts)". Leave empty when not known.' },
        { key: 'need', label: 'Juniors wanted', type: 'number', min: 0, max: 10 },
        { key: 'min', label: 'At least', type: 'number', min: 0, max: 10, hint: 'It cannot run with fewer. Every list gets its minimum before any list gets more.' },
        { key: 'status', label: 'Status', type: 'select', options: STATUSES },
        { key: 'away', label: 'Consultant away (clinics close; an OT list becomes an emergency slot)', type: 'check' },
      ],
      // (an emergency slot's need and minimum are the rule's: kept out of the change unless typed differently)
      onSave: v => saveOverrides(m, [[l.id, { consultant: v.consultant || null, patients: v.patients, status: v.status, away: v.away,
        need: l.emergency && v.need === l.need ? undefined : v.need ?? l.need,
        min: v.min == null || v.min === minOf(l) ? had ? m.wk?.overrides?.find(o => o.id === l.id)?.min : undefined : v.min }]]),
      ...(had ? { deleteLabel: 'Back to the usual', onDelete: () => saveOverrides(m, [[l.id, null]]) } : {}),
    });
  }
  /**
   * Changes lists for this week only. Each change is laid over the list's earlier change (a key set to undefined drops it);
   * null drops the list's change altogether. A built week is drawn from its lists as built, so they change too.
   * @param {ReturnType<typeof model>} m @param {[string, Partial<import('../data/lists.js').Override> | null][]} changes  list id, change
   * @param {Record<string, unknown>} [more]  other fields saved with it (the grid)
   */
  async function saveOverrides(m, changes, more = {}) {
    const by = new Map((m.wk?.overrides ?? []).map(o => [o.id, o]));
    for (const [id, c] of changes) {
      if (!c) { by.delete(id); continue; }
      /** @type {Record<string, unknown>} */
      const next = { ...by.get(id), ...c, id };
      for (const k of Object.keys(next)) if (next[k] === undefined || (k === 'away' && next[k] === false)) delete next[k];
      if (Object.keys(next).length > 1) by.set(id, /** @type {any} */ (next)); else by.delete(id);
    }
    const overrides = [...by.values()];
    /** @type {Record<string, unknown>} */
    const fields = { overrides, ...more };
    if (m.built && m.wk?.lists?.length) {
      const ids = new Set(changes.map(([id]) => id));
      const now = new Map(slotsFor(m.templates, monday, overrides).filter(x => ids.has(x.id)).map(x => [x.id, x]));
      fields.lists = m.wk.lists.map(x => now.get(x.id) ?? x);
    }
    toast(await app.data.weeks.upsert(monday, m.wk, fields) ? REFUSED : 'Saved');
  }

  /**
   * "Check against Epic": the week's consultants by Mon to Fri AM and PM. A box takes the patients Epic has booked (0 greys
   * the list out) or A for away; a box with no list is a dash. "Away all week" fills a row. Saved as this week's changes.
   * @param {ReturnType<typeof model>} m
   */
  function epicSheet(m) {
    if (!ctx.canWrite()) return;
    const raw = slotsFor(m.templates, monday, m.wk?.overrides);
    const cons = [...new Set(raw.map(l => l.consultant).filter(/** @returns {c is string} */ c => !!c))].sort();
    if (!cons.length) { toast('No lists have a consultant this week.'); return; }
    const days = rangeDays(monday, addDays(monday, 4));
    /** @type {Map<string, { input: HTMLInputElement, lists: import('../roster/model.js').ListSlot[] }>} */
    const boxes = new Map();
    const table = h('table', { class: 'ep-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Consultant'), days.map(d => h('th', { scope: 'col', colspan: 2 }, `${weekdayName(d)} ${Number(d.slice(8))}`))),
        h('tr', {}, h('th', {}), days.map(() => [h('th', { class: 'small' }, 'AM'), h('th', { class: 'small' }, 'PM')]))),
      h('tbody', {}, cons.map(c => {
        const rowBoxes = /** @type {HTMLInputElement[]} */ ([]);
        const cells = days.flatMap(d => /** @type {const} */ (['AM', 'PM']).map(s => {
          const lists = raw.filter(l => l.consultant === c && l.day === d && l.session === s);
          if (!lists.length) return h('td', { class: 'ep-none', 'aria-label': 'no list' }, '–');
          const value = lists.some(l => l.away) ? 'A' : lists.find(l => l.patients != null)?.patients ?? '';
          const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'text', maxlength: 3, size: 3, value: String(value), autocomplete: 'off',
            'aria-label': `${c}, ${weekdayName(d)} ${s}: patients, or A for away`, title: lists.map(l => l.name).join(', ') }));
          boxes.set(`${c}|${d}|${s}`, { input, lists });
          rowBoxes.push(input);
          return h('td', {}, input);
        }));
        return h('tr', {}, h('th', { scope: 'row' }, h('span', {}, c),
          h('button', { type: 'button', class: 'ep-away small', onclick: () => { for (const b of rowBoxes) b.value = 'A'; } }, 'Away all week')), cells);
      })));
    sheet.open({
      title: 'Check against Epic', saveLabel: 'Save',
      note: `${weekTitle(monday)}. Type the patients Epic has booked (0 = none, the list is greyed out) or A when the consultant is away: their clinics close and their OT list becomes an emergency slot a registrar leads. Empty keeps the usual.`,
      fields: [],
      body: { node: h('div', { class: 'ep-wrap' }, table), read: () => Object.fromEntries([...boxes].map(([k, b]) => [k, b.input.value.trim()])) },
      onSave: v => {
        /** @type {[string, Partial<import('../data/lists.js').Override>][]} */
        const changes = [];
        for (const [k, b] of boxes) {
          const t = String(v[k] ?? '').toLowerCase();
          const away = /^a(way)?$/.test(t), n = /^\d{1,3}$/.test(t) ? Math.min(200, Number(t)) : undefined;
          for (const l of b.lists) changes.push([l.id, { away, patients: n }]);
        }
        return saveOverrides(m, changes);
      },
    });
  }

  /**
   * The Short panel: each list below its minimum, with the ways to fill it and what each costs (roster/short.js).
   * @param {ReturnType<typeof model>} m @param {ReturnType<typeof sectionsOf>} sec
   */
  function shortPanel(m, sec) {
    if (!m.built || !sec.short.length) return null;
    const canWrite = ctx.canWrite();
    return [h('h2', {}, `Short: ${sec.short.length} list${sec.short.length === 1 ? '' : 's'} below the minimum`),
      h('ul', { class: 'sh-list' }, sec.short.map(gap => {
        const l = m.lists.find(x => x.id === gap.list);
        if (!l) return null;
        const opts = canWrite ? shortOptions({ gap, lists: m.lists, grid: m.grid, people: m.people, free: sec.free[gap.day] ?? [] }) : [];
        /** @param {import('../roster/sections.js').ShortOption} o */
        const apply = o => {
          if (o.kind === 'add') return saveGrid({ grid: place(m.grid, gap.day, gap.session, l.id, o.name) });
          if (o.kind === 'move') return saveGrid({ grid: move(m.grid, { day: gap.day, session: gap.session, name: o.name, to: l.id }) });
          if (o.kind === 'fewer') return saveOverrides(m, [[l.id, { min: o.min }]]);
          return saveOverrides(m, [[l.id, { status: 'closed' }]], { grid: m.grid.map(r => (r.list === l.id && r.day === gap.day && r.session === gap.session ? { ...r, juniors: [] } : r)) });
        };
        return h('li', { class: 'sh-item' },
          h('p', {}, h('b', {}, `${weekdayName(gap.day)} ${gap.session} · ${l.site} ${listName(l)}`), gap.noReg ? (l.emergency ? ' emergency slot with no registrar to lead it' : l.kind === 'hot' ? ' no registrar or R3 to run it' : ' no registrar (an MSP list always needs one)') : ` ${gap.got} of at least ${gap.min}`),
          opts.length > 0 && h('div', { class: 'sh-options' }, opts.map(o => h('button', { type: 'button', class: 'sh-option', onclick: () => apply(o) },
            h('span', {}, o.text), h('span', { class: 'small' }, o.cost)))));
      }))];
  }

  /** @param {ReturnType<typeof model>} m @param {import('../roster/model.js').ListSlot} l  a settled list */
  function listCard(m, l) {
    const juniors = juniorsOn(m.grid, l.day, l.session, l.id);
    const closed = l.status === 'closed';
    const open = l.status === 'open';
    const state = l.holiday ? 'public holiday: closed' : closed ? (l.consultantOnLeave ? 'consultant away: closed' : 'closed') : !open ? l.status.replace('-', ' ')
      : l.emergency ? 'emergency slot (consultant away): a registrar leads' : l.patients === 0 ? 'no patients booked' : '';
    const noteBits = [l.rooms, l.patients != null && app.settings.get('showPatients') ? `${l.patients} pts` : '', state].filter(Boolean);
    const min = minOf(l);
    const noReg = open && regLed(l) && !juniors.some(n => leads(l, m.people.find(p => p.name === n)));
    const short = open && (juniors.length < min || noReg);
    const under = open && !short && !l.emergency && juniors.length < l.need;
    const canWrite = ctx.canWrite();
    return h('li', { class: `wk-list kind-${l.kind}${open && (l.need > 0 || juniors.length) ? '' : ' is-off'}${l.emergency ? ' is-eot' : ''}${short && m.built ? ' is-short' : ''}`, dataset: { list: l.id } },
      h('div', { class: 'wk-list-head' }, h('b', {}, l.name, l.emergency && ' (EOT)'), l.consultant && h('span', { class: 'wk-con' }, l.consultant),
        canWrite && h('button', { type: 'button', class: 'wk-edit', 'aria-label': `Change ${l.name} for this week`, onclick: () => weekListSheet(m, l) }, icon(ICONS.pencil))),
      noteBits.length > 0 && h('div', { class: 'wk-note small' }, noteBits.join(' · ')),
      (open || juniors.length > 0) && h('div', { class: 'wk-juniors' },
        juniors.map(n => h('button', { type: 'button', class: 'wk-chip', disabled: !canWrite, dataset: { name: n }, 'aria-label': `${n}: move or take off`, onclick: () => moveSheet(m, l.day, l.session, n, l.id) }, n)),
        open && short && m.built && h('span', { class: 'wk-need small' }, juniors.length < min ? `needs ${min - juniors.length} more` : l.kind === 'hot' ? 'needs a registrar or R3' : 'needs a registrar'),
        open && under && m.built && h('span', { class: 'wk-want small' }, `could take ${l.need - juniors.length} more`),
        open && canWrite && juniors.length < Math.max(l.need, 1) + 1 && h('button', { type: 'button', class: 'wk-add', 'aria-label': `Add a junior to ${l.name}`, onclick: () => addSheet(m, l.day, l.session, l) }, icon(ICONS.plus))));
  }

  function draw() {
    if (!store.loaded('lists') && !store.loaded('weeks')) return;
    loading.done();
    if (!placed && store.loaded('weeks') && ctx.canWrite()) {
      placed = true;
      const mon = makerWeek(todayKey(), d => Array.isArray(/** @type {any} */ (store.row('weeks', d))?.grid));
      if (mon !== monday) { monday = mon; selected = mon; }
    }
    const m = model();
    const sec = sectionsOf({ monday, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid, holidays: m.holidays });
    const days = sec.days;
    if (!days.includes(selected)) selected = days[0];

    const siteSelect = $('week-site');
    $('week-title').textContent = weekTitle(monday);
    /** @type {HTMLSelectElement} */ (siteSelect).value = site;
    const sites = [...new Set(m.lists.map(l => l.site))];
    fill($('week-site'), h('option', { value: 'all' }, 'All sites'), [...SITE_ORDER, ...sites.filter(s => !SITE_ORDER.includes(s))].filter(s => SITE_ORDER.includes(s) || sites.includes(s)).map(s => h('option', { value: s }, s)));
    /** @type {HTMLSelectElement} */ (siteSelect).value = site;
    const canWrite = ctx.canWrite();
    $('week-build').hidden = !canWrite;
    $('week-epic').hidden = !canWrite || !m.lists.length;
    fill($('week-short'), shortPanel(m, sec));
    $('week-state-note').textContent = !m.lists.length ? '' : m.built ? (m.wk?.built ? `Built ${new Date(m.wk.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}.` : 'Saved.') : canWrite ? 'Not built yet. Tap Build week.' : 'Not built yet.';
    empty.show(!m.lists.length);

    fill($('week-chips'), days.map(d => h('button', { type: 'button', class: `wk-daychip${d === todayKey() ? ' is-today' : ''}`, 'aria-pressed': String(d === selected), dataset: { day: d }, onclick: () => { selected = d; draw(); } },
      h('span', {}, weekdayName(d)), h('span', { class: 'small' }, String(Number(d.slice(8)))))));

    fill($('week-grid'), days.map(d => {
      const plan = m.planOn(d)[dayType(d, m.holidays)];
      const tiers = TIERS.filter(t => plan.includes(t) || sec.onCall[d][t]);
      return h('section', { class: `wk-day${d === selected ? ' is-selected' : ''}${d === todayKey() ? ' is-today' : ''}`, dataset: { day: d }, 'aria-label': `${weekdayName(d)} ${shortDay(d)}` },
        h('h2', { class: 'wk-day-title' }, weekdayName(d), h('span', { class: 'small' }, shortDay(d)), m.holidays.includes(d) && h('span', { class: 'wk-ph small' }, 'Public holiday')),
        SESSIONS.map(([s, name]) => {
          const mine = m.lists.filter(l => l.day === d && l.session === s && (site === 'all' || l.site === site));
          const siteNames = [...new Set(mine.map(l => l.site))].sort((a, b) => (SITE_ORDER.indexOf(a) + 1 || 9) - (SITE_ORDER.indexOf(b) + 1 || 9));
          return h('div', { class: 'wk-session' },
            h('h3', {}, name),
            !mine.length && h('p', { class: 'small wk-none' }, 'No lists'),
            siteNames.map(sn => h('div', { class: 'wk-site' }, h('h4', {}, sn),
              h('ul', { class: 'wk-lists' }, mine.filter(l => l.site === sn).map(l => listCard(m, l))))));
        }),
        h('div', { class: 'wk-extras' },
          h('h3', {}, 'On call'),
          h('dl', { class: 'wk-oncall' }, tiers.map(t => [h('dt', {}, TIER_LABEL[t]), h('dd', {}, sec.onCall[d][t] ?? '–')])),
          sec.leave[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Leave'), names(sec.leave[d])),
          sec.postCall[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Post-call'), names(sec.postCall[d])),
          m.built && sec.free[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Free'),
            names(sec.free[d].map(f => [f.name, f.why ? 'on call' : f.when === 'FULL DAY' ? '' : f.when])))));
    }));
    $('week-print-sheet').classList.remove('is-ready');
  }

  return {
    ...view,
    /** @param {import('../items.js').State} s */
    show(s) { view.show(s); draw(); },
    draw,
  };
}
