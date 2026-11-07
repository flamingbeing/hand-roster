// The Week tab (#week-page, the first screen): a week's daily roster. Mon to Fri, AM and PM, each by site, each list with the
// juniors on it; then who is on call, on leave, post-call and free. It opens on the Grid: the whole week as the hand-made
// sheet lays it out (days across, AM and PM by site down), the way the department already reads it (owner, 6 Nov 2026).
// Day shows the same as cards, one day at a time (day chips) and the five side by side once the page itself is about 58rem
// wide (the side bar's room counts, 7 Nov 2026); the choice is kept on the device. Printing shows one thing on one landscape
// page: the hand-made grid once the export code is in, else the view on screen. The bar holds one step at a time:
// for the roster maker, Check against Epic and Build week until the week is built, then Share (chat text, the two Excel
// files, print) with Epic and Build again in that menu; a viewer has Share alone. "Build week" fills the grid
// from the lists, leave and calls (roster/week.js, loaded when first used); a tap on a junior moves, swaps or removes them.
// The grid is stored per week; leave, post-call, on-call and free are worked out each time (roster/sections.js). The lists are
// settled each time too (roster/settle.js): a public holiday closes them, a consultant away closes their clinics and turns
// their OT into an emergency slot. "Check against Epic" takes the week's booked patients and who is away, consultant by
// consultant (their leave is not in the junior leave calendar); the Short panel offers ways to fill a list below its minimum.
// The edits (screens/week-edit.js) load on the roster maker's first edit or Build, so a viewer never loads them; each
// saves from the week as it is then and can be undone from its toast (6 Nov 2026).
// "This is me" (More) keeps a name on this device: it stands out wherever it shows, with a My week card on top
// (screens/week-mine.js, loaded once a name is set) (7 Nov 2026). Their own lists and cells are marked too, and a viewer
// with no name set is asked once, on this device, to pick it (7 Nov 2026). A person's phone, when set, is a call link
// beside their name on call (dom.js telLink, 7 Nov 2026).
// On a phone the Grid shows about two days: it opens at today's column, once per week shown (7 Nov 2026).
import { icon, loadState, emptyState, openMenu, lazyModules } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, sectionScreen, h, fill, telLink } from '../dom.js';
import { addDays, mondayOf, nextWorkday, rangeDays, shortDay, weekday, weekdayName, MONTHS, MONTH_NAMES, todayKey } from '../roster/dates.js';
import { TIERS, TIER_LABEL, conText, dayType, hasMe, leads, minOf, regLed, settleLists, tierPlanOf } from '../roster/model.js';
import { callsAround, callsUnmade, clashesOf } from '../roster/sections.js';
import { listName, sectionsOf } from '../roster/sections.js';
import { isPinned, juniorsOn, weekBuilt } from '../roster/grid.js';
import { firstWeek, makerWeek } from '../roster/sections.js';
import { slotsFor } from '../data/lists.js';
import { activePeople, meOf, phonesOf } from '../data/people.js';
import { leaveOf } from '../data/leave.js';

const SESSIONS = /** @type {const} */ ([['AM', 'Morning'], ['PM', 'Afternoon']]);
const SITE_ORDER = ['NUH', 'NTFGH'];
// what a week is built from: until each kind's first rows are in, Build week, Build again, Check against Epic and the grid's
// edits wait, or a build would miss leave or calls, or save over a built week not heard yet (7 Nov 2026)
export const WEEK_NEEDS = /** @type {import('../cloud.js').Kind[]} */ (['lists', 'people', 'leave', 'rosters', 'weeks']);
/** "This is me" (meOf): marked wherever the name shows, in bold, the accent and underlined (not by colour alone) */
let me = '';
/** names as small chips, each with an optional note (AM, PM, on call); commas kept for copy and screen readers
 * @param {(string | [string, string])[]} list */
const names = list => h('p', { class: 'wk-names' }, list.map((x, i) => {
  const [n, note] = Array.isArray(x) ? x : [x, ''];
  return h('span', { class: n === me ? 'wk-name is-me' : 'wk-name' }, n, note && h('i', {}, ` ${note}`), i < list.length - 1 && h('span', { class: 'visually-hidden' }, ','));
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
  // raw: the lists unsettled (what the week stores and a change is made from); lists: settled, as drawn
  const raw = built && wk?.lists?.length ? wk.lists : slotsFor(templates, mon, wk?.overrides);
  const lists = settleLists(raw, { leave, holidays });
  /** @param {string} day @returns {import('../roster/model.js').TierPlan} the call tiers of that day's month */
  const planOn = day => tierPlanOf(rosters.find(r => r.id === day.slice(0, 7))?.tierPlan);
  const unmade = callsUnmade(/** @type {any} */ (rosters), mon);   // a build can't keep their post-call days clear
  return { wk, templates, built, raw, lists, grid, people, leave, calls, holidays, planOn, unmade, callsMade: !unmade.length, phones: phonesOf(/** @type {any} */ (store.get('people'))) };
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
  /** @type {Map<string, string>} the roster maker's clashes (clashesOf) by day|session|name, why */
  let clashAt = new Map();
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
  // a viewer with no name set is asked once who they are; picking or Not now keeps it away on this device (More still has it)
  const ASKED_KEY = 'me-asked';
  let asked = (() => { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; } })();
  const setAsked = () => { asked = true; try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* private window: asked again next time */ } };
  /** the Monday the Grid last opened at today's column (or at Monday): a live redraw never pulls back a reader who scrolled */
  let scrolledFor = '';
  $('week-show-grid').addEventListener('click', () => setShow('grid'));
  $('week-show-day').addEventListener('click', () => setShow('day'));
  const empty = emptyState($('week-empty'), { title: 'No lists yet', hint: 'Add the weekly lists on the Lists tab, then build the week.' });
  if (!store.loaded('lists')) loading.loading();

  const view = sectionScreen('week-view');
  store.on(WEEK_NEEDS, () => draw());
  ctx.onRole(() => draw());
  app.settings.watch('defaultSite', () => { site = String(app.settings.get('defaultSite') || 'all'); draw(); });
  app.settings.watch('showPatients', () => draw());
  app.settings.watch('me', () => draw());
  site = String(app.settings.get('defaultSite') || 'all');

  /** @param {number} n */
  const step = n => { placed = true; monday = addDays(monday, 7 * n); selected = monday; draw(); };
  $('week-prev').replaceChildren(icon(ICONS.chevronLeft)); $('week-next').replaceChildren(icon(ICONS.chevronRight));
  $('week-prev').addEventListener('click', () => step(-1));
  $('week-next').addEventListener('click', () => step(1));
  $('week-title').addEventListener('click', () => {   // the date takes you back to this week, at today's column
    placed = true; scrolledFor = ''; monday = firstWeek(todayKey()); selected = rangeDays(monday, addDays(monday, 4)).includes(todayKey()) ? todayKey() : monday; draw(); });
  $('week-site').addEventListener('change', e => { site = /** @type {HTMLSelectElement} */ (e.target).value; draw(); });
  $('week-more').replaceChildren(icon(ICONS.ellipsis), 'More');
  $('week-more').addEventListener('click', () => {
    const canWrite = ctx.canWrite(), m = model();
    // chat text of the day on screen, of the next working day (holidays skipped) or of the week on screen (7 Nov 2026)
    const next = nextWorkday(todayKey(), m.holidays), here = dayOnScreen();
    openMenu($('week-more'), [
      ...(here !== next ? [{ label: `Copy ${dayName(here)} for WhatsApp`, icon: ICONS.clipboardCopy, run: () => copyDay(here) }] : []),
      { label: `Copy next working day (${dayName(next)})`, icon: ICONS.clipboardCopy, run: () => copyDay(next) },
      { label: 'Copy the whole week', icon: ICONS.clipboardCopy, run: () => copyWeek() },
      { label: 'Excel (CORE)', icon: ICONS.download, run: () => exportXlsx('core') },
      { label: 'Excel (hand grid)', icon: ICONS.download, run: () => exportXlsx('hand') },
      { label: 'Print', icon: ICONS.printer, run: () => printWeek() },
      { label: 'This is me', icon: ICONS.userCheck, run: () => pickMe(m.people) },
      ...(canWrite && m.built && m.lists.length && store.ready(WEEK_NEEDS) ? [null, { label: 'Check against Epic', icon: ICONS.listChecks, run: () => edit(e => e.epicSheet()) },
        { label: 'Build again', icon: ICONS.refreshCw, run: () => edit(e => e.build()) },
        { label: 'Reset week', icon: ICONS.rotateCcw, run: () => edit(e => e.reset()) }] : []),
    ], { label: 'More' });
  });
  // Ctrl+P and the browser's own print draw the same sheet once the export code is in: a button loads it, and on a laptop
  // (a pointer that hovers) the first idle moment after the week is drawn does (draw, below); a phone loads it only when asked
  const exportMod = lazyModules({ exporter: () => import('./export.js') });
  const exportCode = () => exportMod.need('exporter');
  window.addEventListener('beforeprint', () => {
    const x = exportMod.loaded('exporter');
    if (x && !$('week-page').hidden) x.renderPrint($('week-print-sheet'), layoutInput(model(), monday));
  });
  $('week-epic').replaceChildren(icon(ICONS.listChecks), 'Check against Epic');
  $('week-epic').addEventListener('click', () => edit(e => e.epicSheet()));
  $('week-build').replaceChildren(icon(ICONS.sparkles), 'Build week');
  $('week-build').addEventListener('click', () => edit(e => e.build()));
  $('week-drift').replaceChildren(icon(ICONS.refreshCw), 'Build again');
  $('week-drift').addEventListener('click', () => edit(e => e.build()));

  // the picker and the My week card (screens/week-mine.js), loaded when the picker opens or a name is set
  /** @type {Promise<typeof import('./week-mine.js')> | null} */
  let mineLoad = null;
  /** @type {typeof import('./week-mine.js') | null} */
  let mine = null;
  const mineCode = () => (mineLoad ??= import('./week-mine.js').then(x => (mine = x), e => { mineLoad = null; throw e; }));
  /** @param {import('../roster/model.js').Person[]} people  the active people */
  const pickMe = people => guarded(async () => (await mineCode()).pickMe(app, people), 'Could not open that. Try again.');
  /** The ask: a viewer with no name set, once per device. Only a tap loads the picker. @param {import('../roster/model.js').Person[]} people */
  const askCard = people => h('section', { class: 'wk-mine wk-ask', 'aria-labelledby': 'week-ask-title' },
    h('b', { id: 'week-ask-title' }, 'Find your days: pick your name'),
    h('div', { class: 'wk-ask-do' },
      h('button', { type: 'button', class: 'ui-primary', onclick: () => { setAsked(); draw(); pickMe(people); } }, icon(ICONS.userCheck), 'Pick my name'),
      h('button', { type: 'button', onclick: () => { setAsked(); draw(); $('week-more').focus(); } }, 'Not now')));

  /** Opens the Grid at today's column, just right of the sticky session column, on the first draw of a week (a Monday not
   * yet done) and after 'back to this week'; any other week opens at Monday. Never scrollIntoView (it moves the page). */
  function toToday() {
    const box = $('week-table');
    if (scrolledFor === monday || !box.clientWidth) return;   // (hidden: not laid out yet, so a later draw does it)
    scrolledFor = monday;
    const th = box.querySelector('thead th.is-today'), label = box.querySelector('thead th');
    if (!th || !label || box.scrollWidth <= box.clientWidth) { box.scrollLeft = 0; return; }
    // twice: the session column only sticks once scrolled, so the second step takes up where it then sits
    for (let i = 0; i < 2; i++) box.scrollLeft += th.getBoundingClientRect().left - label.getBoundingClientRect().right;
  }

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
  /** @param {string} day @returns {string} 'Tue 10 Nov' */
  const dayName = day => `${weekdayName(day)} ${shortDay(day)}`;
  /** @returns {string} the day being looked at: Day's chosen day; on the Grid the first weekday from today on, else Monday */
  const dayOnScreen = () => {
    if (show === 'day') return selected;
    const today = todayKey();
    return rangeDays(monday, addDays(monday, 4)).find(d => d >= today) ?? monday;
  };
  /** @param {Awaited<ReturnType<typeof exportCode>>} x @param {string} text @param {string} what  for the toast ('Tue 10 Nov') */
  async function copied(x, text, what) {
    toast(await x.copyText(text) ? `Copied ${what}. Paste it into WhatsApp.` : 'Could not copy. Allow the clipboard and try again.');
  }
  /** copies one day's roster as chat text @param {string} day */
  async function copyDay(day) {
    await guarded(async () => {
      const mon = mondayOf(day), m = model(mon);
      if (!m.built) { toast(`${dayName(day)} is not built yet. Build that week first.`); return; }
      const x = await exportCode();
      await copied(x, x.whatsappText(day, layoutInput(m, mon)), dayName(day));
    }, 'Could not copy.');
  }
  /** copies the week on screen, Monday to Friday, as chat text */
  async function copyWeek() {
    await guarded(async () => {
      const mon = monday, m = model(mon);
      if (!m.built) { toast(`The week of ${shortDay(mon)} is not built yet. Build it first.`); return; }
      const x = await exportCode();
      await copied(x, x.weekText(layoutInput(m, mon)), `the week of ${shortDay(mon)}`);
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
   * Clashes, each opening the move sheet, with Take off beside it; Take them all off when two or more (one save, one Undo)
   * @param {ReturnType<typeof model>} m @param {ReturnType<typeof clashesOf>} list
   */
  const clashPanel = (m, list) => list.length > 0 && [h('h2', {}, `Clashes: ${list.length}`),
    list.length > 1 && h('button', { type: 'button', class: 'sh-all', onclick: () => edit(e => e.takeOffAll(list)) }, 'Take them all off'),
    h('div', { class: 'sh-options' }, list.map(c => {
      const l = m.lists.find(x => x.id === c.list), on = l ? `${l.site} ${listName(l)}` : 'a list';
      return h('div', { class: 'sh-clash' }, h('button', { type: 'button', class: 'sh-option', onclick: () => edit(e => e.moveSheet(m, c.day, c.session, c.name, c.list)) },
        `${weekdayName(c.day)} ${Number(c.day.slice(8))} ${c.session} · ${c.name} on ${on}: ${c.why.join(', ')}`),
        h('button', { type: 'button', class: 'sh-off', 'aria-label': `Take ${c.name} off ${on}`, onclick: () => edit(e => e.takeOff(m, c)) }, 'Take off'));
    }))];
  /** a junior's button on a list, marked when it clashes @param {ReturnType<typeof model>} m @param {import('../roster/model.js').ListSlot} l @param {string} n @param {string} cls */
  const nameBtn = (m, l, n, cls) => { const why = clashAt.get(`${l.day}|${l.session}|${n}`), pinned = isPinned(m.grid, l.day, l.session, l.id, n);
    return { type: 'button', class: `${cls}${why ? ' is-clash' : ''}${n === me ? ' is-me' : ''}${pinned ? ' is-pinned' : ''}`, dataset: { name: n }, 'aria-label': `${n}${pinned ? ', pinned' : ''}: move, pin or take off${why ? `. Clash: ${why}` : ''}`, onclick: () => edit(e => e.moveSheet(m, l.day, l.session, n, l.id)) }; };

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
      const mineHere = hasMe(l, juniors, me);
      const flag = l.holiday ? 'PH' : l.status === 'closed' ? 'closed' : l.emergency ? `${con || 'consultant'} away` : !open ? l.status.replace('-', ' ') : l.patients === 0 ? 'no patients' : '';
      return h('div', { class: `wt-list kind-${l.kind}${off ? ' is-off' : ''}${l.emergency ? ' is-eot' : ''}${short ? ' is-short' : ''}${mineHere ? ' has-me' : ''}`, dataset: { list: l.id } },
        canWrite ? h('button', { type: 'button', class: 'wt-head', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (/** @type {MouseEvent} */ e) => openMenu(/** @type {HTMLElement} */ (e.currentTarget), [
          ...(open ? [{ label: 'Add a junior', icon: ICONS.plus, run: () => edit(e => e.addSheet(m, l.day, l.session, l)) }] : []),
          { label: 'Change for this week', icon: ICONS.pencil, run: () => edit(e => e.weekListSheet(l)) },
        ], { label: head }) }, head) : h('span', { class: 'wt-head' }, head),
        mineHere && h('span', { class: 'visually-hidden' }, ', you'),
        (flag || l.rooms) && h('span', { class: 'wt-flag' }, [l.rooms, flag].filter(Boolean).join(' · ')),
        (juniors.length > 0 || short) && h('div', { class: 'wt-names' },
          juniors.flatMap((n, i) => [i > 0 && ', ', canWrite ? h('button', nameBtn(m, l, n, 'wt-name'), n)
            : h('span', { class: n === me ? 'wt-name is-me' : 'wt-name' }, n)]),
          short && h('span', { class: 'wt-need' }, juniors.length < min ? `needs ${min - juniors.length}` : l.kind === 'hot' ? 'needs a reg or R3' : 'needs a reg')));
    };
    /** @param {string} label @param {string} sub @param {(d: string) => unknown} cell @param {string} [cls] @param {(d: string) => boolean} [mineOn]  the cell holds me */
    const row = (label, sub, cell, cls = '', mineOn = () => false) => h('tr', { class: cls },
      h('th', { scope: 'row' }, label, sub && h('span', { class: 'wt-sub' }, sub)),
      days.map(d => h('td', { class: [m.holidays.includes(d) && 'is-ph', !!me && mineOn(d) && 'has-me'].filter(Boolean).join(' ') || null }, cell(d))));
    /** @param {(string | [string, string])[]} list @returns {boolean} */
    const holds = list => list.some(x => (Array.isArray(x) ? x[0] : x) === me);
    /** @param {(string | [string, string])[]} list */
    const plain = list => list.length ? h('p', { class: 'wt-plain' }, list.flatMap((x, i) => {
      const [n, note] = Array.isArray(x) ? x : [x, ''], t = note ? `${n} (${note})` : n;
      return [i > 0 && ', ', n === me ? h('b', { class: 'is-me' }, t) : t];
    })) : null;
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
          return h('dl', { class: 'wt-oncall' }, TIERS.filter(t => plan.includes(t) || sec.onCall[d][t]).map(t => [h('dt', {}, TIER_LABEL[t]), h('dd', { class: sec.onCall[d][t] === me ? 'is-me' : '' }, sec.onCall[d][t] ?? '–', telLink(m.phones, sec.onCall[d][t]))]));
        }, 'wt-first', d => Object.values(sec.onCall[d]).includes(me)),
        row('Leave', '', d => plain(sec.leave[d]), '', d => holds(sec.leave[d])),
        row('Post-call', '', d => plain(sec.postCall[d]), '', d => holds(sec.postCall[d])),
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
    const mineHere = hasMe(l, juniors, me);
    return h('li', { class: `wk-list kind-${l.kind}${open && (l.need > 0 || juniors.length) ? '' : ' is-off'}${l.emergency ? ' is-eot' : ''}${short && m.built ? ' is-short' : ''}${mineHere ? ' has-me' : ''}`, dataset: { list: l.id } },
      h('div', { class: 'wk-list-head' }, h('b', {}, l.name, l.emergency && ' (EOT)', mineHere && h('span', { class: 'visually-hidden' }, ', you')), l.consultant && h('span', { class: 'wk-con' }, conText(l)),
        canWrite && h('button', { type: 'button', class: 'wk-edit', 'aria-label': `Change ${l.name} for this week`, onclick: () => edit(e => e.weekListSheet(l)) }, icon(ICONS.pencil))),
      noteBits.length > 0 && h('div', { class: 'wk-note small' }, noteBits.join(' · ')),
      (open || juniors.length > 0) && h('div', { class: 'wk-juniors' },
        juniors.map(n => h('button', { ...nameBtn(m, l, n, 'wk-chip'), disabled: !canWrite }, n)),
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
    me = meOf(app.settings.get('me'), m.people);
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
    const ready = store.ready(WEEK_NEEDS);
    // one step at a time: Epic and Build until it is built, then More (Epic and Build again are in its menu)
    $('week-build').hidden = !canWrite || m.built;
    $('week-epic').hidden = !canWrite || m.built || !m.lists.length;
    // (shown but not tappable until all the week's records are in; Build stays off while a build runs)
    $('week-build').toggleAttribute('disabled', !ready || !!editor?.busy());
    $('week-epic').toggleAttribute('disabled', !ready);
    $('week-more').hidden = canWrite && !m.built;   // nothing of the maker's to share yet (a viewer can still take the lists out)
    const away = monday !== firstWeek(todayKey());
    $('week-title').classList.toggle('is-away', away);
    if (away) $('week-title').setAttribute('aria-label', `${weekTitle(monday)}. Back to this week`); else $('week-title').removeAttribute('aria-label');
    $('week-show-grid').setAttribute('aria-pressed', String(show === 'grid'));
    $('week-show-day').setAttribute('aria-pressed', String(show === 'day'));
    const clashes = m.built && canWrite ? clashesOf({ grid: m.grid, lists: m.lists, leave: m.leave, calls: m.calls, holidays: m.holidays }) : [];
    clashAt = new Map(clashes.map(c => [`${c.day}|${c.session}|${c.name}`, c.why.join(', ')]));
    fill($('week-short'), shortPanel(m, sec), clashPanel(m, clashes));
    // a built week is drawn from its lists as built: say so when the Lists tab has changed since (the maker's edit code counts)
    const stale = canWrite && m.built && !!m.wk?.lists?.length;
    if (stale && !editing) editCode().then(() => draw(), () => { /* no note until a later draw loads it */ });
    const drift = stale && editor ? editor.drift(monday, m) : 0;
    $('week-drift').hidden = !drift || !ready;
    // ('Not built yet' only once the week's records are in: before that it may be built)
    $('week-state-note').textContent = !ready ? 'Loading…' : !m.lists.length ? '' : m.built ? [m.wk?.built ? `Built ${new Date(m.wk.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}.` : '',
      drift ? `The Lists tab has changed since (${drift} list${drift === 1 ? '' : 's'}).` : ''].filter(Boolean).join(' ')
      : `Not built yet.${canWrite && !m.callsMade ? ` Calls for ${m.unmade.map(mo => MONTH_NAMES[Number(mo.slice(5)) - 1]).join(' and ')} are not made yet, so post-call days are not kept clear.` : ''}`;
    $('week-table').hidden = show !== 'grid';
    $('week-chips').hidden = $('week-grid').hidden = show !== 'day';
    if (show === 'grid') { fill($('week-table'), weekTable(m, sec, days)); toToday(); }
    if (me && !mine) mineCode().then(() => draw(), () => { /* no card until a later draw loads it */ });
    fill($('week-mine'), me ? mine?.mineCard({ name: me, days, lists: m.lists, grid: m.grid, sec, calls: m.calls, leave: m.leave, built: m.built, holidays: m.holidays,
      rosters: /** @type {any} */ (store.get('rosters')), today: todayKey(), phones: m.phones })
      : !canWrite && !asked && m.people.length > 0 && askCard(m.people));
    empty.show(store.loaded('lists') && !m.lists.length);

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
          h('dl', { class: 'wk-oncall' }, tiers.map(t => [h('dt', {}, TIER_LABEL[t]), h('dd', { class: sec.onCall[d][t] === me ? 'is-me' : '' }, sec.onCall[d][t] ?? '–', telLink(m.phones, sec.onCall[d][t]))])),
          sec.leave[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Leave'), names(sec.leave[d])),
          sec.postCall[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Post-call'), names(sec.postCall[d])),
          m.built && sec.free[d].length > 0 && h('div', { class: 'wk-line' }, h('h3', {}, 'Free'),
            names(sec.free[d].map(f => [f.name, f.why ? 'on call' : f.when === 'FULL DAY' ? '' : f.when])))));
    }));
    $('week-print-sheet').classList.remove('is-ready');
    if (matchMedia('(hover: hover)').matches) exportMod.warmUp();   // (only the first call runs)
  }

  return {
    ...view,
    /** @param {import('../items.js').State} s */
    show(s) { view.show(s); draw(); },
    draw,
  };
}
