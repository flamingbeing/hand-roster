// The Calls tab (#calls-page): a month's on-call roster. A calendar of the four tiers (CON, REG, MO NUH, MO NTFGH; weekends and
// public holidays have fewer), "Make calls" (the solver, roster/calls.js), a table of how many calls each person has,
// and what breaks a rule. A tap on a day sets its calls by hand; a call set by hand is kept when the calls are made again.
// A phone shows the days as a list, a wider screen as a month grid.
import { icon, confirmModal, emptyState } from '@core/ui';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { solveCalls } from '../roster/calls.js';
import { checkCalls } from '../roster/calls-check.js';
import { setCall, lockedMap, problemLines } from '../roster/calls-edit.js';
import { callMapIn, monthCells, shiftMonth } from '../roster/sections.js';
import { callRowsOf, DEFAULT_TIER_PLAN, TIERS, TIER_LABEL, canTake, dayType } from '../roster/model.js';
import { MONTHS, monthDays, shortDay, weekdayName, todayKey } from '../roster/dates.js';
import { activePeople } from '../data/people.js';
import { leaveOf, requestsOf } from '../data/leave.js';
import { editSheet } from './sheet.js';

/** @param {string} month @returns {string} 'November 2026' */
export const monthTitle = month => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
const SHORT = /** @type {Record<string, string>} */ ({ con: 'CON', reg: 'REG', moNuh: 'NUH', moNtf: 'NTF' });

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  let month = todayKey().slice(0, 7);
  let busy = false;
  const sheet = editSheet();
  const host = $('calls-host');
  const empty = emptyState(host, { title: 'No people yet', hint: 'Add the doctors on the People tab first.' });
  const bar = h('div', { class: 'cl-bar' });
  const stateNote = h('p', { class: 'small', role: 'status' });
  const cal = h('div', { class: 'cl-cal', role: 'list', 'aria-label': 'Calls by day' });
  const counts = h('div', { class: 'cl-counts' });
  const problemsBox = h('div', { class: 'cl-problems' });
  host.append(bar, stateNote, cal, counts, problemsBox);

  store.on(['people', 'leave', 'requests', 'rosters'], () => draw());
  ctx.onRole(() => draw());

  /** @param {number} n */
  const step = n => { month = shiftMonth(month, n); draw(); };

  function model() {
    const roster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', month));
    const people = activePeople(/** @type {any} */ (store.get('people')));
    const leave = leaveOf(/** @type {any} */ (store.get('leave')));
    const requests = requestsOf(/** @type {any} */ (store.get('requests')));
    const prevRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', shiftMonth(month, -1)));
    const nextRoster = /** @type {import('../data/plans.js').RosterRow | undefined} */ (store.row('rosters', shiftMonth(month, 1)));
    const prior = callMapIn([...(prevRoster?.calls ?? []), ...(nextRoster?.calls ?? [])].filter(c => c.date < `${month}-01`), shiftMonth(month, -1));
    return { roster, people, leave, requests, prior, calls: roster?.calls ?? [], holidays: roster?.holidays ?? [], minGap: roster?.minGap ?? 2 };
  }

  async function make() {
    if (busy || !ctx.canWrite()) return;
    const m = model();
    const locked = lockedMap(m.roster?.locked ?? [], m.calls);
    const hand = Object.keys(locked).length;
    const anyCalls = m.calls.some(c => TIERS.some(t => c[t]));
    if (anyCalls && !await confirmModal(`Make the calls for ${monthTitle(month)} again? ${hand ? `The ${hand} you set by hand stay; the rest` : 'They'} will be made new.`, { title: 'Make calls', yes: 'Make calls' })) return;
    busy = true; $('calls-make').setAttribute('disabled', ''); stateNote.textContent = 'Making the calls…';
    try {
      await new Promise(r => setTimeout(r, 30));   // let the note paint before the solver holds the page
      const seed = (m.roster?.seed ?? 0) + 1;
      const res = solveCalls({ month, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, seed, prior: m.prior, locked, iterations: 20000 });
      const refused = await app.data.rosters.upsert(month, m.roster, { calls: callRowsOf(res.assignments), problems: problemLines(res.problems), seed, built: Date.now() });
      toast(refused ? REFUSED : res.problems.length ? `Made. ${res.problems.length} thing${res.problems.length === 1 ? '' : 's'} to look at.` : 'Made');
    } finally { busy = false; $('calls-make').removeAttribute('disabled'); draw(); }
  }

  /** @param {string} date */
  function daySheet(date) {
    const m = model();
    const plan = DEFAULT_TIER_PLAN[dayType(date, m.holidays)];
    const tiers = TIERS.filter(t => plan.includes(t) || m.calls.find(c => c.date === date)?.[t]);
    const row = m.calls.find(c => c.date === date);
    const eligible = (/** @type {import('../roster/model.js').Tier} */ t) => /** @type {[string, string][]} */ ([['', 'Nobody'], ...m.people.filter(p => canTake(p, t)).map(p => /** @type {[string, string]} */ ([p.name, p.name]))]);
    sheet.open({
      title: `${weekdayName(date)} ${shortDay(date)}`, note: 'A call set here is kept when the calls are made again.', saveLabel: 'Save',
      values: Object.fromEntries(tiers.map(t => [t, row?.[t] ?? ''])),
      fields: tiers.map(t => ({ key: t, label: TIER_LABEL[t], type: /** @type {const} */ ('select'),
        options: () => { const o = eligible(t); const cur = row?.[t]; return cur && !o.some(([v]) => v === cur) ? [...o, /** @type {[string, string]} */ ([cur, cur])] : o; } })),
      warn: v => {
        const next = Object.fromEntries(tiers.map(t => [t, v[t] || null]));
        const calls = [...m.calls.filter(c => c.date !== date), { date, con: null, reg: null, moNuh: null, moNtf: null, ...next }];
        return checkCalls({ month, calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior })
          .problems.filter(p => p.date === date || (next[p.tier] === p.name && Math.abs(Date.parse(p.date) - Date.parse(date)) <= 4 * 864e5)).map(p => p.text);
      },
      onSave: async v => {
        let state = { calls: m.calls, locked: m.roster?.locked ?? [] };
        for (const t of tiers) if ((v[t] || null) !== (row?.[t] ?? null)) state = setCall(state.calls, state.locked, date, t, v[t] || null);
        const refused = await app.data.rosters.upsert(month, m.roster, { calls: state.calls, locked: state.locked });
        toast(refused ? REFUSED : 'Saved');
      },
    });
  }

  function monthSheet() {
    const m = model();
    sheet.open({
      title: `${monthTitle(month)}: settings`, saveLabel: 'Save',
      note: 'Public holidays have fewer tiers on call, like a Saturday. Enter them as days.',
      values: { holidays: m.holidays.join('\n'), minGap: m.minGap },
      fields: [
        { key: 'holidays', label: 'Public holidays (one day per line, YYYY-MM-DD)', type: 'area', max: 400 },
        { key: 'minGap', label: 'Days clear between one person’s calls', type: 'number', min: 0, max: 7, hint: '2 means call on Monday, next on Thursday at the earliest.' },
      ],
      onSave: async v => {
        const holidays = String(v.holidays).split(/[\s,;]+/).filter(Boolean);
        const refused = await app.data.rosters.upsert(month, m.roster, { holidays, ...(v.minGap == null ? {} : { minGap: v.minGap }) });
        toast(refused ? REFUSED : 'Saved');
      },
    });
  }

  function draw() {
    if (!store.loaded('people')) return;
    const m = model();
    const canWrite = ctx.canWrite();
    empty.show(!m.people.length && canWrite);
    const prev = h('button', { type: 'button', 'aria-label': 'Previous month', onclick: () => step(-1) }, icon(ICONS.chevronLeft));
    const next = h('button', { type: 'button', 'aria-label': 'Next month', onclick: () => step(1) }, icon(ICONS.chevronRight));
    fill(bar, prev, h('h2', { class: 'cl-title', id: 'calls-title' }, monthTitle(month)), next,
      h('span', { class: 'cl-bar-end' },
        canWrite && h('button', { type: 'button', onclick: monthSheet }, 'Settings'),
        canWrite && h('button', { type: 'button', class: 'ui-primary', id: 'calls-make', disabled: busy, onclick: make }, icon(ICONS.sparkles), 'Make calls')));
    const byDate = new Map(m.calls.map(c => [c.date, c]));
    const any = m.calls.some(c => TIERS.some(t => c[t]));
    const check = checkCalls({ month, calls: m.calls, people: m.people, leave: m.leave, requests: m.requests, holidays: m.holidays, minGap: m.minGap, prior: m.prior });
    const bad = new Set(check.problems.map(p => `${p.date}|${p.tier}`));
    stateNote.textContent = any ? (m.roster?.built ? `Made ${new Date(m.roster.built).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}. ${check.empty.length ? `${check.empty.length} empty.` : ''}` : '') : (canWrite ? 'No calls yet. Tap Make calls.' : 'No calls yet.');

    /** @param {string} date */
    const cell = date => {
      const row = byDate.get(date), type = dayType(date, m.holidays);
      const plan = DEFAULT_TIER_PLAN[type];
      const shown = TIERS.filter(t => plan.includes(t) || row?.[t]);
      const locked = new Set((m.roster?.locked ?? []));
      return h('button', { type: 'button', role: 'listitem', class: `cl-day type-${type}${date === todayKey() ? ' is-today' : ''}`, disabled: !canWrite, dataset: { day: date }, 'aria-label': `${weekdayName(date)} ${shortDay(date)}: edit calls`, onclick: () => daySheet(date) },
        h('span', { class: 'cl-date' }, h('b', {}, String(Number(date.slice(8)))), h('span', { class: 'cl-wd' }, weekdayName(date)), m.holidays.includes(date) && h('span', { class: 'cl-ph small' }, 'PH')),
        h('span', { class: 'cl-tiers' }, shown.map(t => h('span', { class: `cl-tier${bad.has(`${date}|${t}`) ? ' is-bad' : ''}${locked.has(`${date}|${t}`) ? ' is-hand' : ''}`, title: row?.[t] ?? '' },
          h('i', {}, SHORT[t]), h('span', {}, row?.[t] ?? '–')))));
    };
    fill(cal, monthCells(month).map(d => d ? cell(d) : h('span', { class: 'cl-blank', 'aria-hidden': 'true' })));

    fill(counts, any && [
      h('h3', {}, 'Calls per person'),
      h('table', { class: 'cl-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Total'), h('th', {}, 'Off days'), TIERS.map(t => h('th', {}, SHORT[t])))),
        h('tbody', {}, check.counts.map(c => h('tr', {}, h('th', { scope: 'row' }, c.name), h('td', {}, String(c.total)), h('td', {}, String(c.weekend)), TIERS.map(t => h('td', {}, c.tiers[t] ? String(c.tiers[t]) : '·'))))))]);

    const lines = [...check.problems.map(p => p.text), ...check.empty.map(e => `${TIER_LABEL[e.tier]} on ${shortDay(e.date)} has nobody`)];
    fill(problemsBox, any && (lines.length
      ? [h('h3', {}, 'To look at'), h('ul', { class: 'cl-problem-list' }, lines.slice(0, 40).map(t => h('li', {}, t))), lines.length > 40 && h('p', { class: 'small' }, `and ${lines.length - 40} more`)]
      : [h('p', { class: 'small ok' }, 'No rule is broken.')]));
  }
  return { draw };
}
