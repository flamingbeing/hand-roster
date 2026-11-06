// Sign-in, roles from the role doc, and the Week tab's lists.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, openWeek, openTab, clickOpens, addList, weekdayShown, synced, serverHas, db, uniq, APP } from './fixtures.mjs';

test('signed out: the sign-in screen, accessible', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out .ui-signin')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
});

test('an account with no role sees no roster until an admin adds it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, null);
  await expect(page.locator('#week-view')).toBeHidden();
  await expect(page.locator('#uid')).not.toBeEmpty();
});

test('a member adds a list: it shows on the Week tab and reaches the server', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('list');
  await addList(page, t);
  await synced(page);
  await serverHas(t);
  await expect(page.locator('#week-build')).toBeVisible();
});

test('a list deleted on the Lists tab comes back with Undo, after a reload too', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('undo');
  await addList(page, t);
  await synced(page);
  await openTab(page, 'lists');
  await clickOpens(page.locator('#lists-host .rl-open', { hasText: t }), page.locator('#edit-sheet'));
  await page.locator('#edit-delete').click();
  await expect(page.locator('#lists-host')).not.toContainText(t);
  await page.locator('#toasts .toast', { hasText: `Deleted ${t}` }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#lists-host .rl-open', { hasText: t })).toBeVisible();
  await synced(page);
  await serverHas(t);
  // the delete's tombstone on this device does not hide it once the page opens again
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await openTab(page, 'lists');
  await expect(page.locator('#lists-host .rl-open', { hasText: t })).toBeVisible();
});

test('a viewer reads but cannot build or change', async ({ phone }) => {
  const t = uniq('seen');
  await db.put(`spaces/_/lists/${t}`, { site: 'NUH', kind: 'ot', name: t, wd: weekdayShown(), session: 'AM', need: 1, status: 'open', updatedAt: Date.now() });
  const page = await phone();
  await signIn(page, 'viewer');
  await expect(page.locator('#week-grid')).toContainText(t);
  await expect(page.locator('#week-table .wt-list', { hasText: t })).toBeVisible();
  await expect(page.locator('#week-table .wt-list', { hasText: t }).locator('button')).toHaveCount(0);
  await expect(page.locator('#week-build')).toBeHidden();
  await expect(page.locator('#week-more')).toBeVisible();
});

test('a role change reaches the page by itself (role doc v ahead of the token)', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await expect(page.locator('#week-build')).toBeHidden();
  await db.put(`members/${uid}`, { role: 'member', v: 2 });
  await expect(page.locator('#week-build')).toBeVisible();
  await db.del(`members/${uid}`);
  await expect(page.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

// S1: removing someone ends their access, not only their role doc: the Worker deletes the doc and revokes the account
// (revoked/{uid}: the rules refuse at once; claims cleared; refresh tokens ended)
test('an admin removes a member: the page loses the roster, writes are refused, the session ends', async ({ phone }) => {
  const admin = await phone(), gone = await phone();
  const { uid: adminUid } = await signIn(admin, 'admin');
  const { uid } = await signIn(gone, 'member');
  // a page can't delete a role doc any more (the rules), and only admins may ask the Worker
  expect(await gone.evaluate(u => window.starter.members().remove(u), adminUid)).toBe('Admins only.');
  expect(await admin.evaluate(u => window.starter.members().remove(u), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toBeFalsy();
  expect(await db.get(`revoked/${uid}`)).toBeTruthy();
  await expect(gone.locator('#week-view')).toBeHidden({ timeout: 15_000 });
  // after a token refresh the token carries no role; the sessions were ended (validSince: real Firebase then refuses the
  // refresh token and the page signs out; the Auth emulator doesn't check it on refresh, so the test reads the account)
  expect(await gone.evaluate(async () => {
    const { getAuth } = await import('firebase/auth');
    const u = getAuth().currentUser;
    return u ? (await u.getIdTokenResult(true).then(r => r.claims.g ?? 'none', e => e.code)) : 'signed out';
  })).not.toHaveProperty('_');
  const account = await (await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1/projects/demo-hand-roster/accounts:lookup`,
    { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) })).json();
  expect(Number(account.users[0].validSince)).toBeGreaterThan(0);
  // added back later: the next claims ask clears revoked/ and the list returns
  expect(await admin.evaluate(u => window.starter.members().setRole(u, 'viewer'), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toMatchObject({ role: 'viewer', v: 1 });
});

// A token refresh restarts Firestore's Listen stream; a role change written just then must still reach the page (the
// Firestore emulator before v1.22 lost such changes: firebase-tools is pinned past it, package.json "rules")
test('a role change during a token refresh still reaches the page', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  const refresh = () => page.evaluate(async () => { const { getAuth } = await import('firebase/auth'); void getAuth().currentUser?.getIdToken(true); });
  for (let v = 2; v < 10; v += 2) {
    await refresh();
    await db.put(`members/${uid}`, { role: 'member', v });
    await expect(page.locator('#week-build')).toBeVisible();
    await refresh();
    await db.put(`members/${uid}`, { role: 'viewer', v: v + 1 });
    await expect(page.locator('#week-build')).toBeHidden();
  }
});

test('two lists added offline, the second while the first is still unsent, both show and both reach the server', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openWeek(page);
  await synced(page);
  await page.context().setOffline(true);
  const first = uniq('first'), second = uniq('second');
  const wd = weekdayShown();
  // both adds in one task, so the second is queued before the first save resolves
  await page.evaluate(([a, b, w]) => {
    const lists = window.starter.data().lists;
    lists.add({ site: 'NUH', kind: 'ot', name: a, wd: w, session: 'AM', need: 1, status: 'open' });
    lists.add({ site: 'NUH', kind: 'ot', name: b, wd: w, session: 'AM', need: 1, status: 'open' });
  }, [first, second, wd]);
  await expect(page.locator('#week-grid')).toContainText(first);
  await expect(page.locator('#week-grid')).toContainText(second);
  await page.context().setOffline(false);
  await serverHas(first);
  await serverHas(second);
});
