// Rule levels and priorities, shared by the slot engine (src/slot/) and the grid engine (src/grid/).
//
// A rule's level says what breaking it means:
//   block  never broken by a fill; a hand edit that breaks it is shown as broken (red)
//   warn   a fill breaks it only when there is no other way; shown as a warning (amber), which a maker may accept
//   soft   a preference: each break costs points, by priority
// A rule's priority (1 most important, 3 least) picks the weight band of a soft rule; block and warn rules carry it
// too, to order them in a list.

/** @typedef {'block' | 'warn' | 'soft'} Level */
/** @typedef {1 | 2 | 3} Priority */

/** @type {Level[]} */
export const LEVELS = ['block', 'warn', 'soft'];
/** @type {Priority[]} */
export const PRIORITIES = [1, 2, 3];

// cost of one unit of a broken rule: block and warn sit far above any sum of soft costs, block above warn
export const BLOCK = 1e12;
export const WARN = 1e6;
/** @type {Record<Priority, number>} soft weight bands (also roster-core's 1-100 rule weight) */
export const PRIORITY_WEIGHT = { 1: 100, 2: 30, 3: 10 };

/** @param {unknown} v @returns {Level} */
export const levelOf = v => (v === 'block' || v === 'warn' || v === 'soft' ? v : 'soft');
/** @param {unknown} v @returns {Priority} */
export const priorityOf = v => (v === 1 || v === 3 ? v : v === '1' ? 1 : v === '3' ? 3 : 2);

/**
 * Cost of `units` breaks of a rule.
 * @param {Level} level @param {Priority} priority @param {number} units @param {number} [weight] a soft rule's extra factor
 */
export function costOf(level, priority, units, weight = 1) {
  if (!units) return 0;
  if (level === 'block') return BLOCK * units;
  if (level === 'warn') return WARN * units;
  return PRIORITY_WEIGHT[priority] * weight * units;
}

/** Sort key: block first, then warn, then soft; inside a level priority 1 first. @param {{ level: Level, priority: Priority }} r */
export const rank = r => LEVELS.indexOf(r.level) * 10 + r.priority;

/**
 * A level-and-priority rule as a roster-core (grid) rule: block and warn are hard, soft takes its band's weight.
 * `warn: true` stays on the rule so an app can show it amber.
 * @param {{ level?: Level, priority?: Priority, on?: boolean, words?: string, [k: string]: any }} rule
 */
export function toGridRule(rule) {
  const { level, priority, on, words, ...rest } = rule;
  const lv = levelOf(level), pr = priorityOf(priority);
  return {
    ...rest,
    ...(words ? { name: words } : {}),
    enabled: on !== false,
    hard: lv !== 'soft',
    weight: PRIORITY_WEIGHT[pr],
    ...(lv === 'warn' ? { warn: true } : {}),
  };
}

/**
 * A roster-core (grid) rule with level and priority added (its own fields kept): hard -> block (warn if marked),
 * weight -> the nearest band.
 * @param {{ hard?: boolean, weight?: number, enabled?: boolean, warn?: boolean, [k: string]: any }} rule
 */
export function fromGridRule(rule) {
  const w = Number(rule.weight) || PRIORITY_WEIGHT[2];
  /** @type {Priority} */
  const priority = w >= 65 ? 1 : w >= 20 ? 2 : 3;
  /** @type {Level} */
  const level = rule.hard ? (rule.warn ? 'warn' : 'block') : 'soft';
  return { ...rule, level, priority, on: rule.enabled !== false };
}
