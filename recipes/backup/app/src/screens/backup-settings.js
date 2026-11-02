// Settings > Backup (the backup recipe's glue, recipes/backup.json): the tasks as one file to keep (.json.gz, or a
// spreadsheet: CSV, Excel) and a restore that only adds what is missing, with a dry-run line first. The file work is
// @core/backup (pure; SheetJS loads only when an Excel file is made or read); this wires it to a Settings page through
// modules.js's "backup" slot. The fields, columns and clean below are the sample app's tasks: make them the app's own.
import { createBackup } from '@core/backup';
import { APP } from '../config.js';
import { cleanFields } from '../tasks.js';

const WAIT_MS = 30_000;
// Lucide "archive" (https://lucide.dev, ISC licence)
/** @type {import('app-ui/icons/lucide.js').IconNodes} */
const ARCHIVE = [['rect', { width: '20', height: '5', x: '2', y: '3', rx: '1' }], ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }], ['path', { d: 'M10 12h4' }]];
const TYPES = { 'json.gz': 'application/gzip', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** the backup, set up for the tasks: what is kept, the readable columns, and what a restored task may hold */
export const tasksBackup = () => createBackup({
  format: `${APP.name}-backup`,
  fields: ['text', 'notes', 'listId', 'due', 'dueTime', 'done', 'doneAt', 'createdAt'],
  columns: [
    { title: 'Task', value: r => r.text },
    { title: 'Notes', value: r => r.notes },
    { title: 'Due', value: r => [r.due, r.dueTime].filter(Boolean).join(' ') },
    { title: 'Done', value: r => (r.done ? 'yes' : '') },
  ],
  noun: ['task', 'tasks'],
  sheet: 'Tasks',
  // a task read from a file: only fields of the right type reach the save (the rules check them again)
  clean: r => {
    if (typeof r.text !== 'string' || !r.text.trim()) return null;
    const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : null);
    const doneAt = num(r.doneAt), createdAt = num(r.createdAt);
    return {
      id: r.id, done: r.done === true,
      ...cleanFields({ text: r.text.slice(0, 500), notes: str(r.notes)?.slice(0, 5000) ?? null, listId: str(r.listId), due: str(r.due), dueTime: str(r.dueTime) }),
      ...(doneAt !== null ? { doneAt } : {}), ...(createdAt !== null ? { createdAt } : {}),
    };
  },
});

/** hands a file to the browser as a download @param {Uint8Array} bytes @param {string} type @param {string} name */
function download(bytes, type, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes.slice().buffer], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** an element with its attributes and children @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [kids] */
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};

/** @type {import('../shell.js').SettingsSlot} */
export function backupSettings({ app }) {
  const backup = tasksBackup();
  return {
    title: 'Backup', icon: ARCHIVE, sub: 'Your tasks as a file, and restore', group: 'Data', find: 'export import spreadsheet csv excel restore',
    mount(host) {
      const save = (/** @type {string} */ ext, /** @type {string} */ label) => el('button', { type: 'button', 'data-backup': ext }, [label]);
      const file = /** @type {HTMLInputElement} */ (el('input', { type: 'file', id: 'backup-file', accept: '.gz,.json,.csv,.xlsx' }));
      const plan = el('p', { id: 'backup-plan', class: 'small', role: 'status' });
      const go = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', id: 'backup-go', class: 'ui-primary' }, ['Restore']));
      const msg = el('p', { id: 'backup-msg', class: 'small', role: 'status' });
      go.hidden = true;
      host.append(
        el('p', { class: 'small' }, ['Your tasks as one file to keep. Restoring only adds what is missing; nothing here is changed or deleted.']),
        el('div', { class: 'row backup-save' }, [save('json.gz', 'Back up (.json.gz)'), save('csv', 'Spreadsheet (CSV)'), save('xlsx', 'Spreadsheet (Excel)')]),
        el('label', { class: 'kit-field' }, ['Restore from a backup', file]),
        plan, go, msg,
      );

      /** @type {import('@core/backup').BackupData | null} */
      let data = null;
      let busy = false;
      const have = () => ({ ids: app.items().map(t => t.id) });
      const ready = async () => {
        for (const t0 = Date.now(); !app.serverCopyIn(); await new Promise(r => setTimeout(r, 250))) if (Date.now() - t0 > WAIT_MS) return false;
        return true;
      };
      /** @param {string} label @param {() => Promise<void>} job */
      const run = async (label, job) => {
        if (busy) return;
        busy = true; msg.textContent = label;
        try { await job(); } catch (e) { msg.textContent = /** @type {Error} */ (e).message; } finally { busy = false; }
      };

      host.querySelector('.backup-save')?.addEventListener('click', e => {
        const ext = /** @type {HTMLElement} */ (e.target).closest('button')?.dataset.backup;
        if (ext !== 'json.gz' && ext !== 'csv' && ext !== 'xlsx') return;
        void run(ext === 'json.gz' ? 'Making the backup…' : 'Making the spreadsheet…', async () => {
          const snap = backup.build({ records: app.items() });
          const bytes = ext === 'json.gz' ? await backup.pack(snap) : ext === 'csv' ? new TextEncoder().encode(backup.toCsv(snap)) : await backup.toXlsx(snap);
          const name = backup.fileName(ext);
          download(bytes, TYPES[ext], name);
          msg.textContent = `Saved ${name} (${backup.words(snap.records.length)}).`;
        });
      });
      file.addEventListener('change', () => {
        const picked = file.files?.[0];
        data = null; plan.textContent = ''; go.hidden = true;
        if (!picked) return;
        void run('Reading…', async () => {
          const read = await backup.read(picked.name, new Uint8Array(await picked.arrayBuffer()));
          const p = backup.plan(read, have());
          data = read; plan.textContent = backup.describe(p); msg.textContent = '';
          go.hidden = !p.add.length;
        });
      });
      go.addEventListener('click', () => {
        const d = data;
        if (!d) return;
        go.hidden = true;
        void run('Restoring…', async () => {
          const { added, refused } = await backup.restore(d, {
            ready, have,
            save: async list => { let n = 0; for (const t of list) if (await app.put(/** @type {any} */ (t))) n++; return n; },
          });
          data = null; plan.textContent = ''; file.value = '';
          msg.textContent = `Restored ${backup.words(added)}` + (refused ? `; ${refused} could not be saved` : '') + '.';
        });
      });
    },
  };
}
