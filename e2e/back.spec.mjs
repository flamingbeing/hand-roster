// Back with tabs: switching tabs adds at most one Back step; Back on another tab goes to the first tab, Back there asks once, then leaves the app.
import { test, expect, signIn, openTab } from './fixtures.mjs';

test('tabs A -> B -> C add at most one Back step; Back goes to the first tab, then (asked once) out of the app', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(page.locator('#week-page')).toBeVisible();
  const start = await page.evaluate(() => history.length);
  const appUrl = page.url();

  await openTab(page, 'calls');
  await openTab(page, 'people');
  await openTab(page, 'settings');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(start + 1);

  await page.goBack();
  await expect(page.locator('#week-page')).toBeVisible();
  expect(page.url()).toBe(appUrl);

  await page.goBack();   // the first Back on the first tab asks, the second within 2 s leaves
  await expect(page.getByText('Press Back again to close')).toBeVisible();
  expect(page.url()).toBe(appUrl);
  await page.goBack();
  await expect.poll(() => page.url()).not.toBe(appUrl);

});
