// The Short panel's choices: for a list below its minimum, the ways to stretch the people there are, each with what it
// costs, cheapest first: someone free that session; someone moved off a list that has more than it must (an emergency
// slot's MO first, the lowest priority, then a list's extra junior); running with the juniors it has; closing it. An
// emergency slot below its minimum needs a registrar, so only registrars are offered for it. Pure.
import { minOf } from './settle.js';
import { juniorsOn } from './grid.js';

/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./sections.js').Gap} Gap */
/** @typedef {import('./sections.js').FreeEntry} FreeEntry */
/**
 * @typedef {{ kind: 'add', name: string, text: string, cost: string }
 *   | { kind: 'move', name: string, from: string, text: string, cost: string }
 *   | { kind: 'fewer', min: number, text: string, cost: string }
 *   | { kind: 'close', text: string, cost: string }} ShortOption
 */

/** @param {ListSlot} l @returns {string} 'KRWOT 3 (Dr A)' */
export const listName = l => `${l.name}${l.consultant ? ` (${l.consultant})` : ''}`;

/**
 * @param {{ gap: Gap, lists: ListSlot[], grid: import('./grid.js').GridRow[], people: Person[], free: FreeEntry[] }} o
 *   free: that day's free entries (sectionsOf)
 * @returns {ShortOption[]}
 */
export function shortOptions({ gap, lists, grid, people, free }) {
  const list = lists.find(l => l.id === gap.list);
  if (!list) return [];
  const grade = new Map(people.map(p => [p.name, p.grade]));
  // an emergency slot without its registrar takes a registrar only
  const needsReg = !!list.emergency && !juniorsOn(grid, gap.day, gap.session, list.id).some(n => grade.get(n) === 'reg');
  const fits = (/** @type {string} */ n) => !needsReg || grade.get(n) === 'reg';
  /** @type {ShortOption[]} */
  const out = [];

  for (const f of free) {
    if (f.why || (f.when !== 'FULL DAY' && f.when !== gap.session) || !fits(f.name)) continue;
    out.push({ kind: 'add', name: f.name, text: `Add ${f.name}`, cost: 'free that session' });
    if (out.length >= 2) break;
  }

  /** @type {{ o: ShortOption, rank: number }[]} */
  const moves = [];
  for (const l of lists) {
    if (l.id === list.id || l.day !== gap.day || l.session !== gap.session || l.status !== 'open') continue;
    const on = juniorsOn(grid, l.day, l.session, l.id);
    const spare = on.length - minOf(l);
    if (spare <= 0) continue;
    // from an emergency slot only its MO: it keeps the registrar who leads it
    const regs = on.filter(n => grade.get(n) === 'reg');
    const movable = l.emergency ? on.filter(n => grade.get(n) !== 'reg' || regs.length > 1) : on;
    for (const n of movable.filter(fits)) {
      const cost = l.emergency ? `the emergency slot ${listName(l)} loses its MO` : `${listName(l)} drops to ${on.length - 1} of the ${l.need} it wants`;
      moves.push({ o: { kind: 'move', name: n, from: l.id, text: `Move ${n} from ${l.name}`, cost }, rank: l.emergency ? 0 : 1 });
    }
  }
  moves.sort((a, b) => a.rank - b.rank);
  out.push(...moves.slice(0, 3).map(m => m.o));

  const got = juniorsOn(grid, gap.day, gap.session, list.id).length;
  out.push({ kind: 'fewer', min: got, text: got ? `Run with ${got}` : 'Run with no junior',
    cost: `${got} junior${got === 1 ? '' : 's'} instead of ${gap.min}, this week only` });
  out.push({ kind: 'close', text: 'Close it', cost: list.emergency ? 'no emergency slot that session' : list.kind === 'ot' || list.kind === 'msp' ? 'its cases move to another day' : 'its patients are rebooked' });
  return out;
}
