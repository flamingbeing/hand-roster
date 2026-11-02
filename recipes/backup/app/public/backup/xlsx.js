// Spreadsheet rows as an Excel file and back, with SheetJS (vendored; it loads only when one of these is called, never
// with the page). A cell holds at most 32767 characters, so a long Data cell continues in "Data 2", "Data 3"… and a long
// readable cell is cut; the Data columns are what a restore reads.

const CELL = 30000;
/** @returns {Promise<typeof import('../vendor/xlsx/0.20.3/xlsx.js')>} */
const sheetJs = () => import('../vendor/xlsx/0.20.3/xlsx.js');

/** the Data column (the last) split over as many columns as the longest needs @param {string[][]} rows @returns {string[][]} */
function fit(rows) {
  const data = rows[0].length - 1;
  const parts = rows.map(r => r[data].match(new RegExp(`[^]{1,${CELL}}`, 'g')) || ['']);
  const width = Math.max(...parts.map(p => p.length));
  return rows.map((r, i) => {
    const head = r.slice(0, data).map(c => (c.length > CELL ? c.slice(0, CELL) + '…' : c));
    const extra = Array.from({ length: width - 1 }, (_, k) => parts[i][k + 1] ?? (i ? '' : `Data ${k + 2}`));
    return [...head, parts[i][0], ...extra];
  });
}

/** Data and its continuation columns joined into one @param {unknown[][]} rows @returns {string[][]} */
function join(rows) {
  const head = (rows[0] || []).map(h => String(h).trim());
  const from = head.indexOf('Data');
  if (from < 0) return rows.map(r => r.map(c => String(c ?? '')));
  let to = from + 1;
  while (/^Data \d+$/.test(head[to] || '')) to++;
  return rows.map((r, i) => [...r.slice(0, from).map(c => String(c ?? '')), i ? r.slice(from, to).map(c => String(c ?? '')).join('') : 'Data', ...r.slice(to).map(c => String(c ?? ''))]);
}

/** @param {string[][]} rows @param {string} name the sheet's name @returns {Promise<Uint8Array>} */
export async function backupToXlsx(rows, name) {
  const X = await sheetJs();
  const book = X.utils.book_new();
  X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(fit(rows)), name.slice(0, 31));
  return new Uint8Array(X.write(book, { bookType: 'xlsx', type: 'array', compression: true }));
}

/** the first sheet's rows, Data joined again @param {Uint8Array} bytes @returns {Promise<string[][]>} */
export async function xlsxToRows(bytes) {
  const X = await sheetJs();
  let book;
  try { book = X.read(bytes, { type: 'array' }); } catch { throw new Error('That file can’t be opened (not an Excel file).'); }
  const sheet = book.Sheets[book.SheetNames[0]];
  return sheet ? join(X.utils.sheet_to_json(sheet, { header: 1, defval: '' })) : [];
}
