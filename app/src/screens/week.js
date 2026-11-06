// The Week tab (#week-page, the first screen): a week's daily roster. Mon to Fri, AM and PM, each by site, each list with the
// juniors on it; then who is on call, on leave, post-call and free. A phone shows one day at a time (day chips); from 900 px
// wide the five days sit side by side, and printing always shows all five on one landscape page. "Build week" fills the grid
// from the lists, leave and calls (roster/week.js, loaded when first used); a tap on a junior moves, swaps or removes them.
// The grid is stored per week; leave, post-call, on-call and free are worked out each time (roster/sections.js).
import { icon, loadState, confirmModal, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, sectionScreen, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { addDays, mondayOf, nextWorkday, rangeDays, shortDay, weekday, weekdayName, MONTHS, todayKey } from '../roster/dates.js';
import { TIER_LABEL, DEFAULT_TIER_PLAN, dayType, leaveIndex } from '../roster/model.js';
import { callsAround } from '../roster/sections.js';
import { sectionsOf, whyNot } from '../roster/sections.js';
import { gridRows, juniorsOn, listOf, move, place } from '../roster/grid.js';
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

/** the Monday to show first: this week, or next once the weekend is here @param {string} today */
export const firstWeek = today => (weekday(today) === 6 || weekday(today) === 0 ? addDays(mondayOf(today), 7) : mondayOf(today));
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
  const step = n => { monday = addDays(monday, 7 * n); selected = monday; draw(); };
  $('week-prev').replaceChildren(icon(ICONS.chevronLeft)); $('week-next').replaceChildren(icon(ICONS.chevronRight));
  $('week-prev').addEventListener('click', () => step(-1));
  $('week-next').addEventListener('click', () => step(1));
  $('week-today').addEventListener('click', () => { monday = firstWeek(todayKey()); selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday; draw(); });
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
  $('week-build').replaceChildren(icon(ICONS.sparkles), 'Build week');
  $('week-build').addEventListener('click', () => build());

  /** everything a week is drawn from, as of now @param {string} [mon] a Monday (default: the week on screen) */
  function model(mon = monday) {
    const wk = /** @type {import('../data/plans.js').WeekRow | undefined} */ (store.row('weeks', mon));
    const templates = /** @type {import('../data/lists.js').ListRow[]} */ (store.get('lists'));
    const built = Array.isArray(wk?.grid);
    const lists = built && wk?.lists?.length ? wk.lists : slotsFor(templates, mon, wk?.overrides);
    const grid = wk?.grid ?? [];
    const people = activePeople(/** @type {any} */ (store.get('people')));
    const leave = leaveOf(/** @type {any} */ (store.get('leave')));
    const rosters = /** @type {import('../data/plans.js').RosterRow[]} */ (store.get('rosters'));
    const calls = callsAround(/** @type {any} */ (rosters), mon);
    const holidays = rosters.flatMap(r => r.holidays ?? []);
    return { wk, templates, built, lists, grid, people, leave, calls, holidays };
  }

  /** @param {ReturnType<typeof model>} m @param {string} mon @returns {import('../roster/layout.js').WeekLayoutInput} what the sheet, the print and the chat text are made from */
  const layoutInput = (m, mon) => ({
    monday: mon, lists: m.lists, grid: m.grid, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays,
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
    if (m.built && m.grid.some(r => r.juniors.length) && !await confirmModal('Build this week again? Changes made by hand to its grid are replaced.', { title: 'Build week', yes: 'Build again' })) return;
    building = true; $('week-build').setAttribute('disabled', '');
    try {
      const { buildWeek } = await import('../roster/week.js');
      const seed = (m.wk?.seed ?? 0) + 1;
      const res = buildWeek({ monday, lists: slotsFor(m.templates, monday, m.wk?.overrides), people: m.people, leave: m.leave, calls: m.calls, seed });
      const refused = await app.data.weeks.upsert(monday, m.wk, { grid: gridRows(res.grid), lists: res.lists, seed, built: Date.now() });
      toast(refused ? REFUSED : res.problems.length ? `Built. ${res.problems.length} list${res.problems.length === 1 ? ' is' : 's are'} short of juniors.` : 'Built');
    } finally { building = false; $('week-build').removeAttribute('disabled'); }
  }

  /** @param {Record<string, unknown>} fields the week's grid and lists, saved */
  async function saveGrid(fields) {
    const m = model();
    toast(await app.data.weeks.upsert(monday, m.wk, { lists: m.lists, ...fields }) ? REFUSED : 'Saved');
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
    const sec = sectionsOf({ monday, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid });
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
      values: { consultant: l.consultant ?? '', patients: l.patients ?? null, need: l.need, status: l.status },
      fields: [
        { key: 'consultant', label: 'Consultant', type: 'select',
          options: [['', 'Nobody'], ...(l.consultant && !cons.includes(l.consultant) ? [l.consultant, ...cons] : cons).map(n => /** @type {[string, string]} */ ([n, n]))] },
        { key: 'patients', label: 'Patients', type: 'number', min: 0, max: 200, hint: 'Shown on the print and the hand grid as "(21 pts)". Leave empty when not known.' },
        { key: 'need', label: 'Juniors needed', type: 'number', min: 0, max: 10 },
        { key: 'status', label: 'Status', type: 'select', options: STATUSES },
      ],
      onSave: v => saveOverride(m, l, { id: l.id, consultant: v.consultant || null, patients: v.patients, need: v.need ?? l.need, status: v.status }),
      ...(had ? { deleteLabel: 'Back to the usual', onDelete: () => saveOverride(m, l, null) } : {}),
    });
  }
  /** @param {ReturnType<typeof model>} m @param {import('../roster/model.js').ListSlot} l @param {import('../data/lists.js').Override | null} o  null: drop the change */
  async function saveOverride(m, l, o) {
    const overrides = [...(m.wk?.overrides ?? []).filter(x => x.id !== l.id), ...(o ? [o] : [])];
    /** @type {Record<string, unknown>} */
    const fields = { overrides };
    // a built week is drawn from its lists as built, so the change goes into them too
    if (m.built && m.wk?.lists?.length) {
      const now = slotsFor(m.templates, monday, overrides).find(x => x.id === l.id);
      fields.lists = m.wk.lists.map(x => (x.id !== l.id ? x : now
        ? { ...x, consultant: now.consultant ?? null, patients: now.patients ?? null, need: now.need, status: now.status }
        : o ? { ...x, consultant: o.consultant ?? null, patients: o.patients ?? null, need: o.need ?? x.need, status: /** @type {any} */ (o.status ?? x.status) } : x));
    }
    toast(await app.data.weeks.upsert(monday, m.wk, fields) ? REFUSED : 'Saved');
  }

  /** @param {ReturnType<typeof model>} m @param {import('../roster/model.js').ListSlot} l @param {ReturnType<typeof sectionsOf>} sec @param {Set<string>} gone consultants away */
  function listCard(m, l, sec, gone) {
    const juniors = juniorsOn(m.grid, l.day, l.session, l.id);
    const away = !!l.consultant && gone.has(`${l.consultant}|${l.day}|${l.session}`);
    const closed = l.status === 'closed' || (l.kind === 'clinic' && away);
    const open = l.status === 'open' && !closed;
    const state = closed ? (away ? 'consultant on leave: closed' : 'closed') : !open ? l.status.replace('-', ' ') : away ? 'consultant on leave' : '';
    const noteBits = [l.rooms, l.patients != null && app.settings.get('showPatients') ? `${l.patients} pts` : '', state].filter(Boolean);
    const short = open && juniors.length < l.need;
    const canWrite = ctx.canWrite();
    return h('li', { class: `wk-list kind-${l.kind}${open ? '' : ' is-off'}${short && m.built ? ' is-short' : ''}`, dataset: { list: l.id } },
      h('div', { class: 'wk-list-head' }, h('b', {}, l.name), l.consultant && h('span', { class: 'wk-con' }, l.consultant),
        canWrite && h('button', { type: 'button', class: 'wk-edit', 'aria-label': `Change ${l.name} for this week`, onclick: () => weekListSheet(m, l) }, icon(ICONS.pencil))),
      noteBits.length > 0 && h('div', { class: 'wk-note small' }, noteBits.join(' · ')),
      (open || juniors.length > 0) && h('div', { class: 'wk-juniors' },
        juniors.map(n => h('button', { type: 'button', class: 'wk-chip', disabled: !canWrite, dataset: { name: n }, 'aria-label': `${n}: move or take off`, onclick: () => moveSheet(m, l.day, l.session, n, l.id) }, n)),
        open && short && m.built && h('span', { class: 'wk-need small' }, `needs ${l.need - juniors.length} more`),
        open && canWrite && juniors.length < Math.max(l.need, 1) + 1 && h('button', { type: 'button', class: 'wk-add', 'aria-label': `Add a junior to ${l.name}`, onclick: () => addSheet(m, l.day, l.session, l) }, icon(ICONS.plus))));
  }

  function draw() {
    if (!store.loaded('lists') && !store.loaded('weeks')) return;
    loading.done();
    const m = model();
    const sec = sectionsOf({ monday, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid });
    const lv = leaveIndex(m.leave);
    const days = sec.days;
    if (!days.includes(selected)) selected = days[0];
    // (a consultant away at a list's session, for the "closed" and "on leave" notes)
    /** @type {Set<string>} */
    const gone = new Set();
    for (const l of m.lists) if (l.consultant && lv.blocks(l.consultant, l.day, l.session)) gone.add(`${l.consultant}|${l.day}|${l.session}`);

    const siteSelect = $('week-site');
    $('week-title').textContent = weekTitle(monday);
    /** @type {HTMLSelectElement} */ (siteSelect).value = site;
    const sites = [...new Set(m.lists.map(l => l.site))];
    fill($('week-site'), h('option', { value: 'all' }, 'All sites'), [...SITE_ORDER, ...sites.filter(s => !SITE_ORDER.includes(s))].filter(s => SITE_ORDER.includes(s) || sites.includes(s)).map(s => h('option', { value: s }, s)));
    /** @type {HTMLSelectElement} */ (siteSelect).value = site;
    const canWrite = ctx.canWrite();
    $('week-build').hidden = !canWrite;
    $('week-state-note').textContent = !m.lists.length ? '' : m.built ? (m.wk?.built ? `Built ${new Date(m.wk.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}.` : 'Saved.') : canWrite ? 'Not built yet. Tap Build week.' : 'Not built yet.';
    empty.show(!m.lists.length);

    fill($('week-chips'), days.map(d => h('button', { type: 'button', class: `wk-daychip${d === todayKey() ? ' is-today' : ''}`, 'aria-pressed': String(d === selected), dataset: { day: d }, onclick: () => { selected = d; draw(); } },
      h('span', {}, weekdayName(d)), h('span', { class: 'small' }, String(Number(d.slice(8)))))));

    fill($('week-grid'), days.map(d => {
      const plan = DEFAULT_TIER_PLAN[dayType(d)];
      const tiers = (/** @type {const} */ (['con', 'reg', 'moNuh', 'moNtf'])).filter(t => plan.includes(t) || sec.onCall[d][t]);
      return h('section', { class: `wk-day${d === selected ? ' is-selected' : ''}${d === todayKey() ? ' is-today' : ''}`, dataset: { day: d }, 'aria-label': `${weekdayName(d)} ${shortDay(d)}` },
        h('h2', { class: 'wk-day-title' }, weekdayName(d), h('span', { class: 'small' }, shortDay(d))),
        SESSIONS.map(([s, name]) => {
          const mine = m.lists.filter(l => l.day === d && l.session === s && (site === 'all' || l.site === site));
          const siteNames = [...new Set(mine.map(l => l.site))].sort((a, b) => (SITE_ORDER.indexOf(a) + 1 || 9) - (SITE_ORDER.indexOf(b) + 1 || 9));
          return h('div', { class: 'wk-session' },
            h('h3', {}, name),
            !mine.length && h('p', { class: 'small wk-none' }, 'No lists'),
            siteNames.map(sn => h('div', { class: 'wk-site' }, h('h4', {}, sn),
              h('ul', { class: 'wk-lists' }, mine.filter(l => l.site === sn).map(l => listCard(m, l, sec, gone))))));
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
