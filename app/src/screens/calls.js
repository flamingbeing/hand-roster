// The Calls tab (#calls-page): a month's on-call roster. A calendar of the tiers (CON, REG, MO NUH, MO NTFGH every day by
// default; Settings sets the tiers per kind of day; REG 2 on the days it is entered by hand), "Make calls" (the solver,
// roster/calls.js), a table of how many calls each person has,
// and what breaks a rule. A tap on a day sets its calls by hand; a call set by hand is kept when the calls are made again,
// until the maker taps Release them.
// A narrow page shows the days as a list, a page about 52rem wide or more as a month grid. Print (or Ctrl+P on this tab)
// prints the month on one landscape page: the grid and the calls per person (7 Nov 2026). Copy puts the month's calls on the
// clipboard as chat text for WhatsApp, or, once "This is me" is set, only that person's calls (7 Nov 2026).
// A person's phone, when set, is a call link beside their name: in a viewer's day cells (a maker's day is a button, which
// can't hold a link) and in the day sheet (owner, 7 Nov 2026).
// The rule check (roster/report.js, app-roster's score of the rule cards): a maker sees a call that breaks a block rule marked
// red and a warn rule amber, a Report button (the rule report sheet, screens/report.js), and Make calls names the calls
// nobody can take; when something breaks, a second toast opens the report. An accepted warning is kept on the month.
// Draft and published (roster/drafts.js): Make calls saves into the month's draft, which viewers don't see until Publish; a
// day's calls set by hand go into the draft when there is one, else onto the published month. Make calls on a month with
// calls first shows the new calls as a preview (changed calls marked) with Apply or Discard; a first Make calls goes straight
// to the draft. A line under the bar says where the month stands: Publish and Discard draft, or Back to draft.
import { validateRule, describeRule, score, check } from '@core/roster';
import { icon, emptyState, openMenu, undoToast } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill, telLink } from '../dom.js';
import { LOADING, REFUSED } from '../items.js';
import { solveCalls } from '../roster/calls.js';
import { checkCalls } from '../roster/calls-check.js';
import { callRules, rulesOf, wordsOf } from '../roster/rule-cards.js';
import { callsProblem } from '../roster/problem.js';
import { MONTH_PLAN, asMaker, backToDraftOf, callChanges, planSig, planState, planWrite, publishOf, undoOf, undoPlan } from '../roster/drafts.js';
import { checkSaid, marksOf, reportOf, shortLines } from '../roster/report.js';
import { applyDayEdit, handCount, keepGoodCalls, lockedMap, problemLines, callChoices, dayLabel } from '../roster/calls-edit.js';
import { callMapIn, firstMonth, monthCells, shiftMonth } from '../roster/sections.js';
import { callRow, callRowsOf, DAY_TYPES, TIERS, TIER_LABEL, dayType, tierPlanOf, tiersShown } from '../roster/model.js';
import { MONTHS, MONTH_NAMES, monthDays, shortDay, weekdayName, todayKey } from '../roster/dates.js';
import { holidaysIn, readHolidays, weekendHolidays } from '../roster/holidays.js';
import { activePeople, meOf, phonesOf } from '../data/people.js';
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
  // the preview's line (Apply, Discard) or where the month stands (Publish, Back to draft): a maker's
  const planLine = h('div', { class: 'wk-plan', id: 'calls-plan', hidden: true });
  host.append(bar, h('p', { class: 'small cl-state' }, stateNote, releaseSlot), planLine, cal, handKey, counts, problemsBox);

  store.on(CALLS_NEEDS, () => draw());
  ctx.onRole(() => draw());
  app.settings.watch('me', () => draw());   // "This is me" (Week, More): the name marked here too

  /** @param {number} n */
  const step = n => { month = shiftMonth(month, n); draw(); };
  /** true (and says so) while some of what the calls are made from has not arrived yet */
  const waiting = () => { if (store.ready(CALLS_NEEDS)) return false; toast(LOADING); return true; };

  /** the month's roster and what its calls depend on, as the store holds them now @param {string} [mon] (default: the month on screen) */
  function model(mon = month) {
    // a maker sees the drafts laid over (roster/drafts.js); top: the month's record as stored (what saves start from)
    const mk = (/** @type {import('../data/plans.js').RosterRow | undefined} */ r) => (ctx.canWrite() ? asMaker(r) : r);
    const top = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', mon));
    const roster = mk(top);
    const people = activePeople(/** @type {any} */ (store.get('people')));
    const leave = leaveOf(/** @type {any} */ (store.get('leave')));
    const requests = requestsOf(/** @type {any} */ (store.get('requests')));
    const prevRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (mk(store.row('rosters', shiftMonth(mon, -1))));
    const nextRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (mk(store.row('rosters', shiftMonth(mon, 1))));
    // the months either side, for the gap rule across the month's ends: a call on the 30th too close to one already made on the 1st is flagged and avoided
    const prior = callMapIn(prevRoster?.calls ?? [], shiftMonth(mon, -1));
    const after = callMapIn(nextRoster?.calls ?? [], shiftMonth(mon, 1));
    const plan = tierPlanOf(roster?.tierPlan);
    // the rule cards in force (spaces/_/rules over the defaults); the month's own "Days clear" wins over the gap card
    const cards = rulesOf(/** @type {any} */ (store.get('rules')), validateRule), rules = callRules(cards);
    return { cards, top, roster, people, leave, requests, prior, after, calls: roster?.calls ?? [], holidays: roster?.holidays ?? [], minGap: roster?.minGap ?? rules.minGap, plan, rules,
      phones: phonesOf(/** @type {any} */ (store.get('people'))) };
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

  /** copies the month's calls as chat text, or only mine (anyone may: it changes nothing) @param {string} mon @param {boolean} mine */
  async function copyCalls(mon, mine) {
    const m = model(mon);
    if (!m.calls.some(c => TIERS.some(t => c[t]))) { toast(ctx.canWrite() ? 'Make the calls first.' : 'No calls yet.'); return; }
    const me = mine ? meOf(app.settings.get('me'), m.people) : '';
    try {
      const x = await import('./export.js');
      const text = x.callsText({ month: mon, calls: m.calls, holidays: m.holidays, tierPlan: m.plan, ...(me ? { name: me } : {}) });
      const what = `${me ? 'your' : 'the'} calls for ${MONTH_NAMES[Number(mon.slice(5)) - 1]}`;
      toast(await x.copyText(text) ? `Copied ${what}. Paste it into WhatsApp.` : 'Could not copy. Allow the clipboard and try again.');
    } catch { toast('Could not copy.'); }
  }
  /** Copy: the whole month straight away; with "This is me" set, a menu of the whole month or only my calls @param {MouseEvent} e */
  function copyClick(e) {
    const mon = month;
    if (!meOf(app.settings.get('me'), model(mon).people)) { copyCalls(mon, false); return; }
    openMenu(/** @type {HTMLElement} */ (e.currentTarget), [
      { label: 'Whole month', icon: ICONS.clipboardCopy, run: () => copyCalls(mon, false) },
      { label: 'Only my calls', icon: ICONS.userCheck, run: () => copyCalls(mon, true) },
    ], { label: 'Copy' });
  }

  // the print CSS (app.css) prints the Week unless html[data-print="calls"]: set when this tab is the one shown (cleared
  // otherwise too, in case a browser never said afterprint)
  const root = document.documentElement;
  window.addEventListener('beforeprint', () => { if ($('calls-page').hidden) delete root.dataset.print; else root.dataset.print = 'calls'; });
  window.addEventListener('afterprint', () => { delete root.dataset.print; });
  function printMonth() {
    if (held()) return;   // (a preview is not the month)
    root.dataset.print = 'calls';
    window.print();
  }

  // Make calls on a month that has calls already asks first (7 Nov 2026): a late leave or request should not reshuffle the
  // whole month. Three ways out, as Build week's (app-ui has only yes or no): Fix the problems only (keep every call the
  // check finds fine and fill the problem calls and the empty tiers), Make all new, or Cancel (the sheet's own). Calls set
  // by hand stay either way. A month with no calls yet is made straight away. Both ways hold the clear-days rule against
  // last month's calls and next month's once made, a hard rule (owner 7 Nov 2026; see solveCalls).
  async function make() {
    if (busy || !ctx.canWrite() || held() || waiting()) return;
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
    // (and the rule cards: not in CALLS_NEEDS, so the tab never waits on them to show)
    if (busy || !ctx.canWrite() || waiting()) return;
    if (!store.ready(['rules'])) { toast(LOADING); return; }
    busy = true; $('calls-make').setAttribute('disabled', ''); stateNote.textContent = 'Making the calls…';
    try {
      await new Promise(r => setTimeout(r, 30));   // let the note paint before the solver holds the page
      // the month as it is now (another maker may have saved while the question was open)
      const m = model(mon);
      const locked = fixOnly
        ? keepGoodCalls(mon, m.calls, m.roster?.locked ?? [], checkCalls({ month: mon, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan }))
        : lockedMap(m.roster?.locked ?? [], m.calls);
      const seed = (m.roster?.seed ?? 0) + 1;
      const res = solveCalls({ month: mon, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, seed, prior: m.prior, after: m.after, locked, tiers: m.plan, iterations: 20000, rules: m.rules });
      const calls = callRowsOf(res.assignments);
      // the same lines the page's To look at list shows, so the two agree; unmet requests are said apart
      const check = checkCalls({ month: mon, calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan });
      const look = check.problems.length + check.empty.length, unmet = res.problems.filter(p => p.rule === 'want').length;
      // (warnings accepted before are dropped: they were accepted for calls that may have changed)
      const c = checked(mon, { ...m, calls, roster: m.roster && { ...m.roster, accepted: [] } });
      const said = [look && `${look} thing${look === 1 ? '' : 's'} to look at.`, unmet && `${unmet} request${unmet === 1 ? '' : 's'} not met.`].filter(Boolean).join(' ');
      // a month with calls: a preview first (Apply saves it into the draft, with Undo); a first Make calls straight into the draft
      pv = { mon, sig: planSig(store.row('rosters', mon), MONTH_PLAN), fields: { calls, problems: problemLines(res.problems), seed, built: Date.now(), accepted: [] }, check: c,
        said: said ? `${fixOnly ? 'Fixed' : 'Made'}. ${said}` : fixOnly ? 'Fixed' : 'Made', changes: callChanges(m.calls, calls, TIERS) };
      if (!m.calls.some(x => TIERS.some(t => x[t]))) await apply();
    } finally { busy = false; $('calls-make').removeAttribute('disabled'); draw(); }
  }

  // the preview of Make calls: the new calls' fields, the Made toast's words, the check, which calls change
  /** @type {{ mon: string, sig: string, fields: Record<string, any>, said: string, check: ReturnType<typeof checked>, changes: Set<string> } | null} */
  let pv = null;
  /** true (and says so) while the month on screen shows a preview: Apply or Discard first */
  const held = () => { if (pv?.mon !== month) return false; toast('Apply or discard the preview first.'); return true; };
  /**
   * Writes fields onto the month's record as it is now, with Undo (each field put back as it was, on the record as it is by then).
   * @param {string} mon @param {Record<string, unknown>} out @param {string} said
   * @param {(now: any) => Record<string, unknown>} [back]  Undo's fields from the record as it is then (default: each field as it was)
   * @returns {Promise<boolean>} saved
   */
  async function write(mon, out, said, back) {
    const row = /** @type {any} */ (store.row('rosters', mon)), was = undoOf(row, out);
    if (await app.data.rosters.upsert(mon, row, out)) { toast(REFUSED); return false; }
    undo.show(said, () => putBack(mon, back ? back(store.row('rosters', mon)) : was));
    return true;
  }
  /** the month's plan fields saved into its draft when it has one (or `toDraft`: Make calls), else onto the month, with Undo @param {string} mon @param {Record<string, unknown>} fields @param {string} said @param {boolean} [toDraft] */
  function save(mon, fields, said, toDraft = false) {
    const row = /** @type {any} */ (store.row('rosters', mon));
    return write(mon, planWrite(row, fields, MONTH_PLAN, toDraft), said, undoPlan(row, fields, MONTH_PLAN, toDraft));
  }
  /** Apply: the preview saved into the month's draft; then what the rule check found, in a toast of its own (Made keeps Undo) */
  async function apply() {
    const p = pv;
    if (!p) return;
    pv = null;
    // the month changed since (another maker's edit came in): the preview was made from calls that are gone
    if (planSig(store.row('rosters', p.mon), MONTH_PLAN) !== p.sig) { toast('The calls changed since this preview. Make calls again to see them with the change.'); draw(); return; }
    if (await save(p.mon, p.fields, p.said, true) && p.check.words) {
      toast(p.check.words, { ms: 10000, action: { label: 'Report', run: () => { void openCallsReport(p.mon, p.check.rows, p.check.short); } } });
    }
    draw();
  }
  /** the line's buttons: Publish, Back to draft, Discard draft (each with Undo) @param {'publish' | 'draft' | 'drop'} what */
  function planDo(what) {
    const mon = month, row = /** @type {any} */ (store.row('rosters', mon));
    if (held() || !row || !ctx.canWrite()) return;
    if (what === 'publish' && row.draft) void write(mon, publishOf(row, MONTH_PLAN), `Published: viewers see ${monthTitle(mon)}'s calls now.`);
    if (what === 'draft' && !row.draft) void write(mon, backToDraftOf(row, MONTH_PLAN), 'Back to draft. Viewers see the published calls until you publish.');
    if (what === 'drop' && row.draft) void write(mon, { draft: null }, 'Draft discarded.');
  }
  let planKey = '';
  /** @param {string} id @param {string} label @param {() => void} run @param {boolean} [primary] */
  const planBtn = (id, label, run, primary = false) => h('button', { type: 'button', id, class: primary ? 'ui-primary' : '', 'data-size': 'small', onclick: run }, label);
  /** the line under the bar for the month on screen (each draw) */
  function drawPlan() {
    const made = (/** @type {any} */ r) => !!r?.calls?.some((/** @type {any} */ c) => TIERS.some(t => c[t]));
    const n = pv?.changes.size ?? 0;
    const state = !ctx.canWrite() ? '' : pv?.mon === month ? `preview|${n}` : planState(/** @type {any} */ (store.row('rosters', month)), made);
    if (state === planKey) return;   // (the same buttons stay: a sync redraw never takes a focused button away)
    planKey = state;
    planLine.hidden = !state;
    planLine.dataset.state = state.split('|')[0];
    fill(planLine, state.startsWith('preview') ? [
      h('p', { role: 'status' }, h('b', {}, 'Preview. '), n ? `${n} call${n === 1 ? '' : 's'} change (marked). ` : 'Nothing changes. ', 'Nothing is saved until you apply.'),
      h('span', { class: 'wk-plan-do' }, planBtn('calls-apply', 'Apply', () => { void apply(); }, true),
        planBtn('calls-discard', 'Discard', () => { pv = null; draw(); toast('Discarded: the calls are as they were.'); })),
    ] : state === 'published' ? [
      h('p', { role: 'status' }, h('b', {}, 'Published. '), 'Viewers see these calls.'),
      h('span', { class: 'wk-plan-do' }, planBtn('calls-to-draft', 'Back to draft', () => planDo('draft'))),
    ] : state ? [
      h('p', { role: 'status' }, h('b', {}, 'Draft. '), state === 'draft' ? 'Viewers don\'t see these calls yet.' : 'Viewers see the published calls until you publish.'),
      h('span', { class: 'wk-plan-do' }, planBtn('calls-publish', 'Publish', () => planDo('publish'), true), planBtn('calls-drop-draft', 'Discard draft', () => planDo('drop'))),
    ] : []);
  }

  /** a month as app-roster's problem and roster @param {string} mon @param {ReturnType<typeof model>} m */
  // (the month's own "Days clear" wins over the gap card, as for the solver and checkCalls)
  const problemOf = (mon, m) => callsProblem({ month: mon, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, tiers: m.plan, prior: m.prior, after: m.after,
    rules: m.roster?.minGap ? m.cards.map(r => (r.id === 'calls-gap' ? { ...r, params: { ...r.params, to: m.minGap } } : r)) : m.cards });

  /** The month's check: the report's rows, the calls nobody can take, the toast's words (empty: all fine) @param {string} mon @param {ReturnType<typeof model>} m */
  function checked(mon, m) {
    const { problem, roster } = problemOf(mon, m);
    const byId = new Map(m.cards.map(r => [r.id, r]));
    const words = (/** @type {string} */ id, /** @type {string} */ fallback) => { const r = byId.get(id); return r ? wordsOf(r, describeRule) : fallback; };
    const rows = reportOf(score(/** @type {any} */ (problem), roster), { words, dayName, accepted: m.roster?.accepted });
    const place = (/** @type {string} */ id) => { const [d, t] = id.split('|'); return `${dayName(d)} ${TIER_LABEL[/** @type {import('../roster/model.js').Tier} */ (t)] ?? t}`; };
    const short = shortLines(check(/** @type {any} */ (problem), {}).short, place, words);
    return { rows, short, words: checkSaid(rows, short) };
  }

  /** The rule report sheet (screens/report.js, loaded when first used) @param {string} mon @param {import('../roster/report.js').ReportRow[]} rows @param {{ slot: string, text: string }[]} short */
  async function openCallsReport(mon, rows, short) {
    const { openReport } = await import('./report.js');
    openReport({
      title: `Rules, ${monthTitle(mon)}`, rows, short,
      accept: async (key, on) => {
        const now = model(mon), was = now.roster?.accepted ?? [];
        const accepted = on ? [...new Set([...was, key])].slice(-300) : was.filter(k => k !== key);
        if (await app.data.rosters.upsert(mon, now.top, planWrite(now.top, { accepted }, MONTH_PLAN))) { toast(REFUSED); return false; }
        return true;
      },
    });
  }

  /** the Report button: the month on screen as it stands */
  function report() {
    if (!ctx.canWrite() || waiting()) return;
    if (!store.ready(['rules'])) { toast(LOADING); return; }
    const mon = month, c = checked(mon, model(mon));
    void openCallsReport(mon, c.rows, c.short);
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
    if (!locked.length || held()) return;
    await save(mon, { locked: [] }, 'Released. Make calls may now change them.');
  }

  /** @param {string} date */
  function daySheet(date) {
    if (held() || waiting()) return;
    const mon = month, m = model(mon);   // (options and warnings read the month as it was when the sheet opened)
    const plan = m.plan[dayType(date, m.holidays)];
    // (REG 2 is offered every day: the roster has one on a few days, entered by hand)
    const tiers = TIERS.filter(t => plan.includes(t) || t === 'reg2' || m.calls.find(c => c.date === date)?.[t]);
    const row = m.calls.find(c => c.date === date);
    const callable = tiers.filter(t => m.phones.has(row?.[t] ?? ''));
    sheet.open({
      title: `${weekdayName(date)} ${shortDay(date)}`, note: 'A call set here is kept when the calls are made again.', saveLabel: 'Save',
      values: Object.fromEntries(tiers.map(t => [t, row?.[t] ?? ''])),
      fields: tiers.map(t => ({ key: t, label: TIER_LABEL[t], type: /** @type {const} */ ('select'),
        // free people first, each with their calls this month and why they may not be free
        options: () => callChoices({ date, tier: t, people: m.people, calls: m.calls, prior: m.prior, after: m.after, leave: m.leave, requests: m.requests, minGap: m.minGap, current: row?.[t] }) })),
      // who is on call that day now, each with their call link
      body: callable.length ? { node: h('p', { class: 'small cl-call' }, 'Call: ', callable.map((t, i) => [i > 0 && ' · ', `${SHORT[t]} ${row?.[t]} `, telLink(m.phones, row?.[t])])), read: () => ({}) } : undefined,
      warn: v => {
        const next = Object.fromEntries(tiers.map(t => [t, v[t] || null]));
        const calls = [...m.calls.filter(c => c.date !== date), { date, ...callRow({ ...row, ...next }) }];
        return checkCalls({ month: mon, calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior, after: m.after, tiers: m.plan })
          .problems.filter(p => p.date === date || (next[p.tier] === p.name && Math.abs(Date.parse(p.date) - Date.parse(date)) <= 4 * 864e5)).map(p => readDays(p.text));
      },
      // saved onto the month as it is now: only the tiers changed here, so another maker's save meanwhile stays
      onSave: async v => {
        if (waiting()) return;
        const now = model(mon);
        const state = applyDayEdit(now.calls, now.roster?.locked ?? [], date, Object.fromEntries(tiers.map(t => [t, row?.[t] ?? null])), Object.fromEntries(tiers.map(t => [t, v[t] || null])));
        await save(mon, { calls: state.calls, locked: state.locked }, 'Saved');
      },
    });
  }

  function monthSheet() {
    if (waiting()) return;
    const mon = month, m = model(mon);
    // Singapore's public holidays for the month (roster/holidays.js, MOM's list): Suggest adds the weekday ones; the admin
    // still saves. A weekend one counts as the weekend for calls (owner, 7 Nov 2026), so it is named, not added
    const pub = holidaysIn(mon);
    const named = [pub.suggest.length && `Singapore: ${pub.suggest.map(p => `${shortDay(p.day)} ${p.name}`).join(', ')}.`,
      pub.weekendNames.length && `On a weekend (counts as the weekend for calls, not added): ${pub.weekendNames.join(', ')}.`].filter(Boolean).join(' ');
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
      // a weekend day typed in is kept but said: calls treat it as the weekend, not a holiday (owner, 7 Nov 2026)
      warn: v => {
        const { days, ignored } = readHolidays(v.holidays, mon), wk = weekendHolidays(days);
        return [ignored.length && `Ignored: ${ignored.join(', ')} (${outOfMonth}).`,
          wk.length && `On a weekend: ${wk.map(shortDay).join(', ')} count as the weekend for calls, not as a holiday.`].filter(s => typeof s === 'string');
      },
      onSave: async v => {
        if (waiting()) return;
        const { days: holidays, ignored } = readHolidays(v.holidays, mon);
        const tierPlan = Object.fromEntries(DAY_TYPES.map(([d]) => [d, String(v[`plan-${d}`]).split(',').filter(Boolean)]));
        // only these fields, onto the month as it is now (another maker may have saved calls meanwhile)
        const refused = await app.data.rosters.upsert(mon, model(mon).top, { holidays, tierPlan, ...(v.minGap == null ? {} : { minGap: v.minGap }) });
        toast(refused ? REFUSED : ignored.length ? `Saved. Ignored: ${ignored.join(', ')} (${outOfMonth}).` : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('people')) return;
    const canWrite = ctx.canWrite();
    // a preview, while open for this month: its calls in place of the month's, the calls it changes marked
    const m0 = model(), p = canWrite && pv?.mon === month ? pv : null;
    const m = p ? { ...m0, calls: /** @type {import('../roster/model.js').CallDay[]} */ (p.fields.calls), roster: m0.roster && { ...m0.roster, accepted: [] } } : m0;
    drawPlan();
    const ready = store.ready(CALLS_NEEDS);
    const me = meOf(app.settings.get('me'), m.people);
    empty.show(!m.people.length && canWrite);
    const prev = h('button', { type: 'button', 'aria-label': 'Previous month', onclick: () => step(-1) }, icon(ICONS.chevronLeft));
    const next = h('button', { type: 'button', 'aria-label': 'Next month', onclick: () => step(1) }, icon(ICONS.chevronRight));
    const any = m.calls.some(c => TIERS.some(t => c[t]));
    // the rule check's marks on the calls (a maker's; rechecked each draw, so after every hand edit)
    const pk = canWrite && any && store.loaded('rules') ? problemOf(month, m) : null;
    const marks = pk ? marksOf(score(/** @type {any} */ (pk.problem), pk.roster), m.roster?.accepted).cells : null;
    fill(bar, prev, h('h2', { class: 'cl-title', id: 'calls-title' }, monthTitle(month)), next,
      h('span', { class: 'cl-bar-end' },
        h('button', { type: 'button', id: 'calls-copy', 'aria-haspopup': me ? 'menu' : null, 'aria-expanded': me ? 'false' : null, onclick: copyClick }, icon(ICONS.clipboardCopy), 'Copy'),
        h('button', { type: 'button', id: 'calls-xlsx', onclick: exportXlsx }, icon(ICONS.download), 'Excel'),
        h('button', { type: 'button', id: 'calls-print', onclick: printMonth }, icon(ICONS.printer), 'Print'),
        canWrite && h('button', { type: 'button', onclick: monthSheet }, 'Settings'),
        canWrite && any && h('button', { type: 'button', id: 'calls-report', onclick: report }, icon(ICONS.listChecks), 'Report'),
        canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'calls-make', disabled: busy || !ready, onclick: make }, icon(ICONS.sparkles), 'Make calls')));
    const byDate = new Map(m.calls.map(c => [c.date, c]));
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
        .map(t => ({ t, name: row?.[t] ?? null, bad: bad.has(`${date}|${t}`), hand: !!row?.[t] && locked.has(`${date}|${t}`), mk: row?.[t] ? marks?.get(`${date}|${t}|${row[t]}`) : undefined, new: !!p?.changes.has(`${date}|${t}`) }));
      const label = dayLabel(date, type === 'ph', tiers) + (canWrite ? ' Tap to edit calls.' : '');
      const props = canWrite ? { type: 'button', onclick: () => daySheet(date) } : { role: 'listitem' };
      return h(canWrite ? 'button' : 'div', { ...props, class: `cl-day type-${type}${date === today ? ' is-today' : ''}`, dataset: { day: date }, 'aria-label': label },
        h('span', { class: 'cl-date' }, h('b', {}, String(Number(date.slice(8)))), h('span', { class: 'cl-wd' }, weekdayName(date)), type === 'ph' && h('span', { class: 'cl-ph small' }, 'PH')),
        h('span', { class: 'cl-tiers' }, tiers.map(x => h('span', { class: `cl-tier${x.name ? '' : ' is-empty'}${x.bad ? ' is-bad' : ''}${x.mk?.level ? ` is-${x.mk.level}` : ''}${x.new ? ' is-new' : ''}${x.hand ? ' is-hand' : ''}${me && x.name === me ? ' is-me' : ''}`, title: x.name ?? '' },
          h('i', {}, SHORT[x.t]), h('span', {}, x.name ?? '–'), !canWrite && telLink(m.phones, x.name),
          x.bad && h('span', { class: 'visually-hidden' }, ' (problem)'), x.mk && h('span', { class: 'visually-hidden' }, ` (breaks: ${x.mk.why.map(readDays).join('; ')})`), x.hand && h('span', { class: 'visually-hidden' }, ' (set by hand)'), x.new && h('span', { class: 'visually-hidden' }, ' (changed)')))));
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
