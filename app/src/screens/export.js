// Everything that takes the roster out of the app, loaded only when one of its buttons is used (Week and Calls import it
// on demand): the print sheet of the week, the xlsx files (ExcelJS is vendored in public/vendor/exceljs and loaded here
// the first time, never at startup), and the chat text to paste into WhatsApp. The cells come from roster/layout.js, the same
// ones for the sheet, the print and the text.
import { h, fill } from '../dom.js';
import { weekLayout, handSections, callsLayout } from '../roster/layout.js';
import { buildWeekWorkbook, buildCallsWorkbook } from '../roster/xlsx.js';
import { whatsappText } from '../roster/whatsapp.js';

/** @typedef {import('../roster/layout.js').WeekLayoutInput} WeekLayoutInput */
export { whatsappText };

export const EXCEL_SRC = './vendor/exceljs/4.4.0/exceljs.min.js';
/** @type {Promise<any> | null} */
let excel = null;
/** @returns {Promise<any>} the ExcelJS library, fetched on first use */
export function loadExcel() {
  const g = /** @type {any} */ (globalThis);
  if (g.ExcelJS) return Promise.resolve(g.ExcelJS);
  excel ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXCEL_SRC;
    s.onload = () => (g.ExcelJS ? resolve(g.ExcelJS) : reject(new Error('The spreadsheet library did not start.')));
    s.onerror = () => { excel = null; s.remove(); reject(new Error('The spreadsheet library did not load (offline?).')); };
    document.head.append(s);
  });
  return excel;
}

/** @param {any} wb  a built workbook @param {string} filename */
async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** @param {string} s @returns {string} a safe file name part */
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** @param {WeekLayoutInput} o the week's inputs @returns {Promise<string>} the file name */
export async function exportWeek(o) {
  const ExcelJS = await loadExcel();
  const layout = weekLayout({ ...o, style: 'core' });
  const name = `hrm-roster-${o.monday}.xlsx`;
  await saveWorkbook(buildWeekWorkbook(ExcelJS, layout), name);
  return name;
}

/** @param {Parameters<typeof callsLayout>[0]} o @returns {Promise<string>} the file name */
export async function exportCalls(o) {
  const ExcelJS = await loadExcel();
  const cl = callsLayout(o);
  const name = `hrm-calls-${slug(o.month)}.xlsx`;
  await saveWorkbook(buildCallsWorkbook(ExcelJS, cl), name);
  return name;
}

/**
 * Draws the week as the hand-made grid (title, then a row each for AM sessions, PM sessions, on call, leave, post-call and
 * free, a column a day) into `host`. The page shows it only when printing.
 * @param {HTMLElement} host @param {WeekLayoutInput} o
 */
export function renderPrint(host, o) {
  const layout = weekLayout({ ...o, style: 'hand' });
  const rows = handSections(layout);
  fill(host, h('h2', { class: 'pr-title' }, layout.title),
    h('table', { class: 'pr-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), layout.dayHeads.map(d => h('th', { scope: 'col' }, d)))),
      h('tbody', {}, rows.map(r => h('tr', { class: `pr-${r.section.toLowerCase().replace(/[^a-z]+/g, '-')}` },
        h('th', { scope: 'row' }, r.title),
        r.cells.map(lines => h('td', {}, lines.map(l => h('div', { class: `pr-line pr-${l.k}` }, l.t)))))))));
  host.classList.add('is-ready');
}

/** @param {string} text @returns {Promise<boolean>} copied to the clipboard */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back to a selection copy */ }
  const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', { 'aria-hidden': 'true', class: 'pr-copy' }));
  ta.value = text;
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
