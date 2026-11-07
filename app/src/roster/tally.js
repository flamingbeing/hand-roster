// Fairness tallies: per person over a month or a range, what each has carried (calls by tier, weekend and public-holiday
// calls, list sessions, EOT lists) and one weighted score, so the maker can see who has had more than their share.
// Weights are the maker's (spaces/_/layouts/tally); the defaults make a call count 1, a weekend call 2, a list 0.2 and an
// EOT list a further 0.5. Pure: the Fairness sheet and the calls Excel both read it.
import { TIERS, TIER_LABEL, dayType } from './model.js';
import { addDays, mondayOf } from './dates.js';

/** @typedef {import('./model.js').Tier} Tier */
/** @typedef {{ name: string, tiers: Record<string, number>, calls: number, weekend: number, lists: number, eot: number, score: number }} TallyRow */

/** what a weight can be set on, with its words */
export const WEIGHT_KEYS = /** @type {[string, string][]} */ ([
  ...TIERS.map(t => /** @type {[string, string]} */ ([t, `${TIER_LABEL[t]} call`])),
  ['weekend', 'Weekend or holiday call (added to its tier)'], ['lists', 'List session'], ['eot', 'EOT list (added to a list session)'],
]);
export const DEFAULT_WEIGHTS = /** @type {Record<string, number>} */ ({ con: 1, reg: 1, reg2: 1, moNuh: 1, moNtf: 1, weekend: 1, lists: 0.2, eot: 0.5 });

/** @param {any} saved the saved `tally` record @returns {Record<string, number>} a weight for every key (0-20, else the default) */
export function weightsOf(saved) {
  const w = saved?.weights && typeof saved.weights === 'object' ? saved.weights : {};
  return Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, d]) => [k, typeof w[k] === 'number' && w[k] >= 0 && w[k] <= 20 ? w[k] : d]));
}

/**
 * @param {{ calls?: import('./model.js').CallDay[], weeks?: { id?: string, grid?: import('./grid.js').GridRow[], lists?: { id: string, emergency?: boolean }[] }[],
 *   from: string, to: string, holidays?: string[], weights?: Record<string, number> }} o  from/to: first and last day (YYYY-MM-DD)
 * @returns {TallyRow[]} most carried first
 */
export function tallyOf({ calls = [], weeks = [], from, to, holidays = [], weights = DEFAULT_WEIGHTS }) {
  /** @type {Map<string, TallyRow>} */
  const by = new Map();
  const row = (/** @type {string} */ name) => {
    let r = by.get(name);
    if (!r) by.set(name, r = { name, tiers: {}, calls: 0, weekend: 0, lists: 0, eot: 0, score: 0 });
    return r;
  };
  const inside = (/** @type {string} */ d) => d >= from && d <= to;
  for (const c of calls) {
    if (!inside(c.date)) continue;
    const off = dayType(c.date, holidays) !== 'weekday';
    for (const t of TIERS) {
      const name = /** @type {any} */ (c)[t];
      if (typeof name !== 'string' || !name) continue;
      const r = row(name);
      r.tiers[t] = (r.tiers[t] ?? 0) + 1; r.calls++;
      r.score += weights[t] ?? 0;
      if (off) { r.weekend++; r.score += weights.weekend ?? 0; }
    }
  }
  for (const w of weeks) {
    const emergency = new Set((w.lists ?? []).filter(l => l.emergency).map(l => l.id));
    for (const g of w.grid ?? []) {
      if (!inside(g.day)) continue;
      for (const name of g.juniors) {
        const r = row(name);
        r.lists++; r.score += weights.lists ?? 0;
        if (emergency.has(g.list)) { r.eot++; r.score += weights.eot ?? 0; }
      }
    }
  }
  for (const r of by.values()) r.score = Math.round(r.score * 100) / 100;
  return [...by.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** @param {string} from @param {string} to @returns {string[]} the Mondays of every week that touches the range */
export function mondaysIn(from, to) {
  /** @type {string[]} */
  const out = [];
  for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/**
 * The tally as a table for the calls Excel: a head and a row each, tiers shown only when someone has one.
 * @param {TallyRow[]} rows @param {(t: Tier) => string} [tierName] @returns {{ head: string[], rows: (string | number)[][] }}
 */
export function tallyTable(rows, tierName = t => TIER_LABEL[t]) {
  const tiers = TIERS.filter(t => rows.some(r => r.tiers[t]));
  return {
    head: ['Name', ...tiers.map(tierName), 'Weekend/PH', 'Lists', 'EOT', 'Score'],
    rows: rows.map(r => [r.name, ...tiers.map(t => r.tiers[t] ?? 0), r.weekend, r.lists, r.eot, r.score]),
  };
}
