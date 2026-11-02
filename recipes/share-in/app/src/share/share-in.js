// Share-in's parts that need no page: what a share from another app (the manifest's share_target, sw.js) turns into, and
// how the service worker's cache is read. Nothing runs on import.

/** the cache sw.js fills, and the keys it uses */
export const CACHE = 'share-in';
export const DATA_KEY = '/share-in/data';
export const FILE_KEY = '/share-in/file-';
/** the longest an item's text and notes can be (the sample task sheet's own limits: make them the app's) */
export const TEXT_MAX = 500;
export const NOTES_MAX = 5000;

/** the parts of a share as an item's text: its title, and a body of the text and the link
 * @param {{ title?: unknown, text?: unknown, url?: unknown }} s @returns {{ title: string, body: string }} */
export function parseShare(s) {
  const text = String(s.text ?? '').trim(), url = String(s.url ?? '').trim();
  // some apps put the link inside the text: it is not said twice
  const body = [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n\n');
  const title = String(s.title ?? '').trim() || body.split('\n')[0].slice(0, 80) || 'Shared';
  return { title, body };
}
/** an item's notes with a share added at the end @param {string} notes @param {string} add */
export const appendShare = (notes, add) => (notes.trim() ? `${notes.replace(/\s+$/, '')}\n\n${add}\n` : `${add}\n`);
/** whether notes of this length can be saved @param {string} notes */
export const fitsNotes = notes => notes.length <= NOTES_MAX;

/** the cache's CacheStorage-shaped part this file uses
 * @typedef {{ open: (name: string) => Promise<{ match: (k: any) => Promise<Response | undefined>, keys: () => Promise<readonly { url: string }[]> }>,
 *   delete: (name: string) => Promise<boolean> }} CacheStore */

/** the share waiting in the cache, which is emptied (null: none, or no cache here)
 * @param {CacheStore | undefined} [store]
 * @returns {Promise<{ fields: Record<string, string>, files: File[] } | null>} */
export async function takeShare(store = globalThis.caches) {
  if (!store) return null;
  const cache = await store.open(CACHE);
  const data = await cache.match(DATA_KEY);
  if (!data) { await store.delete(CACHE); return null; }
  const fields = await data.json();
  /** @type {File[]} */ const files = [];
  for (const req of await cache.keys()) {
    if (!req.url.includes(FILE_KEY)) continue;
    const res = await cache.match(req);
    if (res) files.push(new File([await res.blob()], decodeURIComponent(res.headers.get('x-name') || 'shared'), { type: res.headers.get('content-type') || '' }));
  }
  await store.delete(CACHE);
  return { fields, files };
}
/** throws away a share nobody asked for (the option is off) @param {CacheStore | undefined} [store] */
export async function dropShare(store = globalThis.caches) { await store?.delete(CACHE); }
