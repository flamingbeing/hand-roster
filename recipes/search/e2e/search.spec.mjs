// @core/search on the sample list: the box filters the list, a phrase, -word, an operator and a misspelt operator
// behave, a word in a task's notes finds it and shows that passage marked, "/" focuses the box, and the page passes axe
// with a query typed.
import { test, expect, signIn, add, uniq } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

// the add form clears itself a moment after the item shows; wait for that before the next one
const addOne = async (page, text) => { await add(page, text); await expect(page.locator('#new-text')).toHaveValue(''); };
// (a row's button also holds its sub line and thumbnails: read just the task's own text)
const shown = page => page.locator('#today li .task-main').evaluateAll(bs => bs.map(b => b.firstChild?.textContent ?? ''));

test('the search box narrows the list, with phrase, leave-out, operators and a hint', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const tag = uniq('s').replace(/[^a-z]/g, '');
  await addOne(a, `${tag} spinal for knee`);
  await addOne(a, `${tag} epidural for hip, 12 hours`);
  await addOne(a, `${tag} spinal day surgery`);
  const q = a.locator('#q');

  await q.fill(`${tag} spinal`);
  await expect.poll(() => shown(a)).toHaveLength(2);

  await q.fill(`${tag} -spinal`);
  await expect.poll(() => shown(a)).toEqual([`${tag} epidural for hip, 12 hours`]);

  await q.fill(`"${tag} spinal day"`);
  await expect.poll(() => shown(a)).toEqual([`${tag} spinal day surgery`]);

  await q.fill(`${tag} has:number`);
  await expect.poll(() => shown(a)).toEqual([`${tag} epidural for hip, 12 hours`]);

  await q.fill(`${tag} hsa:number`);
  await expect(a.locator('#search-msg')).toHaveText('Did you mean has:?');

  await q.fill(`${tag} nothing-like-this`);
  await expect(a.locator('#search-msg')).toHaveText('No matches');

  await q.fill('');
  expect((await shown(a)).filter(t => t.startsWith(tag))).toHaveLength(3);
});

test('a word in a task’s notes finds it, and the row shows that passage with the word marked', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const tag = uniq('p').replace(/[^a-z]/g, ''), word = `${tag}gate`;
  await a.click('#new-task');
  await a.fill('#task-text', `${tag} call back`);
  await a.fill('#task-notes', `Ask about the side ${word} code, then the parcel.`);
  await a.click('#task-save');
  await expect(a.locator('#today')).toContainText(`${tag} call back`);
  const row = a.locator('#today li', { hasText: `${tag} call back` });

  await a.fill('#q', `${tag}ga`);
  await expect.poll(() => shown(a)).toEqual([`${tag} call back`]);
  await expect(row.locator('.search-passage')).toHaveText(`Ask about the side ${word} code, then the parcel.`);
  await expect(row.locator('.search-passage mark')).toHaveText(word);
  expect(await AxeBuilder(a)).toEqual([]);

  // found by its text alone: no passage; with the box empty none
  await a.fill('#q', `"${tag} call"`);
  await expect.poll(() => shown(a)).toEqual([`${tag} call back`]);
  await expect(row.locator('.search-passage')).toHaveCount(0);
  await a.fill('#q', '');
  await expect(a.locator('#today .search-passage')).toHaveCount(0);
});

test('"/" focuses the search box; axe passes with a query typed', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  // (the "Added" toast springs in once the form clears: wait for that, so axe's wait for animations covers it)
  await addOne(a, uniq('axe'));
  await a.locator('body').press('/');
  await expect(a.locator('#q')).toBeFocused();
  await a.fill('#q', 'is:long');
  expect(await AxeBuilder(a)).toEqual([]);
});
