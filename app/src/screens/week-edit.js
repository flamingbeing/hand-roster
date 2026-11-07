// The Week tab's edits, apart from week.js so the first screen loads less (viewers never load it): Build week, a junior
// moved, swapped, added or taken off, a list changed for this week, Check against Epic, the Short panel's options, the
// Clashes panel's Take off and how many lists the Lists tab has changed since the week was built.
// week.js loads it on a roster maker's first edit or Build, or when a maker opens a built week. Each save works from the week as it is when saved
// (roster/week-edits.js): a change another maker saved while a sheet was open stays. The copy a sheet opened with only
// words and warns. A Build, a grid edit or a list change can be undone from its toast for a few seconds. Build again keeps
// every pinned junior where they are (someone added or moved by hand is pinned); Reset week drops the pins and builds fresh.
import { undoToast } from '@core/ui';
import { $, h } from '../dom.js';
import { LOADING, REFUSED } from '../items.js';
import { shortDay } from '../roster/dates.js';
import { conText } from '../roster/model.js';
import { sectionsOf, whyNot } from '../roster/sections.js';
import { shortOptions } from '../roster/short.js';
import { gridRows, isPinned, juniorsOn } from '../roster/grid.js';
import { pinsOf, withPins } from '../roster/pins.js';
import { applyEdit, applyEdits, keptAsks, mergeOverrides, undoFields } from '../roster/week-edits.js';
import { listsDrift } from '../roster/lists-drift.js';
import { rulesOf, weekRules } from '../roster/rule-cards.js';
import { slotsFor } from '../data/lists.js';
import { editSheet } from './sheet.js';
import { WEEK_NEEDS } from './week.js';

/** @typedef {ReturnType<typeof import('./week.js').weekModel>} Model */
/** @typedef {import('../roster/week-edits.js').GridEdit} GridEdit */
/** @typedef {ReturnType<typeof import('../roster/sections.js').clashesOf>[number]} Clash */
/** @typedef {[string, Partial<import('../data/lists.js').Override> | null][]} Changes  list id, change */

/**
 * @param {{ ctx: import('./context.js').Context, model: (mon?: string) => Model, monday: () => string }} env
 *   model: the week as it is now; monday: the week on screen
 */
export function weekEdit({ ctx, model, monday }) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  // the kit's Undo toast on the page's toaster (whose show hands back that toast's dismiss)
  const undo = undoToast({ show: (text, o) => { const gone = toast(text, o); return () => { if (typeof gone === 'function') gone(); }; } }, { ms: 6000 });
  let building = false;
  /** true (and says so) while some of what the week is built from has not arrived yet */
  const waiting = () => { if (store.ready(WEEK_NEEDS)) return false; toast(LOADING); return true; };
  /** the rule cards in force, as the week builder takes them (spaces/_/rules over the defaults) */
  const rules = () => weekRules(rulesOf(store.get('rules')));

  /**
   * Saves some fields of a week, with Undo: it puts those fields back as they were, on the week as it is by then.
   * @param {string} mon @param {Model} now  the week just before @param {Record<string, unknown>} fields @param {string} said
   */
  async function save(mon, now, fields, said) {
    const was = undoFields(/** @type {any} */ (now.wk), Object.keys(fields));
    if (await app.data.weeks.upsert(mon, now.wk, fields)) { toast(REFUSED); return; }
    undo.show(said, async () => {
      if (await app.data.weeks.upsert(mon, /** @type {any} */ (store.row('weeks', mon)), was)) toast(REFUSED);
    });
  }

  /** a grid edit, or several saved as one (one Undo), made on the week as it is now @param {string} mon @param {GridEdit | GridEdit[]} e @param {string} said */
  async function saveGrid(mon, e, said) {
    if (waiting()) return;
    const now = model(mon);
    await save(mon, now, { lists: now.built && now.wk?.lists?.length ? now.wk.lists : slotsFor(now.templates, mon, now.wk?.overrides), grid: applyEdits(now.grid, [e].flat()) }, said);
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
    await save(mon, now, fields, 'Saved');
  }

  async function build() {
    if (building || !ctx.canWrite() || waiting()) return;
    const mon = monday(), m = model(mon);
    if (!m.lists.length) { toast('Add the weekly lists first (Lists tab).'); return; }
    if (!m.built || !m.grid.some(r => r.juniors.length)) { await rebuild(mon, []); return; }
    await rebuild(mon, await pinsNow(mon, m));
  }

  /** Reset week: every pin dropped and the week built fresh (the list changes for this week stay) */
  function reset() {
    if (building || !ctx.canWrite() || waiting()) return;
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
   * Builds the week again with a new seed, the pins placed first.
   * @param {string} mon @param {import('../roster/pins.js').Pin[]} pins  the pins to keep
   */
  async function rebuild(mon, pins) {
    if (building || waiting()) return;
    building = true; $('week-build').setAttribute('disabled', '');
    try {
      const { buildWeek } = await import('../roster/week.js');
      const now = model(mon);
      const seed = (now.wk?.seed ?? 0) + 1;
      const lists = slotsFor(now.templates, mon, now.wk?.overrides);
      const res = buildWeek({ monday: mon, lists, people: now.people, leave: now.leave, calls: now.calls, holidays: now.holidays, seed, pins, rules: rules() });
      const grid = withPins(gridRows(res.grid), pins);
      const kept = pinsOf(grid).length;
      const short = res.problems.filter(p => p.got < p.min || p.noReg).length;
      // the lists are kept as the template stood, unsettled, so a holiday or leave taken away later reopens them
      // the month's calls not made yet: built all the same, but post-call days are not known, so say so
      const said = [
        pins.length && (kept === pins.length ? `Kept ${kept} pin${kept === 1 ? '' : 's'}.` : `Kept ${kept} of ${pins.length} pins (the others' lists are closed this week).`),
        short && `${short} list${short === 1 ? ' is' : 's are'} below the minimum: see Short.`,
        !now.callsMade && 'Calls are not made yet: post-call not kept clear.',
      ].filter(Boolean);
      await save(mon, now, { grid, lists, seed, built: Date.now() }, said.length ? `Built. ${said.join(' ')}` : 'Built');
    } finally { building = false; $('week-build').toggleAttribute('disabled', !store.ready(WEEK_NEEDS)); }
  }

  /** @param {Model} m  the week as drawn (words and warnings) @param {string} day @param {'AM' | 'PM'} session @param {string} name @param {string} list */
  function moveSheet(m, day, session, name, list) {
    const mon = monday();
    const here = m.lists.filter(l => l.day === day && l.session === session && l.status === 'open');
    const label = (/** @type {any} */ l) => `${l.site} ${l.name}${l.consultant ? ` – ${conText(l)}` : ''}`;
    const nameOf = (/** @type {string} */ id) => m.lists.find(l => l.id === id)?.name ?? 'the list';
    sheet.open({
      title: name, note: `${shortDay(day)}, ${session === 'AM' ? 'morning' : 'afternoon'}. Now on ${label(m.lists.find(l => l.id === list) ?? { site: '', name: 'no list' })}.`,
      values: { to: list, pinned: isPinned(m.grid, day, session, list, name) }, saveLabel: 'Save', deleteLabel: 'Take off the list',
      fields: [
        { key: 'to', label: 'Move to', type: 'select', options: () => [['', 'Free (no list)'], ...here.map(l => /** @type {[string, string]} */ ([l.id, `${label(l)} (${juniorsOn(m.grid, day, session, l.id).length}/${l.need})`]))] },
        { key: 'swap', label: 'Swap with', type: 'select', hint: 'The other person goes to the list this one leaves.',
          options: v => [['', 'Nobody'], ...(v.to ? juniorsOn(m.grid, day, session, v.to).filter(n => n !== name).map(n => /** @type {[string, string]} */ ([n, n])) : [])] },
        { key: 'pinned', label: 'Pinned: Build again keeps them here', type: 'check', hint: 'Someone moved or added by hand is pinned too. Reset week (More) drops every pin.' },
      ],
      warn: v => (v.to && v.to !== list ? whyNot({ name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: v.to }).filter(w => !w.includes('already on another')) : []),
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

  /** @param {Model} m @param {string} day @param {'AM' | 'PM'} session @param {import('../roster/model.js').ListSlot} l */
  function addSheet(m, day, session, l) {
    const mon = monday();
    const juniors = m.people.filter(p => p.grade !== 'con');
    const sec = sectionsOf({ monday: mon, people: m.people, leave: m.leave, calls: m.calls, lists: m.lists, grid: m.grid, holidays: m.holidays });
    const freeNames = new Set((sec.free[day] ?? []).filter(f => f.when === 'FULL DAY' || f.when === session).map(f => f.name));
    const ordered = [...juniors.filter(p => freeNames.has(p.name)), ...juniors.filter(p => !freeNames.has(p.name))];
    if (!ordered.length) { toast('Add people first (People tab).'); return; }
    sheet.open({
      title: `Add to ${l.name}`, note: `${l.site}${l.consultant ? ` – ${conText(l)}` : ''}, ${shortDay(day)} ${session === 'AM' ? 'morning' : 'afternoon'}. Free people are listed first.`,
      values: { name: ordered[0].name }, saveLabel: 'Add',
      fields: [{ key: 'name', label: 'Junior', type: 'select', options: ordered.map(p => /** @type {[string, string]} */ ([p.name, `${p.name}${freeNames.has(p.name) ? '' : ' (not free)'}`])) }],
      warn: v => whyNot({ name: v.name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: l.id }).filter(w => !w.includes('already on another')),
      onSave: v => saveGrid(mon, { kind: 'add', day, session, list: l.id, name: v.name }, `Added ${v.name} to ${l.name}.`),
    });
  }

  /** A list's changes for this week only (screens/week-list.js, loaded when first used) @param {import('../roster/model.js').ListSlot} l */
  async function weekListSheet(l) {
    const { weekListSheet: open } = await import('./week-list.js');
    // the week as it is now, not as last drawn: a change saved a moment ago may not be drawn yet. The sheet starts from the
    // list unsettled; the settled one only says why it is closed this week
    const mon = monday(), now = model(mon), settled = now.lists.find(x => x.id === l.id) ?? l;
    open({ m: now, l: now.raw.find(x => x.id === l.id) ?? settled, settled, sheet, saveOverrides: changes => saveOverrides(mon, changes) });
  }

  /** "Check against Epic" (screens/epic.js, loaded when first used) */
  async function epicSheet() {
    if (!ctx.canWrite() || waiting()) return;
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

  return { build, reset, busy: () => building, moveSheet, addSheet, weekListSheet, epicSheet, shortButtons, takeOff, takeOffAll, drift };
}
