// The roster screens: the app loads, the Week tab is the first screen, the other tabs open (lazily), a viewer is read-only.
import { test, expect, signIn, openTab, openWeek, openSettings, clickOpens, db, uniq, today } from './fixtures.mjs';

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

test('renaming a person carries their leave, request and list along; Undo puts the old name back', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  // two names, neither inside the other, so a row with one never matches the other
  const name = uniq('Dr Ann Test'), renamed = uniq('Dr Ann Tester'), listName = uniq('Hand OT');
  const d = new Date(); d.setDate(d.getDate() + 30);
  const day = today(d);
  const lv = uniq('lv'), rq = uniq('rq'), ls = uniq('ls');
  await db.put(`spaces/_/people/${uniq('p')}`, { name, grade: 'con', rank: 'Consultant', active: true, updatedAt: Date.now() });
  await db.put(`spaces/_/leave/${lv}`, { name, from: day, to: day, session: 'both', updatedAt: Date.now() });
  await db.put(`spaces/_/requests/${rq}`, { name, date: day, type: 'cannot', tier: null, updatedAt: Date.now() });
  await db.put(`spaces/_/lists/${ls}`, { site: 'NUH', kind: 'ot', name: listName, wd: 1, session: 'AM', consultant: 'Dr Eve Test', consultant2: name, need: 1, status: 'open', updatedAt: Date.now() });
  // the Leave tab shows both rows, so the page has them before the sheet counts them
  await openTab(page, 'leave');
  const rowsOf = (/** @type {string} */ who) => page.locator('#leave-host .rl-row', { hasText: who });
  await expect(rowsOf(name)).toHaveCount(2, { timeout: 15_000 });
  await openTab(page, 'people');
  const person = page.locator('#people-host .rl-open', { hasText: name });
  await expect(person).toBeVisible({ timeout: 15_000 });
  await clickOpens(person, page.locator('#edit-sheet'));
  await expect(page.locator('#ef-carry')).toBeChecked();
  await page.locator('#ef-name').fill(renamed);
  await expect(page.locator('#edit-sheet .warn')).toHaveText('Also changes the name in 1 leave, 1 request and 1 list.');
  await page.locator('#edit-save').click();
  const toast = page.locator('#toasts .toast', { hasText: 'Saved. Name changed in 3 rows.' });
  await expect(toast).toBeVisible();
  await openTab(page, 'leave');
  await expect(rowsOf(renamed)).toHaveCount(2);
  await expect(rowsOf(name)).toHaveCount(0);
  await expect(rowsOf(renamed).locator('.rl-tag', { hasText: /not on the roster/i })).toHaveCount(0);
  const names = async () => [(await db.get(`spaces/_/leave/${lv}`))?.name, (await db.get(`spaces/_/requests/${rq}`))?.name,
    (await db.get(`spaces/_/lists/${ls}`))?.consultant2, (await db.get(`spaces/_/lists/${ls}`))?.consultant];
  await expect.poll(names, { timeout: 15_000 }).toEqual([renamed, renamed, renamed, 'Dr Eve Test']);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(names, { timeout: 15_000 }).toEqual([name, name, name, 'Dr Eve Test']);
  await expect(rowsOf(name)).toHaveCount(2);
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

test('a 1000 px laptop: the Day cards follow the page width, printing shows one thing, Calls prints its month', async ({ sized }) => {
  const page = await sized(1000);
  await signIn(page, 'member');
  await expect(page.locator('#week-table')).toBeVisible();
  // printed (Ctrl+P, no Print button): the grid on screen, or the hand-made grid, never two of them
  const printed = () => page.evaluate(() => ['.wt-scroll', '.wk-grid', '.pr-sheet']
    .filter(s => /** @type {HTMLElement} */ (document.querySelector(`#week-view ${s}`)).checkVisibility()));
  await page.emulateMedia({ media: 'print' });
  expect(await printed()).toHaveLength(1);
  await page.emulateMedia({ media: 'screen' });
  // Day: five cards of at least 11rem each, or one day at a time with the day chips (the side bar's 280 px counted)
  await page.locator('#week-show-day').click();
  await expect(page.locator('#week-grid')).toBeVisible();
  const roomy = () => page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return /** @type {HTMLElement} */ (document.querySelector('#week-chips')).checkVisibility()
      || [...document.querySelectorAll('.wk-day')].every(d => d.getBoundingClientRect().width >= 11 * rem);
  });
  expect(await roomy()).toBe(true);
  await page.emulateMedia({ media: 'print' });
  expect(await printed()).toHaveLength(1);
  await page.emulateMedia({ media: 'screen' });
  // the side bar hidden: the page is wider, and still no card is squeezed
  await page.locator('.ui-side-toggle').click();
  await expect(page.locator('html[data-side-hidden]')).toHaveCount(1);
  await expect.poll(roomy).toBe(true);
  // Calls has Print; with html[data-print="calls"] (its Print, or Ctrl+P on that tab) the month prints, not the Week
  await page.locator('.ui-side-toggle').click();
  await expect(page.locator('html[data-side-hidden]')).toHaveCount(0);
  await page.locator('#side [data-tab-page="#calls-page"]').click();
  await expect(page.locator('#calls-page').getByRole('button', { name: 'Print' })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.print = 'calls'; });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#calls-page')).toBeVisible();
  await expect(page.locator('#week-page')).toBeHidden();
  await expect(page.locator('#calls-print')).toBeHidden();
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
  // the day reads its calls aloud (its label replaces what is inside), the bold said in words
  const day3 = page.locator(`#calls-host .cl-day[data-day="${month}-03"]`);
  await expect.poll(() => day3.getAttribute('aria-label')).toContain(`CON ${con} (set by hand)`);
  await expect(day3).toHaveAttribute('aria-label', /Tap to edit calls\.$/);
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

test('Build again on a week changed by hand: Cancel changes nothing, Keep builds around the hand placement, Undo', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, nineteen on
  for (let i = 0; i < 19; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const [t, t2, name] = [uniq('OT K'), uniq('OT L'), uniq('Dr Kay Test')];
  // on lists by hand only, so no build puts them there by itself: the grid differs from its build and the placement is an ask
  await db.put(`spaces/_/people/${name}`, { name, grade: 'mo', rank: 'MO', active: true, byHand: true, updatedAt: Date.now() });
  for (const id of [t, t2]) await db.put(`spaces/_/lists/${id}`, { site: 'NUH', kind: 'ot', name: id, wd: 1, session: 'AM', need: 1, status: 'open', updatedAt: Date.now() });
  // the lists are on the page (unbuilt, the week draws them from the template) before the week is built over them
  for (const id of [t, t2]) await expect(page.locator(`#week-table .wt-list[data-list="${id}"]`)).toHaveCount(1, { timeout: 15_000 });
  const list = (/** @type {string} */ id) => ({ id, site: 'NUH', kind: 'ot', name: id, day: mon, session: 'AM', consultant: null, status: 'open', need: 1 });
  await db.put(`spaces/_/weeks/${mon}`, { lists: [list(t), list(t2)], grid: [{ day: mon, session: 'AM', list: t, juniors: [name] }], seed: 1, built: Date.now(), updatedAt: Date.now() });
  await expect(page.locator(`#week-table .wt-list[data-list="${t}"] .wt-name`, { hasText: name })).toBeVisible({ timeout: 15_000 });
  const week = async () => { const w = await db.get(`spaces/_/weeks/${mon}`); return [w?.seed, w?.grid?.find((/** @type {any} */ r) => r.list === t)?.juniors]; };
  const again = async () => {
    await page.locator('#week-more').click();
    await clickOpens(page.getByRole('menuitem', { name: 'Build again' }), page.locator('#edit-sheet'));
    await expect(page.locator('#edit-sheet')).toContainText('people you took off may be placed again', { timeout: 15_000 });
  };
  await again();
  await expect(page.locator('#edit-save')).toHaveText('Keep my changes');
  await expect(page.locator('#edit-delete')).toHaveText('Replace them');
  await page.locator('#edit-sheet [data-close]').click();
  await expect(page.locator('#edit-sheet')).toBeHidden();
  expect(await week()).toEqual([1, [name]]);
  await again();
  await page.locator('#edit-save').click();
  const toast = page.locator('.toast', { hasText: 'Kept 1 of 1 hand placement.' });
  await expect(toast).toBeVisible();
  await expect.poll(week, { timeout: 15_000 }).toEqual([2, [name]]);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(week, { timeout: 15_000 }).toEqual([1, [name]]);
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

test('This is me: a name picked from More stands out on the grid, with a My week card on top', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  // a week of its own, fifteen on
  for (let i = 0; i < 15; i++) await page.locator('#week-next').click();
  await expect(page.locator('#week-title')).toHaveClass(/is-away/);
  const mon = /** @type {string} */ (await page.locator('#week-grid .wk-day').first().getAttribute('data-day'));
  const [a, name, other] = [uniq('OT M'), uniq('Dr Mia Test'), uniq('Dr Ned Test')];
  for (const n of [name, other]) await db.put(`spaces/_/people/${n}`, { name: n, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  const list = { id: a, site: 'NUH', kind: 'ot', name: a, day: mon, session: 'AM', consultant: null, rooms: null, patients: null, status: 'open', need: 2, consultantOnLeave: false };
  await db.put(`spaces/_/weeks/${mon}`, { lists: [list], grid: [{ day: mon, session: 'AM', list: a, juniors: [name, other] }], seed: 1, built: Date.now(), updatedAt: Date.now() });
  const on = (/** @type {string} */ n) => page.locator(`#week-table .wt-list[data-list="${a}"] .wt-name`, { hasText: n });
  await expect(on(name)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#week-table .is-me')).toHaveCount(0);
  await expect(page.locator('#week-mine')).toBeEmpty();
  // More, This is me: the picker loads on this tap
  await page.locator('#week-more').click();
  await clickOpens(page.getByRole('menuitem', { name: 'This is me' }), page.locator('#edit-sheet'));
  await expect(page.locator(`#ef-me option[value="${name}"]`)).toHaveText(`${name} (MO)`, { timeout: 15_000 });
  await page.locator('#ef-me').selectOption(name);
  await page.locator('#edit-save').click();
  await expect(on(name)).toHaveClass(/is-me/);
  await expect(on(other)).not.toHaveClass(/is-me/);
  const card = page.locator('#week-mine details.wk-mine');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('open', '');
  await expect(card.locator('summary')).toContainText(`My week: ${name}`);
  await expect(card.locator(`li[data-day="${mon}"]`)).toContainText(`AM NUH ${a}`);
  // Nobody: the marks and the card go
  await page.locator('#week-more').click();
  await clickOpens(page.getByRole('menuitem', { name: 'This is me' }), page.locator('#edit-sheet'));
  await page.locator('#ef-me').selectOption('');
  await page.locator('#edit-save').click();
  await expect(page.locator('#week-table .is-me')).toHaveCount(0);
  await expect(page.locator('#week-mine')).toBeEmpty();
});

test('a viewer on a phone: the Grid opens at today\'s column, and is asked once to pick their name', async ({ phone }) => {
  const page = await phone();
  const name = uniq('Dr Ola Test');   // (the ask needs someone to pick)
  await db.put(`spaces/_/people/${name}`, { name, grade: 'mo', rank: 'MO', active: true, updatedAt: Date.now() });
  await signIn(page, 'viewer');
  await openWeek(page);
  // a weekday: this week, scrolled so today's column sits just right of the session column (a weekend opens on next week)
  const wd = new Date().getDay();
  if (wd >= 1 && wd <= 5) {
    await expect(page.locator('#week-table thead th.is-today')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
      const box = /** @type {HTMLElement} */ (document.querySelector('#week-table')).getBoundingClientRect();
      const th = /** @type {HTMLElement} */ (document.querySelector('#week-table thead th.is-today')).getBoundingClientRect();
      const label = /** @type {HTMLElement} */ (document.querySelector('#week-table thead th')).getBoundingClientRect();
      return th.left >= label.right - 2 && th.right <= box.right + 2;
    }), { timeout: 15_000 }).toBe(true);
  }
  // asked who they are; Not now hides it for good on this device (More still has This is me)
  const ask = page.locator('#week-mine .wk-ask');
  await expect(ask).toContainText('Find your days: pick your name', { timeout: 15_000 });
  await expect(ask.getByRole('button', { name: 'Pick my name' })).toBeVisible();
  await ask.getByRole('button', { name: 'Not now' }).click();
  await expect(ask).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#week-table')).toBeVisible();
  await expect(page.locator('#week-mine .wk-ask')).toHaveCount(0);
  await page.locator('#week-more').click();
  await expect(page.getByRole('menuitem', { name: 'This is me' })).toBeVisible();
});
