// Calls > Settings: Suggest public holidays fills the month's Singapore holidays; a mistyped day is named, not saved.
import { test, expect, signIn, openTab, db } from './fixtures.mjs';

test('calls settings: suggest public holidays, a mistyped day is ignored and said so', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  // a month in the holiday table with a weekday holiday (Deepavali on a Thursday)
  const month = '2027-10', title = 'October 2027';
  await db.put(`spaces/_/rosters/${month}`, { holidays: [], updatedAt: Date.now() });
  await openTab(page, 'calls');
  const shown = async () => {
    const [m, y] = String(await page.locator('#calls-title').textContent()).split(' ');
    return Number(y) * 12 + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(m);
  };
  const want = 2027 * 12 + 9;
  for (let i = 0; i < 36 && await shown() !== want; i++) await page.getByRole('button', { name: await shown() < want ? 'Next month' : 'Previous month' }).click();
  await expect(page.locator('#calls-title')).toHaveText(title);
  await expect(page.locator('#calls-host .cl-state [role="status"]')).toContainText('Public holidays not set for this month', { timeout: 15_000 });
  await page.locator('#calls-host').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  await expect(page.locator('#edit-sheet')).toContainText('28 Oct Deepavali');
  await page.locator('#ef-holidays').fill('28 Oct');
  await page.locator('#calls-suggest-holidays').click();
  await expect(page.locator('#ef-holidays')).toHaveValue('2027-10-28\n28 Oct');
  await expect(page.locator('#edit-sheet .warn')).toHaveText('Ignored: 28 Oct (use YYYY-MM-DD within October 2027).');
  await page.locator('#edit-save').click();
  await expect(page.locator('#toasts')).toContainText('Saved. Ignored: 28 Oct');
  await expect.poll(async () => (await db.get(`spaces/_/rosters/${month}`))?.holidays, { timeout: 15_000 }).toEqual(['2027-10-28']);
  await expect(page.locator('#calls-host .cl-state [role="status"]')).not.toContainText('Public holidays not set');
});
