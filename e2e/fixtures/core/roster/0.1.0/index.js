// app-roster: a rostering engine for web apps. Pure ES modules, no DOM, no database.
//
// This entry is the slot engine (src/slot/): slots that need N people, rules as data with a level (block, warn,
// soft) and a priority (1-3), one score for filled and hand-edited rosters, a check before a fill, ranked candidates
// for a slot, and a fill that keeps pins and changes as little as it can. The person x day grid engine of the
// monthly roster apps is its own entry, grid.js (README "Two models").
export const VERSION = '0.1.0';

export { score, check, candidates, fill, prng } from './src/slot/engine.js';
export { RULE_TYPES, newRule, normalizeRule, describeRule, validateRule, slotWords, whoWords } from './src/slot/rules.js';
export { stateOf, rosterOf, dayNumber, weekdayOf, addDays, minOf } from './src/slot/model.js';
export { LEVELS, PRIORITIES, PRIORITY_WEIGHT, BLOCK, WARN, costOf, levelOf, priorityOf, rank } from './src/levels.js';
