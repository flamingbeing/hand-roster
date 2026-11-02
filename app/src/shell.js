// The page's shell (index.html: .ui-shell, the kit's bar, tab bar, side bar and drawer) and the Settings page: the kit's
// settingsScreen with the options (options.js) and its About rows, and what the options do to the tabs. A new app adds
// its pages as .ui-tab-page sections with a tab (its data-tab-id) and a side link each, and keeps the rest.
// Settings opens on a menu, as the logbook's do: a search box, the tabs taken off the bar (one tap away), then a row per
// page; Back closes a page. The Tab bar page arranges the tabs (the kit's tabArranger; the tabs option, this device).
import { startGestures, adaptiveShell, settingsScreen, createTransients, tabArranger, arrangeTabs, applyTabs } from '@core/ui';
import { themeSwitch } from '@core/theme';
import { APP } from './config.js';
import { $ } from './dom.js';
import { ICONS } from './icons.js';
import { SETTING_SECTIONS } from './options.js';
import { modules } from './modules.js';

/**
 * A recipe's own Settings page (modules.js `settingsPages`, one entry per recipe: backup, bin, feedback, shareIn; the recipes fill them): made once the app is there; null
 * when the page has nothing to show (the feedback page in a static app).
 * @typedef {(o: { app: import('./items.js').ItemsApp }) => import('app-ui/ui/settings-screen.js').SettingSection | null} SettingsSlot
 */

// The Settings menu's headings, in this order; a page whose group is not listed goes under 'Other' (last), so a new
// page is never left out and a recipe never edits this list
const SETTINGS_GROUPS = ['Tasks', 'Look', 'Sharing', 'Data', 'Advanced', 'Other'];
/** @param {import('app-ui/ui/settings-screen.js').SettingSection[]} sections */
const byGroup = sections => sections
  .map(s => (SETTINGS_GROUPS.includes(s.group ?? '') ? s : { ...s, group: 'Other' }))
  .sort((a, b) => SETTINGS_GROUPS.indexOf(a.group ?? '') - SETTINGS_GROUPS.indexOf(b.group ?? ''));

// Settings always stays on the bar (the tabs off it are listed at the top of its menu)
const TAB_RULES = { fixed: ['settings'] };

// The shell starts first, as soon as the page's scripts have run, so the tabs and the menu work while the app is still
// starting; the Settings page follows (settingsPage) once the app and its options are there.
// A page that draws itself late (a lazy screen, a list filled on first view) listens for 'draw-ahead' and draws a
// still copy then, so a swipe or a quick flick never brings it in blank (app-ui rc.69 `ahead`, from the logbook).
// An app that empties its hidden pages must spare the `.is-beside` ones.
export function startShell() {
  const kit = startGestures(document, { ahead: page => page.dispatchEvent(new CustomEvent('draw-ahead')) });
  const shell = adaptiveShell(/** @type {HTMLElement} */ (document.querySelector('.ui-shell')), { screens: kit.screens });
  Object.assign(window, { kit, shell });   // for the tests
}

/** the tab bar's tabs, in index.html's order (an app's own hidden ones left out) */
function barTabs() {
  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.ui-tabbar > [data-tab-id]')]);
  // (its name is the button's own text, not its icon's)
  const label = (/** @type {HTMLElement} */ t) => [...t.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
  return tabs.filter(t => !t.hidden).map(t => ({ id: /** @type {string} */ (t.dataset.tabId), label: label(t) }));
}
const tabButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelector(`.ui-tabbar > [data-tab-id="${id}"]`));

/** a list of rows in host @param {HTMLElement} host @param {HTMLElement[]} items */
function listIn(host, items) {
  const list = document.createElement('ul');
  list.className = 'ui-list';
  list.append(...items.map(item => { const li = document.createElement('li'); li.append(item); return li; }));
  host.append(list);
}

/** @param {import('./items.js').ItemsApp | null} app  null: not set up, so no Settings page */
export function settingsPage(app) {
  if (!app) {
    for (const id of ['tab-settings', 'side-settings']) $(id).hidden = true;
    return;
  }
  const { settings } = app;
  const bar = /** @type {HTMLElement} */ (document.querySelector('.ui-tabbar'));

  // the bar as arranged on this device, now and whenever the arrangement changes (here, Reset or a settings file)
  /** @type {Set<() => void>} */
  const repaints = new Set();
  const arranged = () => arrangeTabs(barTabs().map(t => t.id), settings.get('tabs'), TAB_RULES);
  const paintBar = () => { applyTabs(bar, arranged()); repaints.forEach(f => f()); };
  settings.watch('tabs', paintBar);
  paintBar();

  /** the tabs taken off the bar, one tap away at the top of the menu (none: nothing shows) @param {HTMLElement} host */
  const offBar = host => {
    const draw = () => {
      const off = arranged().hidden;
      host.replaceChildren();
      if (!off.length) return;
      host.append(Object.assign(document.createElement('h2'), { className: 'ui-settings-title', textContent: 'Off the tab bar' }));
      listIn(host, off.map(id => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ui-row ui-settings-go', textContent: barTabs().find(t => t.id === id)?.label || id });
        b.addEventListener('click', () => tabButton(id)?.click());
        return b;
      }));
    };
    repaints.add(draw);
    draw();
    return () => { repaints.delete(draw); };
  };

  settingsScreen($('settings-host'), {
    settings,
    menu: { steps: createTransients({ history, location, events: window }), top: offBar },
    sections: byGroup([
      ...SETTING_SECTIONS,
      { title: 'Tab bar', icon: ICONS.menu, sub: 'Order, and which tabs show', group: 'Look', find: 'arrange tabs', mount: host => {
        let stop = () => {};
        const draw = () => { stop(); stop = tabArranger(host, { tabs: barTabs(), get: () => settings.get('tabs'), set: v => settings.set('tabs', v), rules: TAB_RULES }); };
        repaints.add(draw);
        draw();
        return () => { repaints.delete(draw); stop(); };
      } },
      { title: 'Look', icon: ICONS.smartphone, sub: 'Theme, colour and density', group: 'Look', mount: host => { themeSwitch(host); } },
      // the recipes' own pages (an empty slot adds none)
      ...Object.values(modules.settingsPages ?? {}).flatMap(slot => { const section = slot?.({ app }); return section ? [section] : []; }),
    ]),
    about: { name: APP.title || APP.name, update: app.update },
  });

  // what the options do to the page, now and whenever one changes (here or on another device)
  const apply = () => {
    document.querySelector('.ui-screens')?.classList.toggle('big', settings.get('bigRows'));
  };
  settings.watch(null, apply);
  apply();
}
