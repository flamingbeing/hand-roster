import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShare, appendShare, fitsNotes, takeShare, dropShare, NOTES_MAX } from '../src/share/share-in.js';

test('parseShare: title, text and link', () => {
  assert.deepEqual(parseShare({ title: 'T', text: 'words', url: 'https://x.test/a' }), { title: 'T', body: 'words\n\nhttps://x.test/a' });
  assert.deepEqual(parseShare({ text: 'see https://x.test/a', url: 'https://x.test/a' }), { title: 'see https://x.test/a', body: 'see https://x.test/a' });
  assert.deepEqual(parseShare({ url: ' https://x.test/a ' }), { title: 'https://x.test/a', body: 'https://x.test/a' });
  assert.deepEqual(parseShare({}), { title: 'Shared', body: '' });
});
test('appendShare puts the share at the end; fitsNotes caps the length', () => {
  assert.equal(appendShare('', 'a'), 'a\n');
  assert.equal(appendShare('x\n\n', 'a'), 'x\n\na\n');
  assert.ok(fitsNotes('x'.repeat(NOTES_MAX)) && !fitsNotes('x'.repeat(NOTES_MAX + 1)));
});

/** a CacheStorage with a few named caches (what sw.js leaves) */
function fakeStore(entries) {
  const caches = new Map();
  if (entries) caches.set('share-in', new Map(entries));
  return {
    caches,
    async open(name) {
      if (!caches.has(name)) caches.set(name, new Map());
      const m = caches.get(name);
      return { match: async k => m.get(typeof k === 'string' ? k : k.url), keys: async () => [...m.keys()].map(url => ({ url })) };
    },
    async delete(name) { return caches.delete(name); },
  };
}

test('takeShare reads the text and the files once, then the cache is empty', async () => {
  const store = fakeStore([
    ['/share-in/data', new Response(JSON.stringify({ title: 'T', text: '', url: '' }), { headers: { 'content-type': 'application/json' } })],
    ['/share-in/file-0', new Response('hello', { headers: { 'content-type': 'text/plain', 'x-name': encodeURIComponent('a b.txt') } })],
  ]);
  const got = await takeShare(store);
  assert.equal(got.fields.title, 'T');
  assert.equal(got.files.length, 1);
  assert.equal(got.files[0].name, 'a b.txt');
  assert.equal(await got.files[0].text(), 'hello');
  assert.equal(store.caches.has('share-in'), false);
  assert.equal(await takeShare(store), null);
});
test('takeShare: no cache API, or nothing kept, is null; dropShare keeps nothing', async () => {
  assert.equal(await takeShare(null), null);
  const store = fakeStore([['/share-in/data', new Response('{}')]]);
  await dropShare(store);
  assert.equal(store.caches.has('share-in'), false);
  await dropShare(undefined);
});
