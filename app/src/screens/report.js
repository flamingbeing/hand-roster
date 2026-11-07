// The rule report sheet (from the toast after a Build or Make calls, Week's More and the Calls tab's Report button): first the slots
// nobody can take, named, then each rule in force, broken first, with how many times; a tap on a rule opens where and
// why. A maker can accept a warning (kept on the week or month, so its cell loses its mark) or take an accepted one back.
// Lazy: week-edit.js and calls.js load it on first use.
import { h } from '../dom.js';
import { editSheet } from './sheet.js';

const LEVEL_WORD = { block: 'Must hold', warn: 'Warning', soft: 'Preference' };

/**
 * @param {{ title: string, rows: import('../roster/report.js').ReportRow[], short: { slot: string, text: string }[],
 *   accept?: (key: string, on: boolean) => Promise<boolean> }} o  accept: saves a warning as accepted (on) or not, true when it saved
 */
export function openReport(o) {
  const broken = o.rows.filter(r => r.broken && r.level !== 'soft').length, unmet = o.rows.filter(r => (r.broken && r.level === 'soft') || (!r.broken && r.below)).length;
  const said = [broken ? `${broken} rule${broken === 1 ? '' : 's'} broken` : 'Every must-hold rule and warning holds', unmet && `${unmet} preference${unmet === 1 ? '' : 's'} not fully met`].filter(Boolean).join(', ');
  const node = h('div', { class: 'rp', id: 'rule-report' },
    o.short.length > 0 && h('section', { class: 'rp-short' }, h('h3', {}, "Can't be filled"),
      h('ul', {}, o.short.map(s => h('li', { class: 'rp-short-line', dataset: { slot: s.slot } }, s.text)))),
    h('p', { class: 'small' }, `${said}.${broken || unmet ? ' Tap a rule for where.' : ''}`),
    h('ul', { class: 'rp-rules' }, o.rows.map(r => h('li', {},
      h('details', { class: `rp-rule level-${r.level}${r.broken ? ' is-broken' : ''}`, dataset: { rule: r.id } },
        h('summary', {},
          h('span', { class: 'rp-level' }, LEVEL_WORD[r.level]),
          h('span', { class: 'rp-words' }, r.words),
          h('span', { class: 'rp-count' }, r.broken ? `${r.broken}` : r.below ? `holds, ${r.below} under ideal` : 'holds', r.accepted ? ` (${r.accepted} accepted)` : '')),
        r.hits.length > 0 && h('ul', { class: 'rp-hits' }, r.hits.map(x => hitLine(x, o.accept))))))));
  editSheet().open({
    title: o.title, fields: [], saveLabel: 'Close', body: { node, read: () => ({}) },
    onSave: () => undefined,
  });
}

/** a hit: where and why, and for a warning Accept (or Accepted, to take back) @param {import('../roster/report.js').ReportHit} x @param {(key: string, on: boolean) => Promise<boolean>} [accept] */
function hitLine(x, accept) {
  const li = h('li', { class: `rp-hit${x.accepted ? ' is-accepted' : ''}` }, h('span', {}, x.text));
  if (x.level !== 'warn' || !accept) return li;
  let on = x.accepted;
  const btn = h('button', { type: 'button', class: 'rp-accept', 'aria-pressed': String(on) }, on ? 'Accepted' : 'Accept');
  btn.addEventListener('click', async () => {
    btn.setAttribute('disabled', '');
    if (await accept(x.key, !on)) { on = !on; btn.textContent = on ? 'Accepted' : 'Accept'; btn.setAttribute('aria-pressed', String(on)); li.classList.toggle('is-accepted', on); }
    btn.removeAttribute('disabled');
  });
  li.append(btn);
  return li;
}
