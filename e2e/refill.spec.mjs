// The cell sheet and Build again as a refill (screens/week-edit.js cellSheet, roster/who-could.js, buildWeek `keep`): a tap on
// a junior shows "Who could go here?"; picking a free person there is one hand edit; Build again then fills the gap it left
// and changes no other list's people that needn't change (they are not pinned). Invented names only.
import { test, expect, signIn, openWeek, db, uniq, clickOpens } from './fixtures.mjs';

test('after one hand edit from the cell sheet, Build again changes no unpinned cell that needn\'t change', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, 34 on (the rule report spec uses 30)
  for (let i = 0; i < 34; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const [a, b, c] = [uniq('OT R'), uniq('OT S'), uniq('OT T')];
  // (Vic and Wes spare: other specs' Monday lists, built at the same time, take free people too)
  const [p1, p2, p3, p4, p5, p6] = ['Dr Ria Test', 'Dr Sam Test', 'Dr Tai Test', 'Dr Uma Test', 'Dr Vic Test', 'Dr Wes Test'].map(n => uniq(n));
  for (const n of [p1, p2, p3, p4, p5, p6]) await db.put(`spaces/_/people/${n}`, { name: n, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  // A needs two, B and C one each (C in the afternoon); Build again builds from the Lists tab's lists
  const tpl = { a: { session: 'AM', need: 2 }, b: { session: 'AM', need: 1 }, c: { session: 'PM', need: 1 } };
  const ids = { a, b, c };
  for (const [k, t] of Object.entries(tpl)) await db.put(`spaces/_/lists/${ids[/** @type {'a'} */ (k)]}`, { site: 'NUH', kind: 'ot', name: ids[/** @type {'a'} */ (k)], wd: 1, session: t.session, need: t.need, status: 'open', updatedAt: Date.now() });
  for (const id of [a, b, c]) await expect(page.locator(`#week-table .wt-list[data-list="${id}"]`)).toHaveCount(1, { timeout: 15_000 });
  const list = (/** @type {string} */ id, /** @type {'AM' | 'PM'} */ session, /** @type {number} */ need) => ({ id, site: 'NUH', kind: 'ot', name: id, day: mon, session, consultant: null, status: 'open', need });
  // built, A one short, nobody pinned
  await db.put(`spaces/_/weeks/${mon}`, {
    lists: [list(a, 'AM', 2), list(b, 'AM', 1), list(c, 'PM', 1)], seed: 1, built: Date.now(), updatedAt: Date.now(),
    grid: [{ day: mon, session: 'AM', list: a, juniors: [p1] }, { day: mon, session: 'AM', list: b, juniors: [p2] }, { day: mon, session: 'PM', list: c, juniors: [p3] }],
  });
  const on = (/** @type {string} */ id, /** @type {string} */ n) => page.locator(`#week-table .wt-list[data-list="${id}"] .wt-name`, { hasText: n });
  await expect(on(a, p1)).toBeVisible({ timeout: 15_000 });

  // the cell sheet: who could go here, Uma (free) among them
  await clickOpens(on(a, p1), page.locator('#edit-sheet'));
  await expect(page.locator('#cell-sheet h3')).toHaveText('Who could go here?');
  const uma = page.locator('#cell-sheet .cs-who', { has: page.locator(`text=${p4}`) });
  await expect(uma).toHaveCount(1);
  await expect(uma).toContainText('free');
  if (!(await uma.isVisible())) await page.locator('#cell-sheet details').filter({ has: uma }).locator('summary').click();
  await uma.click();
  await expect(page.locator('.toast', { hasText: `${p4} is on` })).toBeVisible({ timeout: 15_000 });
  await expect(on(a, p4)).toBeVisible();
  await expect(on(a, p1)).toHaveCount(0);

  // Build again: Uma (pinned by the hand edit) stays, A's open seat is filled, B and C keep their unpinned people
  await page.locator('#week-more').click();
  await page.getByRole('menuitem', { name: 'Build again' }).click();
  await page.locator('#week-apply').click();   // (a preview first)
  await expect(page.locator('.toast', { hasText: 'Built' })).toBeVisible({ timeout: 15_000 });
  const rows = async () => {
    const d = await db.get(`spaces/_/weeks/${mon}`), w = { ...d, ...d?.draft };   // (Build again saves into the week's draft)
    const r = (/** @type {string} */ id) => w?.grid?.find((/** @type {any} */ x) => x.list === id);
    return { seed: w?.seed, a: r(a)?.juniors.includes(p4) && r(a)?.juniors.length, b: r(b)?.juniors, c: r(c)?.juniors, pins: [r(b)?.pinned ?? [], r(c)?.pinned ?? []] };
  };
  await expect.poll(rows, { timeout: 15_000 }).toEqual({ seed: 2, a: 2, b: [p2], c: [p3], pins: [[], []] });
});
