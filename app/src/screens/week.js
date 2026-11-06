// The Week tab (#week-page, the first screen): a week's daily roster. Mon to Fri, AM and PM, each by site, each list with the
// juniors on it; then who is on call, on leave, post-call and free. It opens on the Grid: the whole week as the hand-made
// sheet lays it out (days across, AM and PM by site down), the way the department already reads it (owner, 6 Nov 2026).
// Day shows the same as cards, one day at a time on a phone (day chips) and the five side by side from 900 px wide; the
// choice is kept on the device. Printing always shows all five on one landscape page. The bar holds one step at a time:
// for the roster maker, Check against Epic and Build week until the week is built, then Share (chat text, the two Excel
// files, print) with Epic and Build again in that menu; a viewer has Share alone. "Build week" fills the grid
// from the lists, leave and calls (roster/week.js, loaded when first used); a tap on a junior moves, swaps or removes them.
// The grid is stored per week; leave, post-call, on-call and free are worked out each time (roster/sections.js). The lists are
// settled each time too (roster/settle.js): a public holiday closes them, a consultant away closes their clinics and turns
// their OT into an emergency slot. "Check against Epic" takes the week's booked patients and who is away, consultant by
// consultant (their leave is not in the junior leave calendar); the Short panel offers ways to fill a list below its minimum.
// The edits (screens/week-edit.js) load on the roster maker's first edit or Build, so a viewer never loads them; each
// saves from the week as it is then and can be undone from its toast (6 Nov 2026).
import { icon, loadState, emptyState, openMenu } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, sectionScreen, h, fill } from '../dom.js';
import { addDays, mondayOf, nextWorkday, rangeDays, shortDay, weekday, weekdayName, MONTHS, todayKey } from '../roster/dates.js';
import { TIERS, TIER_LABEL, conText, dayType, leads, minOf, regLed, settleLists, tierPlanOf } from '../roster/model.js';
import { callsAround } from '../roster/sections.js';
import { listName, sectionsOf } from '../roster/sections.js';
import { juniorsOn, weekBuilt } from '../roster/grid.js';
import { firstWeek, makerWeek } from '../roster/sections.js';
import { slotsFor } from '../data/lists.js';
import { activePeople } from '../data/people.js';
import { leaveOf } from '../data/leave.js';

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

/** everything a week is drawn from, as of now @param {import('../store.js').Store} store @param {string} mon a Monday */
export function weekModel(store, mon) {
  const wk = /** @type {import('../data/plans.js').WeekRow | undefined} */ (store.row('weeks', mon));
  const templates = /** @type {import('../data/lists.js').ListRow[]} */ (store.get('lists'));
  const built = weekBuilt(wk);
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

/**
 * @param {import('./context.js').Context} ctx
 */
export function weekScreen(ctx) {
  const { app, store, toast } = ctx;
  let monday = firstWeek(todayKey());
  let selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday;
  let site = 'all';
  let placed = false;   // the roster maker's first week chosen (makerWeek), or the person has moved off the first week
  // the roster maker's edits (screens/week-edit.js), loaded on the first edit or Build: a viewer never loads them
  /** @type {Promise<ReturnType<typeof import('./week-edit.js').weekEdit>> | null} */
  let editing = null;
  /** @type {ReturnType<typeof import('./week-edit.js').weekEdit> | null} */
  let editor = null;
  const editCode = () => (editing ??= import('./week-edit.js').then(x => (editor = x.weekEdit({ ctx, model, monday: () => monday })),
    e => { editing = null; throw e; }));   // (offline before it was ever loaded: the next tap tries again)
  /** @param {(e: NonNullable<typeof editor>) => unknown} job */
  const edit = job => guarded(async () => { await job(await editCode()); }, 'Could not open that. Try again.');
  $('week-state').replaceChildren();   // the frame app.js painted at start (its own load state, which nothing else clears)
  const loading = loadState($('week-state'));
  const VIEW_KEY = 'week-view';
  /** @type {'grid' | 'day'} */
  let show = (() => { try { return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'grid'; } catch { return 'grid'; } })();
  /** @param {'grid' | 'day'} v */
  const setShow = v => { show = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window: not kept */ } draw(); };
  $('week-show-grid').addEventListener('click', () => setShow('grid'));
  $('week-show-day').addEventListener('click', () => setShow('day'));
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
  $('week-title').addEventListener('click', () => {   // the date takes you back to this week
    placed = true; monday = firstWeek(todayKey()); selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday; draw(); });
  $('week-site').addEventListener('change', e => { site = /** @type {HTMLSelectElement} */ (e.target).value; draw(); });
  $('week-more').replaceChildren(icon(ICONS.ellipsis), 'More');
  $('week-more').addEventListener('click', () => {
    const canWrite = ctx.canWrite(), m = model();
    openMenu($('week-more'), [
      { label: 'Copy for WhatsApp', icon: ICONS.clipboardCopy, run: () => copyTomorrow() },
      { label: 'Excel (CORE)', icon: ICONS.download, run: () => exportXlsx('core') },
      { label: 'Excel (hand grid)', icon: ICONS.download, run: () => exportXlsx('hand') },
      { label: 'Print', icon: ICONS.printer, run: () => printWeek() },
      ...(canWrite && m.built && m.lists.length ? [null, { label: 'Check against Epic', icon: ICONS.listChecks, run: () => edit(e => e.epicSheet()) },
        { label: 'Build again', icon: ICONS.refreshCw, run: () => edit(e => e.build()) }] : []),
    ], { label: 'More' });
  });
  // Ctrl+P and the browser's own print draw the same sheet, once the export code has been loaded by a button or the idle load below
  /** @type {typeof import('./export.js') | null} */
  let exporter = null;
  /** @returns {Promise<typeof import('./export.js')>} */
  const exportCode = async () => (exporter ??= await import('./export.js'));
  window.addEventListener('beforeprint', () => { if (exporter && !$('week-page').hidden) exporter.renderPrint($('week-print-sheet'), layoutInput(model(), monday)); });
  $('week-epic').replaceChildren(icon(ICONS.listChecks), 'Check against Epic');
  $('week-epic').addEventListener('click', () => edit(e => e.epicSheet()));
  $('week-build').replaceChildren(icon(ICONS.sparkles), 'Build week');
  $('week-build').addEventListener('click', () => edit(e => e.build()));

  /** everything a week is drawn from, as of now @param {string} [mon] a Monday (default: the week on screen) */
  function model(mon = monday) { return weekModel(store, mon); }

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

  /**
   * The Short panel: each list below its minimum; for the roster maker, the ways to fill it and what each costs
   * (roster/short.js), as buttons from the edit code (drawn again once it has loaded).
   * @param {ReturnType<typeof model>} m @param {ReturnType<typeof sectionsOf>} sec
   */
  function shortPanel(m, sec) {
    if (!m.built || !sec.short.length) return null;
    const canWrite = ctx.canWrite();
    if (canWrite && !editing) editCode().then(() => draw(), () => { /* no buttons until a later draw loads it */ });
    return [h('h2', {}, `Short: ${sec.short.length} list${sec.short.length === 1 ? '' : 's'} below the minimum`),
      h('ul', { class: 'sh-list' }, sec.short.map(gap => {
        const l = m.lists.find(x => x.id === gap.list);
        if (!l) return null;
        return h('li', { class: 'sh-item' },
          h('p', {}, h('b', {}, `${weekdayName(gap.day)} ${gap.session} · ${l.site} ${listName(l)}`), gap.noReg ? (l.emergency ? ' emergency slot with no registrar to lead it' : l.kind === 'hot' ? ' no registrar or R3 to run it' : ' no registrar (an MSP list always needs one)') : ` ${gap.got} of at least ${gap.min}`),
          canWrite && editor && editor.shortButtons(m, sec, gap, l));
      }))];
  }

  /**
   * The Grid: the week as the hand-made sheet lays it out. Days across; AM and PM by site down, each cell the lists of that
   * session as "Consultant LIST" with the juniors under; then on call, leave, post-call and free. For those who may edit, a
   * list's name opens a menu (add a junior, change it for this week) and a junior's name moves them.
   * @param {ReturnType<typeof model>} m @param {ReturnType<typeof sectionsOf>} sec @param {string[]} days
   */
  function weekTable(m, sec, days) {
    const canWrite = ctx.canWrite();
    const ORDER = { clinic: 0, hot: 1, ot: 2, msp: 3 };   // as the roster maker's sheet runs: clinics, HOT, OT, MSP
    const shown = m.lists.filter(l => site === 'all' || l.site === site);
    const sites = [...new Set(shown.map(l => l.site))].sort((a, b) => (SITE_ORDER.indexOf(a) + 1 || 9) - (SITE_ORDER.indexOf(b) + 1 || 9) || a.localeCompare(b));
    /** @param {import('../roster/model.js').ListSlot} l */
    const entry = l => {
      const juniors = juniorsOn(m.grid, l.day, l.session, l.id);
      const open = l.status === 'open', min = minOf(l);
      const noReg = open && regLed(l) && !juniors.some(n => leads(l, m.people.find(p => p.name === n)));
      const short = m.built && open && (juniors.length < min || noReg);
      const off = !open || (l.need === 0 && !juniors.length);
      const con = conText(l);
      const head = l.emergency ? `EOT ${l.name}` : [con, l.name.replace(/^CLINIC\b/, 'Clinic')].filter(Boolean).join(' ');
      const flag = l.holiday ? 'PH' : l.status === 'closed' ? 'closed' : l.emergency ? `${con || 'consultant'} away` : !open ? l.status.replace('-', ' ') : l.patients === 0 ? 'no patients' : '';
      return h('div', { class: `wt-list kind-${l.kind}${off ? ' is-off' : ''}${l.emergency ? ' is-eot' : ''}${short ? ' is-short' : ''}`, dataset: { list: l.id } },
        canWrite ? h('button', { type: 'button', class: 'wt-head', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (/** @type {MouseEvent} */ e) => openMenu(/** @type {HTMLElement} */ (e.currentTarget), [
          ...(open ? [{ label: 'Add a junior', icon: ICONS.plus, run: () => edit(e => e.addSheet(m, l.day, l.session, l)) }] : []),
          { label: 'Change for this week', icon: ICONS.pencil, run: () => edit(e => e.weekListSheet(l)) },
        ], { label: head }) }, head) : h('span', { class: 'wt-head' }, head),
        (flag || l.rooms) && h('span', { class: 'wt-flag' }, [l.rooms, flag].filter(Boolean).join(' · ')),
        (juniors.length > 0 || short) && h('div', { class: 'wt-names' },
          juniors.flatMap((n, i) => [i > 0 && ', ', canWrite ? h('button', { type: 'button', class: 'wt-name', dataset: { name: n }, 'aria-label': `${n}: move or take off`, onclick: () => edit(e => e.moveSheet(m, l.day, l.session, n, l.id)) }, n)
            : h('span', { class: 'wt-name' }, n)]),
          short && h('span', { class: 'wt-need' }, juniors.length < min ? `needs ${min - juniors.length}` : l.kind === 'hot' ? 'needs a reg or R3' : 'needs a reg')));
    };
    /** @param {string} label @param {string} sub @param {(d: string) => unknown} cell @param {string} [cls] */
    const row = (label, sub, cell, cls = '') => h('tr', { class: cls },
      h('th', { scope: 'row' }, label, sub && h('span', { class: 'wt-sub' }, sub)), days.map(d => h('td', { class: m.holidays.includes(d) ? 'is-ph' : '' }, cell(d))));
    /** @param {(string | [string, string])[]} list */
    const plain = list => list.length ? h('p', { class: 'wt-plain' }, list.map(x => (Array.isArray(x) ? (x[1] ? `${x[0]} (${x[1]})` : x[0]) : x)).join(', ')) : null;
    return h('table', { class: 'wt' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Session')),
        days.map(d => h('th', { scope: 'col', class: d === todayKey() ? 'is-today' : '' }, weekdayName(d), h('span', { class: 'wt-sub' }, shortDay(d)), m.holidays.includes(d) && h('span', { class: 'wt-ph' }, 'PH'))))),
      h('tbody', {},
        SESSIONS.flatMap(([s]) => sites.filter(sn => shown.some(l => l.session === s && l.site === sn)).map((sn, i) => row(s, sn, d => shown
          .filter(l => l.day === d && l.session === s && l.site === sn)
          .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.consultant ?? '').localeCompare(b.consultant ?? ''))
          .map(entry), i === 0 ? 'wt-first' : ''))),
        row('On call', '', d => {
          const plan = m.planOn(d)[dayType(d, m.holidays)];
          return h('dl', { class: 'wt-oncall' }, TIERS.filter(t => plan.includes(t) || sec.onCall[d][t]).map(t => [h('dt', {}, TIER_LABEL[t]), h('dd', {}, sec.onCall[d][t] ?? '–')]));
        }, 'wt-first'),
        row('Leave', '', d => plain(sec.leave[d])),
        row('Post-call', '', d => plain(sec.postCall[d])),
        m.built && row('Free', '', d => plain(sec.free[d].map(f => [f.name, f.why ? 'on call' : f.when === 'FULL DAY' ? '' : f.when])))));
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
      h('div', { class: 'wk-list-head' }, h('b', {}, l.name, l.emergency && ' (EOT)'), l.consultant && h('span', { class: 'wk-con' }, conText(l)),
        canWrite && h('button', { type: 'button', class: 'wk-edit', 'aria-label': `Change ${l.name} for this week`, onclick: () => edit(e => e.weekListSheet(l)) }, icon(ICONS.pencil))),
      noteBits.length > 0 && h('div', { class: 'wk-note small' }, noteBits.join(' · ')),
      (open || juniors.length > 0) && h('div', { class: 'wk-juniors' },
        juniors.map(n => h('button', { type: 'button', class: 'wk-chip', disabled: !canWrite, dataset: { name: n }, 'aria-label': `${n}: move or take off`, onclick: () => edit(e => e.moveSheet(m, l.day, l.session, n, l.id)) }, n)),
        open && short && m.built && h('span', { class: 'wk-need small' }, juniors.length < min ? `needs ${min - juniors.length} more` : l.kind === 'hot' ? 'needs a registrar or R3' : 'needs a registrar'),
        open && under && m.built && h('span', { class: 'wk-want small' }, `could take ${l.need - juniors.length} more`),
        open && canWrite && juniors.length < Math.max(l.need, 1) + 1 && h('button', { type: 'button', class: 'wk-add', 'aria-label': `Add a junior to ${l.name}`, onclick: () => edit(e => e.addSheet(m, l.day, l.session, l)) }, icon(ICONS.plus))));
  }

  function draw() {
    if (!store.loaded('lists') && !store.loaded('weeks')) return;
    loading.done();
    if (!placed && store.loaded('weeks') && ctx.canWrite()) {
      placed = true;
      const mon = makerWeek(todayKey(), d => weekBuilt(/** @type {any} */ (store.row('weeks', d))));
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
    // one step at a time: Epic and Build until it is built, then More (Epic and Build again are in its menu)
    $('week-build').hidden = !canWrite || m.built;
    $('week-epic').hidden = !canWrite || m.built || !m.lists.length;
    $('week-more').hidden = canWrite && !m.built;   // nothing of the maker's to share yet (a viewer can still take the lists out)
    const away = monday !== firstWeek(todayKey());
    $('week-title').classList.toggle('is-away', away);
    if (away) $('week-title').setAttribute('aria-label', `${weekTitle(monday)}. Back to this week`); else $('week-title').removeAttribute('aria-label');
    $('week-show-grid').setAttribute('aria-pressed', String(show === 'grid'));
    $('week-show-day').setAttribute('aria-pressed', String(show === 'day'));
    fill($('week-short'), shortPanel(m, sec));
    $('week-state-note').textContent = !m.lists.length ? '' : m.built ? (m.wk?.built ? `Built ${new Date(m.wk.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}.` : '') : 'Not built yet.';
    $('week-table').hidden = show !== 'grid';
    $('week-chips').hidden = $('week-grid').hidden = show !== 'day';
    if (show === 'grid') fill($('week-table'), weekTable(m, sec, days));
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
