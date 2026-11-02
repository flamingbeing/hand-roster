// The three task tabs: Today (#today-page: also the quick add), Upcoming and Done. One screen draws all of them from the
// same tasks: the picked list narrows them, the search recipe's filter narrows them further, and the tasks' pure rules
// (tasks.js) say what goes where. Ticking a task shows an undo toast; the kit's conflict sheet and the refused list sit on Today.
import { conflictSheet, refusedList, toaster, emptyState, undoToast, loadState, confirmModal } from '@core/ui';
import { COLL, REFUSED, INBOX, itemText } from '../items.js';
import { todayTasks, upcomingGroups, doneTasks, inList, dayKey, dayLabel, dueText, dueOf, timeOf, isOverdue, listOf } from '../tasks.js';
import { $, input, sectionScreen } from '../dom.js';
import { taskSheet } from './task-sheet.js';
import { listPicker } from './lists.js';
import { modules } from '../modules.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Item} Item */
/**
 * The tools slot (modules.js "listFilter"; the search recipe fills it): draws into the slot and narrows the tasks.
 * @typedef {(o: { slot: HTMLElement, redraw: () => void }) => { feed: (items: Item[]) => void, pick: (items: Item[]) => Item[] | null,
 *   passage?: (item: Item) => HTMLElement | null }} ListFilter  passage: what a row shows under its text while filtered (a search's matched words)
 */
/**
 * The tasks' files slot (modules.js "itemFiles"; the files recipe fills it): thumbnails on the rows, a part of the task sheet.
 * @typedef {object} ItemFiles
 * @property {(byItem: Map<string, unknown[]>) => void} feed  every task's files, whenever one changes
 * @property {(itemId: string) => unknown[]} of  a task's files as this device has them
 * @property {(item: Item) => HTMLElement | null} thumbs  the row's thumbnails
 * @property {(slot: HTMLElement, editing: () => Item | null) => () => void} mount  fills the sheet's slot -> redraw it
 * (app: cloud.js's Started, which the files module needs; any here, as a static app has no cloud.js)
 * @typedef {(o: { app: any, toast: (message: string) => unknown }) => ItemFiles} ItemFilesSlot
 */

/** @param {import('../items.js').ItemsApp} app */
export function tasksScreen(app) {
  let canWrite = false;
  /** @type {Task[]} */
  let all = [];
  /** @type {Task[]} */
  let todayShown = [];
  /** @type {Task[]} */
  let doneShown = [];
  let drawnDay = dayKey();
  const toasts = toaster($('toasts'));
  const toast = toasts.show;
  const undo = undoToast(toasts);
  const filter = modules.listFilter?.({ slot: $('list-tools'), redraw: () => draw(all, new Set()) });
  const files = modules.itemFiles?.({ app, toast });
  // skeleton rows until the tasks first arrive. app.js may already show its own (an early frame): that one goes, or
  // done() here clears only this block and the early skeleton stays for good
  $('today-state').replaceChildren();
  const loading = loadState($('today-state'));
  if (!$('today').children.length) loading.loading();   // (rows from the last visit are already up: app.js)
  const lists = listPicker(app, { toast, redraw: () => draw(all, new Set()), tasks: () => all });
  const sheet = taskSheet(app, { toast, undo, files, lists: lists.lists });
  const emptyOf = {
    today: emptyState($('today-empty'), { title: 'Nothing due today', hint: 'Tasks due today, and any that are overdue, show up here.', action: { label: 'Add a task', onClick: () => input('new-text').focus() } }),
    upcoming: emptyState($('upcoming-empty'), { title: 'Nothing coming up', hint: 'Tasks with a later day, and tasks with no day, show up here.' }),
    done: emptyState($('done-empty'), { title: 'Nothing done yet', hint: 'Tasks you tick off show up here.' }),
  };
  conflictSheet($('conflict-sheet'), { sync: app.sync, text: itemText });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: itemText });

  /** where a new task starts: the picked list, and (Today's quick add, and New on Today) due today */
  const startFields = (/** @type {boolean} */ today) => {
    const l = lists.pick();
    return { listId: l === 'all' || l === INBOX ? null : l, ...(today ? { due: dayKey() } : {}) };
  };
  $('add').addEventListener('submit', async e => {
    e.preventDefault();
    const text = input('new-text').value.trim();
    if (!text) return;
    // clear the box now, not after the save: on a slow network the next task may be typed while this one saves
    // (a refused save is kept in the refused list, not in the box)
    input('new-text').value = '';
    let refused;
    try { refused = await app.add({ text, ...startFields(true) }); }
    catch (err) { if (!input('new-text').value) input('new-text').value = text; throw err; }   // not saved: give it back
    toast(refused ? REFUSED : 'Added');
  });
  $('new-task').addEventListener('click', () => sheet.open(null, startFields(document.getElementById('today-page')?.hidden === false)));
  $('clear-done').addEventListener('click', async () => {
    const done = doneShown;   // what the Done tab shows: the picked list and the search narrow it
    if (!done.length || !await confirmModal(`Delete ${done.length} done ${done.length === 1 ? 'task' : 'tasks'}?`, { title: 'Clear done tasks', danger: true, yes: 'Delete' })) return;
    for (const t of done) await app.remove(t, files?.of(t.id) ?? []);
    toast('Cleared');
  });

  /** @param {Task} t @param {string} today @param {boolean} changed @param {boolean} onToday  Today names no day for what is due today */
  const row = (t, today, changed, onToday) => {
    const li = document.createElement('li'), check = document.createElement('input'), main = document.createElement('button');
    li.className = 'ui-row task-row'; li.dataset.id = t.id;
    li.classList.toggle('changed', changed); li.classList.toggle('done', !!t.done);
    check.type = 'checkbox'; check.className = 'task-check'; check.checked = !!t.done; check.disabled = !canWrite;
    check.setAttribute('aria-label', `${t.done ? 'Not done' : 'Done'}: ${t.text}`);
    check.addEventListener('change', async () => {
      const done = check.checked;
      if (await app.tick(t, done)) { check.checked = !done; toast(REFUSED); return; }
      if (done) undo.show(`Done “${t.text.length > 40 ? `${t.text.slice(0, 40)}…` : t.text}”`, async () => { const now = all.find(x => x.id === t.id); if (now && await app.tick(now, false)) toast(REFUSED); });
    });
    main.type = 'button'; main.className = 'task-main'; main.textContent = t.text; main.disabled = !canWrite;
    main.addEventListener('click', () => sheet.open(t));
    const passage = filter?.passage?.(t);
    if (passage) main.append(passage);
    const thumbs = files?.thumbs(t);
    if (thumbs) main.append(thumbs);
    const sub = document.createElement('span');
    sub.className = 'ui-row-sub task-sub';
    const listName = listOf(t, lists.lists()) !== INBOX ? lists.lists().find(l => l.id === t.listId)?.name : '';
    sub.textContent = [onToday && dueOf(t) === today ? timeOf(t) : dueText(t, today), listName].filter(Boolean).join(' · ');
    sub.classList.toggle('overdue', isOverdue(t));
    li.append(check, main);
    if (sub.textContent) main.append(sub);
    return li;
  };

  const screen = sectionScreen('list-view', s => {
    const could = canWrite;
    canWrite = s.role === 'admin' || s.role === 'member';
    $('add').hidden = !canWrite; $('new-task').hidden = !canWrite;
    lists.canWrite(canWrite);
    // (a screen change is a view transition, so the tabs can be drawn before the role arrives)
    if (canWrite !== could) draw(all, new Set());
  });
  /** @param {Task[]} items @param {Set<string>} changed */
  const draw = (items, changed) => {
    all = items; filter?.feed(items);
    loading.done();
    const today = drawnDay = dayKey(), sort = app.settings.get('sort');
    const narrowed = inList(filter?.pick(items) ?? items, lists.pick(), lists.lists());
    todayShown = todayTasks(narrowed, today, sort);
    $('today').replaceChildren(...todayShown.map(t => row(t, today, changed.has(t.id), true)));
    emptyOf.today.show(todayShown.length === 0 && canWrite);
    const groups = upcomingGroups(narrowed, today, sort);
    $('upcoming').replaceChildren(...groups.map(g => {
      const sec = document.createElement('section'), h = document.createElement('h2'), ul = document.createElement('ul');
      sec.className = 'task-group'; h.className = 'task-group-title'; h.textContent = g.key ? dayLabel(g.key, today) : 'No date';
      ul.className = 'ui-list'; ul.setAttribute('aria-label', h.textContent);
      ul.replaceChildren(...g.tasks.map(t => row(t, today, changed.has(t.id), false)));
      sec.append(h, ul);
      return sec;
    }));
    emptyOf.upcoming.show(groups.length === 0 && canWrite);
    const done = doneShown = doneTasks(narrowed);
    $('done').replaceChildren(...done.map(t => row(t, today, changed.has(t.id), false)));
    $('clear-done').hidden = !canWrite || done.length === 0;
    emptyOf.done.show(done.length === 0 && canWrite);
    lists.repaint();
  };
  app.settings.watch('sort', () => draw(all, new Set()));
  // an app left open past midnight: the days (and what is overdue) move on when the page is seen again, and each minute
  const newDay = () => { if (dayKey() !== drawnDay) draw(all, new Set()); };
  document.addEventListener('visibilitychange', newDay);
  setInterval(newDay, 60_000);
  return {
    ...screen,
    /** @param {Task[]} items @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw,
    /** @param {import('../items.js').TaskList[]} next */
    drawLists(next) { lists.draw(next); draw(all, new Set()); },
    /** @returns {Task[]} the rows Today shows (what the next start paints first) */
    shown: () => todayShown,
    /** @param {Map<string, unknown[]>} by  every task's files */
    drawFiles(by) { files?.feed(by); draw(all, new Set()); sheet.redraw(); },
  };
}
