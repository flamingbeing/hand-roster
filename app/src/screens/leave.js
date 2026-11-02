// The Leave and requests tab (#leave-host): who is away (all day, or AM or PM only) and the call days a person cannot do or
// would like. Leave blocks lists and calls and closes a consultant's clinics; a "cannot" is a rule the call maker keeps, a
// "would like" something it tries for. Days that have passed are kept out of sight until asked for.
import { icon, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { SESSIONS, TYPES } from '../data/leave.js';
import { TIER_LABEL, TIERS } from '../roster/model.js';
import { shortDay, weekdayName, todayKey } from '../roster/dates.js';
import { editSheet } from './sheet.js';
import { rowList, heading } from './rows.js';

const SESSION_LABEL = Object.fromEntries(SESSIONS);
const TYPE_LABEL = Object.fromEntries(TYPES);

/** @param {string} a @param {string} b */
const span = (a, b) => (a === b ? `${weekdayName(a)} ${shortDay(a)}` : `${shortDay(a)} to ${shortDay(b)}`);

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
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

  /** @param {import('../data/leave.js').LeaveRow | null} row */
  function openLeave(row) {
    const today = todayKey();
    sheet.open({
      title: row ? 'Edit leave' : 'Add leave', saveLabel: 'Save',
      values: { name: row?.name ?? '', from: row?.from ?? today, to: row?.to ?? row?.from ?? today, session: row?.session ?? 'both', note: row?.note ?? '' },
      fields: [
        { key: 'name', label: 'Who', type: 'select', options: nameOptions(row?.name) },
        { key: 'from', label: 'From', type: 'date', required: true },
        { key: 'to', label: 'To (the last day away)', type: 'date', required: true },
        { key: 'session', label: 'Which part of the day', type: 'select', options: SESSIONS },
        { key: 'note', label: 'Note', max: 200 },
      ],
      warn: v => (v.from && v.to && v.to < v.from ? ['The last day is before the first.'] : []),
      onDelete: row ? async () => { toast(await app.data.leave.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        if (!v.name) { toast('Choose who first.'); return; }
        const fields = { name: v.name, from: v.from, to: v.to < v.from ? v.from : v.to, session: v.session, note: v.note || null };
        toast((row ? await app.data.leave.edit(row, fields) : await app.data.leave.add(fields)) ? REFUSED : 'Saved');
      },
    });
  }

  /** @param {import('../data/leave.js').RequestRow | null} row */
  function openRequest(row) {
    sheet.open({
      title: row ? 'Edit request' : 'Add request', saveLabel: 'Save',
      values: { name: row?.name ?? '', date: row?.date ?? todayKey(), type: row?.type ?? 'cannot', tier: row?.tier ?? '' },
      fields: [
        { key: 'name', label: 'Who', type: 'select', options: nameOptions(row?.name) },
        { key: 'date', label: 'Day', type: 'date', required: true },
        { key: 'type', label: 'Request', type: 'select', options: TYPES },
        { key: 'tier', label: 'For which call', type: 'select', options: [['', 'Any call'], ...TIERS.map(t => /** @type {[string, string]} */ ([t, TIER_LABEL[t]]))] },
      ],
      onDelete: row ? async () => { toast(await app.data.requests.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: async v => {
        if (!v.name) { toast('Choose who first.'); return; }
        const fields = { name: v.name, date: v.date, type: v.type, tier: v.tier || null };
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
    const liveLeave = leave.filter(r => r.to >= today).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
    const pastLeave = leave.filter(r => r.to < today).sort((a, b) => b.from.localeCompare(a.from));
    const liveReq = reqs.filter(r => r.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const pastReq = reqs.filter(r => r.date < today).sort((a, b) => b.date.localeCompare(a.date));
    const past = pastLeave.length + pastReq.length;
    fill(bar,
      canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'leave-add', onclick: () => openLeave(null) }, icon(ICONS.plus), 'Add leave'),
      canWrite && h('button', { type: 'button', id: 'request-add', onclick: () => openRequest(null) }, icon(ICONS.plus), 'Add request'));

    /** @param {import('../data/leave.js').LeaveRow[]} list */
    const leaveRows = list => rowList('Leave', list.map(r => ({
      main: r.name, sub: [span(r.from, r.to), r.session && r.session !== 'both' ? SESSION_LABEL[r.session] : '', r.note].filter(Boolean).join(' · '),
      tag: r.from <= today && r.to >= today ? 'Away now' : '', dim: r.to < today, onOpen: canWrite ? () => openLeave(r) : null })));
    /** @param {import('../data/leave.js').RequestRow[]} list */
    const reqRows = list => rowList('Requests', list.map(r => ({
      main: r.name, sub: [span(r.date, r.date), r.tier ? TIER_LABEL[r.tier] : 'any call'].join(' · '), tag: TYPE_LABEL[r.type], dim: r.date < today, onOpen: canWrite ? () => openRequest(r) : null })));

    fill(body,
      h('section', { class: 'rl-block' }, heading('Leave', liveLeave.length), liveLeave.length ? leaveRows(liveLeave) : h('p', { class: 'small' }, 'Nobody is away or booked to be.')),
      h('section', { class: 'rl-block' }, heading('Call requests', liveReq.length), liveReq.length ? reqRows(liveReq) : h('p', { class: 'small' }, 'No requests from today on.')),
      past > 0 && h('button', { type: 'button', class: 'rl-more', 'aria-expanded': String(showPast), onclick: () => { showPast = !showPast; draw(); } }, showPast ? 'Hide past' : `Show past (${past})`),
      showPast && pastLeave.length > 0 && h('section', { class: 'rl-block' }, heading('Past leave', pastLeave.length), leaveRows(pastLeave)),
      showPast && pastReq.length > 0 && h('section', { class: 'rl-block' }, heading('Past requests', pastReq.length), reqRows(pastReq)));
  }
  draw();
  return { draw };
}
