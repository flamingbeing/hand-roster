// The Week tab's edits, apart from week.js so the first screen loads less (viewers never load it): Build week, a junior
// moved, swapped, added or taken off, a list changed for this week, Check against Epic and the Short panel's options.
// week.js loads it on a roster maker's first edit or Build. Each save works from the week as it is when saved
// (roster/week-edits.js): a change another maker saved while a sheet was open stays. The copy a sheet opened with only
// words and warns. A Build, a grid edit or a list change can be undone from its toast for a few seconds.
import { confirmModal, undoToast } from '@core/ui';
import { $, h } from '../dom.js';
import { REFUSED } from '../items.js';
import { shortDay } from '../roster/dates.js';
import { conText } from '../roster/model.js';
import { sectionsOf, shortOptions, whyNot } from '../roster/sections.js';
import { gridRows, juniorsOn } from '../roster/grid.js';
import { applyEdit, mergeOverrides, undoFields } from '../roster/week-edits.js';
import { slotsFor } from '../data/lists.js';
import { editSheet } from './sheet.js';

/** @typedef {ReturnType<typeof import('./week.js').weekModel>} Model */
/** @typedef {import('../roster/week-edits.js').GridEdit} GridEdit */
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

  /** a grid edit, made on the week as it is now @param {string} mon @param {GridEdit} e @param {string} said */
  async function saveGrid(mon, e, said) {
    const now = model(mon);
    await save(mon, now, { lists: now.built && now.wk?.lists?.length ? now.wk.lists : slotsFor(now.templates, mon, now.wk?.overrides), grid: applyEdit(now.grid, e) }, said);
  }

  /**
   * Changes lists for this week only, laid over the week's changes as they are now. A built week is drawn from its lists
   * as built, so they change too.
   * @param {string} mon @param {Changes} changes @param {GridEdit} [edit]  a grid edit saved with it
   */
  async function saveOverrides(mon, changes, edit) {
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
    if (building || !ctx.canWrite()) return;
    const mon = monday(), m = model(mon);
    if (!m.lists.length) { toast('Add the weekly lists first (Lists tab).'); return; }
    const { buildWeek } = await import('../roster/week.js');
    const raw = slotsFor(m.templates, mon, m.wk?.overrides);
    // ask only when the grid differs from what its last build would make now: a hand change (or leave or calls changed since)
    const asBuilt = () => JSON.stringify(gridRows(buildWeek({ monday: mon, lists: raw, people: m.people, leave: m.leave, calls: m.calls, holidays: m.holidays, seed: m.wk?.seed ?? 0 }).grid)) === JSON.stringify(m.grid.map(r => ({ day: r.day, session: r.session, list: r.list, juniors: r.juniors })));
    if (m.built && m.grid.some(r => r.juniors.length) && !asBuilt() && !await confirmModal('Build this week again? Changes made by hand to its grid are replaced.', { title: 'Build week', yes: 'Build again' })) return;
    building = true; $('week-build').setAttribute('disabled', '');
    try {
      const now = model(mon);
      const seed = (now.wk?.seed ?? 0) + 1;
      const lists = slotsFor(now.templates, mon, now.wk?.overrides);
      const res = buildWeek({ monday: mon, lists, people: now.people, leave: now.leave, calls: now.calls, holidays: now.holidays, seed });
      const short = res.problems.filter(p => p.got < p.min || p.noReg).length;
      // the lists are kept as the template stood, unsettled, so a holiday or leave taken away later reopens them
      // the month's calls not made yet: built all the same, but post-call days are not known, so say so
      const said = [short ? `Built. ${short} list${short === 1 ? ' is' : 's are'} below the minimum: see Short.` : 'Built', !now.callsMade && 'Calls are not made yet: post-call not kept clear.'];
      await save(mon, now, { grid: gridRows(res.grid), lists, seed, built: Date.now() }, said.filter(Boolean).join(short ? ' ' : '. '));
    } finally { building = false; $('week-build').removeAttribute('disabled'); }
  }

  /** @param {Model} m  the week as drawn (words and warnings) @param {string} day @param {'AM' | 'PM'} session @param {string} name @param {string} list */
  function moveSheet(m, day, session, name, list) {
    const mon = monday();
    const here = m.lists.filter(l => l.day === day && l.session === session && l.status === 'open');
    const label = (/** @type {any} */ l) => `${l.site} ${l.name}${l.consultant ? ` – ${conText(l)}` : ''}`;
    const nameOf = (/** @type {string} */ id) => m.lists.find(l => l.id === id)?.name ?? 'the list';
    sheet.open({
      title: name, note: `${shortDay(day)}, ${session === 'AM' ? 'morning' : 'afternoon'}. Now on ${label(m.lists.find(l => l.id === list) ?? { site: '', name: 'no list' })}.`,
      values: { to: list }, saveLabel: 'Move', deleteLabel: 'Take off the list',
      fields: [
        { key: 'to', label: 'Move to', type: 'select', options: () => [['', 'Free (no list)'], ...here.map(l => /** @type {[string, string]} */ ([l.id, `${label(l)} (${juniorsOn(m.grid, day, session, l.id).length}/${l.need})`]))] },
        { key: 'swap', label: 'Swap with', type: 'select', hint: 'The other person goes to the list this one leaves.',
          options: v => [['', 'Nobody'], ...(v.to ? juniorsOn(m.grid, day, session, v.to).filter(n => n !== name).map(n => /** @type {[string, string]} */ ([n, n])) : [])] },
      ],
      warn: v => (v.to && v.to !== list ? whyNot({ name, day, session, leave: m.leave, calls: m.calls, grid: m.grid, list: v.to }).filter(w => !w.includes('already on another')) : []),
      onSave: v => saveGrid(mon, { kind: 'move', day, session, name, to: v.to || null, swapWith: v.swap || null },
        v.swap ? `Swapped ${name} and ${v.swap}.` : v.to ? `Moved ${name} to ${nameOf(v.to)}.` : `${name} is free.`),
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
    if (!ctx.canWrite()) return;
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
    /** @param {import('../roster/sections.js').ShortOption} o */
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

  return { build, moveSheet, addSheet, weekListSheet, epicSheet, shortButtons };
}
