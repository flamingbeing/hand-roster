// The lists: the picker under each tab's title (All, Inbox, then the person's lists, with open counts when that option is
// on) and the sheet that adds, renames and deletes them. The list picked is the settings' defaultList, so it follows the
// person between devices (a cloud app) and new tasks go into it.
import { confirmModal } from '@core/ui';
import { INBOX, REFUSED } from '../items.js';
import { orderedLists, openCounts } from '../tasks.js';
import { $, input, dialog } from '../dom.js';

/**
 * @param {import('../items.js').ItemsApp} app
 * @param {{ toast: (message: string) => unknown, redraw: () => void, tasks: () => import('../items.js').Task[] }} o  redraw: the tabs
 * @returns {{ draw: (lists: import('../items.js').TaskList[]) => void, lists: () => import('../items.js').TaskList[], pick: () => string,
 *   canWrite: (yes: boolean) => void, repaint: () => void }}
 */
export function listPicker(app, { toast, redraw, tasks }) {
  /** @type {import('../items.js').TaskList[]} */
  let lists = [];
  let writable = false, loaded = false;
  const sheet = dialog('lists-sheet');
  const manage = $('lists-manage');
  /** the list shown: a deleted one falls back to All */
  const pick = () => {
    const v = String(app.settings.get('defaultList') || 'all');
    return v === 'all' || v === INBOX || lists.some(l => l.id === v) || !loaded ? v : 'all';
  };

  const paintPickers = () => {
    const counts = openCounts(tasks(), lists), show = !!app.settings.get('showCounts'), now = pick();
    const entries = [['all', 'All'], [INBOX, 'Inbox'], ...orderedLists(lists).map(l => [l.id, l.name])];
    for (const host of document.querySelectorAll('.list-picker')) {
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const buttons = entries.map(([id, name]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'list-chip'; b.dataset.list = id;
        b.setAttribute('aria-pressed', String(id === now));
        const n = id === 'all' ? total : counts.get(id) ?? 0;
        b.textContent = show ? `${name} ${n}` : name;
        b.addEventListener('click', () => { void app.settings.set('defaultList', id); redraw(); });
        return b;
      });
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'list-chip list-edit'; more.textContent = 'Edit lists'; more.hidden = !writable;
      more.addEventListener('click', () => { paintManage(); sheet.showModal(); });
      const focused = host.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).dataset.list : null;
      host.replaceChildren(...buttons, more);
      if (focused) /** @type {HTMLElement | undefined} */ (buttons.find(b => b.dataset.list === focused))?.focus();   // a redraw keeps the keyboard where it was
    }
  };
  // (a list name is capped at 60, as the rules cap it)
  const paintManage = () => {
    manage.replaceChildren(...orderedLists(lists).map(l => {
      const li = document.createElement('li'), name = document.createElement('input'), del = document.createElement('button');
      li.className = 'ui-row list-manage-row';
      name.value = l.name; name.maxLength = 60; name.setAttribute('aria-label', `Name of the list ${l.name}`);
      name.addEventListener('change', async () => {
        const v = name.value.trim();
        if (!v) { name.value = l.name; return; }
        if (v !== l.name && await app.renameList(l, v)) toast(REFUSED);
      });
      del.type = 'button'; del.className = 'danger'; del.textContent = 'Delete'; del.setAttribute('aria-label', `Delete the list ${l.name}`);
      del.addEventListener('click', async () => {
        if (!await confirmModal(`Delete “${l.name}”? Its tasks move to Inbox.`, { title: 'Delete list', danger: true, yes: 'Delete' })) return;
        if (pick() === l.id) void app.settings.set('defaultList', 'all');
        await app.removeList(l);
      });
      li.append(name, del);
      return li;
    }));
  };
  $('list-add').addEventListener('submit', async e => {
    e.preventDefault();
    const name = input('list-name').value.trim();
    if (!name) return;
    input('list-name').value = '';
    if (await app.addList(name)) toast(REFUSED);
  });
  app.settings.watch('defaultList', () => { paintPickers(); redraw(); });
  app.settings.watch('showCounts', paintPickers);

  return {
    draw(next) { lists = next; loaded = true; paintPickers(); if (sheet.open) paintManage(); },
    lists: () => lists,
    pick,
    canWrite(yes) { writable = yes; paintPickers(); },
    repaint: paintPickers,
  };
}
