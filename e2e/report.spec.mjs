// The rule check (roster/report.js, screens/report.js): a junior on a list while on leave breaks a must-hold rule; their
// name on the grid is marked and More's Rule report lists the rule as broken, with where. Invented names only.
import { test, expect, signIn, openWeek, db, uniq } from './fixtures.mjs';

test('a broken rule shows in the rule report and on its cell', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, 30 on (the Rules spec uses 26)
  for (let i = 0; i < 30; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const name = uniq('Dr Lee Test'), list = uniq('OT Q');
  await db.put(`spaces/_/people/${name}`, { name, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  await db.put(`spaces/_/leave/${uniq('lv')}`, { name, from: mon, to: mon, session: 'both', updatedAt: Date.now() });
  // the week as built, with them put on its one list by hand
  await db.put(`spaces/_/weeks/${mon}`, {
    built: Date.now(), seed: 1, updatedAt: Date.now(),
    lists: [{ id: list, site: 'NUH', kind: 'ot', name: list, day: mon, session: 'AM', consultant: null, rooms: null, patients: null, status: 'open', need: 1, consultantOnLeave: false }],
    grid: [{ day: mon, session: 'AM', list, juniors: [name] }],
  });
  const cell = page.locator(`#week-table .wt-list[data-list="${list}"] .wt-name`, { hasText: name });
  await expect(cell).toHaveClass(/is-block/, { timeout: 15_000 });
  await expect(cell).toHaveAttribute('aria-label', /Breaks: /);

  await page.locator('#week-more').click();
  await page.getByRole('menuitem', { name: 'Rule report' }).click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  const rule = page.locator('#rule-report [data-rule="week-leave"]');
  await expect(rule).toHaveClass(/is-broken/);
  await expect(rule.locator('.rp-level')).toHaveText('Must hold');
  await rule.locator('summary').click();
  await expect(rule.locator('.rp-hits')).toContainText(name);
  await expect(page.locator('#rule-report [data-rule="week-cover"]')).not.toHaveClass(/is-broken/);
});
