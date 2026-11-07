// The rule check of a week or a month, from app-roster's score and check (@core/roster) of problem.js's problem: the marks
// on the cells (a person on a list or a call that breaks a block rule is red, a warn rule amber), the rule-by-rule report
// (broken first, each with where and why) and the slots nobody can take. A warning can be accepted: its key is kept on the
// week or month (`accepted`), and an accepted warning shows no mark and is not counted as broken (the report still lists it).
// Pure: the screens pass in the package's results.

/** @typedef {{ rule: string, level: 'block' | 'warn' | 'soft', units: number, why: string, slot?: string, person?: string, day?: string, cost?: number }} Hit */
/** @typedef {{ id: string, type: string, words: string, level: Hit['level'], priority: number, on: boolean, ok: boolean, n: number, cost: number, hits: Hit[] }} RuleResult */
/** @typedef {{ level: 'block' | 'warn', why: string[] }} Mark */
/** @typedef {{ key: string, level: Hit['level'], text: string, accepted: boolean }} ReportHit */
/** @typedef {{ id: string, words: string, level: Hit['level'], on: boolean, broken: number, accepted: number, hits: ReportHit[] }} ReportRow */

/** a hit's key, as `accepted` keeps it @param {Hit} h */
export const hitKey = h => `${h.rule}|${h.slot ?? ''}|${h.person ?? ''}`.slice(0, 160);

/** ISO days in a package message as "Mon 9 Nov" @param {string} text @param {(day: string) => string} dayName */
export const readable = (text, dayName) => text.replace(/\d{4}-\d{2}-\d{2}/g, dayName);

/**
 * The marks: a person in a slot (key `slot|person`) and a slot as a whole (a list short of people, say), worst level first.
 * Soft hits and accepted warnings make none.
 * @param {{ hits: Hit[] }} score @param {string[]} [accepted]
 * @returns {{ cells: Map<string, Mark>, slots: Map<string, Mark> }}
 */
export function marksOf(score, accepted = []) {
  const ok = new Set(accepted), cells = new Map(), slots = new Map();
  for (const h of score.hits) {
    if (h.level === 'soft' || !h.slot || (h.level === 'warn' && ok.has(hitKey(h)))) continue;
    const map = h.person ? cells : slots, key = h.person ? `${h.slot}|${h.person}` : h.slot;
    const m = map.get(key);
    if (!m) map.set(key, { level: h.level, why: [h.why] });
    else { if (h.level === 'block') m.level = 'block'; if (!m.why.includes(h.why)) m.why.push(h.why); }
  }
  return { cells, slots };
}

/**
 * The report's rows: every rule in force, broken first (block, then warn, then soft), then those that hold; a rule's hits
 * with where and why. A warning accepted counts apart from the broken ones.
 * @param {{ rules: RuleResult[] }} score @param {{ words: (id: string, fallback: string) => string, dayName: (day: string) => string, accepted?: string[] }} o
 * @returns {ReportRow[]}
 */
export function reportOf(score, o) {
  const ok = new Set(o.accepted ?? []);
  const LEVEL = { block: 0, warn: 1, soft: 2 };
  const rows = score.rules.filter(r => r.on).map(r => {
    const hits = r.hits.filter(h => r.type !== 'balance' || h.units >= 1).map(h => {
      const key = hitKey(h);
      return { key, level: h.level, text: readable(h.why, o.dayName), accepted: h.level === 'warn' && ok.has(key) };
    });
    const accepted = hits.filter(h => h.accepted).length;
    return { id: r.id, words: o.words(r.id, r.words), level: r.level, on: r.on, broken: hits.length - accepted, accepted, hits };
  });
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => Number(!a.r.broken) - Number(!b.r.broken) || LEVEL[a.r.level] - LEVEL[b.r.level] || a.i - b.i).map(x => x.r);
}

/**
 * The slots nobody can take, as lines (never dropped: each is named, with the rules that keep people out).
 * @param {{ slot: string, day: string, min: number, got: number, can: number, why: { rule: string, words: string, people: number }[] }[]} short
 * @param {(slot: string) => string} place  a slot's name for people ("Mon 9 Nov AM NUH KRWOT 3")
 * @param {(id: string, fallback: string) => string} words
 * @returns {{ slot: string, place: string, text: string }[]}
 */
export function shortLines(short, place, words) {
  return short.map(s => {
    const n = s.min - s.got;
    const who = s.can ? `only ${s.can} can take it, it needs ${n}` : 'nobody can take it';
    const why = s.why.slice(0, 3).map(w => `${words(w.rule, w.words)} (${w.people})`).join('; ');
    const at = place(s.slot);
    return { slot: s.slot, place: at, text: `${at}: ${who}${why ? `. Kept out by: ${why}` : ''}` };
  });
}

/**
 * The words a build's toast says about the check: how many rules break and the slots nobody can take (named, the first two).
 * @param {ReportRow[]} rows @param {{ place: string }[]} short
 */
export function checkSaid(rows, short) {
  const block = rows.filter(r => r.broken && r.level === 'block').length, warn = rows.filter(r => r.broken && r.level === 'warn').length;
  const names = short.slice(0, 2).map(s => s.place).join(', ');
  return [
    short.length && `Can't be filled: ${names}${short.length > 2 ? ` and ${short.length - 2} more` : ''}.`,
    block && `${block} rule${block === 1 ? '' : 's'} broken.`,
    warn && `${warn} warning${warn === 1 ? '' : 's'}.`,
  ].filter(Boolean).join(' ');
}
