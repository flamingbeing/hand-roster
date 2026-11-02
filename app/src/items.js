// The app's shared bits, the same whichever data side the app has (cloud.js: sign-in and sync; a static app's local.js:
// this device only): the collections, a task's text, the refused-save line and the shapes the screens use.
export const COLL = 'tasks';
/** the lists tasks are filed under; Inbox is not stored (every account has it, and a task with no list or a deleted one is in it) */
export const LISTS = 'lists';
export const INBOX = 'inbox';
/** @param {unknown} record  a task, or a refused save's record -> its text (the screens, their sheets and search) */
export const itemText = record => String(/** @type {{ text?: unknown } | null} */ (record)?.text ?? '');
/** what the page says when the server refused a save at once (its copy waits in the refused list) */
export const REFUSED = 'The server refused that. A copy is kept in the refused list.';

/**
 * A task. due: a day, YYYY-MM-DD; dueTime: HH:MM, only with a due day (both are local time: a task is due where the
 * person is). Optional fields are absent or null (null clears one). done tasks keep doneAt (ms).
 * @typedef {{ id: string, text: string, notes?: string | null, listId?: string | null, due?: string | null, dueTime?: string | null,
 *   done?: boolean, doneAt?: number | null, createdAt?: number, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} Item
 */
/** @typedef {Item} Task */
/** @typedef {{ id: string, name: string, order?: number, createdAt?: number, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} TaskList */
/** @typedef {{ text?: string, notes?: string | null, listId?: string | null, due?: string | null, dueTime?: string | null }} Fields  what an add or edit sets */
/** one entry of the bin: a deleted item's last version (the bin recipe; docId is its document in the bin) */
/** @typedef {{ docId: string, id: string, kind?: unknown, deletedAt: number, data?: any }} BinEntry */
/** @typedef {{ list: () => Promise<BinEntry[]>, restore: (entry: BinEntry) => Promise<string>, purge: (entries: BinEntry[]) => Promise<void> }} BinApi */
/** @typedef {{ uid: string, email: string, name: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */
/** @typedef {{ phase: Phase, user?: User, role?: string }} State */

/**
 * What the screens use of the app (cloud.js start(); local.js in a static app). A slot or screen that needs more
 * (the files recipe) takes cloud.js's Started.
 * @typedef {object} ItemsApp
 * @property {import('app-ui/ui/types').SyncApi} sync  for the kit's conflict sheet and refused list
 * @property {import('app-ui/settings/types').SettingsApi} settings
 * @property {import('app-ui/ui/types').UpdateApi | null} update  with a service worker only
 * @property {(fields: Fields) => Promise<string>} add  a new task; '' when stored or queued, else the reason it was refused
 * @property {(task: Task, patch: Fields) => Promise<string>} edit  the same; task: the copy the edit started from
 * @property {(task: Task, done: boolean) => Promise<string>} tick  done or not done (doneAt is set and cleared with it)
 * @property {(task: Task, attached?: unknown[]) => Promise<void>} remove
 * @property {(name: string) => Promise<string>} addList
 * @property {(list: TaskList, name: string) => Promise<string>} renameList
 * @property {(list: TaskList) => Promise<void>} removeList  its tasks go to Inbox
 * @property {(taskId: string, cb: (task: Task | null) => void) => () => void} watchItem  cb(null) once it is gone -> stop()
 * @property {() => Task[]} items  the tasks as last heard (a backup takes them)
 * @property {(task: Task) => Promise<string>} put  a whole task under its own id (a restore); '' or the reason, as add
 * @property {BinApi} [bin]  the deleted items (the bin recipe; the cloud app only)
 * @property {() => boolean} serverCopyIn  whether the server's copy has arrived yet (a restore waits for it; always true
 *   in a static app)
 */
