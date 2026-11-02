// The share-in recipe's glue (recipes/share-in.json): the chooser that shows when a share arrives (Android, installed app).
// Its switch is the row on Settings > Features; the option shareIn is off until turned on.
// Made once the app is there (modules.js "shareIn" slot, called by shell.js); the check for a share waiting runs then.
import { shareSheet } from './share-sheet.js';

/** @type {import('../shell.js').SettingsSlot} */
export function shareInSettings({ app }) {
  void shareSheet(app).check();
  return null;   // the switch is a row on Settings > Features (options.js)
}
