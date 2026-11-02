// The bin recipe's data side (recipes/bin.json): list, restore and purge over spaces/{space}/bin. The delete itself
// writes the entry (cloud.js onCommit, in the delete's own transaction); this reads those entries, brings one back as
// the same item, and removes the ones past 30 days. cloud.js reaches it through data-modules.js.
import { COLL } from './items.js';
import { itemOf } from './bin.js';

const BIN = 'bin';

/** @type {import('./data-modules.js').BinData} */
export const binData = {
  coll: BIN,
  api: ({ sdk, space, items, put }) => {
    /** the entry's document in the bin @param {{ docId: string }} e */
    const ref = async e => { const { F, db } = await sdk(); return F.doc(db, 'spaces', space, BIN, e.docId); };
    const api = {
      /** every entry, with its docId */
      async list() {
        const { F, db } = await sdk();
        return (await F.getDocs(F.collection(db, 'spaces', space, BIN))).docs.map(/** @param {any} d */ d => ({ ...d.data(), docId: d.id }));
      },
      /** the item comes back with its own id and its entry goes; '' or why not */
      async restore(/** @type {import('./items.js').BinEntry} */ entry) {
        const item = itemOf(entry, COLL);
        if (!item) return 'That item can’t be restored.';
        if (items().some(t => t.id === item.id)) {   // already back (restored elsewhere): drop the stale entry, never overwrite
          await api.purge([entry]).catch(() => {});
          return 'That item is already back.';
        }
        const why = await put(/** @type {any} */ (item));
        if (why) return why;
        return await api.purge([entry]).then(() => '', () => 'Restored, but its bin entry could not be removed.');
      },
      /** delete entries for good (the 30-day purge, and Delete forever) */
      async purge(/** @type {import('./items.js').BinEntry[]} */ entries) {
        const { F } = await sdk();
        await Promise.all(entries.map(async e => F.deleteDoc(await ref(e))));
      },
    };
    return api;
  },
};
