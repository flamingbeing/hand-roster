// "Who could go here?" on the cell sheet: every junior ranked for one place on the week's grid (a list, a day, a session),
// by what putting them there does to app-roster's score of the whole week. Someone free takes the place (the person there
// now goes free); someone on another list that session swaps with them, so neither list is left short by it. Each
// option says the worst rule it breaks or costs (block: can't; warn; soft: costs), and whether it still holds.
// Pure: the screen passes in the package's score (@core/roster) and the week's problem (problem.js weekProblem).
import { listOf } from './grid.js';
import { applyEdit } from './week-edits.js';

/** @typedef {import('./grid.js').GridRow} GridRow */
/** @typedef {import('./report.js').Hit} Hit */
/** @typedef {import('./week-edits.js').GridEdit} GridEdit */
/**
 * @typedef {object} Option
 * @property {string} person
 * @property {string | null} from  the list they are on that session now (null: free)
 * @property {boolean} ok  breaks no must-hold rule the week did not break already
 * @property {Hit['level'] | null} level  the worst rule it newly breaks or costs (null: none)
 * @property {string[]} rules  those rules' ids, worst first (at most 3)
 * @property {number} delta  the week's cost after minus before (lower is better)
 * @property {GridEdit} edit  the grid edit that does it
 */

const RANK = { block: 0, warn: 1, soft: 2 };
/** @param {Hit} h */
const keyOf = h => `${h.rule}|${h.slot ?? ''}|${h.person ?? ''}|${h.why}`;

/**
 * @param {{ score: (problem: any, roster: Record<string, string[]>) => { cost: number, hits: Hit[] }, problem: { slots: Record<string, any>[] },
 *   grid: GridRow[], day: string, session: 'AM' | 'PM', list: string, name?: string, people: string[] }} o
 *   name: the person there now (none: an open seat); people: who to rank (juniors)
 * @returns {Option[]} ok first, then by cost
 */
export function whoCould(o) {
  const ids = new Set(o.problem.slots.map(s => s.id));
  /** @param {GridRow[]} rows */
  const rosterOf = rows => {
    /** @type {Record<string, string[]>} */
    const r = {};
    for (const g of rows) if (ids.has(g.list)) r[g.list] = [...g.juniors];
    return r;
  };
  const before = o.score(o.problem, rosterOf(o.grid));
  /** @type {Map<string, number>} */
  const had = new Map();
  for (const h of before.hits) had.set(keyOf(h), (had.get(keyOf(h)) ?? 0) + 1);
  const here = o.grid.find(r => r.day === o.day && r.session === o.session && r.list === o.list)?.juniors ?? [];
  /** @type {Option[]} */
  const out = [];
  for (const person of o.people) {
    if (here.includes(person)) continue;
    const from = listOf(o.grid, o.day, o.session, person);
    /** @type {GridEdit} */
    const edit = o.name ? { kind: 'move', day: o.day, session: o.session, name: person, to: o.list, swapWith: o.name }
      : { kind: 'move', day: o.day, session: o.session, name: person, to: o.list };
    const after = o.score(o.problem, rosterOf(applyEdit(o.grid, edit)));
    const left = new Map(had);
    /** @type {Hit[]} */
    const added = [];
    for (const h of after.hits) {
      const n = left.get(keyOf(h)) ?? 0;
      if (n > 0) left.set(keyOf(h), n - 1); else added.push(h);
    }
    added.sort((a, b) => RANK[a.level] - RANK[b.level] || (b.cost ?? 0) - (a.cost ?? 0));
    out.push({
      person, from, ok: !added.some(h => h.level === 'block'), level: added[0]?.level ?? null,
      rules: [...new Set(added.map(h => h.rule))].slice(0, 3), delta: after.cost - before.cost, edit,
    });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || a.delta - b.delta || a.person.localeCompare(b.person));
}
