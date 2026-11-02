// The workbooks: a week in the CORE sheet's layout and a month of calls. ExcelJS is handed in (it is loaded only when an
// export is asked for, from public/vendor/exceljs), so this file stays importable by node and by the page alike. The
// cells come from layout.js; this file only gives them a look. Colours are by kind, never by person.
import { coreRows } from './layout.js';

/** @typedef {import('./layout.js').WeekLayout} WeekLayout */
/** @typedef {import('./layout.js').CallsLayout} CallsLayout */
/** @typedef {any} ExcelJS */

const THIN = { style: 'thin', color: { argb: 'FF9AA0A6' } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const FILL = (/** @type {string} */ argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const HEAD_FILL = FILL('FF1F3864'), SECTION_FILL = FILL('FFD9E2F3'), LIST_FILL = FILL('FFE2EFDA'), GREY_FILL = FILL('FFD9D9D9'), OFF_FILL = FILL('FFFFF2CC');

/** @param {string} name @returns {string} a valid sheet name (no : \ / ? * [ ], 31 characters at most) */
export const sheetName = name => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Roster';

/**
 * @param {ExcelJS} ExcelJS
 * @param {WeekLayout} layout
 * @returns {any} the workbook
 */
export function buildWeekWorkbook(ExcelJS, layout) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(0);
  const ws = wb.addWorksheet(sheetName(layout.sheet), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const { head, rows } = coreRows(layout);
  ws.columns = head.map((_, i) => ({ width: i === 0 ? 18 : 30 }));
  const hr = ws.addRow(head);
  hr.eachCell((/** @type {any} */ c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = BOX; });
  for (const cells of rows) {
    const r = ws.addRow(cells.map(c => c.t));
    cells.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.border = BOX;
      cell.alignment = { vertical: 'top', wrapText: true };
      if (c.k === 'section') { cell.fill = SECTION_FILL; cell.font = { bold: true }; }
      else if (c.k === 'label') cell.font = { bold: true };
      else if (c.k === 'head') { cell.fill = LIST_FILL; cell.font = { bold: true }; }
      else if (c.k === 'closed') { cell.fill = GREY_FILL; cell.font = { bold: true, italic: true, color: { argb: 'FF595959' } }; }
    });
  }
  return wb;
}

/**
 * @param {ExcelJS} ExcelJS
 * @param {CallsLayout} cl
 * @returns {any} the workbook
 */
export function buildCallsWorkbook(ExcelJS, cl) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(0);
  const ws = wb.addWorksheet(sheetName(cl.sheet), {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = cl.head.map((_, i) => ({ width: i === 0 ? 14 : i === 1 ? 10 : 22 }));
  const title = ws.addRow([cl.title]);
  ws.mergeCells(1, 1, 1, cl.head.length);
  title.getCell(1).font = { bold: true, size: 13 };
  /** @param {any} row @param {any} fill */
  const header = (row, fill) => row.eachCell((/** @type {any} */ c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill; c.border = BOX; c.alignment = { horizontal: 'center' }; });
  header(ws.addRow(cl.head), HEAD_FILL);
  for (const row of cl.rows) {
    const r = ws.addRow(row.cells);
    r.eachCell({ includeEmpty: true }, (/** @type {any} */ c) => { c.border = BOX; if (row.off) c.fill = OFF_FILL; });
  }
  if (cl.counts.length) {
    ws.addRow([]);
    const t = ws.addRow(['Calls per person']);
    t.getCell(1).font = { bold: true };
    header(ws.addRow(cl.countsHead), HEAD_FILL);
    for (const row of cl.counts) ws.addRow(row).eachCell({ includeEmpty: true }, (/** @type {any} */ c) => { c.border = BOX; });
  }
  return wb;
}
