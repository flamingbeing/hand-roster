// Spreadsheet rows as one CSV file (Excel opens it) and back. Pure (tested in app/test/backup.unit.test.mjs).

// a readable cell that starts like a formula gets a leading ' so a spreadsheet shows it as text, never runs it
const cell = (/** @type {unknown} */ v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** @param {string[][]} rows @returns {string} with a byte-order mark, so Excel reads it as UTF-8 */
export const backupToCsv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** Rows of cells; the separator is the one used most in the first lines (Excel in some countries saves with ;).
 * @param {string} text @returns {string[][]} */
export function csvToRows(text) {
  const s = text.replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 10).join('\n');
  const count = (/** @type {string} */ ch) => first.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((x, y) => count(y) - count(x))[0];
  /** @type {string[][]} */ const rows = [];
  /** @type {string[]} */ let row = [];
  let at = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch !== '"') at += ch;
      else if (s[i + 1] === '"') { at += '"'; i++; } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(at); at = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(at); rows.push(row); row = []; at = '';
    } else at += ch;
  }
  if (at || row.length) { row.push(at); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
