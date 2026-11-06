// The app's shared bits: the refused-save line and the shapes the page, the screens and the screen switch use (cloud.js
// start() has the data).
/** what the page says when the server refused a save at once (its copy waits in the refused list) */
export const REFUSED = 'The server refused that. A copy is kept in the refused list.';
/** what the page says when a make, build or save is tapped before the records it works from have all arrived */
export const LOADING = 'Still loading. Try again in a moment.';

/** @typedef {{ uid: string, email: string, name: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */
/** @typedef {{ phase: Phase, user?: User, role?: string }} State */
/** one entry of the bin: a deleted record's last version (the bin recipe; docId is its document in the bin) */
/** @typedef {{ docId: string, id: string, kind?: unknown, deletedAt: number, data?: any }} BinEntry */
/** @typedef {{ list: () => Promise<BinEntry[]>, restore: (entry: BinEntry) => Promise<string>, purge: (entries: BinEntry[]) => Promise<void> }} BinApi */

/**
 * What the shell and Settings use of the app (cloud.js start()).
 * @typedef {object} ItemsApp
 * @property {import('app-ui/ui/types').SyncApi} sync  for the kit's conflict sheet and refused list
 * @property {import('app-ui/settings/types').SettingsApi} settings
 * @property {import('app-ui/ui/types').UpdateApi | null} update  with a service worker only
 */

/**
 * A saved record in words, for the conflict sheet and the refused list: who or what it is, and the days it covers.
 * @param {unknown} value
 * @returns {string}
 */
export function recordText(value) {
  const r = /** @type {Record<string, any>} */ (value && typeof value === 'object' ? value : {});
  if (r._deleted) return 'deleted';
  const when = r.from && r.to ? `${r.from} to ${r.to}` : r.date || r.wd && r.session ? [r.date, r.wd ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][r.wd] : '', r.session].filter(Boolean).join(' ') : '';
  const calls = Array.isArray(r.calls) ? `${r.calls.length} days of calls` : Array.isArray(r.grid) ? 'the week’s grid' : '';
  return [r.name || (typeof r.id === 'string' && /^\d{4}-\d{2}/.test(r.id) ? r.id : ''), when, calls].filter(Boolean).join(', ') || 'a change';
}
