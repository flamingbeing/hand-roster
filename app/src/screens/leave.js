// The Leave and requests tab (#leave-host): who is away (all day, or AM or PM only) and the call days a person cannot do or
// would like. Leave blocks lists and calls and closes a consultant's clinics; a "cannot" is a rule the call maker keeps, a
// "would like" something it tries for. Days that have passed are kept out of sight until asked for.
import { icon, emptyState, undoToast } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { SESSIONS, TYPES } from '../data/leave.js';
import { TIER_LABEL, TIERS } from '../roster/model.js';
import { shortDay, weekdayName, todayKey } from '../roster/dates.js';
import { leaveClashes, MAX_DAYS } from '../roster/leave-clash.js';
import { expandDays, groupByMonth, requestRangeClashes } from '../roster/leave-view.js';
import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

const SESSION_LABEL = Object.fromEntries(SESSIONS);
const TYPE_LABEL = Object.fromEntries(TYPES);

// the last person leave or a request was saved for: the next one is often for them too (one tap fewer)
let lastName = '';
// the person the tab is showing ('' for everyone): kept while the page is open, not stored
let who = '';

/** @param {string} a @param {string} b */
const span = (a, b) => (a === b ? `${weekdayName(a)} ${shortDay(a)}` : `${shortDay(a)} to ${shortDay(b)}`);

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  // the kit's Undo toast on the page's toaster (whose show hands back that toast's dismiss)
  const undo = undoToast({ show: (text, o) => { const gone = toast(text, o); return () => { if (typeof gone === 'function') gone(); }; } }, { ms: 8000 });
  const host = $('leave-host');
  let showPast = false;
  const empty = emptyState(host, { title: 'No leave or requests', hint: 'Add leave and call requests here. They are used when the week and the calls are made.' });
  const bar = h('div', { class: 'rl-bar' });
  const body = h('div', { class: 'rl-body' });
  host.append(bar, body);
  store.on(['leave', 'requests', 'people'], () => draw());
  ctx.onRole(() => draw());

  const names = () => /** @type {import('../data/people.js').PersonRow[]} */ (/** @type {any} */ (store.get('people'))).filter(p => p.active !== false).map(p => p.name).sort();
  /** @param {string | undefined} cur @returns {[string, string][]} the names, and a name no longer on the roster if the row has it */
  const nameOptions = cur => { const list = names(); return (cur && !list.includes(cur) ? [cur, ...list] : list).map(n => [n, n]); };

  /** the calls and weeks made so far, read when a sheet's warning runs */
  const made = () => ({ rosters: /** @type {any[]} */ (store.get('rosters')), weeks: /** @type {any[]} */ (store.get('weeks')) });

  /** @param {import('../data/leave.js').LeaveRow | null} row */
  function openLeave(row) {
    const today = todayKey();
    sheet.open({
      title: row ? 'Edit leave' : 'Add leave', saveLabel: 'Save',
      values: { name: row?.name ?? (who || lastName), from: row?.from ?? today, to: row?.to ?? row?.from ?? today, session: row?.session ?? 'both', note: row?.note ?? '' },
      fields: [
        { key: 'name', label: 'Who', type: 'select', options: nameOptions(row?.name) },
        { key: 'from', label: 'From', type: 'date', required: true },
        { key: 'to', label: 'To (the last day away)', type: 'date', required: true, follows: 'from' },
        { key: 'session', label: 'Which part of the day', type: 'select', options: SESSIONS },
        { key: 'note', label: 'Note', max: 200 },
      ],
      // what the leave clashes with in the calls and built weeks already made: information only, Save still goes ahead
      warn: v => [
        ...(v.from && v.to && v.to < v.from ? ['The last day is before the first.'] : []),
        ...leaveClashes({ name: v.name, from: v.from, to: v.to, session: v.session, ...made(), leave: /** @type {any[]} */ (store.get('leave')) }),
      ],
      onDelete: row ? async () => {
        if (await app.data.leave.remove(row)) { toast(REFUSED); return; }
        // Undo puts the same record back, under its own id
        undo.show(`Deleted leave for ${row.name}, ${span(row.from, row.to)}`, async () => { if (await app.data.leave.put(row)) toast(REFUSED); });
      } : undefined,
      onSave: async v => {
        if (!v.name) { toast('Choose who first.'); return; }
        lastName = v.name;
        const fields = { name: v.name, from: v.from, to: v.to < v.from ? v.from : v.to, session: v.session, note: v.note || null };
        toast((row ? await app.data.leave.edit(row, fields) : await app.data.leave.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  /**
   * Adds one request a day from `fields.date` to `last` (a new request with a last day): one toast for them all, whose
   * Undo removes the rows this save added (found again in the store, as an add does not hand back its id).
   * @param {{ name: string, date: string, type: 'cannot' | 'want', tier: string | null }} fields @param {string[]} days
   */
  async function addRequests(fields, days) {
    const before = new Set(/** @type {import('../data/leave.js').RequestRow[]} */ (/** @type {any} */ (store.get('requests'))).map(r => r.id));
    let refused = 0;
    for (const date of days) if (await app.data.requests.add({ ...fields, date })) refused++;
    if (refused) { toast(REFUSED); return; }
    const want = new Set(days);
    undo.show(`Saved ${days.length} requests`, async () => {
      const added = /** @type {import('../data/leave.js').RequestRow[]} */ (/** @type {any} */ (store.get('requests'))).filter(r => !before.has(r.id) && !r._deleted
        && r.name === fields.name && r.type === fields.type && (r.tier || null) === fields.tier && want.has(r.date));
      let failed = false;
      for (const r of added) if (await app.data.requests.remove(r)) failed = true;
      if (failed) toast(REFUSED);
    });
  }

  /** @param {import('../data/leave.js').RequestRow | null} row */
  function openRequest(row) {
    const day = row?.date ?? todayKey();
    sheet.open({
      title: row ? 'Edit request' : 'Add request', saveLabel: 'Save',
      values: { name: row?.name ?? (who || lastName), date: day, ...(row ? {} : { to: day }), type: row?.type ?? 'cannot', tier: row?.tier ?? '' },
      fields: [
        { key: 'name', label: 'Who', type: 'select', options: nameOptions(row?.name) },
        { key: 'date', label: 'Day', type: 'date', required: true },
        // a new request only: one request a day up to this one, so a run of days is one trip through the sheet
        ...(row ? [] : [{ key: 'to', label: 'Last day', type: /** @type {const} */ ('date'), follows: 'date', hint: `One request a day, up to ${MAX_DAYS} days.` }]),
        { key: 'type', label: 'Request', type: 'select', options: TYPES },
        { key: 'tier', label: 'For which call', type: 'select', options: [['', 'Any call'], ...TIERS.map(t => /** @type {[string, string]} */ ([t, TIER_LABEL[t]]))] },
      ],
      warn: v => {
        const days = expandDays(v.date, row ? null : v.to);
        return [
          ...(!row && v.date && v.to && v.to < v.date ? ['The last day is before the first.'] : []),
          ...(!row && days.length && v.to > days[days.length - 1] ? [`Only the first ${MAX_DAYS} days are added.`] : []),
          ...requestRangeClashes({ name: v.name, from: v.date, to: row ? null : v.to, type: v.type, rosters: made().rosters }),
        ];
      },
      onDelete: row ? async () => {
        if (await app.data.requests.remove(row)) { toast(REFUSED); return; }
        undo.show(`Deleted the request for ${row.name}, ${span(row.date, row.date)}`, async () => { if (await app.data.requests.put(row)) toast(REFUSED); });
      } : undefined,
      onSave: async v => {
        if (!v.name) { toast('Choose who first.'); return; }
        lastName = v.name;
        const fields = { name: v.name, date: v.date, type: v.type, tier: v.tier || null };
        const days = row ? [v.date] : expandDays(v.date, v.to);
        if (days.length > 1) { await addRequests(fields, days); return; }
        toast((row ? await app.data.requests.edit(row, fields) : await app.data.requests.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('leave') && !store.loaded('requests')) return;
    const canWrite = ctx.canWrite(), today = todayKey();
    const leave = /** @type {import('../data/leave.js').LeaveRow[]} */ (/** @type {any} */ (store.get('leave')));
    const reqs = /** @type {import('../data/leave.js').RequestRow[]} */ (/** @type {any} */ (store.get('requests')));
    empty.show(!leave.length && !reqs.length && canWrite);
    // the names with leave or requests, and the chosen one even when its last row has gone (so the empty lines say whose)
    const withRows = [...new Set([...leave.map(r => r.name), ...reqs.map(r => r.name), ...(who ? [who] : [])])].sort();
    /** @param {{ name: string }} r */
    const shown = r => !who || r.name === who;
    const liveLeave = leave.filter(r => r.to >= today && shown(r)).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
    const pastLeave = leave.filter(r => r.to < today && shown(r)).sort((a, b) => b.from.localeCompare(a.from));
    const liveReq = reqs.filter(r => r.date >= today && shown(r)).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const pastReq = reqs.filter(r => r.date < today && shown(r)).sort((a, b) => b.date.localeCompare(a.date));
    const past = pastLeave.length + pastReq.length;
    fill(bar,
      canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'leave-add', onclick: () => openLeave(null) }, icon(ICONS.plus), 'Add leave'),
      canWrite && h('button', { type: 'button', id: 'request-add', onclick: () => openRequest(null) }, icon(ICONS.plus), 'Add request'),
      withRows.length > 0 && h('label', { class: 'rl-who' }, h('span', { class: 'small' }, 'Who'),
        h('select', { id: 'leave-who', onchange: (/** @type {Event} */ e) => { who = /** @type {HTMLSelectElement} */ (e.target).value; draw(); } },
          [['', 'Everyone'], ...withRows.map(n => [n, n])].map(([v, l]) => h('option', { value: v, selected: v === who }, l)))));

    // names no longer on the roster (deleted, made inactive or renamed in People) are tagged, once People has loaded
    const onRoster = new Set(names());
    /** @param {string} name @param {string} tag */
    const tagOf = (name, tag) => {
      const off = store.loaded('people') && !onRoster.has(name);
      return off ? (tag ? `${tag} · not on the roster` : 'Not on the roster') : tag;
    };
    /** @param {import('../data/leave.js').LeaveRow[]} list */
    const leaveRows = list => rowList('Leave', list.map(r => ({
      main: r.name, sub: [span(r.from, r.to), r.session && r.session !== 'both' ? SESSION_LABEL[r.session] : '', r.note].filter(Boolean).join(' · '),
      tag: tagOf(r.name, r.from <= today && r.to >= today ? 'Away now' : ''), dim: r.to < today, onOpen: canWrite ? () => openLeave(r) : null })));
    /** @param {import('../data/leave.js').RequestRow[]} list */
    const reqRows = list => rowList('Requests', list.map(r => ({
      main: r.name, sub: [span(r.date, r.date), r.tier ? TIER_LABEL[r.tier] : 'any call'].join(' · '), tag: tagOf(r.name, TYPE_LABEL[r.type]), dim: r.date < today, onOpen: canWrite ? () => openRequest(r) : null })));
    /** the live rows under a small heading for each month @template T @param {T[]} list @param {(r: T) => string} dayOf @param {(rows: T[]) => HTMLElement} rowsOf */
    const byMonth = (list, dayOf, rowsOf) => groupByMonth(list, dayOf).map(g => [h('h3', { class: 'rl-month' }, `${g.label} (${g.rows.length})`), rowsOf(g.rows)]);

    fill(body,
      h('section', { class: 'rl-block' }, heading('Leave', liveLeave.length),
        liveLeave.length ? byMonth(liveLeave, r => r.from, leaveRows) : h('p', { class: 'small' }, who ? `No leave for ${who}.` : 'Nobody is away or booked to be.')),
      h('section', { class: 'rl-block' }, heading('Call requests', liveReq.length),
        liveReq.length ? byMonth(liveReq, r => r.date, reqRows) : h('p', { class: 'small' }, who ? `No requests for ${who}.` : 'No requests from today on.')),
      past > 0 && h('button', { type: 'button', class: 'rl-more', 'aria-expanded': String(showPast), onclick: () => { showPast = !showPast; draw(); } }, showPast ? 'Hide past' : `Show past (${past})`),
      showPast && pastLeave.length > 0 && h('section', { class: 'rl-block' }, heading('Past leave', pastLeave.length), leaveRows(pastLeave)),
      showPast && pastReq.length > 0 && h('section', { class: 'rl-block' }, heading('Past requests', pastReq.length), reqRows(pastReq)));
  }
  draw();
  return { draw };
}
