// The app's writes, the same for both data sides: cloud.js and a static app's local.js each pass in how one record is
// saved (the sync engine's save, queued and sent in the cloud app, kept on the device in a static one). Every one
// resolves to '' when the save is stored or queued, or to the reason when it was refused at once (app-sync rejects then;
// the copy waits in the refused list, so the page says so rather than fail).
import { COLL, LISTS } from './items.js';
import { cleanFields } from './tasks.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').TaskList} TaskList */

/** @param {Promise<unknown>} saving @returns {Promise<string>} */
export const refusal = saving => saving.then(() => '', e => (e instanceof Error && e.message) || 'The server refused it');

/**
 * @param {{ save: (coll: string, record: Record<string, unknown>, base: unknown) => Promise<unknown>, id: () => string, now?: () => number }} o
 *   save: one record (base: the copy the change started from, null for a new one)
 */
export function taskOps({ save, id, now = Date.now }) {
  return {
    /** @param {import('./items.js').Fields} fields @returns {Promise<string>} */
    add: fields => refusal(save(COLL, { id: id(), done: false, ...cleanFields(fields), createdAt: now() }, null)),
    /** @param {Task} task @param {import('./items.js').Fields} patch @returns {Promise<string>} */
    edit: (task, patch) => refusal(save(COLL, { ...task, ...cleanFields(patch) }, task)),
    /** @param {Task} task @param {boolean} done @returns {Promise<string>} */
    tick: (task, done) => refusal(save(COLL, { ...task, done, doneAt: done ? now() : null }, task)),
    /** a whole task under its own id, as a new save (a restore brings one back) @param {Task} task @returns {Promise<string>} */
    put: task => refusal(save(COLL, { ...task }, null)),
    /** @param {Task} task */
    removeTask: async task => { await save(COLL, { id: task.id, _deleted: true }, task); },
    /** @param {string} name @returns {Promise<string>} */
    addList: name => refusal(save(LISTS, { id: id(), name: name.trim(), order: now(), createdAt: now() }, null)),
    /** @param {TaskList} list @param {string} name @returns {Promise<string>} */
    renameList: (list, name) => refusal(save(LISTS, { ...list, name: name.trim() }, list)),
    /** @param {TaskList} list */
    removeList: async list => { await save(LISTS, { id: list.id, _deleted: true }, list); },
  };
}
