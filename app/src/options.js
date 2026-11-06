// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off.
import { cleanTabs } from '@core/ui';
import { ICONS } from './icons.js';

export const SETTINGS_COLL = 'settings';

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // the site the Week tab opens on: 'all', or a site's name
  defaultSite: { scope: 'device', default: 'all', clean: v => (typeof v === 'string' && v.length <= 20 ? v : 'all') },
  // whether a list card on the Week tab says how many patients are booked
  showPatients: { scope: 'device', default: false },
  // the tab bar's order and the tabs off it (this device; Settings, Tab bar)
  tabs: { scope: 'device', default: { order: [], hidden: [] }, clean: cleanTabs },
  // "This is me" (Week, More): a person's name, kept on this device only (no email, no account link)
  me: { scope: 'device', default: '', clean: v => (typeof v === 'string' && v.length <= 60 ? v : '') },
  // add: options
};

/** The Features page's rows: a recipe adds one switch for its part (an option here that is on until turned off); with none,
 * the page does not show. @type {import('app-ui/ui/settings-screen.js').SettingRow[]} */
const FEATURES = [
  // add: feature rows
];

/** The Settings pages (src/shell.js: @core/ui settingsScreen with its menu): a row is a switch for a yes/no option; icon,
 * sub and group are the page's row in the menu. */
/** @type {import('app-ui/ui/settings-screen.js').SettingSection[]} */
export const SETTING_SECTIONS = [
  { title: 'Roster', icon: ICONS.calendar, sub: 'Site, patients and row size', group: 'Roster', rows: [
    { key: 'defaultSite', label: 'Week tab opens on', sub: 'This device', choices: [['all', 'All sites'], ['NUH', 'NUH'], ['NTFGH', 'NTFGH']] },
    { key: 'showPatients', label: 'Show patient numbers on the lists', sub: 'This device' },
    { key: 'bigRows', label: 'Larger rows', sub: 'This device' },
  ] },
  { title: 'Features', icon: ICONS.listChecks, sub: 'Switch optional parts on or off', group: 'Advanced', visible: () => FEATURES.length > 0, rows: FEATURES },
];
