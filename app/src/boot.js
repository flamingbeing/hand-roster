// Runs first, before anything else on the page. Installable, never prompted: the browser's own install banner is
// cancelled and its prompt kept for Settings > About > Install this app (app-ui install.js), so it shows only on a tap
// (the manifest, icons and service worker stay). Then this device's theme, before the first paint, so a chosen look
// never flashes the default one.
import { applyTheme } from '@core/theme';
import { APP } from './config.js';

addEventListener('beforeinstallprompt', e => { e.preventDefault(); /** @type {any} */ (globalThis).coreInstallPrompt = e; });
applyTheme({ accent: APP.accent });
