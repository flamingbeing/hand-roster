// createBackup: the backup object, its checks and the add-only restore, set up once for the app's own records. Pure but
// for the injected `io`; no DOM (tested in app/test/backup.unit.test.mjs). A restore only adds: a record whose id is
// here already is kept as it is, nothing is deleted, and the server's copy is waited for first (a new phone shows an
// empty list until it arrives, and everything would count as missing).
import { backupToRows, rowsToBackup } from './rows.js';
import { backupToCsv, csvToRows } from './csv.js';
import { packBackup, unpackJson } from './gzip.js';
import { backupToXlsx, xlsxToRows } from './xlsx.js';

const VERSION = 1;
const FILE_FIELDS = ['id', 'name', 'path', 'size', 'type'];
export const STILL_LOADING = 'Your data is still loading (no signal?). Try again in a moment.';

/** @param {Record<string, any>} from @param {string[]} fields @returns {any} */
const pick = (from, fields) => Object.fromEntries(fields.filter(k => from[k] !== undefined).map(k => [k, from[k]]));
/** every field but the sync's own (a leading _ and serverAt) @param {Record<string, any>} rec */
const ownFields = rec => Object.keys(rec).filter(k => !k.startsWith('_') && k !== 'serverAt' && k !== 'updatedAt');

/** @param {import('./types').Options} options @returns {import('./types').BackupApi} */
export function createBackup({ format, name = format, fields, clean, columns = [], noun = ['record', 'records'], sheet = 'Records' }) {
  if (!format) throw new Error('createBackup: format is required');
  /** the fields a record keeps in the file: the app's list, or its own; `updatedAt` only when it is a time
   * @param {Record<string, any>} rec */
  const keep = rec => ({
    ...pick(rec, fields ? ['id', ...fields.filter(f => f !== 'id')] : ownFields(rec)),
    ...(Number.isFinite(rec.updatedAt) ? { updatedAt: rec.updatedAt } : {}),
  });
  /** a record read from a file -> what is saved (only the kept fields; the app's clean has the last word), or null
   * @param {Record<string, any>} rec */
  const reread = rec => {
    const { updatedAt, ...base } = keep(rec);
    void updatedAt;   // the save stamps its own time
    return clean ? clean(base) : base;
  };
  const words = (/** @type {number} */ c) => `${c} ${c === 1 ? noun[0] : noun[1]}`;

  /** @param {any} data @returns {import('./types').BackupData} */
  const check = data => {
    if (!data || typeof data !== 'object' || data.format !== format) throw new Error('That isn’t a backup from this app.');
    if (typeof data.version !== 'number' || data.version > VERSION) throw new Error('That backup is from a newer version of the app. Update first.');
    return {
      settings: null, space: null, exportedAt: '', ...data,
      records: Array.isArray(data.records) ? data.records : [], files: Array.isArray(data.files) ? data.files : [],
      skipped: Number(data.skipped) || 0,
    };
  };
  /** spreadsheet rows -> the backup; null when the headings aren't a backup's @param {unknown[][]} rows */
  const fromRows = rows => { const d = rowsToBackup(rows, { format, version: VERSION }); return d && check(d); };

  /** @type {import('./types').BackupApi} */
  const api = {
    build({ records, files = [], settings = null, space = null, now = new Date() }) {
      return {
        format, version: VERSION, exportedAt: now.toISOString(), space, settings,
        records: records.map(keep), files: files.map(f => pick(f, FILE_FIELDS)),
      };
    },
    check,
    plan(data, have) {
      const here = new Set(have.ids), fileIds = new Set(have.fileIds ?? []), seen = new Set();
      const usable = data.records.filter(r => r && typeof r === 'object' && typeof r.id === 'string' && r.id && !seen.has(r.id) && seen.add(r.id));
      /** @type {import('./types').Item[]} */
      const add = [];
      let unreadable = data.records.length - usable.length, present = 0;
      for (const r of usable) {
        if (here.has(r.id)) { present++; continue; }
        const c = reread(r);
        if (c && typeof c.id === 'string' && c.id) add.push(c); else unreadable++;
      }
      return {
        add, present, filesMissing: data.files.filter(f => f && !fileIds.has(f.id)).length,
        settings: data.settings != null && (have.settingsWouldChange ? have.settingsWouldChange(data.settings) : true),
        skipped: (data.skipped || 0) + unreadable,
      };
    },
    describe(p) {
      const parts = [p.add.length ? `Adds ${words(p.add.length)}` : 'Nothing to add', p.present ? `${p.present} already here, kept as they are` : ''];
      if (p.filesMissing) parts.push(`${p.filesMissing} ${p.filesMissing === 1 ? 'file' : 'files'} listed but not here (files are not restored)`);
      if (p.settings) parts.push('settings you haven’t changed are restored');
      if (p.skipped) parts.push(`${p.skipped} could not be read`);
      return parts.filter(Boolean).join('; ') + '.';
    },
    async restore(data, io) {
      if (!(await io.ready())) throw new Error(STILL_LOADING);
      const plan = api.plan(data, io.have());   // planned again from what is here now
      const refused = plan.add.length ? await io.save(plan.add) : 0;
      if (plan.settings && io.applySettings) await io.applySettings(data.settings);
      return { added: plan.add.length - refused, refused, plan };
    },
    pack: packBackup,
    async unpack(bytes) { return check(await unpackJson(bytes)); },
    toCsv: data => backupToCsv(backupToRows(data, columns)),
    fromCsv: text => fromRows(csvToRows(text)),
    toXlsx: data => backupToXlsx(backupToRows(data, columns), sheet),
    async fromXlsx(bytes) { return fromRows(await xlsxToRows(bytes)); },
    async read(fileName, bytes) {
      const read = /\.xlsx$/i.test(fileName) ? await api.fromXlsx(bytes)
        : /\.csv$/i.test(fileName) ? api.fromCsv(new TextDecoder().decode(bytes))
          : await api.unpack(bytes);
      if (!read) throw new Error('That spreadsheet isn’t a backup from this app (no Kind and Data columns).');
      return read;
    },
    fileName(ext = 'json.gz', now = new Date()) { return `${name}-${now.toISOString().slice(0, 10)}.${ext}`; },
    words,
  };
  return api;
}
