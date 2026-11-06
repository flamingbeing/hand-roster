// The Leave and requests tab: a run of request days saved in one go (and taken back with one Undo), the Who filter, a
// name no longer on the roster tagged, and leave lines pasted from a message. Invented names only.
import { test, expect, signIn, openTab, db, uniq, today } from './fixtures.mjs';

/** a day `n` days from today, YYYY-MM-DD */
const ahead = (/** @type {number} */ n) => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };

test('three request days in one go, the Who filter shows only theirs, one Undo takes them all back', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  const name = uniq('Dr Ann Test');
  await db.put(`spaces/_/people/${name}`, { name, grade: 'reg', rank: 'Reg', active: true, updatedAt: Date.now() });
  // someone else's request, so the filter has something to leave out
  await db.put(`spaces/_/requests/${uniq('rq')}`, { name: uniq('Dr Ben Test'), date: ahead(41), type: 'want', tier: null, updatedAt: Date.now() });
  await openTab(page, 'people');
  await expect(page.locator('#people-host')).toContainText(name, { timeout: 15_000 });
  await openTab(page, 'leave');
  await page.locator('#request-add').click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  await page.locator('#ef-name').selectOption(name);
  await page.locator('#ef-date').fill(ahead(40));
  await page.locator('#ef-to').fill(ahead(42));
  await page.locator('#edit-save').click();
  const toast = page.locator('#toasts .toast', { hasText: 'Saved 3 requests' });
  await expect(toast).toBeVisible();
  await page.locator('#leave-who').selectOption(name);
  const rows = page.locator('#leave-host .rl-row');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#leave-host .rl-row', { hasNotText: name })).toHaveCount(0);
  await expect(page.locator('#leave-host .rl-month').first()).toBeVisible();
  await expect(page.locator('#leave-host')).toContainText(`No leave for ${name}.`);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#leave-host')).toContainText(`No requests for ${name}.`);
});

test('leave for a name not on the roster is tagged', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  const gone = uniq('Dr Gone Test');
  await db.put(`spaces/_/leave/${uniq('lv')}`, { name: gone, from: ahead(30), to: ahead(31), session: 'both', updatedAt: Date.now() });
  await openTab(page, 'leave');
  await expect(page.locator(`#leave-who option[value="${gone}"]`)).toHaveCount(1, { timeout: 15_000 });
  await page.locator('#leave-who').selectOption(gone);
  await expect(page.locator('#leave-host .rl-row', { hasText: gone }).locator('.rl-tag')).toHaveText('Not on the roster');
});

test('pasted leave lines show a live count, Save adds each new row once, one Undo takes them back', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  const name = uniq('Dr Ann Test');
  // today, as the message writes it ("7 Nov"): always this year and never past
  const d = new Date();
  const day = `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
  await openTab(page, 'leave');
  await page.locator('#leave-paste').click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  // all day, the PM of the same day (its own row), and the first line again (skipped)
  await page.locator('#ef-text').fill(`${name} ${day}\n${name} ${day} (away PM)\n${name} ${day}`);
  await expect(page.locator('#edit-sheet .warn')).toContainText('2 leave rows to add, 1 already there.');
  await page.locator('#edit-save').click();
  const toast = page.locator('#toasts .toast', { hasText: 'Added 2 leave rows' });
  await expect(toast).toBeVisible();
  await page.locator('#leave-who').selectOption(name);
  const rows = page.locator('#leave-host .rl-row');
  await expect(rows).toHaveCount(2);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#leave-host')).toContainText(`No leave for ${name}.`);
});
