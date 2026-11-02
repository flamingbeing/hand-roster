// Settings > Bin (the bin recipe's glue, recipes/bin.json): the items deleted in the last 30 days, each with Restore and
// Delete forever; entries past 30 days are purged when the page opens. The page is built here (no index.html edits) and
// mounted through modules.js's "bin" slot. The pure parts are bin.js, the Firestore side is bin-data.js (cloud.js app.bin).
import { confirmModal } from '@core/ui';
import { COLL, itemText } from '../items.js';
import { binLabel, sortBin } from '../bin.js';

// Lucide "trash-2" (https://lucide.dev, ISC licence)
/** @type {import('app-ui/icons/lucide.js').IconNodes} */
const TRASH = [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }], ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }], ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }], ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }]];

/** an element with its attributes and children @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [kids] */
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};

/** @type {import('../shell.js').SettingsSlot} */
export function binSettings({ app }) {
  return {
    title: 'Bin', icon: TRASH, sub: 'Deleted items, kept for 30 days', group: 'Data', visible: 'binOn', find: 'trash deleted restore recover',
    mount(host) {
      const bin = app.bin;
      const msg = el('p', { id: 'bin-msg', class: 'small', role: 'status' });
      const list = el('ul', { id: 'bin-items', class: 'bin-items' });
      host.append(el('p', { class: 'small' }, ['Deleted items stay here for 30 days, then go for good.']), list, msg);
      if (!bin) { msg.textContent = 'The bin is not available here.'; return () => {}; }
      let gone = false;

      /** the entries now: the ones to show, with the expired ones purged on the way */
      const load = async () => {
        const { show, purge } = sortBin(await bin.list(), COLL);
        if (purge.length) await bin.purge(purge).catch(() => {});   // (a viewer's purge is refused: the writers' pages do it)
        return show;
      };
      /** @param {string} label @param {() => Promise<void>} run */
      const button = (label, run) => {
        const b = /** @type {HTMLButtonElement} */ (el('button', { type: 'button' }, [label]));
        b.addEventListener('click', () => { b.disabled = true; run().catch(e => { msg.textContent = /** @type {Error} */ (e).message; b.disabled = false; }); });
        return b;
      };
      const draw = async () => {
        msg.textContent = 'Loading…';
        /** @type {Awaited<ReturnType<typeof load>>} */ let show;
        try { show = await load(); } catch (e) { if (!gone) msg.textContent = `The bin could not be read: ${/** @type {Error} */ (e).message}`; return; }
        if (gone) return;
        list.replaceChildren(...show.map(e => el('li', { class: 'ui-row' }, [
          el('span', {}, [itemText(e.data) || 'Untitled']), el('span', { class: 'small' }, [` ${binLabel(e)}`]),
          button('Restore', async () => { msg.textContent = (await bin.restore(e)) || 'Restored.'; await draw(); }),
          button('Delete forever', async () => {
            if (!await confirmModal('Delete this item for good? It can’t be restored.', { title: 'Delete forever', danger: true, yes: 'Delete' })) { await draw(); return; }
            await bin.purge([e]); await draw();
          }),
        ])));
        if (!show.length) msg.textContent = 'The bin is empty. Deleted items stay here for 30 days.';
        else if (msg.textContent === 'Loading…') msg.textContent = '';
      };
      void draw();
      return () => { gone = true; };
    },
  };
}
