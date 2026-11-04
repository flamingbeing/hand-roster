// @core/settings on the Settings pages: a device value stays on this device (it survives sign-out and a reload), and the
// open pages pass axe.
import { test, expect, signIn, synced, openSettings, openWeek } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

const big = page => page.getByRole('switch', { name: /Larger rows/ });

test('the device value survives sign-out and a reload', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await synced(a);
  await openSettings(a, 'Roster');
  await big(a).check();
  await openWeek(a);
  await expect(a.locator('.ui-screens')).toHaveClass(/big/);
  await openSettings(a);
  await a.click('#sign-out');
  await expect(a.locator('#signed-out .ui-signin')).toBeVisible();
  await a.reload({ waitUntil: 'domcontentloaded' });
  await expect(a.locator('#signed-out .ui-signin')).toBeVisible();
  await a.evaluate(e => window.starter.signInAs(e), email);
  await openWeek(a);   // (signed back in on the tab left open: Settings)
  await expect(a.locator('#week-view')).toBeVisible();
  await expect(a.locator('.ui-screens')).toHaveClass(/big/);
});

test('the Settings page passes axe', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await openSettings(a);
  expect(await AxeBuilder(a)).toEqual([]);   // the menu
  await openSettings(a, 'Roster');
  expect(await AxeBuilder(a)).toEqual([]);   // a page
});
