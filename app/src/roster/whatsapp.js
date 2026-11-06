// The chat text of one day's roster, or of the week's five days ("Copy ... for WhatsApp"): plain lines, no markup, short
// enough to read on a phone. Made from the same blocks as the sheet and the print (layout.js), so the three always agree. Pure.
import { addDays, weekdayName } from './dates.js';
import { longDay, weekLayout } from './layout.js';

/** @typedef {import('./layout.js').WeekLayoutInput} WeekLayoutInput */

/**
 * @param {string} day  a Monday to Sunday date; the week around it is `o.monday`
 * @param {Omit<WeekLayoutInput, 'style'>} o  the week's inputs
 * @returns {string}
 */
export function whatsappText(day, o) {
  const layout = weekLayout({ ...o, style: 'core' });
  const i = layout.days.indexOf(day);
  if (i < 0) return '';
  /** @type {string[]} */
  const out = [`HRM roster, ${longDay(day)}${(o.holidays ?? []).includes(day) ? ' (public holiday)' : ''}`];
  const weekend = ['Sat', 'Sun'].includes(weekdayName(day));
  /** @param {string} section @returns {import('./layout.js').Block[]} */
  const of = section => layout.blocks.filter(b => b.section === section);

  for (const [section, title] of [['MORNING SESSION', 'MORNING'], ['AFTERNOON SESSION', 'AFTERNOON']]) {
    const blocks = of(section).filter(b => b.lines[i].length);
    if (!blocks.length) continue;
    out.push('', title);
    for (const b of blocks) {
      out.push(b.label);
      /** @type {string[]} */
      let names = [];
      let last = '';
      const flush = () => { if (last) out.push(names.length ? `${last}: ${names.join(', ')}` : last); last = ''; names = []; };
      for (const ln of b.lines[i]) {
        if (ln.k === 'name') names.push(ln.t);
        else { flush(); last = ln.short ?? ln.t; }
      }
      flush();
    }
  }
  if (weekend && !out.some(l => l === 'MORNING' || l === 'AFTERNOON')) out.push('', 'No lists at the weekend.');

  const calls = of('ON-CALL').map(b => [b.label, b.lines[i][0]?.t ?? '']).filter(([, n]) => n && n !== '–');
  if (calls.length) out.push('', 'ON CALL', ...calls.map(([t, n]) => `${t}: ${n}`));
  for (const [section, title] of [['LEAVE', 'LEAVE'], ['POST-CALL', 'POST-CALL'], ['FREE', 'FREE']]) {
    const names = of(section).flatMap(b => b.lines[i].map(l => l.t));
    if (names.length) out.push('', `${title}: ${names.join(', ')}`);
  }
  return out.join('\n');
}

/** the line between two days in the week's text (plain: no WhatsApp markup) */
export const DAY_SEPARATOR = '----------';

/**
 * The week's chat text: Monday to Friday, each day as whatsappText gives it, a blank line and a separator line between
 * them; a day with no text (one outside the week) is left out.
 * @param {Omit<WeekLayoutInput, 'style'>} o  the week's inputs (`o.monday`)
 * @param {string[]} [days]  the days to take (default: Monday to Friday of `o.monday`'s week)
 * @returns {string}
 */
export function weekText(o, days = [0, 1, 2, 3, 4].map(i => addDays(o.monday, i))) {
  return days.map(d => whatsappText(d, o)).filter(Boolean).join(`\n\n${DAY_SEPARATOR}\n\n`);
}
