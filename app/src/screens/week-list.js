// A list's changes for one week on the Week tab, apart from week.js so the first screen loads less. Loaded on first use.
import { shortDay } from '../roster/dates.js';
import { coOf, minOf } from '../roster/model.js';
import { STATUSES } from '../data/lists.js';

/**
 * A list's changes for this week only (consultants, patients, juniors needed, status): kept in the week's `overrides`, so
 * the Lists tab keeps the usual pattern; "Back to the usual" drops them.
 * @template M
 * @param {{ m: M & { people: { name: string, grade: string, rank?: string }[], wk?: import('../data/plans.js').WeekRow }, l: import('../roster/model.js').ListSlot,
 *   sheet: ReturnType<typeof import('./sheet.js').editSheet>,
 *   saveOverrides: (m: M, changes: [string, Partial<import('../data/lists.js').Override> | null][]) => Promise<void> }} o
 */
export function weekListSheet({ m, l, sheet, saveOverrides }) {
  const cons = m.people.filter(p => p.grade === 'con' || p.rank === 'AC').map(p => p.name).sort();   // an AC can run a list
  const had = (m.wk?.overrides ?? []).some(o => o.id === l.id);
  sheet.open({
    title: `${l.name}, this week`, saveLabel: 'Save',
    note: `${l.site}, ${shortDay(l.day)} ${l.session === 'AM' ? 'morning' : 'afternoon'}. For this week only; the Lists tab keeps the usual.`,
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
    // (an emergency slot's need and minimum are the rule's: kept out of the change unless typed differently)
    onSave: v => saveOverrides(m, [[l.id, { consultant: v.consultant || null,
      // (a sharer is written only when it changes, so the Lists tab's stays the usual)
      ...((([c2, c3]) => ({ consultant2: c2 ?? ((l.consultant2 ?? null) === null ? undefined : null), consultant3: c3 ?? ((l.consultant3 ?? null) === null ? undefined : null) }))(coOf(v.consultant, v.consultant2, v.consultant3))), patients: v.patients, status: v.status, away: v.away,
      need: l.emergency && v.need === l.need ? undefined : v.need ?? l.need,
      min: v.min == null || v.min === minOf(l) ? had ? m.wk?.overrides?.find(o => o.id === l.id)?.min : undefined : v.min }]]),
    ...(had ? { deleteLabel: 'Back to the usual', onDelete: () => saveOverrides(m, [[l.id, null]]) } : {}),
  });
}
