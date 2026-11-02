// Back after a redirect sign-in: the page the sign-in left from is kept whole by the browser (the back/forward cache),
// still on the sign-in screen. Back (asked once) to it must open it as it is now (the list), and Back from there leaves the app.
// Playwright turns that cache off, so this test has its own browser with it on.
import { test as base, expect, chromium } from '@playwright/test';
import { APP, db, uniq } from './fixtures.mjs';

const test = base.extend({
  bfPage: async ({ baseURL }, use) => {
    const browser = await chromium.launch({
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    });
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // each document's pageshows (true: brought back from the cache)
    await context.addInitScript(() => { addEventListener('pageshow', e => { window.__shown = (window.__shown || []).concat(e.persisted); }); });
    await use(await context.newPage());
    await browser.close();
  },
});

test('Back after signing in never shows the sign-in screen again, and Back from the list leaves', async ({ bfPage: page }) => {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out')).toBeVisible();
  // the redirect: the page leaves while signed out, and the sign-in lands on a new load of the app
  await page.goto(`${APP}&back`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), `${uniq('u')}@example.com`);
  await expect(page.locator('#no-access')).toBeVisible();
  await db.put(`members/${await page.locator('#uid').textContent()}`, { role: 'member', v: 1 });
  await expect(page.locator('#list-view')).toBeVisible();

  // (a page from the cache fires no load event; each page's first Back asks "Press Back again to close")
  await page.goBack({ waitUntil: 'commit' });
  await expect(page.getByText('Press Back again to close')).toBeVisible();
  await page.goBack({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => window.__shown).catch(() => null)).toEqual([false]);   // loaded again
  expect(new URL(page.url()).search).toBe('?emulator');
  await expect(page.locator('#list-view')).toBeVisible();
  await expect(page.locator('#signed-out')).toBeHidden();

  await page.goBack({ waitUntil: 'commit' });   // asks once
  await expect(page.getByText('Press Back again to close')).toBeVisible();
  await page.goBack({ waitUntil: 'commit' });
  await expect.poll(() => page.url()).toBe('about:blank');
});
