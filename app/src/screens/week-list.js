// A list's changes for one week on the Week tab, apart from week.js so the first screen loads less. Loaded on first use.
import { shortDay } from '../roster/dates.js';
import { minOf, shutBy } from '../roster/model.js';
import { listChange } from '../roster/week-edits.js';
import { STATUSES } from '../data/lists.js';

/**
 * A list's changes for this week only (consultants, patients, juniors needed, status): kept in the week's `overrides`, so
 * the Lists tab keeps the usual pattern; "Back to the usual" drops them. The sheet shows the list unsettled (`l`) and only
 * says why it is closed or an emergency slot this week (`settled`): a holiday or leave is never saved into the week, so
 * the list opens again once it goes (7 Nov 2026). Only the fields typed differently are saved (listChange).
 * @template M
 * @param {{ m: M & { people: { name: string, grade: string, rank?: string }[], wk?: import('../data/plans.js').WeekRow }, l: import('../roster/model.js').ListSlot,
 *   settled?: import('../roster/model.js').ListSlot, sheet: ReturnType<typeof import('./sheet.js').editSheet>,
 *   saveOverrides: (changes: [string, Partial<import('../data/lists.js').Override> | null][]) => Promise<void> }} o  l: the list
 *   unsettled; settled: as drawn this week; saveOverrides: laid over the week's changes as they are when saved
 */
export function weekListSheet({ m, l, settled = l, sheet, saveOverrides }) {
  const cons = m.people.filter(p => p.grade === 'con' || p.rank === 'AC').map(p => p.name).sort();   // an AC can run a list
  const had = (m.wk?.overrides ?? []).some(o => o.id === l.id);
  const state = weekState(l, settled);
  sheet.open({
    title: `${l.name}, this week`, saveLabel: 'Save',
    note: `${l.site}, ${shortDay(l.day)} ${l.session === 'AM' ? 'morning' : 'afternoon'}.${state ? ` ${state}` : ''} For this week only; the Lists tab keeps the usual.`,
    values: { consultant: l.consultant ?? '', consultant2: l.consultant2 ?? '', consultant3: l.consultant3 ?? '', patients: l.patients ?? null, need: l.need, min: minOf(l), status: l.status, away: !!l.away },
    fields: [
      { key: 'consultant', label: 'Consultant', type: 'select',
        options: [['', 'Nobody'], ...(l.consultant && !cons.includes(l.consultant) ? [l.consultant, ...cons] : cons).map(n => /** @type {[string, string]} */ ([n, n]))] },
      { key: 'consultant2', label: 'Shared with', type: 'select', hint: 'It runs while any of them is in.',
        options: v => [['', 'Nobody'], ...(l.consultant2 && !cons.includes(l.consultant2) ? [l.consultant2, ...cons] : cons).filter(n => n !== v.consultant).map(n => /** @type {[string, string]} */ ([n, n]))] },
      { key: 'consultant3', label: 'And', type: 'select',
        options: v => [['', 'Nobody'], ...(l.consultant3 && !cons.includes(l.consultant3) ? [l.consultant3, ...cons] : cons).filter(n => n !== v.consultant && n !== v.consultant2).map(n => /** @type {[string, string]} */ ([n, n]))] },
      { key: 'patients', label: 'Patients', type: 'number', min: 0, max: 200, hint: 'Shown on the print and the hand grid as "(21 pts)". Leave empty when not known.' },
      { key: 'need', label: 'Juniors wanted', type: 'number', min: 0, max: 10 },
      { key: 'min', label: 'At least', type: 'number', min: 0, max: 10, hint: 'It cannot run with fewer. Every list gets its minimum before any list gets more.' },
      { key: 'status', label: 'Status', type: 'select', options: STATUSES },
      { key: 'away', label: 'Consultant away (clinics close; an OT list becomes an emergency slot)', type: 'check' },
    ],
    onSave: v => { const c = listChange(l, v); return Object.keys(c).length ? saveOverrides([[l.id, c]]) : undefined; },
    ...(had ? { deleteLabel: 'Back to the usual', onDelete: () => saveOverrides([[l.id, null]]) } : {}),
  });
}

/**
 * What this week does to a list on its own, in words ('' when nothing): closed by a holiday, leave, away or no patients,
 * or an emergency slot. A status the week set is in the Status field already.
 * @param {import('../roster/model.js').ListSlot} l  unsettled @param {import('../roster/model.js').ListSlot} s  settled
 */
function weekState(l, s) {
  if (l.status !== 'open') return '';
  if (s.status !== 'open') return `Closed this week: ${shutBy(s)}.`;
  if (s.emergency) return `An emergency slot this week: ${s.away ? 'consultant away' : 'consultant on leave'}.`;
  if (s.patients === 0 && !s.external) return 'No juniors wanted this week: no patients.';
  return '';
}
