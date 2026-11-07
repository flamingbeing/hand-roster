// Draft and published (roster/drafts.js, screens/week-edit.js): Build again on a week with juniors shows a preview with the
// changes marked; Discard saves nothing, Apply saves into a draft that viewers don't see until Publish; Back to draft and
// Discard draft. Invented names only.
import { test, expect, signIn, openWeek, db, uniq } from './fixtures.mjs';

test('Build again previews, Apply saves a draft viewers don\'t see, Publish shows it to them', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, 38 on (the refill spec uses 34)
  for (let i = 0; i < 38; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  // spares besides Pia: other specs' Monday lists run at the same time and take free people too
  const a = uniq('OT P'), [p1, ...spare] = ['Dr Pia Test', 'Dr Quy Test', 'Dr Rex Test', 'Dr Sol Test', 'Dr Tia Test'].map(n => uniq(n));
  for (const n of [p1, ...spare]) await db.put(`spaces/_/people/${n}`, { name: n, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  await db.put(`spaces/_/lists/${a}`, { site: 'NUH', kind: 'ot', name: a, wd: 1, session: 'AM', need: 2, status: 'open', updatedAt: Date.now() });
  await expect(page.locator(`#week-table .wt-list[data-list="${a}"]`)).toHaveCount(1, { timeout: 15_000 });
  // a week built before drafts: published; one short on A
  const list = { id: a, site: 'NUH', kind: 'ot', name: a, day: mon, session: 'AM', consultant: null, status: 'open', need: 2 };
  await db.put(`spaces/_/weeks/${mon}`, { lists: [list], grid: [{ day: mon, session: 'AM', list: a, juniors: [p1] }], seed: 1, built: Date.now(), updatedAt: Date.now() });
  const names = (/** @type {import('@playwright/test').Page} */ p) => p.locator(`#week-table .wt-list[data-list="${a}"] .wt-name`);
  await expect(names(page)).toHaveCount(1, { timeout: 15_000 });
  const line = page.locator('#week-plan');
  await expect(line).toContainText('Published');

  // a viewer sees the published week
  const viewer = await phone();
  await signIn(viewer, 'viewer');
  await openWeek(viewer);
  for (let i = 0; i < 38; i++) await viewer.locator('#week-next').click();
  await expect(names(viewer)).toHaveText([p1], { timeout: 15_000 });
  await expect(viewer.locator('#week-plan')).toHaveCount(0);   // (a viewer never loads the edit code)

  // Build again: a preview, the new name and its list marked; Discard leaves the week as it was
  const buildAgain = async () => { await page.locator('#week-more').click(); await page.getByRole('menuitem', { name: 'Build again' }).click(); };
  await buildAgain();
  await expect(line).toContainText('Preview', { timeout: 15_000 });
  await expect(page.locator(`#week-table .wt-list[data-list="${a}"]`)).toHaveClass(/is-new/);
  await expect(names(page)).toHaveCount(2);
  await expect(page.locator(`#week-table .wt-list[data-list="${a}"] .wt-name.is-new`)).toHaveCount(1);
  await expect(page.locator(`#week-table .wt-list[data-list="${a}"] .wt-name.is-new`)).toHaveAttribute('aria-label', /Changed/);
  await page.locator('#week-discard').click();
  await expect(names(page)).toHaveCount(1);
  await expect(line).toContainText('Published');
  expect((await db.get(`spaces/_/weeks/${mon}`))?.draft ?? null).toBeNull();

  // Apply: into a draft; the maker sees it, viewers still see the published week
  await buildAgain();
  await page.locator('#week-apply').click();
  await expect(page.locator('.toast', { hasText: 'Built' })).toBeVisible({ timeout: 15_000 });
  await expect(line).toContainText('Viewers see the published week until you publish');
  await expect(names(page)).toHaveCount(2);
  await expect.poll(async () => (await db.get(`spaces/_/weeks/${mon}`))?.draft?.grid?.find((/** @type {any} */ r) => r.list === a)?.juniors?.length, { timeout: 15_000 }).toBe(2);
  expect((await db.get(`spaces/_/weeks/${mon}`))?.grid?.[0]?.juniors).toEqual([p1]);
  await expect(names(viewer)).toHaveText([p1]);

  // Publish: viewers see it
  await page.locator('#week-publish').click();
  await expect(line).toContainText('Published', { timeout: 15_000 });
  await expect(names(viewer)).toHaveCount(2, { timeout: 15_000 });
  await expect.poll(async () => (await db.get(`spaces/_/weeks/${mon}`))?.draft ?? null, { timeout: 15_000 }).toBeNull();

  // Back to draft, a hand edit there (viewers keep the published week), then Discard draft: the published week again
  await page.locator('#week-to-draft').click();
  await expect(line).toContainText('Viewers see the published week until you publish', { timeout: 15_000 });
  const second = names(page).nth(1), who = /** @type {string} */ (await second.textContent());
  await second.dispatchEvent('click');
  await expect(page.locator('#edit-sheet')).toBeVisible();
  await page.locator('#ef-to').selectOption('');
  await page.locator('#edit-save').click();
  await expect(names(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(names(viewer)).toHaveCount(2);
  await expect(names(viewer).filter({ hasText: who })).toHaveCount(1);
  await page.locator('#week-drop-draft').click();
  await expect(names(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(line).toContainText('Published');
});
