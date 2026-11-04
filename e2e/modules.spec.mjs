// Engine features the shell shows: sign-out keeps this device's data, forget wipes it, and "Check for updates".
import { test, expect, signIn, addList, synced, serverHas, uniq, APP, openSettings, openWeek } from './fixtures.mjs';

const kept = page => page.evaluate(async () => {
  let n = 0;
  for (const { name } of await indexedDB.databases()) {
    if (!/hand-roster/.test(name || '')) continue;
    n += await new Promise(res => {
      const r = indexedDB.open(name);
      r.onsuccess = async () => {
        const d = r.result; let c = 0;
        for (const s of d.objectStoreNames) c += await new Promise(ok => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); q.onerror = () => ok(0); });
        d.close(); res(c);
      };
      r.onerror = () => res(0);
    });
  }
  return n;
});

test('sign-out keeps the phone’s data and unsent saves; the same account carries on', async ({ phone }) => {
  const page = await phone();
  const { email } = await signIn(page, 'member');
  await synced(page);
  const t = uniq('kept');
  await page.context().setOffline(true);
  await addList(page, t);
  await openSettings(page);
  await page.click('#sign-out');
  await openWeek(page);
  await expect(page.locator('#signed-out .ui-signin')).toBeVisible();
  await expect(page.locator('#sign-out-msg')).toContainText('kept on this device');
  expect(await kept(page)).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await page.evaluate(e => window.starter.signInAs(e), email);
  await expect(page.locator('#week-view')).toBeVisible();
  await expect(page.locator('#week-grid')).toContainText(t);
  await serverHas(t);
});

test('forget this device: refused while unsent, then wipes the phone', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.context().setOffline(true);
  await page.evaluate(() => window.starter.data().lists.add({ site: 'NUH', kind: 'ot', name: 'unsent', wd: 1, session: 'AM', need: 1, status: 'open' }));
  await openSettings(page);
  await page.click('#sign-out');
  await openWeek(page);
  await page.click('#forget');
  await expect(page.locator('#forget-msg')).toContainText('not sent yet');
  await expect(page.locator('#forget-force')).toBeVisible();
  await page.click('#forget-force');
  await expect(page.locator('#forget-msg')).toContainText('Forgotten');
  expect(await kept(page)).toBe(0);
});

test('check for updates: a new version takes over at once', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP + '&sw', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => { window.__same = true; });
  await page.request.get('/__test/bump');
  await openSettings(page, 'About');   // the About rows are in Settings
  await page.locator('.ui-check-update').click();
  await expect.poll(() => page.evaluate(() => window.__same).catch(() => undefined), { timeout: 30_000 }).toBeUndefined();
});
