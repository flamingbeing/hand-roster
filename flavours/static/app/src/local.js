// The app's data on this device only, no sign-in (a static app; `node tools/add.mjs cloud` turns it into the cloud app,
// cloud.js): createApp({ config, modules: [localStore(), settings(), update()] }) from app-sync, the same runner the cloud
// app uses, so the screens and the kit's parts take this app as they take the cloud one (items.js, ItemsApp).
//
// IndexedDB layout (app-sync's local store, @core/store): one database, <name>:_ , with a store per collection
//   tasks      { id, text, notes?, listId?, due?, dueTime?, done, doneAt?, createdAt, updatedAt }   the tasks
//   lists      { id, name, order, createdAt, updatedAt }   the lists (Inbox is not stored)
//   settings   (kept for the account options a cloud app has; a static app's options are this device's, in localStorage)
// Nothing leaves the device: clearing the site's data in the browser clears the list.
import { createApp } from '@core/app';
import { createStores } from '@core/store';
import { update } from '@core/update';
import { settings } from '@core/settings';
import * as register from 'app-update/register.js';
import { APP } from './config.js';
import { OPTIONS, SETTINGS_COLL } from './options.js';
import { COLL, LISTS } from './items.js';
import { taskOps } from './task-ops.js';
import { localStore } from './local-store.js';

const SPACE = '_';
/** @typedef {import('./items.js').Item} Item */
/** @typedef {import('./items.js').TaskList} TaskList */
/** @typedef {import('./items.js').State} State */
/**
 * @typedef {object} Hooks
 * @property {(s: State) => void} onState
 * @property {(items: Item[], changed: Set<string>) => void} onList  the tasks; changed: the ids whose copy changed since
 *   the last call (none the first time)
 * @property {(lists: TaskList[]) => void} onLists  the lists
 */
/** @typedef {Awaited<ReturnType<typeof start>>} Started */

// start({ canReload }) -> the modules' apis (for the UI kit) and the app's actions. canReload: with a service worker,
// the app's own "nothing open" answer for the update's reload; none: no update module. Nothing shows until follow(hooks).
/** @param {{ canReload?: (() => boolean | Promise<boolean>) | null }} o */
export async function start({ canReload = null }) {
  const modules = [
    localStore({ createStores, prefix: `${APP.name}:`, colls: [COLL, LISTS, SETTINGS_COLL], scope: SPACE }),
    settings({ options: OPTIONS, collection: SETTINGS_COLL, scope: SPACE }),
    ...(canReload ? [update({ register, app: 'app', sw: 'sw.js', canReload })] : []),
  ];
  const app = createApp({ config: { name: APP.name }, modules });
  await app.ready;
  const sync = /** @type {import('./local-store.js').LocalSync} */ (app.sync);
  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  /** @type {Item[]} the tasks as last heard (items()) */
  let latest = [];
  const ops = taskOps({ save: (coll, record, base) => sync.save(coll, SPACE, /** @type {any} */ (record), /** @type {any} */ (base)), id });
  return {
    // the modules' apis, for the UI kit (update: with a service worker only, else null)
    sync, settings: app.settings, update: app.update || null,
    /** @param {(st: { state: string, count: number, unsent: number }) => void} fn */
    status$: fn => app.status$(fn),
    // from now on: onState with the one screen there is, onList and onLists with the tasks and lists
    /** @param {Hooks} h */
    follow({ onState, onList, onLists }) {
      onState({ phase: 'ready', role: 'admin' });
      let first = true;
      sync.watch(SPACE, COLL, (list, { changed }) => {
        latest = /** @type {Item[]} */ (list.filter(x => !x._deleted));
        onList(latest, new Set(first ? [] : changed));
        first = false;
      });
      sync.watch(SPACE, LISTS, list => { onLists(/** @type {TaskList[]} */ (list.filter(x => !x._deleted))); });
    },
    // the writes resolve to '' once stored, or to the reason it could not be (the device's storage refused it; task-ops.js)
    add: ops.add, edit: ops.edit, tick: ops.tick,
    addList: ops.addList, renameList: ops.renameList, removeList: ops.removeList,
    /** @param {Item} item @param {unknown[]} [_attached] */
    remove: async (item, _attached = []) => { await ops.removeTask(item); },
    /** @param {string} itemId @param {(item: Item | null) => void} cb @returns {() => void} */
    watchItem: (itemId, cb) => sync.watchDoc([COLL, itemId], d => cb(/** @type {Item | null} */ (d))),
    // the tasks as last heard, a whole task saved under its own id, and the copy (this device's: always in) a restore
    // waits for (the backup recipe)
    items: () => latest,
    put: ops.put,
    serverCopyIn: () => true,
  };
}
