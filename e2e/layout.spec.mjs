// The export layout and the fairness tally: a maker words a tally column on the Rules tab and the hand-grid Excel carries it;
// the Fairness sheet adds up calls and weighs them by the maker's weights. Invented names only. The layout and weight
// records are shared by every spec, so each test puts them back (deleted) before it ends.
import { execFileSync } from 'node:child_process';
import { test, expect, signIn, openTab, openWeek, addList, db, uniq } from './fixtures.mjs';

test('a maker changes a tally word in the export layout and the hand-grid Excel carries it', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  try {
    await openTab(page, 'rules');
    await page.locator('#rules-layout').click();
    await expect(page.locator('#edit-title')).toHaveText('Export layout');
    await page.getByLabel('Tally column: EOT', { exact: true }).fill('Emergency OT e2e');
    await page.locator('#edit-save').click();
    await expect.poll(async () => (await db.get('spaces/_/layouts/export'))?.labels?.['tally.eot'], { timeout: 15_000 }).toBe('Emergency OT e2e');

    // a built week of its own (46 on: the other specs use 5 to 38), then its hand grid
    await openWeek(page);
    await addList(page, `KRWOT ${Date.now() % 1000}`);
    for (let i = 0; i < 46; i++) await page.locator('#week-next').click();
    await expect(page.locator('#week-title')).toHaveClass(/is-away/);
    await page.locator('#week-build').click();
    await expect(page.locator('#week-more')).toBeVisible({ timeout: 15_000 });
    await page.locator('#week-more').click();
    const [hand] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Excel (hand grid)' }).click()]);
    const strings = execFileSync('unzip', ['-p', await hand.path(), 'xl/sharedStrings.xml'], { encoding: 'utf8' });
    expect(strings).toContain('Emergency OT e2e');
    expect(strings).not.toContain('>EOT<');
  } finally {
    await db.del('spaces/_/layouts/export');
  }
});

test('the Fairness sheet adds up a range of months, and a maker\'s weights change the score', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b] = [uniq('Dr Ann Test'), uniq('Dr Bo Test')];
  // a month of its own, far ahead (a Saturday call counts as a weekend call)
  await db.put('spaces/_/rosters/2031-03', { calls: [
    { date: '2031-03-04', con: null, reg: a, reg2: null, moNuh: b, moNtf: null },
    { date: '2031-03-08', con: null, reg: a, reg2: null, moNuh: null, moNtf: null }], updatedAt: Date.now() });
  try {
    await openTab(page, 'calls');
    await page.locator('#calls-fairness').click();
    await expect(page.locator('#edit-title')).toHaveText('Fairness');
    await page.locator('#ty-from').fill('2031-03');
    await page.locator('#ty-to').fill('2031-03');
    const rowA = page.locator(`#ty-table tr[data-name="${a}"]`), rowB = page.locator(`#ty-table tr[data-name="${b}"]`);
    await expect(rowA.locator('.ty-score')).toHaveText('3');   // two REG calls (1 each) and a weekend one (+1)
    await expect(rowB.locator('.ty-score')).toHaveText('1');
    await page.locator('.ty-weights summary').click();
    await page.locator('#ty-w-weekend').fill('5');
    await expect(rowA.locator('.ty-score')).toHaveText('7');
    await page.locator('#edit-save').click();
    await expect.poll(async () => (await db.get('spaces/_/layouts/tally'))?.weights?.weekend, { timeout: 15_000 }).toBe(5);
  } finally {
    await db.del('spaces/_/layouts/tally');
    await db.del('spaces/_/rosters/2031-03');
  }
});

test('a viewer reads the Fairness table but has no weights or export layout', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'viewer');
  await openTab(page, 'calls');
  await page.locator('#calls-fairness').click();
  await expect(page.locator('#edit-title')).toHaveText('Fairness');
  await expect(page.locator('.ty-weights')).toHaveCount(0);
  await page.locator('#edit-save').click();
  await openTab(page, 'rules');
  await expect(page.locator('#rules-layout')).toBeHidden();
});
