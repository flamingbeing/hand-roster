// The Week tab's edits, apart from week.js so the first screen loads less (viewers never load it): Build week, a junior
// moved, swapped, added or taken off, a list changed for this week, Check against Epic, the Short panel's options, the
// Clashes panel's Take off and how many lists the Lists tab has changed since the week was built.
// week.js loads it on a roster maker's first edit or Build, or when a maker opens a built week. Each save works from the week as it is when saved
// (roster/week-edits.js): a change another maker saved while a sheet was open stays. The copy a sheet opened with only
// words and warns. A Build, a grid edit or a list change can be undone from its toast for a few seconds. Build again keeps
// every pinned junior where they are (someone added or moved by hand is pinned) and is a refill: everyone else stays where
// they still can, so only the gaps and what no longer holds change; Reset week drops the pins and builds fresh. A tap on a
// junior opens the cell sheet: the rules they break there, "Who could go here?" (roster/who-could.js), Move, Swap, Pin.
// The rule check (roster/report.js, app-roster's score): the marks on the grid's names (week.js asks marks() each draw, so a
// hand edit is checked again at once), the rule report (a toast after Build when something breaks, and More) and the lists
// nobody can take, named in that toast. An accepted warning is kept on the week (`accepted`).
// Draft and published (roster/drafts.js): a build saves into the week's draft, which viewers don't see until Publish; a hand
// edit goes into the draft when there is one, else onto the published week (viewers see it at once, as before). A line under
// the week's state says which (plan): Publish and Discard draft, or Back to draft. Build again and Reset week on a week with
// juniors on it first show the new week as a preview (changed names and lists marked) with Apply or Discard; nothing is
// saved, and the week can't be edited, until one is tapped. A first build has nothing to compare and goes straight to the draft.
import { validateRule, describeRule, score, check } from '@core/roster';
import { undoToast } from '@core/ui';
import { $, h, fill } from '../dom.js';
import { LOADING, REFUSED } from '../items.js';
import { shortDay, weekdayName } from '../roster/dates.js';
import { conText, settleLists } from '../roster/model.js';
import { listName, sectionsOf, whyNot } from '../roster/sections.js';
import { shortOptions } from '../roster/short.js';
import { gridRows, isPinned, juniorsOn, weekBuilt } from '../roster/grid.js';
import { WEEK_PLAN, backToDraftOf, gridChanges, planSig, planState, planWrite, publishOf, undoOf, undoPlan } from '../roster/drafts.js';
import { changedRows, keepOf, pinsOf, withPins } from '../roster/pins.js';
import { applyEdit, applyEdits, keptAsks, mergeOverrides } from '../roster/week-edits.js';
import { listsDrift } from '../roster/lists-drift.js';
import { rulesOf, weekRules, wordsOf } from '../roster/rule-cards.js';
import { weekProblem } from '../roster/problem.js';
import { checkSaid, marksOf, readable, reportOf, shortLines } from '../roster/report.js';
import { whoCould } from '../roster/who-could.js';
import { slotsFor } from '../data/lists.js';
import { editSheet } from './sheet.js';
import { WEEK_NEEDS } from './week.js';

/** @typedef {ReturnType<typeof import('./week.js').weekModel>} Model */
/** @typedef {import('../roster/week-edits.js').GridEdit} GridEdit */
/** @typedef {ReturnType<typeof import('../roster/sections.js').clashesOf>[number]} Clash */
/** @typedef {[string, Partial<import('../data/lists.js').Override> | null][]} Changes  list id, change */

/**
 * @param {{ ctx: import('./context.js').Context, model: (mon?: string) => Model, monday: () => string, draw: () => void }} env
 *   model: the week as it is now (the drafts laid over); monday: the week on screen; draw: the Week tab drawn again
 */
export function weekEdit({ ctx, model, monday, draw }) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  // the kit's Undo toast on the page's toaster (whose show hands back that toast's dismiss)
  const undo = undoToast({ show: (text, o) => { const gone = toast(text, o); return () => { if (typeof gone === 'function') gone(); }; } }, { ms: 6000 });
  let building = false;
  /** true (and says so) while some of what the week is built from has not arrived yet */
  const waiting = () => { if (store.ready(WEEK_NEEDS)) return false; toast(LOADING); return true; };
  /** the rule cards in force (spaces/_/rules over the defaults) */
  const cards = () => rulesOf(store.get('rules'), validateRule);
  /** the rule cards in force, as the week builder takes them */
  const rules = () => weekRules(cards());
  /** waiting, and for a build also the rule cards (not in WEEK_NEEDS, so the tab never waits on them to show) */
  const buildWaiting = () => { if (waiting()) return true; if (store.ready(['rules'])) return false; toast(LOADING); return true; };

  /**
   * Writes fields onto the week's record as it is now, with Undo: it puts them back as they were, on the record as it is by then.
   * @param {string} mon @param {Record<string, unknown>} out  the record's fields (draft: the whole draft) @param {string} said
   * @param {(now: any) => Record<string, unknown>} [back]  Undo's fields from the record as it is then (default: each field as it was)
   * @returns {Promise<boolean>} saved
   */
  async function write(mon, out, said, back) {
    const row = /** @type {any} */ (store.row('weeks', mon)), was = undoOf(row, out);
    if (await app.data.weeks.upsert(mon, row, out)) { toast(REFUSED); return false; }
    undo.show(said, async () => {
      const now = /** @type {any} */ (store.row('weeks', mon));
      if (await app.data.weeks.upsert(mon, now, back ? back(now) : was)) toast(REFUSED);
    });
    return true;
  }
  /**
   * Saves some of a week's fields, with Undo: into its draft when it has one or `toDraft` (a build), else onto the week.
   * @param {string} mon @param {Record<string, unknown>} fields @param {string} said @param {boolean} [toDraft]
   */
  function save(mon, fields, said, toDraft = false) {
    if (held()) return Promise.resolve(false);
    const row = /** @type {any} */ (store.row('weeks', mon));
    return write(mon, planWrite(row, fields, WEEK_PLAN, toDraft), said, undoPlan(row, fields, WEEK_PLAN, toDraft));
  }

  // the preview of Build again or Reset week: the new week's fields, the Build toast's words, the check, what changes
  /** @type {{ mon: string, sig: string, fields: Record<string, any>, said: string, check: { words: string, rows: import('../roster/report.js').ReportRow[], short: { slot: string, text: string }[] }, cells: Set<string>, lists: Set<string>, n: number } | null} */
  let pv = null;
  /** true (and says so) while the week on screen shows a preview: Apply or Discard first */
  const held = () => { if (pv?.mon !== monday()) return false; toast('Apply or discard the preview first.'); return true; };
  /**
   * The week as drawn: the preview in place of the week while one is open for it (null: none).
   * @param {Model} m @param {string} mon @returns {Model | null}
   */
  function shown(m, mon) {
    if (pv?.mon !== mon || !ctx.canWrite()) return null;
    const raw = pv.fields.lists;
    return { ...m, built: true, grid: pv.fields.grid, raw, lists: settleLists(raw, { leave: m.leave, holidays: m.holidays }), wk: m.wk && { ...m.wk, accepted: [] } };
  }
  /** Apply: the preview saved into the week's draft, with Undo; then what the check found */
  async function apply() {
    const p = pv;
    if (!p) return;
    pv = null;
    // the week changed since (another maker's edit came in): the preview was made from a week that is gone, so build again
    if (planSig(store.row('weeks', p.mon), WEEK_PLAN) !== p.sig) { toast('The week changed since this preview. Build again to see it with the change.'); draw(); return; }
    if (await save(p.mon, p.fields, p.said, true) && p.check.words) {
      toast(p.check.words, { ms: 10000, action: { label: 'Report', run: () => { void openWeekReport(p.mon, p.check.rows, p.check.short); } } });
    }
    draw();
  }
  function discard() { pv = null; draw(); toast('Discarded: the week is as it was.'); }

  /** Publish: the draft becomes what viewers see */
  function publish() {
    const mon = monday(), row = /** @type {any} */ (store.row('weeks', mon));
    if (!held() && row?.draft) void write(mon, publishOf(row, WEEK_PLAN), 'Published: viewers see this week now.');
  }
  /** Back to draft: a draft from the published week; viewers keep seeing the published one until Publish */
  function toDraft() {
    const mon = monday(), row = /** @type {any} */ (store.row('weeks', mon));
    if (!held() && row && !row.draft) void write(mon, backToDraftOf(row, WEEK_PLAN), 'Back to draft. Viewers see the published week until you publish.');
  }
  /** Discard draft: the draft dropped (Undo brings it back); the maker sees the published week again, or an unbuilt one */
  function dropDraft() {
    const mon = monday(), row = /** @type {any} */ (store.row('weeks', mon));
    if (!held() && row?.draft) void write(mon, { draft: null }, 'Draft discarded.');
  }

  // the line under the week's state: the preview's (Apply, Discard) or where the week stands (Publish, Back to draft)
  const line = h('div', { class: 'wk-plan', id: 'week-plan', hidden: true });
  $('week-state-note').parentElement?.after(line);
  let lineKey = '';
  /** @param {string} id @param {string} label @param {() => void} run @param {boolean} [primary] */
  const btn = (id, label, run, primary = false) => h('button', { type: 'button', id, class: primary ? 'ui-primary' : '', 'data-size': 'small', onclick: run }, label);
  /** draws the line for the week on screen (week.js, each draw) */
  function plan() {
    const mon = monday(), row = /** @type {any} */ (store.row('weeks', mon));
    const state = !ctx.canWrite() ? '' : pv?.mon === mon ? `preview|${pv.n}` : planState(row, weekBuilt);
    if (state === lineKey) return;   // (the same buttons stay: a sync redraw never takes a focused button away)
    lineKey = state;
    line.hidden = !state;
    line.dataset.state = state.split('|')[0];
    const n = pv?.n ?? 0;
    fill(line, state.startsWith('preview') ? [
      h('p', { role: 'status' }, h('b', {}, 'Preview. '), n ? `${n} list${n === 1 ? '' : 's'} change (marked). ` : 'Nothing changes. ', 'Nothing is saved until you apply.'),
      h('span', { class: 'wk-plan-do' }, btn('week-apply', 'Apply', () => { void apply(); }, true), btn('week-discard', 'Discard', discard)),
    ] : state === 'published' ? [
      h('p', { role: 'status' }, h('b', {}, 'Published. '), 'Viewers see this week.'),
      h('span', { class: 'wk-plan-do' }, btn('week-to-draft', 'Back to draft', toDraft)),
    ] : state ? [
      h('p', { role: 'status' }, h('b', {}, 'Draft. '), state === 'draft' ? 'Viewers don\'t see this week yet.' : 'Viewers see the published week until you publish.'),
      h('span', { class: 'wk-plan-do' }, btn('week-publish', 'Publish', publish, true), btn('week-drop-draft', 'Discard draft', dropDraft)),
    ] : []);
  }

  /** a grid edit, or several saved as one (one Undo), made on the week as it is now @param {string} mon @param {GridEdit | GridEdit[]} e @param {string} said */
  async function saveGrid(mon, e, said) {
    if (waiting()) return;
    const now = model(mon);
    await save(mon, { lists: now.built && now.wk?.lists?.length ? now.wk.lists : slotsFor(now.templates, mon, now.wk?.overrides), grid: applyEdits(now.grid, [e].flat()) }, said);
  }

  /** the Clashes panel's Take off: the junior off that list, as the move sheet's Take off the list does @param {Model} m @param {Clash} c */
  const takeOff = (m, c) => saveGrid(monday(), { kind: 'move', day: c.day, session: c.session, name: c.name, to: null },
    `Took ${c.name} off ${m.lists.find(l => l.id === c.list)?.name ?? 'the list'}.`);

  /**
   * Take them all off: every clashing junior off their list in one save, so one Undo puts them all back (7 Nov 2026). Worked
   * out from the week as it is then: someone no longer on that list (moved or taken off since the panel was drawn) stays put.
   * @param {Clash[]} clashes
   */
  async function takeOffAll(clashes) {
    const mon = monday(), now = model(mon);
    const edits = clashes.filter(c => juniorsOn(now.grid, c.day, c.session, c.list).includes(c.name))
      .map(c => /** @type {GridEdit} */ ({ kind: 'move', day: c.day, session: c.session, name: c.name, to: null }));
    const n = edits.length;
    if (n) await saveGrid(mon, edits, `Took ${n} ${n === 1 ? 'junior off their list' : 'juniors off their lists'}.`);
  }

  /**
   * Changes lists for this week only, laid over the week's changes as they are now. A built week is drawn from its lists
   * as built, so they change too.
   * @param {string} mon @param {Changes} changes @param {GridEdit} [edit]  a grid edit saved with it
   */
  async function saveOverrides(mon, changes, edit) {
    if (waiting()) return;
    const now = model(mon);
    const overrides = mergeOverrides(now.wk?.overrides ?? [], changes);
    /** @type {Record<string, unknown>} */
    const fields = { overrides };
    if (now.built && now.wk?.lists?.length) {
      const ids = new Set(changes.map(([id]) => id));
      const fresh = new Map(slotsFor(now.templates, mon, overrides).filter(x => ids.has(x.id)).map(x => [x.id, x]));
      fields.lists = now.wk.lists.map(x => fresh.get(x.id) ?? x);
    }
    if (edit) fields.grid = applyEdit(now.grid, edit);
    await save(mon, fields, 'Saved');
  }

  async function build() {
    if (building || !ctx.canWrite() || held() || buildWaiting()) return;
    const mon = monday(), m = model(mon);
    if (!m.lists.length) { toast('Add the weekly lists first (Lists tab).'); return; }
    if (!m.built || !m.grid.some(r => r.juniors.length)) { await rebuild(mon, []); return; }
    // Build again is a refill: the pins, then everything else on the grid that still holds; only the gaps and what no
    // longer holds change (Reset week builds fresh)
    await rebuild(mon, await pinsNow(mon, m), keepOf(m.grid));
  }

  /** Reset week: every pin dropped and the week built fresh (the list changes for this week stay) */
  function reset() {
    if (building || !ctx.canWrite() || held() || buildWaiting()) return;
    const mon = monday(), n = pinsOf(model(mon).grid).length;
    sheet.open({
      title: 'Reset week', fields: [], saveLabel: 'Reset',
      note: `Builds the week fresh${n ? `, dropping ${n} pin${n === 1 ? '' : 's'}` : ''}. Changes to a list for this week (consultants, patients, away) stay; each list's "Back to the usual" drops those.`,
      onSave: () => rebuild(mon, []),
    });
  }

  /**
   * The week's pins for Build again. A week built before pins (7 Nov 2026) has none: its hand placements, a junior the last
   * build would not put there now, become pins instead, so Build again keeps them as it did.
   * @param {string} mon @param {Model} m @returns {Promise<import('../roster/pins.js').Pin[]>}
   */
  async function pinsNow(mon, m) {
    const pins = pinsOf(m.grid);
    if (pins.length || m.grid.some(r => r.pinned)) return pins;
    const { buildWeek } = await import('../roster/week.js');
    const built = gridRows(buildWeek({ monday: mon, lists: slotsFor(m.templates, mon, m.wk?.overrides), people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, seed: m.wk?.seed ?? 0, rules: rules() }).grid);
    return keptAsks(built, m.grid).map(a => ({ person: a.person, list: a.list, day: a.day, session: /** @type {'AM' | 'PM'} */ (a.session) }));
  }

  /**
   * Builds the week again with a new seed, the pins placed first, then (a refill) the rest of the grid where it still holds.
   * @param {string} mon @param {import('../roster/pins.js').Pin[]} pins  the pins to keep @param {import('../roster/pins.js').Pin[]} [keep]
   */
  async function rebuild(mon, pins, keep) {
    if (building || buildWaiting()) return;
    building = true; $('week-build').setAttribute('disabled', '');
    try {
      const { buildWeek } = await import('../roster/week.js');
      const now = model(mon);
      const seed = (now.wk?.seed ?? 0) + 1;
      const lists = slotsFor(now.templates, mon, now.wk?.overrides);
      const res = buildWeek({ monday: mon, lists, people: now.people, leave: now.leave, calls: now.calls, holidays: now.holidays, seed, pins, keep, rules: rules() });
      const grid = withPins(gridRows(res.grid), pins);
      const kept = pinsOf(grid).length;
      const changed = keep ? changedRows(now.grid, grid) : -1;
      const short = res.problems.filter(p => p.got < p.min || p.noReg).length;
      // the check: the lists nobody can take (from leave, calls and the rules alone) and the rules the new grid breaks
      // (warnings accepted before are dropped: they were accepted for a grid that is gone)
      const said2 = checked(mon, { ...now, lists: res.lists, grid, wk: undefined });
      // the lists are kept as the template stood, unsettled, so a holiday or leave taken away later reopens them
      // the month's calls not made yet: built all the same, but post-call days are not known, so say so
      const said = [
        pins.length && (kept === pins.length ? `Kept ${kept} pin${kept === 1 ? '' : 's'}.` : `Kept ${kept} of ${pins.length} pins (the others' lists are closed this week).`),
        changed >= 0 && (changed ? `Changed ${changed} list${changed === 1 ? '' : 's'}.` : 'Nothing needed to change.'),
        short && `${short} list${short === 1 ? ' is' : 's are'} below the minimum: see Short.`,
        !now.callsMade && 'Calls are not made yet: post-call not kept clear.',
      ].filter(Boolean);
      // a week with juniors on it: a preview first (Apply saves it, with Undo); a first build straight into the draft. Then what
      // the check found, in a toast of its own whose button opens the report (the Build toast keeps its Undo)
      pv = { mon, sig: planSig(store.row('weeks', mon), WEEK_PLAN), fields: { grid, lists, seed, built: Date.now(), accepted: [] }, said: said.length ? `Built. ${said.join(' ')}` : 'Built', check: said2,
        ...gridChanges(now.grid, grid), n: changedRows(now.grid, grid) };
      if (!now.grid.some(r => r.juniors.length)) await apply(); else draw();
    } finally { building = false; $('week-build').toggleAttribute('disabled', !store.ready(WEEK_NEEDS)); }
  }

  /**
   * The cell sheet (a tap on a junior on the grid): who is there, the rules they break there with why, "Who could go here?"
   * ranked by app-roster's score with the rule that blocks or costs each (a tap puts that person there: a free one takes
   * the place, one on another list swaps), and Move to, Swap with, Pin.
   * @param {Model} m  the week as drawn (words and warnings) @param {string} day @param {'AM' | 'PM'} session @param {string} name @param {string} list
   */
  function cellSheet(m, day, session, name, list) {
    if (held()) return;
    const mon = monday();
    const here = m.lists.filter(l => l.day === day && l.session === session && l.status === 'open');
    const label = (/** @type {any} */ l) => `${l.site} ${l.name}${l.consultant ? ` – ${conText(l)}` : ''}`;
    const nameOf = (/** @type {string | null} */ id) => m.lists.find(l => l.id === id)?.name ?? 'the list';
    const options = whoNode(m, day, session, name, list, (/** @type {import('../roster/who-could.js').Option} */ o) => {
      sheet.close();
      void saveGrid(mon, o.edit, o.from ? `Swapped ${o.person} and ${name}.` : `${o.person} is on ${nameOf(list)}; ${name} is free.`);
    });
    sheet.open({
      title: name, note: `${shortDay(day)}, ${session === 'AM' ? 'morning' : 'afternoon'}. Now on ${label(m.lists.find(l => l.id === list) ?? { site: '', name: 'no list' })}.`,
      values: { to: list, pinned: isPinned(m.grid, day, session, list, name) }, saveLabel: 'Save', deleteLabel: 'Take off the list',
      head: options,
      fields: [
        { key: 'to', label: 'Move to', type: 'select', options: () => [['', 'Free (no list)'], ...here.map(l => /** @type {[string, string]} */ ([l.id, `${label(l)} (${juniorsOn(m.grid, day, session, l.id).length}/${l.need})`]))] },
        { key: 'swap', label: 'Swap with', type: 'select', hint: 'The other person goes to the list this one leaves.',
          options: v => [['', 'Nobody'], ...(v.to ? juniorsOn(m.grid, day, session, v.to).filter(n => n !== name).map(n => /** @type {[string, string]} */ ([n, n])) : [])] },
        { key: 'pinned', label: 'Pinned: Build again keeps them here', type: 'check', hint: 'Someone moved or added by hand is pinned too. Reset week (More) drops every pin.' },
      ],
      warn: v => (v.to && v.to !== list ? whyNot({ name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: v.to, ...m.pc }).filter(w => !w.includes('already on another')) : []),
      onSave: v => {
        const was = isPinned(m.grid, day, session, list, name);
        // staying put: only the pin changes (nothing to save when it did not)
        if (v.to === list && !v.swap) return v.pinned === was ? undefined
          : saveGrid(mon, { kind: 'pin', day, session, list, name, on: !!v.pinned }, v.pinned ? `Pinned ${name} on ${nameOf(list)}.` : `Unpinned ${name}.`);
        return saveGrid(mon, [{ kind: 'move', day, session, name, to: v.to || null, swapWith: v.swap || null },
          ...(v.to && !v.pinned ? [/** @type {GridEdit} */ ({ kind: 'pin', day, session, list: v.to, name, on: false })] : [])],
        v.swap ? `Swapped ${name} and ${v.swap}.` : v.to ? `Moved ${name} to ${nameOf(v.to)}.` : `${name} is free.`);
      },
      onDelete: () => saveGrid(mon, { kind: 'move', day, session, name, to: null }, `Took ${name} off ${nameOf(list)}.`),
    });
  }

  /**
   * The cell sheet's top: the rules this person breaks here (and the list as a whole), then "Who could go here?".
   * @param {Model} m @param {string} day @param {'AM' | 'PM'} session @param {string} name @param {string} list
   * @param {(o: import('../roster/who-could.js').Option) => void} pick
   */
  function whoNode(m, day, session, name, list, pick) {
    const mk = marks(m), words = wordsFn();
    const mine = mk?.cells.get(`${list}|${name}`), all = mk?.slots.get(list);
    const said = (/** @type {import('../roster/report.js').Mark | undefined} */ x, /** @type {string} */ who) => x?.level && h('li', { class: `cs-mark is-${x.level}` },
      h('span', { class: 'cs-level' }, x.level === 'block' ? 'Breaks' : 'Warning'), h('span', {}, `${who}: ${x.why.map(w => readable(w, dayName)).join('; ')}`));
    const marked = [said(mine, name), said(all, 'This list')].filter(Boolean);
    /** @type {import('../roster/who-could.js').Option[]} */
    let opts = [];
    if (m.built && store.loaded('rules')) {
      const { problem } = problemOf(monday(), m);
      opts = whoCould({ score: /** @type {any} */ (score), problem, grid: m.grid, day, session, list, name, people: m.people.filter(p => p.grade !== 'con').map(p => p.name) });
    }
    const LEVEL = { block: "Can't", warn: 'Warning', soft: 'Costs' };
    const line = (/** @type {import('../roster/who-could.js').Option} */ o) => h('button', { type: 'button', class: `sh-option cs-who${o.ok ? '' : ' is-blocked'}`, dataset: { name: o.person }, onclick: () => pick(o) },
      h('span', {}, o.person, h('span', { class: 'small' }, o.from ? ` · swap: ${name} goes to ${m.lists.find(l => l.id === o.from)?.name ?? 'their list'}` : ' · free')),
      h('span', { class: `small${o.level ? ` is-${o.level}` : ''}` }, o.level ? `${LEVEL[o.level]}: ${o.rules.map(id => words(id, id)).join('; ')}` : 'No rule broken'));
    const can = opts.filter(o => o.ok), cannot = opts.filter(o => !o.ok);
    return h('div', { class: 'cs', id: 'cell-sheet' },
      marked.length > 0 && h('ul', { class: 'cs-marks' }, marked),
      opts.length > 0 && h('section', { class: 'cs-who-could' }, h('h3', {}, 'Who could go here?'),
        can.length > 0 ? h('div', { class: 'sh-options' }, can.slice(0, 8).map(line)) : h('p', { class: 'small' }, 'Nobody can without breaking a must-hold rule.'),
        can.length > 8 && h('details', {}, h('summary', { class: 'small' }, `${can.length - 8} more`), h('div', { class: 'sh-options' }, can.slice(8).map(line))),
        cannot.length > 0 && h('details', {}, h('summary', { class: 'small' }, `Can't go here (${cannot.length})`), h('div', { class: 'sh-options' }, cannot.map(line)))));
  }

  /** @param {Model} m @param {string} day @param {'AM' | 'PM'} session @param {import('../roster/model.js').ListSlot} l */
  function addSheet(m, day, session, l) {
    if (held()) return;
    const mon = monday();
    const juniors = m.people.filter(p => p.grade !== 'con');
    const sec = sectionsOf({ monday: mon, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid, holidays: m.holidays, ...m.pc });
    const freeNames = new Set((sec.free[day] ?? []).filter(f => f.when === 'FULL DAY' || f.when === session).map(f => f.name));
    const ordered = [...juniors.filter(p => freeNames.has(p.name)), ...juniors.filter(p => !freeNames.has(p.name))];
    if (!ordered.length) { toast('Add people first (People tab).'); return; }
    sheet.open({
      title: `Add to ${l.name}`, note: `${l.site}${l.consultant ? ` – ${conText(l)}` : ''}, ${shortDay(day)} ${session === 'AM' ? 'morning' : 'afternoon'}. Free people are listed first.`,
      values: { name: ordered[0].name }, saveLabel: 'Add',
      fields: [{ key: 'name', label: 'Junior', type: 'select', options: ordered.map(p => /** @type {[string, string]} */ ([p.name, `${p.name}${freeNames.has(p.name) ? '' : ' (not free)'}`])) }],
      warn: v => whyNot({ name: v.name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: l.id, ...m.pc }).filter(w => !w.includes('already on another')),
      onSave: v => saveGrid(mon, { kind: 'add', day, session, list: l.id, name: v.name }, `Added ${v.name} to ${l.name}.`),
    });
  }

  /** A list's changes for this week only (screens/week-list.js, loaded when first used) @param {import('../roster/model.js').ListSlot} l */
  async function weekListSheet(l) {
    if (held()) return;
    const { weekListSheet: open } = await import('./week-list.js');
    // the week as it is now, not as last drawn: a change saved a moment ago may not be drawn yet. The sheet starts from the
    // list unsettled; the settled one only says why it is closed this week
    const mon = monday(), now = model(mon), settled = now.lists.find(x => x.id === l.id) ?? l;
    open({ m: now, l: now.raw.find(x => x.id === l.id) ?? settled, settled, sheet, saveOverrides: changes => saveOverrides(mon, changes) });
  }

  /** "Check against Epic" (screens/epic.js, loaded when first used) */
  async function epicSheet() {
    if (!ctx.canWrite() || held() || waiting()) return;
    const { epicSheet: open } = await import('./epic.js');
    const mon = monday();
    open({ m: model(mon), monday: mon, sheet, toast, saveOverrides: changes => saveOverrides(mon, changes) });
  }

  /**
   * The Short panel's ways to fill a list below its minimum, as buttons (week.js draws the panel's words).
   * @param {Model} m @param {ReturnType<typeof sectionsOf>} sec @param {import('../roster/sections.js').Gap} gap @param {import('../roster/model.js').ListSlot} l
   */
  function shortButtons(m, sec, gap, l) {
    const mon = monday();
    const opts = shortOptions({ gap, lists: m.lists, grid: m.grid, people: m.people, free: sec.free[gap.day] ?? [] });
    /** @param {import('../roster/short.js').ShortOption} o */
    const apply = o => {
      const at = { day: gap.day, session: gap.session };
      if (o.kind === 'add') return saveGrid(mon, { kind: 'add', ...at, list: l.id, name: o.name }, `Added ${o.name} to ${l.name}.`);
      if (o.kind === 'move') return saveGrid(mon, { kind: 'move', ...at, name: o.name, to: l.id }, `Moved ${o.name} to ${l.name}.`);
      if (o.kind === 'fewer') return saveOverrides(mon, [[l.id, { min: o.min }]]);
      return saveOverrides(mon, [[l.id, { status: 'closed' }]], { kind: 'clear', ...at, list: l.id });
    };
    return opts.length > 0 ? h('div', { class: 'sh-options' }, opts.map(o => h('button', { type: 'button', class: 'sh-option', onclick: () => apply(o) },
      h('span', {}, o.text), h('span', { class: 'small' }, o.cost)))) : null;
  }

  /** @param {string} mon @param {Model} m @returns {number} the lists added, deleted or changed on the Lists tab since the week was built */
  function drift(mon, m) {
    if (!m.built || !m.wk?.lists?.length) return 0;
    const d = listsDrift(m.wk.lists, slotsFor(m.templates, mon, m.wk.overrides));
    return d.added.length + d.removed.length + d.changed.length;
  }

  /** a rule's words as the Rules tab says them @returns {(id: string, fallback: string) => string} */
  function wordsFn() {
    const byId = new Map(cards().map(r => [r.id, r]));
    return (id, fallback) => { const r = byId.get(id); return r ? wordsOf(r, describeRule) : fallback; };
  }
  const dayName = (/** @type {string} */ d) => `${weekdayName(d)} ${shortDay(d)}`;

  /** a week as app-roster's problem and roster @param {string} mon @param {Pick<Model, 'lists' | 'grid' | 'people' | 'leave' | 'calls' | 'holidays'>} m */
  const problemOf = (mon, m) => weekProblem({ monday: mon, lists: m.lists, grid: m.grid, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, rules: cards() });

  /**
   * The week's check: the report's rows, the lists nobody can take and the words Build's toast says (empty: all fine).
   * @param {string} mon @param {Pick<Model, 'lists' | 'grid' | 'people' | 'leave' | 'calls' | 'holidays'> & { wk?: Model['wk'] }} m
   */
  function checked(mon, m) {
    const { problem, roster } = problemOf(mon, m), words = wordsFn();
    const rows = reportOf(score(/** @type {any} */ (problem), roster), { words, dayName, accepted: m.wk?.accepted });
    const byId = new Map(m.lists.map(l => [l.id, l]));
    const place = (/** @type {string} */ id) => { const l = byId.get(id); return l ? `${dayName(l.day)} ${l.session} ${l.site} ${listName(l)}` : id; };
    const short = shortLines(check(/** @type {any} */ (problem), {}).short, place, words);
    return { rows, short, words: checkSaid(rows, short) };
  }

  /** @type {{ key: unknown[], out: ReturnType<typeof marksOf> } | null} the last marks, kept while nothing they come from changed */
  let lastMarks = null;
  /** the marks on the grid's names and lists, as drawn now @param {Model} m */
  function marks(m) {
    if (!m.built || !store.loaded('rules')) return null;
    const key = [monday(), store.row('weeks', monday()), pv, ...['rules', 'people', 'leave', 'rosters', 'lists'].map(k => store.get(/** @type {import('../cloud.js').Kind} */ (k)))];
    if (lastMarks && key.every((x, i) => x === lastMarks?.key[i])) return lastMarks.out;
    const { problem, roster } = problemOf(monday(), m);
    const out = marksOf(score(/** @type {any} */ (problem), roster), m.wk?.accepted);
    // a preview: the names new on a list and the lists that change are marked too
    if (pv?.mon === monday()) {
      for (const k of pv.cells) out.cells.set(k, { why: [], ...out.cells.get(k), new: true });
      for (const k of pv.lists) out.slots.set(k, { why: [], ...out.slots.get(k), new: true });
    }
    lastMarks = { key, out };
    return lastMarks.out;
  }

  /**
   * The rule report sheet (screens/report.js, loaded when first used).
   * @param {string} mon @param {import('../roster/report.js').ReportRow[]} rows @param {{ slot: string, text: string }[]} short
   */
  async function openWeekReport(mon, rows, short) {
    const { openReport } = await import('./report.js');
    openReport({
      title: `Rules, week of ${shortDay(mon)}`, rows, short,
      accept: async (key, on) => {
        const now = model(mon), was = now.wk?.accepted ?? [], row = /** @type {any} */ (store.row('weeks', mon));
        const accepted = on ? [...new Set([...was, key])].slice(-300) : was.filter(k => k !== key);
        if (await app.data.weeks.upsert(mon, row, planWrite(row, { accepted }, WEEK_PLAN))) { toast(REFUSED); return false; }
        return true;
      },
    });
  }

  /** More's Rule report: the week on screen as it stands */
  async function report() {
    if (!ctx.canWrite() || buildWaiting()) return;
    const mon = monday(), c = checked(mon, model(mon));
    await openWeekReport(mon, c.rows, c.short);
  }

  return { report, marks, shown, plan, build, reset, busy: () => building, cellSheet, addSheet, weekListSheet, epicSheet, shortButtons, takeOff, takeOffAll, drift };
}
