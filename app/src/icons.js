// The app's own icons for the Settings menu (Lucide, https://lucide.dev, ISC licence): [tag, attributes] pairs, drawn by
// @core/ui's icon(). Add one by copying its nodes from lucide.dev; never an emoji or a text glyph.
/** @typedef {import('app-ui/icons/lucide.js').IconNodes} IconNodes */

/** @type {Record<string, IconNodes>} */
export const ICONS = {
  listChecks: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
  menu: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  smartphone: [['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }], ['path', { d: 'M12 18h.01' }]],
};
