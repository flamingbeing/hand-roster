// The roster screens: the app loads, the Week tab is the first screen, the other tabs open (lazily), a viewer is read-only.
import { test, expect, signIn, openTab, openWeek, openSettings, db, uniq } from './fixtures.mjs';

test('a member lands on the Week tab and every tab opens', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await signIn(page, 'member');
  await expect(page.locator('#week-page')).toBeVisible();
  await expect(page.locator('#week-build')).toBeVisible();
  for (const name of ['calls', 'people', 'lists']) await openTab(page, name);
  // the phone's bar holds five tabs: Leave is off it, one tap away at the top of the Settings menu
  await openSettings(page);
  await page.locator('#settings-host .ui-settings-top').getByRole('button', { name: 'Leave' }).click();
  await expect(page.locator('#leave-page')).toBeVisible();
  await openWeek(page);
  await expect(page.locator('#week-view')).toBeVisible();
  // opened again on this device: the start frame (a load state painted before sign-in is back) goes once the week is drawn
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#week-table')).toBeVisible();
  await expect(page.locator('#week-state .load-row')).toHaveCount(0);
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('a person added in the data shows on the People tab', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('Dr Ann Test');
  await db.put(`spaces/_/people/${name}`, { name, grade: 'reg', rank: 'Reg', active: true, updatedAt: Date.now() });
  await openTab(page, 'people');
  await expect(page.locator('#people-host')).toContainText(name, { timeout: 15_000 });
});
