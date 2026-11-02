// The share chooser: a share from another app (text, a link, files) arrives through the manifest's share_target; sw.js
// keeps its parts in a cache and sends the page here (?share=1). The sheet is built here (no index.html part): a new
// item, or added to an item's notes. Nothing runs on import; check() runs when asked.
import { REFUSED, itemText } from '../items.js';
import { parseShare, appendShare, fitsNotes, takeShare, dropShare, TEXT_MAX, NOTES_MAX } from './share-in.js';

const WAIT_MS = 30_000;
const LIST_MAX = 500;

/** an element with its attributes and children @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [kids] */
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};

/** @param {import('../items.js').ItemsApp} app
 * @returns {{ check: () => Promise<void> }}  check: when the page was opened by a share (?share=1), shows the chooser, or
 *   says receiving is off and keeps nothing */
export function shareSheet(app) {
  /** @type {{ title: string, body: string, files: number } | null} */ let held = null;
  const text = el('p', { id: 'share-text', class: 'small' });
  const status = el('p', { id: 'share-status', class: 'small', role: 'status' });
  const pick = /** @type {HTMLSelectElement} */ (el('select', { id: 'share-item' }));
  const pickField = el('label', { class: 'kit-field' }, ['Item', pick]);
  const add = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', id: 'share-add' }, ['Add to an item']));
  const make = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', id: 'share-new', class: 'ui-primary' }, ['New item']));
  const cancel = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', id: 'share-cancel' }, ['Cancel']));
  const sheet = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'ui-sheet', id: 'share', 'aria-labelledby': 'share-title' }, [
    el('div', { class: 'ui-sheet-head' }, [el('h2', { id: 'share-title' }, ['Shared to this app'])]),
    el('div', { class: 'ui-sheet-body' }, [text, pickField, status, el('div', { class: 'row' }, [make, add, cancel])]),
  ]));
  const buttons = [make, add, cancel];
  const close = () => { held = null; sheet.close(); };
  cancel.addEventListener('click', close);
  sheet.addEventListener('cancel', () => { held = null; });

  /** the sheet with a message only (receiving is off, nothing to read) @param {string} message */
  const say = message => {
    held = null; text.textContent = message; status.textContent = '';
    pickField.hidden = true; make.hidden = add.hidden = true; cancel.textContent = 'Close';
    if (!sheet.open) sheet.showModal();
  };

  /** one run at a time (the buttons are off meanwhile); a failure keeps the sheet open @param {() => Promise<string>} job */
  const run = async job => {
    buttons.forEach(b => { b.disabled = true; });
    try {
      const why = await job();
      if (why) status.textContent = why;
      else say('Added.');
    } catch (e) { status.textContent = /** @type {Error} */ (e).message; }
    finally { buttons.forEach(b => { b.disabled = false; }); add.disabled = !pick.options.length; }
  };
  make.addEventListener('click', () => {
    const h = held;
    if (!h) return;
    void run(async () => {
      if (h.body.length > NOTES_MAX) return `That is too long to keep (${NOTES_MAX} characters at most).`;
      return (await app.add({ text: h.title.slice(0, TEXT_MAX), notes: h.body || null })) ? REFUSED : '';
    });
  });
  add.addEventListener('click', () => {
    const item = app.items().find(t => t.id === pick.value), h = held;
    if (!h || !item) return;
    void run(async () => {
      const notes = appendShare(String(item.notes ?? ''), h.body);
      if (!fitsNotes(notes)) return `Those notes would be too long (${NOTES_MAX} characters at most).`;
      return (await app.edit(item, { notes })) ? REFUSED : '';
    });
  });

  /** the items are in once the server's copy has arrived (always, in a static app) */
  const ready = async () => {
    for (const t0 = Date.now(); !app.serverCopyIn(); await new Promise(r => setTimeout(r, 250))) if (Date.now() - t0 > WAIT_MS) return false;
    return true;
  };

  return {
    async check() {
      const url = new URL(location.href);
      if (!url.searchParams.has('share')) return;
      url.searchParams.delete('share');
      history.replaceState(null, '', url);
      if (!sheet.isConnected) document.body.append(sheet);
      if (!app.settings.get('shareIn')) {
        await dropShare().catch(() => {});
        say('Receiving shares is off, and this one was not kept. Turn it on in Settings, Features.');
        return;
      }
      const got = await takeShare().catch(() => null);
      if (!got) return;
      await ready();
      const parsed = parseShare(got.fields);
      held = { ...parsed, files: got.files.length };
      // (files are not kept here: the files recipe's attach is where a share's files would go)
      text.textContent = [parsed.title, parsed.body, got.files.length ? `${got.files.length} file(s) were shared; this app keeps text and links only.` : ''].filter(Boolean).join('\n\n');
      status.textContent = '';
      const items = [...app.items()].filter(t => !t.done).sort((a, b) => itemText(a).localeCompare(itemText(b))).slice(0, LIST_MAX);
      pick.replaceChildren(...items.map(t => new Option(itemText(t) || 'Untitled', t.id)));
      pickField.hidden = !items.length; add.disabled = !items.length;
      make.hidden = add.hidden = false; cancel.textContent = 'Cancel';
      sheet.showModal();
    },
  };
}
