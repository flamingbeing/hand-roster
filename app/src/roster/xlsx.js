// The workbooks: a week in the CORE sheet's layout, a week as the roster maker's hand-made grid (with her live formulas)
// and a month of calls. ExcelJS is handed in (it is loaded only when an export is asked for, from public/vendor/exceljs),
// so this file stays importable by node and by the page alike. The cells (and the formulas) come from layout.js; this
// file only gives them a look. Colours are by kind, never by person.
import { coreRows, colName, HAND_COLS, TALLY } from './layout.js';

/** @typedef {import('./layout.js').WeekLayout} WeekLayout */
/** @typedef {import('./layout.js').CallsLayout} CallsLayout */
/** @typedef {import('./layout.js').HandGrid} HandGrid */
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

// the hand-made grid's colours, as on her sheet (Office theme tints)
const TONE_FILL = {
  clinic: FILL('FFA9D08E'), ot: FILL('FF9BC2E6'), msp: FILL('FFFFC000'), away: FILL('FFF4B084'), grey: FILL('FFAEAAAA'),
};
const SKILLS_FILL = FILL('FF9BC2E6'), YELLOW_FILL = FILL('FFFFFF00'), POST_FILL = FILL('FFED7D31'), GAP_FILL = FILL('FF808080'),
  TH_FILL = FILL('FFE2EFDA'), WHO_FILL = FILL('FFBDD7EE');

/**
 * The week as the roster maker's hand-made grid: her rows, colours and column widths, the formulas written as array
 * formulas (as hers are) with their results filled in, the dates as real dates, and only A:F printed (one page).
 * @param {ExcelJS} ExcelJS
 * @param {HandGrid} grid
 * @returns {any} the workbook
 */
export function buildHandWorkbook(ExcelJS, grid) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(0);
  const ws = wb.addWorksheet(sheetName(grid.sheet), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    // (ExcelJS puts a "$" before the print area's columns only; "A$1" makes the rows fixed too, which LibreOffice needs)
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: `A$1:F$${grid.last}`,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  const C = HAND_COLS;
  /** @type {Record<number, number>} */
  const widths = { 1: 14, 7: 3, [C.check]: 16, [C.tally]: 16, [C.tally + TALLY.length + 1]: 7 };
  for (let c = 2; c <= 6; c++) widths[c] = 31;
  for (let c = C.check + 1; c <= C.check + 5; c++) widths[c] = 4.5;
  for (let c = C.tally + 1; c <= C.tally + TALLY.length; c++) widths[c] = 10;
  for (const [c, w] of Object.entries(widths)) ws.getColumn(Number(c)).width = w;
  const small = { size: 8 }, bold = { size: 8, bold: true };
  // every cell of the printed grid gets a thin box, written or not
  for (let r = 1; r <= grid.last; r++) for (let c = 1; c <= 6; c++) {
    const cell = ws.getCell(r, c);
    cell.border = BOX; cell.font = small; cell.alignment = { vertical: 'top', wrapText: true };
  }
  for (const x of grid.cells) {
    const cell = ws.getCell(x.r, x.c);
    if (x.f) cell.value = { formula: x.f, result: x.v ?? 0, ...(x.k === 'count' ? { shareType: 'array', ref: `${colName(x.c)}${x.r}` } : {}) };
    else if (x.k === 'date' && typeof x.v === 'string') { cell.value = new Date(`${x.v}T00:00:00Z`); cell.numFmt = 'd-mmm'; cell.alignment = { horizontal: 'left' }; }
    else if (x.v !== undefined && x.v !== '') cell.value = x.v;
    if (x.k === 'title') { cell.font = { size: 14, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
    else if (x.k === 'day' || x.k === 'date' || x.k === 'label') cell.font = bold;
    else if (x.k === 'head') { cell.font = bold; cell.fill = TONE_FILL[x.tone ?? 'clinic']; }
    else if (x.k === 'skills') cell.fill = SKILLS_FILL;
    else if (x.k === 'free') cell.fill = YELLOW_FILL;
    else if (x.k === 'post') cell.fill = POST_FILL;
    else if (x.k === 'gap') cell.fill = GAP_FILL;
    else if (x.k === 'th') { cell.font = bold; cell.fill = TH_FILL; cell.border = BOX; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
    else if (x.k === 'who') { cell.font = bold; cell.fill = WHO_FILL; cell.border = BOX; }
    else if (x.k === 'count') { cell.font = small; cell.border = BOX; cell.alignment = { horizontal: 'center' }; }
    // the label column's yellow and orange rows are coloured across, as hers are
    if (x.c === 1 && x.r > 3) {
      const day = grid.cells.find(y => y.r === x.r && y.c === 2);
      if (day?.k === 'free') cell.fill = YELLOW_FILL; else if (day?.k === 'post') cell.fill = POST_FILL; else if (day?.k === 'skills') cell.fill = SKILLS_FILL;
    }
  }
  ws.mergeCells(1, 1, 1, 6);
  ws.getRow(1).height = 20;
  ws.getRow(3).height = 24; // (the dates, and the tally's two-line heads)
  // the rows of names run to a few lines: about 40 characters a line at this size, 11 points a line
  for (const key of ['amFree', 'amLeave', 'post', 'pmFree', 'leave', 'call']) {
    const r = grid.rowOf[key];
    const lines = Math.max(1, ...grid.cells.filter(x => x.r === r && x.c > 1 && x.c <= 6).map(x => Math.ceil(String(x.v ?? '').length / 40)));
    ws.getRow(r).height = Math.max(13, lines * 11 + 2);
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
