// The three tabs and what moves a task between them: due days, no day, ticking (with Undo), lists, Clear; each tab passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, clickOpens, signIn, synced, serverHas, uniq, today, openToday, openTab, db } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

test('a task goes to Today, Upcoming (by day, then No date) or Done by its day and tick', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [now, late, soon, none] = [uniq('now'), uniq('late'), uniq('soon'), uniq('none')];
  await put(now, { text: now, due: day(0) });
  await put(late, { text: late, due: day(-2) });
  await put(soon, { text: soon, due: day(3) });
  await put(none, { text: none });
  await expect(page.locator('#today')).toContainText(now);
  await expect(page.locator('#today')).toContainText(late);
  await expect(page.locator('#today')).not.toContainText(soon);
  await expect(page.locator('#today li', { hasText: late }).locator('.overdue')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);

  await openTab(page, 'upcoming');
  await expect(page.locator('#upcoming')).toContainText(soon);
  await expect(page.locator('#upcoming')).not.toContainText(now);
  // tasks with no day sit in a trailing "No date" group
  const titles = await page.locator('#upcoming .task-group-title').allTextContents();
  expect(titles.at(-1)).toBe('No date');
  await expect(page.locator('#upcoming .task-group', { hasText: 'No date' })).toContainText(none);
  expect(await AxeBuilder(page)).toEqual([]);

  await openToday(page);
  await page.getByRole('checkbox', { name: `Done: ${now}` }).click();
  await expect(page.locator('#today')).not.toContainText(now);
  await openTab(page, 'done');
  await expect(page.locator('#done')).toContainText(now);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.getByRole('checkbox', { name: `Not done: ${now}` }).click();
  await expect(page.locator('#done')).not.toContainText(now);
  await openToday(page);
  await expect(page.locator('#today')).toContainText(now);
});

test('ticking shows Undo, which puts the task back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('undo');
  await put(t, { text: t, due: day(0) });
  await page.getByRole('checkbox', { name: `Done: ${t}` }).click();
  await expect(page.locator('#today')).not.toContainText(t);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(t);
});

test('the task sheet sets a day, time, notes and list; New defaults to today on Today', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.evaluate(() => window.starter.add('x'));   // (a first task so the page has settled)
  const list = uniq('list'), t = uniq('sheet');
  await page.click('#today-page .list-edit');
  await page.fill('#list-name', list);
  await page.click('#list-add button[type=submit]');
  await expect(page.locator('#lists-manage').getByLabel(`Name of the list ${list}`)).toHaveValue(list);   // (the lists are shared: look for this one)
  await page.locator('#lists-sheet').getByRole('button', { name: 'Done' }).click();
  await page.click('#new-task');
  await expect(page.locator('#task-due')).toHaveValue(day(0));
  await page.fill('#task-text', t);
  await page.fill('#task-notes', 'bring the form');
  await page.fill('#task-due', day(1));
  await page.fill('#task-time', '14:30');
  await page.selectOption('#task-list', { label: list });
  await expect(page.locator('#task-sheet')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.click('#task-save');
  await openTab(page, 'upcoming');
  await expect(page.locator('#upcoming li', { hasText: t })).toContainText(`Tomorrow 14:30 · ${list}`);
  await serverHas(t);
  // the picked list narrows every tab, and is where a new quick add goes
  await page.locator('#upcoming-page .list-chip', { hasText: list }).click();
  await expect(page.locator('#upcoming')).toContainText(t);
  await page.locator('#upcoming-page .list-chip', { hasText: 'Inbox' }).click();
  await expect(page.locator('#upcoming')).not.toContainText(t);
});

test('Clear deletes the done tasks after a question', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('clear');
  await put(t, { text: t, done: true, doneAt: Date.now() });
  await openTab(page, 'done');
  await expect(page.locator('#done')).toContainText(t);
  await page.click('#clear-done');
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.locator('#done')).not.toContainText(t);
  await synced(page);
});

test('a start with nothing kept for Today: the early skeleton goes once the tasks arrive', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.evaluate(() => localStorage.setItem('app:last-list', '[]'));   // as after a visit with Today empty
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#today-state .load-row')).toHaveCount(0);
  await expect(page.locator('#today-state')).not.toHaveAttribute('aria-busy', 'true');
});
