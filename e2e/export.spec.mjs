// Taking the roster out: the Excel file of the week and of the calls, the print sheet of the hand-made grid, and the
// chat text. Written with the Playwright checks of the other specs; they run in CI with the emulator.
import { test, expect, signIn, openTab, openWeek, addList, clickOpens } from './fixtures.mjs';

/** @param {import('@playwright/test').Page} page @param {string} item  a pick from the Week's More menu */
const share = async (page, item) => {
  await page.locator('#week-more').click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('the week downloads as the CORE sheet and as the hand-made grid, and prints as the hand-made grid', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  const name = `KRWOT ${Date.now() % 1000}`;
  await addList(page, name);
  // the maker's bar: Epic and Build until the week is built, then More (built five weeks on: the other specs share the
  // space and want this week unbuilt)
  for (let i = 0; i < 5; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  await expect(page.locator('#week-more')).toBeHidden();
  await page.locator('#week-build').click();
  await expect(page.locator('#week-more')).toBeVisible();
  await expect(page.locator('#week-build')).toBeHidden();

  const [download] = await Promise.all([page.waitForEvent('download'), share(page, 'Excel (CORE)')]);
  expect(download.suggestedFilename()).toMatch(/^hrm-roster-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [hand] = await Promise.all([page.waitForEvent('download'), share(page, 'Excel (hand grid)')]);
  expect(hand.suggestedFilename()).toMatch(/^hrm-hand-grid-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // the Grid (the first view) shows the list; Day shows it as a card
  await expect(page.locator('#week-table .wt-list', { hasText: name }).first()).toBeVisible();
  await page.locator('#week-show-day').click();
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
  await share(page, 'Print');
  await expect.poll(() => page.evaluate(() => window.__printed === true)).toBe(true);
  await expect(page.locator('#week-print-sheet .pr-title')).toContainText('HRM Registrar/Fellows/Medical Officer Daily Roster');
  await expect(page.locator('#week-print-sheet .pr-table')).toContainText(name);
  await expect(page.locator('#week-print-sheet th[scope=row]')).toHaveText(['AM sessions', 'PM sessions', 'On call', 'Leave', 'Post-call', 'Free']);

  // the date takes you back to this week
  await page.locator('#week-title').click();
  await expect(page.locator('#week-title')).not.toHaveClass(/is-away/);
});

test('copy for WhatsApp says when there is nothing built to copy; the calls tab has its Excel button', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'viewer');   // (a viewer has More on an unbuilt week; the maker has Epic and Build there)
  await openWeek(page);
  await share(page, 'Copy the whole week');
  await expect(page.locator('#toasts')).toContainText('The week of');
  await expect(page.locator('#toasts')).toContainText('not built yet');
  // the next working day is named in its item
  await page.locator('#week-more').click();
  await expect(page.getByRole('menuitem', { name: /^Copy next working day \((Mon|Tue|Wed|Thu|Fri) \d+ [A-Z][a-z]{2}\)$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await openTab(page, 'calls');
  await expect(page.locator('#calls-xlsx')).toBeVisible();
});
