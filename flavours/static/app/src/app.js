// The page's wiring: the shell and Settings page (shell.js) and the list. A static app has no sign-in:
// the tasks are this device's (local.js). The screens (screens/) are the three task tabs; a new app
// replaces them and keeps this wiring, local.js and the kit (@core/ui, @core/theme).
import { toaster } from '@core/ui';
import { start } from './local.js';
import { $ } from './dom.js';
import { dayKey } from './tasks.js';
import { tasksScreen } from './screens/tasks.js';
import { startShell, settingsPage } from './shell.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types or a
// sheet is open. (Off in the browser tests, ?test, unless ?sw is given.)
const params = new URLSearchParams(location.search);
const withSW = 'serviceWorker' in navigator && (!params.has('test') || params.has('sw'));

window.starter = { ready: false, add: text => app?.add({ text, due: dayKey() }) };   // for the tests
startShell();   // the tabs and menu work while the app starts
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });
settingsPage(app);
// the browser keeps nothing (a private window): this device's list is the only copy, so say so
if (!app.sync.kept) toaster($('toasts')).show('This browser is not keeping data here: the list goes when the page closes');
app.status$(st => { window.starter.status = st.state; });
const list = tasksScreen(app);
app.follow({
  onState(s) { list.show(s); },
  onList(items, changed) {
    list.draw(items, changed);
    window.starter.ready = true;
  },
  onLists(lists) { list.drawLists(lists); },
});
