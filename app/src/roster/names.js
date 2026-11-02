// Matches a name typed or pasted ("Dr Alpha", "alpha pek") to a person in the roster. Pure.

/** @param {string} s @returns {string} lower case, "Dr" and dots dropped, one space between words */
const norm = s => s.toLowerCase().replace(/\b(dr|prof|a\/prof)\b\.?/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The one person the text names: an exact name first, then a name that starts with it, then one that has all its words.
 * null when none or more than one fit (never a guess between two).
 * @param {string} raw @param {{ name: string }[]} people @returns {string | null}
 */
export function matchName(raw, people) {
  const want = norm(raw);
  if (!want) return null;
  const all = people.map(p => ({ name: p.name, n: norm(p.name) }));
  const exact = all.filter(p => p.n === want);
  if (exact.length === 1) return exact[0].name;
  if (exact.length > 1) return null;
  const starts = all.filter(p => p.n.startsWith(want) || want.startsWith(p.n));
  if (starts.length === 1) return starts[0].name;
  if (starts.length > 1) return null;
  const words = want.split(' ');
  const has = all.filter(p => words.every(w => p.n.split(' ').includes(w)));
  return has.length === 1 ? has[0].name : null;
}
