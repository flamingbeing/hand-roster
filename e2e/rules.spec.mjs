// The Rules tab (screens/rules.js): the builders' rules as cards, must-hold first; a maker turns one off and Build again
// follows it, Reset to default brings it back; a viewer reads the cards without switches. Invented names only.
import { test, expect, signIn, openTab, openWeek, db, uniq } from './fixtures.mjs';

/** @param {string} day YYYY-MM-DD @param {number} n */
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('a maker turns the post-call rule off and Build again shows it; Reset to default brings it back', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, 26 on (its Sunday's month is 5 or 6 ahead: the calls tests use 7 to 9)
  for (let i = 0; i < 26; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const sun = addDays(mon, -1), name = uniq('Dr Pat Test');
  await db.put(`spaces/_/people/${name}`, { name, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  const list = uniq('OT R');   // (a week with no lists has nothing to build)
  await db.put(`spaces/_/lists/${list}`, { site: 'NUH', kind: 'ot', name: list, wd: 1, session: 'AM', need: 1, status: 'open', updatedAt: Date.now() });
  await db.put(`spaces/_/rosters/${sun.slice(0, 7)}`, { calls: [{ date: sun, con: null, reg: null, reg2: null, moNuh: name, moNtf: null }], updatedAt: Date.now() });
  const postCall = page.locator('#week-table tr', { has: page.locator('th', { hasText: 'Post-call' }) });
  await expect(postCall).toContainText(name, { timeout: 15_000 });
  await page.locator('#week-build').click();
  await expect(page.locator('#week-more')).toBeVisible({ timeout: 15_000 });

  // the Rules tab: must-hold cards first, in words; the post-call card's switch turns it off
  await openTab(page, 'rules');
  await expect(page.locator('#rules-host .rl-head').first()).toContainText('Must hold');
  await page.locator('#rules-search').fill('post-call');
  const card = page.locator('#rules-host [data-rule="week-post-call"]');
  await expect(card).toContainText('The day after a call is post-call: no list in the PM');
  await expect(page.locator('#rules-host [data-rule="week-site"]')).toHaveCount(0);   // the search leaves the others out
  const sw = card.getByRole('switch');
  await expect(sw).toBeChecked();
  await sw.click();
  await expect.poll(async () => (await db.get('spaces/_/rules/week-post-call'))?.on, { timeout: 15_000 }).toBe(false);
  await expect(card).toHaveClass(/is-dim/);
  await expect(card).toContainText('Changed');

  // Build again: nobody is post-call now
  await openWeek(page);
  await page.locator('#week-more').click();
  await page.getByRole('menuitem', { name: 'Build again' }).click();
  // (a preview first when the week has juniors on it: other tests' people may be on the list)
  const built = page.locator('.toast', { hasText: 'Built' });
  await expect(page.locator('#week-apply').or(built).first()).toBeVisible({ timeout: 15_000 });
  if (await page.locator('#week-apply').isVisible()) await page.locator('#week-apply').click();
  await expect(built).toBeVisible({ timeout: 15_000 });
  await expect(postCall).not.toContainText(name);

  // Reset to default deletes the saved copy: post-call again (other tests share the space's rules)
  await openTab(page, 'rules');
  await card.locator('.rl-open').click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  await page.locator('#edit-delete', { hasText: 'Reset to default' }).click();
  await expect.poll(() => db.get('spaces/_/rules/week-post-call'), { timeout: 15_000 }).toBeNull();
  await expect(card.getByRole('switch')).toBeChecked();
  await openWeek(page);
  await expect(postCall).toContainText(name);
});

test('a viewer reads the rule cards: no switches, no Add rule, no sheet', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'viewer');
  await openTab(page, 'rules');
  await expect(page.locator('#rules-host [data-rule="week-leave"]')).toContainText('Nobody is on a list while on leave');
  await expect(page.locator('#rules-host [role="switch"]')).toHaveCount(0);
  await expect(page.locator('#rules-add')).toBeHidden();
  await expect(page.locator('#rules-host .rl-open')).toHaveCount(0);
});

test('a maker adds a rule of their own from a template; it is listed with its level', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  await openTab(page, 'rules');
  await page.locator('#rules-add').click();
  await page.locator('#ef-type').selectOption('limit');
  await page.locator('#edit-save').click();
  await expect(page.locator('#edit-title')).toHaveText('New rule: How many each');
  const words = uniq('At most two clinics a week');
  await page.locator('#ef-p\\.slots\\.kind').selectOption('clinic');
  await page.locator('#ef-p\\.max').fill('2');
  await page.locator('#ef-level').selectOption('warn');
  await page.locator('#ef-words').fill(words);
  await page.locator('#edit-save').click();
  const row = page.locator('#rules-host .ru-row', { hasText: words });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Your rule');
  await expect(row.locator('xpath=ancestor::section[1]').locator('.rl-head')).toContainText('Warnings');
  // delete it again (the space's rules are shared with other tests)
  await row.locator('.rl-open').click();
  await page.locator('#edit-delete').click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });
});
