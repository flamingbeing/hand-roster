// The roster screens: the app loads, the Week tab is the first screen, the other tabs open (lazily), a viewer is read-only.
import { test, expect, signIn, openTab, openWeek, openSettings, clickOpens, db, uniq } from './fixtures.mjs';

test('a member lands on the Week tab and every tab opens', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await signIn(page, 'member');
  await expect(page.locator('#week-page')).toBeVisible();
  await expect(page.locator('#week-build')).toBeVisible();
  for (const name of ['calls', 'people', 'lists']) await openTab(page, name);
  // the phone's bar holds five tabs: Leave is off it, one tap away at the top of the Settings menu
  await openSettings(page);
  await page.locator('#settings-host .ui-settings-top').getByRole('button', { name: 'Leave' }).click();
  await expect(page.locator('#leave-page')).toBeVisible();
  await openWeek(page);
  await expect(page.locator('#week-view')).toBeVisible();
  // opened again on this device: the start frame (a load state painted before sign-in is back) goes once the week is drawn
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#week-table')).toBeVisible();
  await expect(page.locator('#week-state .load-row')).toHaveCount(0);
  expect(errors, 'uncaught page errors').toEqual([]);
});

test('a person added in the data shows on the People tab', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('Dr Ann Test');
  await db.put(`spaces/_/people/${name}`, { name, grade: 'reg', rank: 'Reg', active: true, updatedAt: Date.now() });
  await openTab(page, 'people');
  await expect(page.locator('#people-host')).toContainText(name, { timeout: 15_000 });
});

test('a laptop: the side bar with icons and a hide button, the pages use the width, Calls draws on first open', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  await expect(page.locator('html[data-wide-ready]')).toHaveCount(1);
  await expect(page.locator('.ui-side-toggle')).toBeVisible();
  await expect(page.locator('.ui-bar-menu')).toBeHidden();
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await expect(page.locator('#side .side-icon svg')).toHaveCount(6);
  // the week grid runs past the kit's 800 px reading width
  expect((await page.locator('#week-page').boundingBox())?.width).toBeGreaterThan(900);
  // two teams sit side by side (the other tests' people are in the same space: found by name)
  const names = [uniq('Dr A'), uniq('Dr B')];
  for (const [i, name] of names.entries()) await db.put(`spaces/_/people/${name}`, { name, grade: 'reg', rank: 'Reg', team: uniq(`Team ${i}`), active: true, updatedAt: Date.now() });
  await page.locator('#side [data-tab-page="#people-page"]').click();
  const blockOf = (/** @type {string} */ name) => page.locator('#people-host .rl-block', { hasText: name });
  await expect(blockOf(names[1])).toBeVisible({ timeout: 15_000 });
  const [a, b] = [await blockOf(names[0]).boundingBox(), await blockOf(names[1]).boundingBox()];
  expect(a && b && (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) > 100)).toBe(true);
  expect((await page.locator('#people-host .rl-block').first().boundingBox())?.width).toBeLessThan(700);
  await page.locator('#side [data-tab-page="#calls-page"]').click();
  await expect(page.locator('#calls-title')).toBeVisible();
  await expect(page.locator('#calls-host .cl-day').first()).toBeVisible();
});

test('calls: a call given to someone off the roster is listed; a tap on the line opens its day, the holder kept', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  // a month well ahead, so no other test's calls are in it
  const now = new Date();
  const ahead = new Date(now.getFullYear(), now.getMonth() + 7, 1);
  const month = `${ahead.getFullYear()}-${String(ahead.getMonth() + 1).padStart(2, '0')}`;
  const title = `${ahead.toLocaleString('en-GB', { month: 'long' })} ${ahead.getFullYear()}`;
  const [con, gone] = [uniq('Dr Ann Test'), uniq('Dr Gone Test')];
  await db.put(`spaces/_/people/${con}`, { name: con, grade: 'con', rank: 'Consultant', active: true, updatedAt: Date.now() });
  await db.put(`spaces/_/rosters/${month}`, { calls: [{ date: `${month}-03`, con: gone, reg: null, moNuh: null, moNtf: null }], updatedAt: Date.now() });
  await openTab(page, 'calls');
  for (let i = 0; i < 12 && (await page.locator('#calls-title').textContent()) !== title; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.locator('#calls-title')).toHaveText(title);
  await expect(page.locator('#calls-host .cl-table')).toContainText(`${gone} (not on roster)`, { timeout: 15_000 });
  const line = page.locator('#calls-host .cl-problem', { hasText: gone });
  await expect(line).toContainText('is not on the roster for calls');
  await line.click();
  await expect(page.locator('#edit-sheet')).toBeVisible();
  await expect(page.locator('#ef-con')).toHaveValue(gone);
  await expect(page.locator(`#ef-con option[value="${con}"]`)).toHaveText(`${con} · 0 calls`);
  await expect(page.locator('#ef-con option').first()).toHaveText('Nobody');
});

test('calls: a call set by hand is shown as such; Release them unlocks it, Undo locks it again', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  // a month of its own, eight ahead (the test above uses seven)
  const now = new Date();
  const ahead = new Date(now.getFullYear(), now.getMonth() + 8, 1);
  const month = `${ahead.getFullYear()}-${String(ahead.getMonth() + 1).padStart(2, '0')}`;
  const title = `${ahead.toLocaleString('en-GB', { month: 'long' })} ${ahead.getFullYear()}`;
  const con = uniq('Dr Ann Test');
  await db.put(`spaces/_/people/${con}`, { name: con, grade: 'con', rank: 'Consultant', active: true, updatedAt: Date.now() });
  await db.put(`spaces/_/rosters/${month}`, { calls: [], locked: [], updatedAt: Date.now() });
  await openTab(page, 'calls');
  for (let i = 0; i < 12 && (await page.locator('#calls-title').textContent()) !== title; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.locator('#calls-title')).toHaveText(title);
  await expect(page.locator('#calls-release')).toHaveCount(0);
  // a hand edit: the day's CON set in its sheet
  await clickOpens(page.locator(`#calls-host .cl-day[data-day="${month}-03"]`), page.locator('#edit-sheet'));
  await expect(page.locator(`#ef-con option[value="${con}"]`)).toHaveCount(1, { timeout: 15_000 });
  await page.locator('#ef-con').selectOption(con);
  await page.locator('#edit-save').click();
  const locks = () => db.get(`spaces/_/rosters/${month}`).then(d => d?.locked);
  await expect.poll(locks, { timeout: 15_000 }).toEqual([`${month}-03|con`]);
  await expect(page.locator('#calls-host .cl-state')).toContainText('1 set by hand.');
  await expect(page.locator('#calls-host .cl-hand-key')).toHaveText('Bold: set by hand, kept when the calls are made again.');
  // Release them: the lock goes, the call stays
  await page.locator('#calls-release').click();
  await expect.poll(locks, { timeout: 15_000 }).toEqual([]);
  await expect(page.locator('#calls-release')).toHaveCount(0);
  expect((await db.get(`spaces/_/rosters/${month}`))?.calls).toEqual([expect.objectContaining({ date: `${month}-03`, con })]);
  await page.locator('.toast', { hasText: 'Released' }).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(locks, { timeout: 15_000 }).toEqual([`${month}-03|con`]);
  await expect(page.locator('#calls-release')).toBeVisible();
});

test('a roster maker moves a junior on the grid and puts them back with Undo', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, seven on (the export spec builds five on)
  for (let i = 0; i < 7; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const [a, b, name] = [uniq('OT A'), uniq('OT B'), uniq('Dr Ann Test')];
  const list = (/** @type {string} */ id) => ({ id, site: 'NUH', kind: 'ot', name: id, day: mon, session: 'AM', consultant: null, rooms: null, patients: null, status: 'open', need: 2, consultantOnLeave: false });
  await db.put(`spaces/_/weeks/${mon}`, { lists: [list(a), list(b)], grid: [{ day: mon, session: 'AM', list: a, juniors: [name] }], seed: 1, built: Date.now(), updatedAt: Date.now() });
  const on = (/** @type {string} */ id) => page.locator(`#week-table .wt-list[data-list="${id}"] .wt-name`, { hasText: name });
  await expect(on(a)).toBeVisible({ timeout: 15_000 });
  // the edit code loads on this first tap
  await clickOpens(on(a), page.locator('#edit-sheet'));
  await page.locator('#ef-to').selectOption(b);
  await page.locator('#edit-save').click();
  await expect(on(b)).toBeVisible();
  await expect(on(a)).toHaveCount(0);
  await page.locator('.toast', { hasText: `Moved ${name}` }).getByRole('button', { name: 'Undo' }).click();
  await expect(on(a)).toBeVisible();
  await expect(on(b)).toHaveCount(0);
});

test('a built week marks a junior on a list on a day they are now on leave, and the clash opens the move sheet', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, eleven on
  for (let i = 0; i < 11; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const [a, name] = [uniq('OT C'), uniq('Dr Ben Test')];
  const list = { id: a, site: 'NUH', kind: 'ot', name: a, day: mon, session: 'AM', consultant: null, rooms: null, patients: null, status: 'open', need: 2, consultantOnLeave: false };
  await db.put(`spaces/_/weeks/${mon}`, { lists: [list], grid: [{ day: mon, session: 'AM', list: a, juniors: [name] }], seed: 1, built: Date.now(), updatedAt: Date.now() });
  const on = page.locator(`#week-table .wt-list[data-list="${a}"] .wt-name`, { hasText: name });
  await expect(on).toBeVisible({ timeout: 15_000 });
  await expect(on).not.toHaveClass(/is-clash/);
  // leave added after the build
  await db.put(`spaces/_/leave/${uniq('lv')}`, { name, from: mon, to: mon, session: 'both', updatedAt: Date.now() });
  await expect(on).toHaveClass(/is-clash/, { timeout: 15_000 });
  await expect(on).toHaveAttribute('aria-label', /Clash: on leave then/);
  const line = page.locator('#week-short .sh-option', { hasText: `${name} on NUH ${a}: on leave then` });
  await clickOpens(line, page.locator('#edit-sheet'));
  await expect(page.locator('#edit-title')).toHaveText(name);
});
