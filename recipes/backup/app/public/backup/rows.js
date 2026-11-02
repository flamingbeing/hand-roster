// The backup as rows of text, the shape CSV and Excel share: Kind and ID, the app's readable columns, Updated, and a Data
// column holding each record in full as JSON, which a restore reads (so a round trip loses nothing). Pure (tested in
// app/test/backup.unit.test.mjs).

const stamp = (/** @type {unknown} */ ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') : '');
const text = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.join('; ') : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** @param {import('./types').BackupData} data @param {import('./types').Column[]} columns
 * @returns {string[][]} the header, a row for the backup itself, then a row per record and per file */
export function backupToRows(data, columns) {
  const { records, files, ...meta } = data;
  const blank = columns.map(() => '');
  const rows = [
    ['Kind', 'ID', ...columns.map(c => c.title), 'Updated', 'Data'],
    ['backup', '', ...blank, meta.exportedAt, JSON.stringify(meta)],
  ];
  for (const r of records) rows.push(['record', r.id, ...columns.map(c => text(c.value(r))), stamp(r.updatedAt), JSON.stringify(r)]);
  for (const f of files) rows.push(['file', f.id, ...blank, '', JSON.stringify(f)]);
  return rows;
}

/** Back to a backup object (not yet checked). Rows whose Data can't be read are counted, not guessed at; null when the
 * headings aren't a backup's. @param {unknown[][]} rows @param {{ format: string, version: number }} start
 * @returns {Record<string, any> | null} */
export function rowsToBackup(rows, start) {
  const head = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  const kindAt = head.indexOf('kind'), dataAt = head.indexOf('data');
  if (kindAt < 0 || dataAt < 0) return null;
  /** @type {Record<string, any>} */
  let meta = { ...start, exportedAt: '', space: null, settings: null };
  const records = [], files = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const kind = String(r[kindAt] ?? '').trim().toLowerCase();
    if (!kind) continue;
    let d;
    try { d = JSON.parse(String(r[dataAt])); } catch { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) skipped++;
    else if (kind === 'backup') meta = { ...meta, ...d };
    else if (kind === 'record') records.push(d);
    else if (kind === 'file') files.push(d);
    else skipped++;
  }
  return { ...meta, records, files, skipped };
}
