// Taking the roster out: the Excel file of the week and of the calls, the print sheet of the hand-made grid, and the
// chat text. Written with the Playwright checks of the other specs; they run in CI with the emulator.
import { test, expect, signIn, openTab, openWeek, addList, clickOpens } from './fixtures.mjs';

test('the week downloads as the CORE sheet and as the hand-made grid, and prints as the hand-made grid', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  const name = `KRWOT ${Date.now() % 1000}`;
  await addList(page, name);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#week-xlsx').click()]);
  expect(download.suggestedFilename()).toMatch(/^hrm-roster-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [hand] = await Promise.all([page.waitForEvent('download'), page.locator('#week-hand-xlsx').click()]);
  expect(hand.suggestedFilename()).toMatch(/^hrm-hand-grid-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // a list's patients for this week only, from its edit button; the sheet shows them again when reopened
  const card = page.locator('.wk-list', { hasText: name }).first();
  await clickOpens(card.locator('.wk-edit'), page.locator('#edit-sheet'));
  await page.locator('#ef-patients').fill('21');
  await page.locator('#edit-save').click();
  await expect(page.locator('#edit-sheet')).toBeHidden();
  await clickOpens(card.locator('.wk-edit'), page.locator('#edit-sheet'));
  await expect(page.locator('#ef-patients')).toHaveValue('21');
  await expect(page.locator('#edit-delete')).toBeVisible();
  await page.locator('#edit-sheet [data-close]').click();

  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.locator('#week-print').click();
  await expect.poll(() => page.evaluate(() => window.__printed === true)).toBe(true);
  await expect(page.locator('#week-print-sheet .pr-title')).toContainText('HRM Registrar/Fellows/Medical Officer Daily Roster');
  await expect(page.locator('#week-print-sheet .pr-table')).toContainText(name);
  await expect(page.locator('#week-print-sheet th[scope=row]')).toHaveText(['AM sessions', 'PM sessions', 'On call', 'Leave', 'Post-call']);
});

test('copy for WhatsApp says when there is nothing built to copy; the calls tab has its Excel button', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  await page.locator('#week-copy').click();
  await expect(page.locator('#toasts')).toContainText('not built yet');
  await openTab(page, 'calls');
  await expect(page.locator('#calls-xlsx')).toBeVisible();
});
