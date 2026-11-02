// Offline saves and two phones (held conflicts: the app-sync suite covers them; a Lists-tab version is a follow-up).
import { test, expect, clickOpens, signIn, signInAgain, addList, synced, serverHas, uniq, APP } from './fixtures.mjs';

test('a save made offline is kept on the phone and sent once back online, even after closing the page', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const t = uniq('offline');
  await page.context().setOffline(true);
  await addList(page, t);
  await expect.poll(() => page.evaluate(() => window.starter.status)).not.toBe('synced');
  // the page closes while offline; the outbox (IndexedDB) still holds the save
  const again = await page.context().newPage();
  await page.close();
  await page.context().setOffline(false);
  // still signed in on this phone: the list shows straight away, and the outbox sends what it kept
  await again.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(again.locator('#week-view')).toBeVisible();
  await serverHas(t);
  await synced(again);
});

test('the bar\'s sync button shows the state as its icon; offline, a tap retries and the save goes once back online', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const btn = page.locator('.ui-bar #sync-btn');
  await expect(btn).toHaveAttribute('data-state', 'synced');
  await expect(btn).toHaveAttribute('aria-label', /Sync now$/);
  await page.context().setOffline(true);
  const t = uniq('button');
  await addList(page, t);
  await expect(btn).not.toHaveAttribute('data-state', 'synced');
  await btn.click();
  expect(await page.evaluate(() => window.starter.syncTaps)).toBe(1);
  await page.context().setOffline(false);
  await btn.click();
  await serverHas(t);
  await expect(btn).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
});

test('two phones see each other’s changes', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('shared');
  await addList(a, t);
  await expect(b.locator('#week-grid')).toContainText(t, { timeout: 15_000 });
});
