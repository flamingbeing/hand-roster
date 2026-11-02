// The task sheet (#task-sheet): adds a task and edits one. It follows its task on the server: a change made elsewhere shows
// under the form, and a delete made elsewhere closes the sheet and says so, unless the person has typed a change: then the
// sheet stays open, says so, and Save adds the task back as a new one. (A task not on the server yet is only "gone" once it
// was seen there.) The files recipe lists the task's photos and files in the sheet (the #edit-extras slot).
import { confirmModal } from '@core/ui';
import { REFUSED, INBOX } from '../items.js';
import { orderedLists } from '../tasks.js';
import { $, input, dialog } from '../dom.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Fields} Fields */

const field = (/** @type {string} */ id) => /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ ($(id));

/**
 * @param {import('../items.js').ItemsApp} app
 * @param {{ toast: (message: string) => unknown, undo: { show: (message: string, undo: () => unknown) => void },
 *   files: import('./tasks.js').ItemFiles | undefined, lists: () => import('../items.js').TaskList[] }} o
 * @returns {{ open: (task: Task | null, start?: Fields) => void, redraw: () => void }}
 *   open: edit a task, or null for a new one (start: its first values); redraw: the files part
 */
export function taskSheet(app, { toast, undo, files, lists }) {
  const sheet = dialog('task-sheet');
  /** @type {Task | null} */
  let editing = null;
  let gone = false;   // the task being edited was deleted elsewhere while the person had typed a change
  /** @type {(() => void) | null} */
  let stopLive = null;

  const redraw = files?.mount($('edit-extras'), () => editing) ?? (() => {});
  const values = () => /** @type {Fields} */ ({
    text: field('task-text').value.trim(), notes: field('task-notes').value, due: field('task-due').value || null,
    dueTime: field('task-time').value || null, listId: field('task-list').value === INBOX ? null : field('task-list').value,
  });
  const fillLists = (/** @type {string | null | undefined} */ current) => {
    const opts = [['inbox', 'Inbox'], ...orderedLists(lists()).map(l => [l.id, l.name])];
    field('task-list').replaceChildren(...opts.map(([v, name]) => Object.assign(document.createElement('option'), { value: v, textContent: name })));
    field('task-list').value = opts.some(([v]) => v === current) ? /** @type {string} */ (current) : INBOX;
  };
  // a time needs a day
  field('task-due').addEventListener('input', () => { field('task-time').disabled = !field('task-due').value; if (!field('task-due').value) field('task-time').value = ''; });

  sheet.addEventListener('close', async () => {
    stopLive?.(); stopLive = null;
    const task = editing; editing = null;
    if (sheet.returnValue !== 'save') return;
    const f = values();
    if (!f.text) return;
    if (!task || gone) { toast(await app.add(f) ? REFUSED : 'Added'); return; }
    /** @type {Fields} */
    const patch = {};
    if (f.text !== task.text) patch.text = f.text;
    if ((f.notes?.trim() || null) !== (task.notes || null)) patch.notes = f.notes;
    if (f.due !== (task.due || null)) patch.due = f.due;
    if (f.dueTime !== (task.dueTime || null)) patch.dueTime = f.dueTime;
    if (f.listId !== (task.listId || null)) patch.listId = f.listId;
    if (Object.keys(patch).length) toast(await app.edit(task, patch) ? REFUSED : 'Saved');
  });
  $('task-delete').addEventListener('click', async () => {
    // a deleted task goes to the bin, and Undo puts it back (no question); one with files asks first, as its files
    // go with it and Undo cannot bring them back
    const attached = editing ? files?.of(editing.id) ?? [] : [];
    if (attached.length && !await confirmModal('Delete this task and its files?', { title: 'Delete task', danger: true, yes: 'Delete' })) return;
    const task = editing; editing = null;
    sheet.close('delete');
    if (!task || gone) return;
    await app.remove(task, attached);
    if (attached.length) { toast('Deleted'); return; }
    const { text, notes, listId, due, dueTime } = task;
    undo.show(`Deleted “${text.length > 40 ? `${text.slice(0, 40)}…` : text}”`, async () => { if (await app.add({ text, notes, listId, due, dueTime })) toast(REFUSED); });
  });

  /** @param {Task | null} task  null: a new task @param {Fields} [start] */
  const open = (task, start = {}) => {
    editing = task; gone = false;
    const v = task ?? start;
    $('task-title').textContent = task ? 'Edit task' : 'New task';
    field('task-text').value = v.text ?? '';
    field('task-notes').value = v.notes ?? '';
    field('task-due').value = v.due ?? '';
    field('task-time').value = v.due ? v.dueTime ?? '' : '';
    field('task-time').disabled = !v.due;
    fillLists(v.listId);
    $('task-delete').hidden = !task;
    $('task-live').textContent = ''; $('edit-msg').textContent = '';
    stopLive?.(); stopLive = null;
    if (task) {
      let seen = false;
      stopLive = app.watchItem(task.id, doc => {
        if (editing?.id !== task.id) return;
        if (doc) {
          seen = true;
          $('task-live').textContent = doc.text !== task.text ? `Changed on another device: “${doc.text}”` : '';
        } else if (seen && values().text !== task.text) {
          gone = true;
          $('task-live').textContent = 'This task was deleted on another device. Save adds it back as a new task.';
        } else if (seen) {
          editing = null;
          sheet.close('gone');
          $('edit-msg').textContent = `“${task.text}” was deleted on another device.`;
        }
      });
    }
    redraw();
    sheet.showModal();
  };
  return { open, redraw };
}
