// Arrange tabs (Settings, Tab bar; @core/ui tabArranger): a tab taken off the bar is listed at the top of the Settings
// menu, one tap away, and stays off after a reload (the tabs option, this device).
import { test, expect, APP, openSettings } from './fixtures.mjs';

test('a tab taken off the bar is one tap away in Settings and stays off', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const people = page.locator('.ui-tabbar [data-tab-id="people"]');
  await expect(people).toBeVisible();

  await openSettings(page, 'Tab bar');
  await expect(page.getByRole('switch', { name: 'On the tab bar: Settings' })).toBeDisabled();   // Settings stays
  await page.getByRole('switch', { name: 'On the tab bar: People' }).click();
  await expect(people).toHaveAttribute('data-off-bar', '');
  await expect(people).toBeHidden();

  await page.locator('#settings-host .ui-settings-back:visible').click();
  const off = page.locator('#settings-host .ui-settings-top').getByRole('button', { name: 'People' });
  await off.click();
  await expect(page.locator('#people-page')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ui-tabbar [data-tab-id="people"]')).toHaveAttribute('data-off-bar', '');
});
