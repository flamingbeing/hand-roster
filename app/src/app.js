// The page's wiring: the shell and Settings page (shell.js), the kit's sync chip, the account block, and the screen
// switch. The Week tab (screens/week.js) is the first screen and loads with the page; Calls, People, Lists and Leave
// (screens/) load when their tab is first opened, and the rest warm up once the first screen is up.
import { syncChip, syncButton, plural, loadState, toaster, lazyModules, conflictSheet, refusedList } from '@core/ui';
import { start, usingEmulator, emulatorSignIn, lastSignedIn } from './cloud.js';
import { $ } from './dom.js';
import { recordText } from './items.js';
import { createStore } from './store.js';
import { screenSwitch } from './screen-switch.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { weekScreen } from './screens/week.js';
import { startShell, settingsPage } from './shell.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

window.starter = { ready: false, signInAs: emulatorSignIn, data: () => app?.data, members: () => app?.members, files: () => app?.files };   // for the tests
startShell();   // the tabs and menu work while the app starts
// this device was signed in last time: show the week's frame (skeleton) now, not a blank page or the sign-in screen
// while the sign-in is restored (cloud.js says signed out only once it has settled, and then the sign-in screen replaces it)
if (lastSignedIn()) { $('week-view').hidden = false; loadState($('week-state')).loading(); }
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });
settingsPage(app);

if (!app) notSetUpScreen().show({ phase: 'not-set-up' });
else {
  // the chip and the tests' status read the whole app (sync and files), not the sync module alone: "Saved" only when
  // nothing is unsent anywhere, the same count sign-out reports. (The files module says 'saving'; the chip's word is 'pending'.)
  /** @param {(st: { state: string, count: number }) => void} fn */
  const chipStatus$ = fn => app.status$(st => {
    const state = st.state === 'saving' ? 'pending' : st.state;
    fn(state === 'synced' && st.unsent > 0 ? { state: 'pending', count: st.unsent } : { state, count: st.count });
  });
  syncChip($('sync-chip'), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });   // (the chip reads only status$)
  // the bar's sync button: the same state; a tap wakes the sync and sends what waits now (window.starter.syncTaps for the tests)
  syncButton($('sync-btn'), { sync: /** @type {any} */ ({ status$: chipStatus$ }), syncNow: async () => {
    window.starter.syncTaps = Number(window.starter.syncTaps ?? 0) + 1;
    app.sync.nudge('wake'); await app.sync.flush();
  } });
  chipStatus$(st => { window.starter.status = st.state; });

  const store = createStore();
  let role = '';
  /** @type {Set<() => void>} */
  const roleWatchers = new Set();
  // admin and member make the roster; a viewer (a junior on a phone) only reads. The rules decide in the end.
  const canWrite = () => role === 'admin' || role === 'member';
  const toast = toaster($('toasts')).show;
  /** @type {import('./screens/context.js').Context} */
  const ctx = { app, store, toast, canWrite, onRole: fn => { roleWatchers.add(fn); } };

  conflictSheet($('conflict-sheet'), { sync: app.sync, text: recordText });
  refusedList($('refused-list'), { sync: app.sync, text: r => recordText(r) });

  const week = weekScreen(ctx);
  // the other tabs load when their page first shows (a tab, a swipe, or the page being laid beside the current one)
  const tabs = lazyModules({
    calls: () => import('./screens/calls.js'),
    people: () => import('./screens/people.js'),
    lists: () => import('./screens/lists.js'),
    leave: () => import('./screens/leave.js'),
  });
  /** @type {Record<string, 'calls' | 'people' | 'lists' | 'leave'>} */
  const pages = { 'calls-page': 'calls', 'people-page': 'people', 'lists-page': 'lists', 'leave-page': 'leave' };
  /** @type {Set<string>} */
  const made = new Set();
  /** @param {'calls' | 'people' | 'lists' | 'leave'} name */
  const make = name => {
    if (made.has(name)) return;
    made.add(name);
    tabs.need(name).then(m => m.create(ctx), err => { made.delete(name); console.warn(err); });
  };
  for (const [id, name] of Object.entries(pages)) {
    const page = $(id);
    if (!page.hidden) make(name);
    new MutationObserver(() => { if (!page.hidden) make(name); }).observe(page, { attributes: true, attributeFilter: ['hidden'] });
    page.addEventListener('draw-ahead', () => make(name));
  }

  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: week,
  });
  $('sign-out').addEventListener('click', async () => {
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The roster is kept on this device for your next sign-in.';
  });
  // Back after a redirect sign-in comes to the page the sign-in left from, kept whole by the browser (the back/forward
  // cache) and still on the sign-in screen: load it again, so it opens as it is now (the week)
  let phase = '';
  addEventListener('pageshow', e => { if (e.persisted && phase !== 'ready') location.reload(); });
  app.follow({
    onState(s) {
      phase = s.phase;
      $('who').textContent = s.user ? s.user.email : '';
      $('sign-out').hidden = !s.user;
      if (s.user) $('sign-out-msg').textContent = '';
      const was = role;
      role = s.role ?? '';
      show(s);
      if (was !== role) for (const fn of [...roleWatchers]) fn();
    },
    onData(kind, rows, changed) {
      store.set(kind, rows, changed);
      if (kind === 'lists') { window.starter.ready = true; tabs.warmUp(); }
    },
  });
}
