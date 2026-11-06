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

test('a laptop: the side bar with icons and a hide button, the pages use the width, Calls draws on first open', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  await expect(page.locator('html[data-wide-ready]')).toHaveCount(1);
  await expect(page.locator('.ui-side-toggle')).toBeVisible();
  await expect(page.locator('.ui-bar-menu')).toBeHidden();
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await expect(page.locator('#side .side-icon svg')).toHaveCount(6);
  // the week grid runs past the kit's 800 px reading width
  expect((await page.locator('#week-page').boundingBox())?.width).toBeGreaterThan(900);
  // two teams sit side by side (the other tests' people are in the same space: found by name)
  const names = [uniq('Dr A'), uniq('Dr B')];
  for (const [i, name] of names.entries()) await db.put(`spaces/_/people/${name}`, { name, grade: 'reg', rank: 'Reg', team: uniq(`Team ${i}`), active: true, updatedAt: Date.now() });
  await page.locator('#side [data-tab-page="#people-page"]').click();
  const blockOf = (/** @type {string} */ name) => page.locator('#people-host .rl-block', { hasText: name });
  await expect(blockOf(names[1])).toBeVisible({ timeout: 15_000 });
  const [a, b] = [await blockOf(names[0]).boundingBox(), await blockOf(names[1]).boundingBox()];
  expect(a && b && (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) > 100)).toBe(true);
  expect((await page.locator('#people-host .rl-block').first().boundingBox())?.width).toBeLessThan(700);
  await page.locator('#side [data-tab-page="#calls-page"]').click();
  await expect(page.locator('#calls-title')).toBeVisible();
  await expect(page.locator('#calls-host .cl-day').first()).toBeVisible();
});
