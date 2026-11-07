// What the Short panel offers for a list below its minimum (Week, roster maker only): add someone free, move someone from a
// list with a junior to spare, run with fewer, or close it. Apart from sections.js so it loads with the maker's edits
// (screens/week-edit.js), not at startup (7 Nov 2026). Pure.
import { canWork, leads, minOf, regLed } from './model.js';
import { juniorsOn } from './grid.js';
import { listName } from './sections.js';

/** @typedef {import('./model.js').Person} Person */
/** @typedef {import('./model.js').ListSlot} ListSlot */
/** @typedef {import('./sections.js').FreeEntry} FreeEntry */
/** @typedef {import('./sections.js').Gap} Gap */

/**
 * @typedef {{ kind: 'add', name: string, text: string, cost: string }
 *   | { kind: 'move', name: string, from: string, text: string, cost: string }
 *   | { kind: 'fewer', min: number, text: string, cost: string }
 *   | { kind: 'close', text: string, cost: string }} ShortOption
 */

/**
 * @param {{ gap: Gap, lists: ListSlot[], grid: import('./grid.js').GridRow[], people: Person[], free: FreeEntry[] }} o
 *   free: that day's free entries (sectionsOf)
 * @returns {ShortOption[]}
 */
export function shortOptions({ gap, lists, grid, people, free }) {
  const list = lists.find(l => l.id === gap.list);
  if (!list) return [];
  const grade = new Map(people.map(p => [p.name, p.grade]));
  const who = new Map(people.map(p => [p.name, p]));
  // a list without the lead it must have (a registrar; a HOT clinic also an R3) takes only someone who can lead it
  const needsReg = regLed(list) && !juniorsOn(grid, gap.day, gap.session, list.id).some(n => leads(list, who.get(n)));
  const fits = (/** @type {string} */ n) => { const p = who.get(n); return !!p && (!needsReg || leads(list, p)) && canWork(p, list); };
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
    // from an MSP list or emergency slot only an MO: it keeps its registrar
    const regs = on.filter(n => leads(l, who.get(n)));
    const movable = regLed(l) ? on.filter(n => !leads(l, who.get(n)) || regs.length > 1) : on;
    for (const n of movable.filter(fits)) {
      const cost = l.emergency ? `the emergency slot ${listName(l)} loses ${grade.get(n) === 'reg' ? 'a registrar' : 'its MO'}` : `${listName(l)} drops to ${on.length - 1} of the ${l.need} it wants`;
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
