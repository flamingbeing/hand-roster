// A search hit's passage: the first place a record's text has one of the searched words, about two lines of it, split
// so the page can mark the word. Pure (no DOM; tested in app/test/snippet.unit.test.mjs). Feed it the terms from
// search.terms(q, field), so a leave-out or a filter is never marked.

/** Markdown as plain lines: heading, list, quote and task marks, link targets and blank lines left out
 * @param {string} text */
export function plainLines(text) {
  return String(text || '').split('\n').map(l => l
    .replace(/^\s*(?:#{1,6}|[-*+>]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()).filter(Boolean);
}

const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} text  the field's text
 * @param {{ text: string, phrase: boolean }[]} terms  the searched words: a word matches where a word starts, a phrase anywhere
 * @param {{ room?: number, markdown?: boolean }} [opts]  room: about how many characters show (two lines of a phone's
 *   row); markdown: read the text as Markdown, its marks left out
 * @returns {{ before: string, match: string, after: string } | null}  null: no searched word is in the text
 */
export function snippetOf(text, terms, { room = 110, markdown = false } = {}) {
  const flat = markdown ? plainLines(text).join(' ') : String(text || '').replace(/\s+/g, ' ').trim();
  // the first place any searched word starts a word (a phrase: anywhere)
  let at = -1, len = 0;
  for (const t of terms) {
    const w = String(t.text || '').trim();
    if (!w) continue;
    const m = new RegExp(t.phrase ? esc(w) : `(?<![\\p{L}\\p{N}])${esc(w)}[\\p{L}\\p{N}]*`, 'iu').exec(flat);
    if (m && (at < 0 || m.index < at)) { at = m.index; len = m[0].length; }
  }
  if (at < 0) return null;
  // a little before the word (from where a word starts), the rest after it
  let from = Math.max(0, at - Math.round(room / 3));
  if (from > 0) { const sp = flat.indexOf(' ', from); from = sp >= 0 && sp < at ? sp + 1 : at; }
  let to = Math.min(flat.length, from + Math.max(room, len + 10));
  if (to < flat.length) { const sp = flat.lastIndexOf(' ', to); if (sp > at + len) to = sp; }
  return {
    before: (from > 0 ? '…' : '') + flat.slice(from, at),
    match: flat.slice(at, at + len),
    after: flat.slice(at + len, to) + (to < flat.length ? '…' : ''),
  };
}
