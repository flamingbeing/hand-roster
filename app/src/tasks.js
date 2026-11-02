// What a task is, as plain functions (no page, no clock but the `now` they are given): which tab a task belongs to, how
// each tab orders and groups its tasks, and the words for a due day. node tests run them (app/test/tasks.unit.test.mjs).
// A day is a local-time YYYY-MM-DD string, so "today" is the person's today and sorts as text.
import { INBOX } from './items.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').TaskList} TaskList */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** @param {Date} [d] @returns {string} */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** @param {Date} [d] @returns {string} */
export const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** @param {string} key @param {number} n  days later (or earlier) @returns {string} */
export const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
/** @param {string} key @returns {Date} noon that day (a day shift never changes the date) */
const at = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
/** @param {unknown} v */
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayKey(at(v)) === v;
/** @param {unknown} v */
export const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** @param {Task} t @returns {string | null} the due day, if it has a valid one */
export const dueOf = t => (isDay(t.due) ? /** @type {string} */ (t.due) : null);
/** @param {Task} t @returns {string | null} the due time, only with a due day */
export const timeOf = t => (dueOf(t) && isTime(t.dueTime) ? /** @type {string} */ (t.dueTime) : null);

/** the list a task shows under: its own while that list exists, else Inbox @param {Task} t @param {TaskList[]} lists */
export const listOf = (t, lists) => (t.listId && lists.some(l => l.id === t.listId) ? t.listId : INBOX);

/** open, due before today, or today with the time gone @param {Task} t @param {Date} [now] */
export function isOverdue(t, now = new Date()) {
  const due = dueOf(t);
  if (t.done || !due) return false;
  const today = dayKey(now);
  return due < today || (due === today && !!timeOf(t) && /** @type {string} */ (timeOf(t)) < timeKey(now));
}

/** @typedef {'due' | 'title' | 'newest'} Sort */
/** @type {Record<Sort, (a: Task, b: Task) => number>} */
const ORDER = {
  // earlier day and time first; a task with no time sorts before the day's timed ones
  due: (a, b) => (dueOf(a) ?? '9').localeCompare(dueOf(b) ?? '9') || (timeOf(a) ?? '').localeCompare(timeOf(b) ?? '') || (a.createdAt ?? 0) - (b.createdAt ?? 0),
  title: (a, b) => a.text.localeCompare(b.text) || (a.createdAt ?? 0) - (b.createdAt ?? 0),
  newest: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
};

/** @param {Task[]} tasks @param {Sort} sort @returns {Task[]} */
const sorted = (tasks, sort) => [...tasks].sort(ORDER[sort] ?? ORDER.due);

/** Today: open tasks due today or before, overdue first (oldest first), then today's as `sort` says @param {Task[]} tasks @param {string} today @param {Sort} sort */
export function todayTasks(tasks, today, sort = 'due') {
  const open = tasks.filter(t => !t.done && (dueOf(t) ?? '9') <= today);
  const late = open.filter(t => /** @type {string} */ (dueOf(t)) < today).sort(ORDER.due);
  return [...late, ...sorted(open.filter(t => dueOf(t) === today), sort)];
}

/** Upcoming: open tasks after today, then those with no day, as groups by day @param {Task[]} tasks @param {string} today @param {Sort} sort
 * @returns {{ key: string, tasks: Task[] }[]} key: the day, or '' for no day */
export function upcomingGroups(tasks, today, sort = 'due') {
  const open = tasks.filter(t => !t.done && (dueOf(t) === null || /** @type {string} */ (dueOf(t)) > today));
  /** @type {Map<string, Task[]>} */
  const by = new Map();
  for (const t of open) by.set(dueOf(t) ?? '', [...by.get(dueOf(t) ?? '') ?? [], t]);
  const keys = [...by.keys()].filter(Boolean).sort();
  if (by.has('')) keys.push('');
  return keys.map(key => ({ key, tasks: sorted(/** @type {Task[]} */ (by.get(key)), sort) }));
}

/** Done: newest first @param {Task[]} tasks */
export const doneTasks = tasks => tasks.filter(t => t.done)
  .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0));

/** @param {Task[]} tasks @param {string} filter  'all' or a list id @param {TaskList[]} lists */
export const inList = (tasks, filter, lists) => (filter === 'all' ? tasks : tasks.filter(t => listOf(t, lists) === filter));

/** open tasks per list id (Inbox included) @param {Task[]} tasks @param {TaskList[]} lists @returns {Map<string, number>} */
export function openCounts(tasks, lists) {
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const t of tasks) if (!t.done) n.set(listOf(t, lists), (n.get(listOf(t, lists)) ?? 0) + 1);
  return n;
}

/** lists in their order, then by name @param {TaskList[]} lists */
export const orderedLists = lists => [...lists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const weekdayYear = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** "Today", "Tomorrow", "Yesterday", else "Mon 3 Nov" (with the year when it is not this one) @param {string} key @param {string} today */
export function dayLabel(key, today) {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return (key.slice(0, 4) === today.slice(0, 4) ? weekday : weekdayYear).format(at(key));
}
/** the line under a task: "Tomorrow 14:30", or "" with no day @param {Task} t @param {string} today */
export function dueText(t, today) {
  const due = dueOf(t);
  return due ? [dayLabel(due, today), timeOf(t)].filter(Boolean).join(' ') : '';
}

/** What an add or edit stores: text trimmed, a bad or empty day/time/list as null, no time without a day. @param {import('./items.js').Fields} f */
export function cleanFields(f) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (f.text !== undefined) out.text = f.text.trim();
  if (f.notes !== undefined) out.notes = f.notes?.trim() ? f.notes.trim() : null;
  if (f.listId !== undefined) out.listId = f.listId && f.listId !== INBOX ? f.listId : null;
  if (f.due !== undefined) out.due = isDay(f.due) ? f.due : null;
  if (f.dueTime !== undefined) out.dueTime = isTime(f.dueTime) ? f.dueTime : null;
  if (out.due === null) out.dueTime = null;
  return out;
}
