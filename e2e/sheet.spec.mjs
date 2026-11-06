// The edit sheet: Cancel, Esc and a close by the page never run the last sheet's Save or Delete again (the dialog keeps
// its returnValue across opens, and a Cancel closes it with none). Each test makes its own lists (the specs share spaces/_/).
import { test, expect, signIn, openTab, db, uniq } from './fixtures.mjs';

/** put lists in the template by name (Wednesday AM) and open the Lists tab with them drawn */
async function withLists(page, names) {
  for (const name of names) await db.put(`spaces/_/lists/${name}`, { site: 'NUH', kind: 'ot', name, wd: 3, session: 'AM', need: 1, status: 'open', updatedAt: Date.now() });
  await signIn(page, 'member');
  await openTab(page, 'lists');
  for (const name of names) await expect(rowOf(page, name)).toBeVisible({ timeout: 15_000 });
}
const rowOf = (page, name) => page.locator('#lists-host .rl-open', { hasText: name });
const saved = page => page.locator('#toasts .toast', { hasText: 'Saved' });

/** open a list, type a new name, then close the sheet without saving; the list keeps its name */
async function cancelEdit(page, name, how) {
  const sheet = page.locator('#edit-sheet');
  await rowOf(page, name).click();
  await expect(sheet).toBeVisible();
  await page.locator('#ef-name').fill(`${name} changed`);
  if (how === 'esc') await page.keyboard.press('Escape');
  else await sheet.locator('[data-close]').click();
  await expect(sheet).toBeHidden();
  // nothing should happen now: a short wait for a wrong save or delete to show
  await page.waitForTimeout(800);
  await expect(rowOf(page, name)).toBeVisible();
  await expect(page.locator('#lists-host')).not.toContainText(`${name} changed`);
  const doc = await db.get(`spaces/_/lists/${name}`);
  expect(doc?.name).toBe(name);
  expect(doc?._deleted).toBeFalsy();
}

test('sheet: after a Save, Cancel and Esc on the next sheet change nothing', async ({ phone }) => {
  const page = await phone();
  const [a, b] = [uniq('List A'), uniq('List B')];
  await withLists(page, [a, b]);
  await rowOf(page, a).click();
  await page.locator('#ef-rooms').fill('Room 7');
  await page.locator('#edit-save').click();
  await expect(saved(page)).toHaveCount(1);
  await expect(rowOf(page, a)).toContainText('Room 7');
  await expect(saved(page)).toHaveCount(0, { timeout: 10_000 });
  await cancelEdit(page, b, 'cancel');
  await expect(saved(page)).toHaveCount(0);
  await cancelEdit(page, b, 'esc');
  await expect(saved(page)).toHaveCount(0);
});

test('sheet: after a Delete, Cancel on the next sheet keeps that list', async ({ phone }) => {
  const page = await phone();
  const [a, b] = [uniq('List C'), uniq('List D')];
  await withLists(page, [a, b]);
  await rowOf(page, a).click();
  await page.locator('#edit-delete').click();
  await expect(page.locator('#toasts')).toContainText('Deleted');
  await expect(rowOf(page, a)).toHaveCount(0);
  await cancelEdit(page, b, 'cancel');
});
