// The Calls tab (#calls-page): a month's on-call roster. A calendar of the tiers (CON, REG, MO NUH, MO NTFGH every day by
// default; Settings sets the tiers per kind of day; REG 2 on the days it is entered by hand), "Make calls" (the solver,
// roster/calls.js), a table of how many calls each person has,
// and what breaks a rule. A tap on a day sets its calls by hand; a call set by hand is kept when the calls are made again,
// until the maker taps Release them.
// A narrow page shows the days as a list, a page about 52rem wide or more as a month grid. Print (or Ctrl+P on this tab)
// prints the month on one landscape page: the grid and the calls per person (7 Nov 2026).
import { icon, emptyState, undoToast } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { LOADING, REFUSED } from '../items.js';
import { solveCalls } from '../roster/calls.js';
import { checkCalls } from '../roster/calls-check.js';
import { applyDayEdit, handCount, keepGoodCalls, lockedMap, problemLines, callChoices, dayLabel } from '../roster/calls-edit.js';
import { callMapIn, firstMonth, monthCells, shiftMonth } from '../roster/sections.js';
import { callRow, callRowsOf, DAY_TYPES, TIERS, TIER_LABEL, dayType, tierPlanOf, tiersShown } from '../roster/model.js';
import { MONTHS, monthDays, shortDay, weekdayName, todayKey } from '../roster/dates.js';
import { holidaysIn, readHolidays } from '../roster/holidays.js';
import { activePeople, meOf } from '../data/people.js';
import { leaveOf, requestsOf } from '../data/leave.js';
import { editSheet } from './sheet.js';

/** @param {string} month @returns {string} 'November 2026' */
export const monthTitle = month => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
const SHORT = /** @type {Record<string, string>} */ ({ con: 'CON', reg: 'REG', reg2: 'REG2', moNuh: 'NUH', moNtf: 'NTF' });
/** @param {string} day @returns {string} 'Mon 2 Nov' */
const dayName = day => `${weekdayName(day)} ${shortDay(day)}`;
/** @param {string} text @returns {string} the checker's text with its YYYY-MM-DD days read as 'Mon 2 Nov' */
const readDays = text => text.replace(/\d{4}-\d{2}-\d{2}/g, dayName);
/** the usual choices of tiers for a kind of day (Settings) */
const PLAN_CHOICES = /** @type {import('../roster/model.js').Tier[][]} */ ([
  ['con', 'reg', 'moNuh', 'moNtf'], ['con', 'reg', 'reg2', 'moNuh', 'moNtf'], ['con', 'reg', 'moNuh'], ['con', 'reg'], ['con'],
]);
/** @param {string[]} tiers */
const planLabel = tiers => tiers.map(t => SHORT[t]).join(' + ');
// what a month's calls are made from: until each kind's first rows are in, Make calls, a day's calls and Settings wait, or
// they would make or save the month without its leave, requests or hand-set calls (7 Nov 2026)
const CALLS_NEEDS = /** @type {import('../cloud.js').Kind[]} */ (['people', 'leave', 'requests', 'rosters']);

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  // the roster maker starts on next month from the 20th (when its calls are made); everyone else on this month
  let month = firstMonth(todayKey(), ctx.canWrite());
  let busy = false;
  const sheet = editSheet();
  // the kit's Undo toast on the page's toaster (whose show hands back that toast's dismiss)
  const undo = undoToast({ show: (text, o) => { const gone = toast(text, o); return () => { if (typeof gone === 'function') gone(); }; } }, { ms: 6000 });
  const host = $('calls-host');
  const empty = emptyState(host, { title: 'No people yet', hint: 'Add the doctors on the People tab first.' });
  const bar = h('div', { class: 'cl-bar' });
  const stateNote = h('span', { role: 'status' });
  // (Release them: the maker's way to let Make calls redo the calls set by hand)
  const releaseSlot = h('span');
  const handKey = h('p', { class: 'small cl-hand-key' });
  // (a maker's days are buttons in a group; a viewer's are items of a list: role set in draw)
  const cal = h('div', { class: 'cl-cal', 'aria-label': 'Calls by day' });
  const counts = h('div', { class: 'cl-counts' });
  const problemsBox = h('div', { class: 'cl-problems' });
  host.append(bar, h('p', { class: 'small cl-state' }, stateNote, releaseSlot), cal, handKey, counts, problemsBox);

  store.on(CALLS_NEEDS, () => draw());
  ctx.onRole(() => draw());
  app.settings.watch('me', () => draw());   // "This is me" (Week, More): the name marked here too

  /** @param {number} n */
  const step = n => { month = shiftMonth(month, n); draw(); };
  /** true (and says so) while some of what the calls are made from has not arrived yet */
  const waiting = () => { if (store.ready(CALLS_NEEDS)) return false; toast(LOADING); return true; };

  /** the month's roster and what its calls depend on, as the store holds them now @param {string} [mon] (default: the month on screen) */
  function model(mon = month) {
    const roster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', mon));
    const people = activePeople(/** @type {any} */ (store.get('people')));
    const leave = leaveOf(/** @type {any} */ (store.get('leave')));
    const requests = requestsOf(/** @type {any} */ (store.get('requests')));
    const prevRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', shiftMonth(mon, -1)));
    const nextRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', shiftMonth(mon, 1)));
    // the months either side, for the gap rule across the month's ends: a call on the 30th too close to one already made on the 1st is flagged and avoided
    const prior = callMapIn(prevRoster?.calls ?? [], shiftMonth(mon, -1));
    const after = callMapIn(nextRoster?.calls ?? [], shiftMonth(mon, 1));
    const plan = tierPlanOf(roster?.tierPlan);
    return { roster, people, leave, requests, prior, after, calls: roster?.calls ?? [], holidays: roster?.holidays ?? [], minGap: roster?.minGap ?? 2, plan };
  }

  /** the month's calls as an Excel file (date rows by the four tiers, then the counts) */
  async function exportXlsx() {
    const m = model();
    if (!m.calls.some(c => TIERS.some(t => c[t]))) { toast('Make the calls first.'); return; }
    try {
      const check = checkCalls({ month, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan });
      const { exportCalls } = await import('./export.js');
      toast(`Saved ${await exportCalls({ month, calls: m.calls, holidays: m.holidays, counts: check.counts, tierPlan: m.plan })}`);
    } catch (e) { toast(e instanceof Error && e.message ? e.message : 'Could not make the Excel file.'); }
  }

  // the print CSS (app.css) prints the Week unless html[data-print="calls"]: set when this tab is the one shown (cleared
  // otherwise too, in case a browser never said afterprint)
  const root = document.documentElement;
  window.addEventListener('beforeprint', () => { if ($('calls-page').hidden) delete root.dataset.print; else root.dataset.print = 'calls'; });
  window.addEventListener('afterprint', () => { delete root.dataset.print; });
  function printMonth() {
    root.dataset.print = 'calls';
    window.print();
  }

  // Make calls on a month that has calls already asks first (7 Nov 2026): a late leave or request should not reshuffle the
  // whole month. Three ways out, as Build week's (app-ui has only yes or no): Fix the problems only (keep every call the
  // check finds fine and fill the problem calls and the empty tiers), Make all new, or Cancel (the sheet's own). Calls set
  // by hand stay either way. A month with no calls yet is made straight away.
  async function make() {
    if (busy || !ctx.canWrite() || waiting()) return;
    const mon = month, open = model(mon);   // (the month on screen may change while it works)
    if (!open.calls.some(c => TIERS.some(t => c[t]))) { await solve(mon, false); return; }
    const hand = handCount(open.roster?.locked ?? [], open.calls);
    const { fix, handBad } = toFix(mon, open);
    const stay = hand ? ` The ${hand} set by hand stay either way; to have those made new too, tap Release them first.` : ' Calls set by hand stay either way.';
    // nothing to fix (no rule broken, no tier empty, or only calls set by hand break one): Make all new is the one choice
    if (!fix) {
      sheet.open({
        title: 'Make calls', fields: [], saveLabel: 'Make all new',
        note: `Nothing to fix in ${monthTitle(mon)}: every call is filled and ${handBad ? 'only calls set by hand break a rule' : 'none breaks a rule'}. Make the whole month new?${stay}`,
        onSave: () => solve(mon, false),
      });
      return;
    }
    sheet.open({
      title: 'Make calls', fields: [], saveLabel: 'Fix the problems only', deleteLabel: 'Make all new',
      note: `${monthTitle(mon)} has calls already. Fix only the ${fix} to look at and keep the rest, or make the whole month new?${stay}`,
      onSave: () => solve(mon, true),
      onDelete: () => solve(mon, false),
    });
  }

  /**
   * How many calls Fix the problems only would leave for the solver (the problem calls not set by hand, and the empty tiers),
   * and whether a call set by hand breaks a rule. @param {string} mon @param {ReturnType<typeof model>} m
   */
  function toFix(mon, m) {
    const check = checkCalls({ month: mon, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan });
    const hand = lockedMap(m.roster?.locked ?? [], m.calls);
    const free = check.problems.filter(p => !hand[p.date]?.[p.tier]);
    return { fix: new Set(free.map(p => `${p.date}|${p.tier}`)).size + check.empty.length, handBad: free.length < check.problems.length };
  }

  /**
   * Makes the month's calls with a new seed and saves them, with Undo. Fix only keeps every call the check finds fine; else
   * only the calls set by hand are kept. Nothing is added to the month's locked list either way.
   * @param {string} mon @param {boolean} fixOnly
   */
  async function solve(mon, fixOnly) {
    if (busy || !ctx.canWrite() || waiting()) return;
    busy = true; $('calls-make').setAttribute('disabled', ''); stateNote.textContent = 'Making the calls…';
    try {
      await new Promise(r => setTimeout(r, 30));   // let the note paint before the solver holds the page
      // the month as it is now (another maker may have saved while the question was open)
      const m = model(mon);
      const locked = fixOnly
        ? keepGoodCalls(mon, m.calls, m.roster?.locked ?? [], checkCalls({ month: mon, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan }))
        : lockedMap(m.roster?.locked ?? [], m.calls);
      const seed = (m.roster?.seed ?? 0) + 1;
      // the month as it was, for Undo (no month yet: an empty one)
      const was = { calls: m.roster?.calls ?? [], locked: m.roster?.locked ?? [], problems: m.roster?.problems ?? [], seed: m.roster?.seed, built: m.roster?.built ?? 0 };
      const res = solveCalls({ month: mon, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, seed, prior: m.prior, after: m.after, locked, tiers: m.plan, iterations: 20000 });
      const calls = callRowsOf(res.assignments);
      const refused = await app.data.rosters.upsert(mon, m.roster, { calls, problems: problemLines(res.problems), seed, built: Date.now() });
      if (refused) { toast(REFUSED); return; }
      // the same lines the page's To look at list shows, so the two agree; unmet requests are said apart
      const check = checkCalls({ month: mon, calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan });
      const look = check.problems.length + check.empty.length, unmet = res.problems.filter(p => p.rule === 'want').length;
      const said = [look && `${look} thing${look === 1 ? '' : 's'} to look at.`, unmet && `${unmet} request${unmet === 1 ? '' : 's'} not met.`].filter(Boolean).join(' ');
      undo.show(said ? `${fixOnly ? 'Fixed' : 'Made'}. ${said}` : fixOnly ? 'Fixed' : 'Made', () => putBack(mon, was));
    } finally { busy = false; $('calls-make').removeAttribute('disabled'); draw(); }
  }

  /** Undo: the month's fields put back as they were, on the month as it is by then @param {string} mon @param {Record<string, unknown>} was */
  async function putBack(mon, was) {
    if (await app.data.rosters.upsert(mon, /** @type {any} */ (store.row('rosters', mon)), was)) toast(REFUSED);
  }

  /** Release them: the month's hand-set calls unlocked (names and calls stay), so Make calls may change them; Undo locks them again */
  async function release() {
    if (!ctx.canWrite() || waiting()) return;
    const mon = month, now = model(mon);
    const locked = now.roster?.locked ?? [];
    if (!locked.length) return;
    if (await app.data.rosters.upsert(mon, now.roster, { locked: [] })) toast(REFUSED);
    else undo.show('Released. Make calls may now change them.', () => putBack(mon, { locked }));
  }

  /** @param {string} date */
  function daySheet(date) {
    if (waiting()) return;
    const mon = month, m = model(mon);   // (options and warnings read the month as it was when the sheet opened)
    const plan = m.plan[dayType(date, m.holidays)];
    // (REG 2 is offered every day: the roster has one on a few days, entered by hand)
    const tiers = TIERS.filter(t => plan.includes(t) || t === 'reg2' || m.calls.find(c => c.date === date)?.[t]);
    const row = m.calls.find(c => c.date === date);
    sheet.open({
      title: `${weekdayName(date)} ${shortDay(date)}`, note: 'A call set here is kept when the calls are made again.', saveLabel: 'Save',
      values: Object.fromEntries(tiers.map(t => [t, row?.[t] ?? ''])),
      fields: tiers.map(t => ({ key: t, label: TIER_LABEL[t], type: /** @type {const} */ ('select'),
        // free people first, each with their calls this month and why they may not be free
        options: () => callChoices({ date, tier: t, people: m.people, calls: m.calls, prior: m.prior, after: m.after, leave: m.leave, requests: m.requests, minGap: m.minGap, current: row?.[t] }) })),
      warn: v => {
        const next = Object.fromEntries(tiers.map(t => [t, v[t] || null]));
        const calls = [...m.calls.filter(c => c.date !== date), { date, ...callRow({ ...row, ...next }) }];
        return checkCalls({ month: mon, calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan })
          .problems.filter(p => p.date === date || (next[p.tier] === p.name && Math.abs(Date.parse(p.date) - Date.parse(date)) <= 4 * 864e5)).map(p => readDays(p.text));
      },
      // saved onto the month as it is now: only the tiers changed here, so another maker's save meanwhile stays
      onSave: async v => {
        if (waiting()) return;
        const now = model(mon), was = { calls: now.calls, locked: now.roster?.locked ?? [] };
        const state = applyDayEdit(was.calls, was.locked, date, Object.fromEntries(tiers.map(t => [t, row?.[t] ?? null])), Object.fromEntries(tiers.map(t => [t, v[t] || null])));
        const refused = await app.data.rosters.upsert(mon, now.roster, { calls: state.calls, locked: state.locked });
        if (refused) toast(REFUSED); else undo.show('Saved', () => putBack(mon, was));
      },
    });
  }

  function monthSheet() {
    if (waiting()) return;
    const mon = month, m = model(mon);
    // Singapore's public holidays for the month (roster/holidays.js): Suggest adds the weekday ones; the admin still saves
    const pub = holidaysIn(mon);
    const named = [pub.suggest.length && `Singapore: ${pub.suggest.map(p => `${shortDay(p.day)} ${p.name}`).join(', ')}.`,
      pub.weekendNames.length && `On a weekend (not added): ${pub.weekendNames.join(', ')}.`].filter(Boolean).join(' ');
    const outOfMonth = `use YYYY-MM-DD within ${monthTitle(mon)}`;
    const suggestBtn = h('button', { type: 'button', id: 'calls-suggest-holidays', disabled: !pub.suggest.length, onclick: () => {
      const area = /** @type {HTMLTextAreaElement} */ ($('ef-holidays'));
      const typed = area.value.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      area.value = [...new Set([...typed, ...pub.suggest.map(p => p.day)])].sort().join('\n');
      area.dispatchEvent(new Event('input'));   // (the sheet redraws its warnings on input)
    } }, icon(ICONS.calendar), 'Suggest public holidays');
    sheet.open({
      title: `${monthTitle(mon)}: settings`, saveLabel: 'Save',
      note: 'Public holidays close that day’s lists on the Week tab. REG 2 can be set on any day by hand.',
      values: { holidays: m.holidays.join('\n'), minGap: m.minGap, ...Object.fromEntries(DAY_TYPES.map(([d]) => [`plan-${d}`, m.plan[d].join(',')])) },
      fields: [
        { key: 'holidays', label: 'Public holidays (one day per line, YYYY-MM-DD)', type: 'area', max: 400,
          hint: named || 'No Singapore public holidays known for this month.' },
        { key: 'minGap', label: 'Days clear between one person’s calls', type: 'number', min: 1, max: 7, hint: '2 means call on Monday, next on Thursday at the earliest.' },
        ...DAY_TYPES.map(([d, label]) => ({ key: `plan-${d}`, label: `On call on ${label.toLowerCase()}`, type: /** @type {const} */ ('select'),
          options: [...PLAN_CHOICES, ...(PLAN_CHOICES.some(c => c.join(',') === m.plan[d].join(',')) ? [] : [m.plan[d]])].map(c => /** @type {[string, string]} */ ([c.join(','), planLabel(c)])) })),
      ],
      body: { node: h('div', { class: 'cl-suggest' }, suggestBtn), read: () => ({}) },
      // a typo, a day that does not exist or a day of another month is named here, never dropped unseen
      warn: v => { const { ignored } = readHolidays(v.holidays, mon); return ignored.length ? [`Ignored: ${ignored.join(', ')} (${outOfMonth}).`] : []; },
      onSave: async v => {
        if (waiting()) return;
        const { days: holidays, ignored } = readHolidays(v.holidays, mon);
        const tierPlan = Object.fromEntries(DAY_TYPES.map(([d]) => [d, String(v[`plan-${d}`]).split(',').filter(Boolean)]));
        // only these fields, onto the month as it is now (another maker may have saved calls meanwhile)
        const refused = await app.data.rosters.upsert(mon, model(mon).roster, { holidays, tierPlan, ...(v.minGap == null ? {} : { minGap: v.minGap }) });
        toast(refused ? REFUSED : ignored.length ? `Saved. Ignored: ${ignored.join(', ')} (${outOfMonth}).` : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('people')) return;
    const m = model();
    const canWrite = ctx.canWrite();
    const ready = store.ready(CALLS_NEEDS);
    const me = meOf(app.settings.get('me'), m.people);
    empty.show(!m.people.length && canWrite);
    const prev = h('button', { type: 'button', 'aria-label': 'Previous month', onclick: () => step(-1) }, icon(ICONS.chevronLeft));
    const next = h('button', { type: 'button', 'aria-label': 'Next month', onclick: () => step(1) }, icon(ICONS.chevronRight));
    fill(bar, prev, h('h2', { class: 'cl-title', id: 'calls-title' }, monthTitle(month)), next,
      h('span', { class: 'cl-bar-end' },
        h('button', { type: 'button', id: 'calls-xlsx', onclick: exportXlsx }, icon(ICONS.download), 'Excel'),
        h('button', { type: 'button', id: 'calls-print', onclick: printMonth }, icon(ICONS.printer), 'Print'),
        canWrite && h('button', { type: 'button', onclick: monthSheet }, 'Settings'),
        canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'calls-make', disabled: busy || !ready, onclick: make }, icon(ICONS.sparkles), 'Make calls')));
    const byDate = new Map(m.calls.map(c => [c.date, c]));
    const any = m.calls.some(c => TIERS.some(t => c[t]));
    const check = checkCalls({ month, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan });
    const shownTiers = tiersShown(m.plan, m.calls);
    const bad = new Set(check.problems.map(p => `${p.date}|${p.tier}`));
    const hand = handCount(m.roster?.locked ?? [], m.calls);
    // ('No calls yet' only once the month's roster has arrived: before that it may have calls)
    let state = !ready ? 'Loading…' : any ? (m.roster?.built ? `Made ${new Date(m.roster.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}. ${check.empty.length ? `${check.empty.length} empty.` : ''}` : '') : (canWrite ? 'No calls yet. Tap Make calls.' : 'No calls yet.');
    // (the maker may have forgotten them: Singapore has a weekday public holiday this month)
    if (ready && canWrite && !m.holidays.length && holidaysIn(month).suggest.length) state = `${state.trim()} Public holidays not set for this month (Settings).`;
    if (canWrite && hand) state = `${state.trim()} ${hand} set by hand.`;
    stateNote.textContent = state.trim();
    fill(releaseSlot, canWrite && hand > 0 && !busy && h('button', { type: 'button', id: 'calls-release', onclick: release }, 'Release them'));
    handKey.textContent = hand ? 'Bold: set by hand, kept when the calls are made again.' : '';
    handKey.hidden = !hand;

    const locked = new Set(m.roster?.locked ?? []), today = todayKey();
    // a maker's day is a button that opens its sheet; a viewer's a list item (no disabled button). Either way it reads its calls
    // aloud (the bold and the wavy line said as words), since a label replaces what is inside (7 Nov 2026)
    cal.setAttribute('role', canWrite ? 'group' : 'list');
    /** @param {string} date */
    const cell = date => {
      const row = byDate.get(date), type = dayType(date, m.holidays);
      const plan = m.plan[type];
      const tiers = TIERS.filter(t => plan.includes(t) || row?.[t])
        .map(t => ({ t, name: row?.[t] ?? null, bad: bad.has(`${date}|${t}`), hand: !!row?.[t] && locked.has(`${date}|${t}`) }));
      const label = dayLabel(date, m.holidays.includes(date), tiers) + (canWrite ? ' Tap to edit calls.' : '');
      const props = canWrite ? { type: 'button', onclick: () => daySheet(date) } : { role: 'listitem' };
      return h(canWrite ? 'button' : 'div', { ...props, class: `cl-day type-${type}${date === today ? ' is-today' : ''}`, dataset: { day: date }, 'aria-label': label },
        h('span', { class: 'cl-date' }, h('b', {}, String(Number(date.slice(8)))), h('span', { class: 'cl-wd' }, weekdayName(date)), m.holidays.includes(date) && h('span', { class: 'cl-ph small' }, 'PH')),
        h('span', { class: 'cl-tiers' }, tiers.map(x => h('span', { class: `cl-tier${x.name ? '' : ' is-empty'}${x.bad ? ' is-bad' : ''}${x.hand ? ' is-hand' : ''}${me && x.name === me ? ' is-me' : ''}`, title: x.name ?? '' },
          h('i', {}, SHORT[x.t]), h('span', {}, x.name ?? '–'),
          x.bad && h('span', { class: 'visually-hidden' }, ' (problem)'), x.hand && h('span', { class: 'visually-hidden' }, ' (set by hand)')))));
    };
    fill(cal, monthCells(month).map(d => d ? cell(d) : h('span', { class: 'cl-blank', 'aria-hidden': 'true' })));

    fill(counts, any && [
      h('h3', {}, 'Calls per person'),
      h('table', { class: 'cl-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Total'), h('th', {}, 'Off days'), shownTiers.map(t => h('th', {}, SHORT[t])))),
        h('tbody', {}, check.counts.map(c => h('tr', { class: c.name === me ? 'is-me' : '' }, h('th', { scope: 'row' }, c.name, c.offRoster && h('span', { class: 'cl-off small' }, ' (not on roster)')), h('td', {}, String(c.total)), h('td', {}, String(c.weekend)), shownTiers.map(t => h('td', {}, c.tiers[t] ? String(c.tiers[t]) : '·'))))))]);

    // in date order; the maker taps a line to open its day (a viewer reads them)
    const lines = [...check.problems.map(p => ({ date: p.date, text: readDays(p.text) })),
      ...check.empty.map(e => ({ date: e.date, text: `${TIER_LABEL[e.tier]} on ${dayName(e.date)} has nobody` }))]
      .sort((a, b) => a.date.localeCompare(b.date));
    fill(problemsBox, any && (lines.length
      ? [h('h3', {}, 'To look at'), h('ul', { class: 'cl-problem-list' }, lines.slice(0, 40).map(l => h('li', {}, canWrite
        ? h('button', { type: 'button', class: 'cl-problem', onclick: () => daySheet(l.date) }, l.text)
        : l.text))), lines.length > 40 && h('p', { class: 'small' }, `and ${lines.length - 40} more`)]
      : [h('p', { class: 'small ok' }, 'No rule is broken.')]));
  }
  // drawn now as well: the data may all be in before this tab first opens, and then no change comes to draw it
  draw();
  return { draw };
}
