// @core/backup (made-up records): the backup object, the add-only restore and its dry-run line, and the three file
// shapes (.json.gz, CSV, Excel) reading back as the same backup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, STILL_LOADING } from '../public/backup/index.js';

const B = createBackup({
  format: 'demo-backup',
  fields: ['title', 'body', 'tags'],
  clean: r => (typeof r.title === 'string' && r.title ? { id: r.id, title: r.title, body: typeof r.body === 'string' ? r.body : '', ...(Array.isArray(r.tags) ? { tags: r.tags } : {}) } : null),
  columns: [{ title: 'Title', value: r => r.title }, { title: 'Text', value: r => r.body }, { title: 'Tags', value: r => r.tags }],
  noun: ['item', 'items'],
});
const records = [
  { id: 'a', title: 'Shopping', body: 'milk, "bread"; eggs\nand jam', tags: ['home', 'week'], updatedAt: 1700000000000, _edits: { title: 1 }, serverAt: 5 },
  { id: 'b', title: '=SUM(A1)', body: '', updatedAt: { seconds: 1 } },
];
const now = new Date('2026-10-30T01:02:03Z');
const backup = () => B.build({ records, files: [{ id: 'f1', name: 'photo.jpg', size: 10, extra: 'x' }], settings: { theme: 'dark' }, space: { id: 's', name: 'Home' }, now });

test('build keeps the listed fields and a real updatedAt, never the sync’s own fields', () => {
  const d = backup();
  assert.equal(d.format, 'demo-backup');
  assert.equal(d.exportedAt, '2026-10-30T01:02:03.000Z');
  assert.deepEqual(d.records[0], { id: 'a', title: 'Shopping', body: 'milk, "bread"; eggs\nand jam', tags: ['home', 'week'], updatedAt: 1700000000000 });
  assert.deepEqual(d.records[1], { id: 'b', title: '=SUM(A1)', body: '' });
  assert.deepEqual(d.files, [{ id: 'f1', name: 'photo.jpg', size: 10 }]);
  assert.equal(B.fileName('csv', now), 'demo-backup-2026-10-30.csv');
});

test('without a field list, every field but _… and serverAt is kept', () => {
  const all = createBackup({ format: 'x' }).build({ records: [{ id: 'a', n: 1, _deleted: false, serverAt: 2, updatedAt: 3 }] });
  assert.deepEqual(all.records, [{ id: 'a', n: 1, updatedAt: 3 }]);
});

test('check refuses another app’s file and a newer version, in plain words', () => {
  assert.throws(() => B.check({ format: 'other' }), /isn’t a backup from this app/);
  assert.throws(() => B.check({ format: 'demo-backup', version: 99 }), /newer version/);
  assert.throws(() => B.check(null), /isn’t a backup/);
  assert.deepEqual(B.check({ format: 'demo-backup', version: 1 }).records, []);
});

test('plan adds only what is missing, through clean; counts what is here and what can’t be read', () => {
  const d = { ...backup(), records: [...backup().records, { id: 'c', title: 7 }, { nope: true }, { id: 'a', title: 'dup' }] };
  const p = B.plan(d, { ids: ['b'], fileIds: [] });
  assert.deepEqual(p.add, [{ id: 'a', title: 'Shopping', body: 'milk, "bread"; eggs\nand jam', tags: ['home', 'week'] }]);
  assert.equal(p.present, 1);
  assert.equal(p.skipped, 3);   // c fails clean; one has no id; one repeats an id
  assert.equal(p.filesMissing, 1);
  assert.equal(p.settings, true);
  assert.equal(B.describe(p), 'Adds 1 item; 1 already here, kept as they are; 1 file listed but not here (files are not restored); settings you haven’t changed are restored; 3 could not be read.');
  assert.equal(B.describe(B.plan(backup(), { ids: ['a', 'b'], fileIds: ['f1'], settingsWouldChange: () => false })), 'Nothing to add; 2 already here, kept as they are.');
});

test('restore waits for the server’s copy, plans again then, and adds; a second run adds nothing', async () => {
  const here = new Map();
  const io = { ready: async () => true, have: () => ({ ids: here.keys() }), save: async list => { for (const r of list) here.set(r.id, r); return 0; } };
  const first = await B.restore(backup(), io);
  assert.equal(first.added, 2);
  assert.equal(here.get('b').title, '=SUM(A1)');
  assert.equal(here.get('a').updatedAt, undefined);   // the save stamps its own time
  const again = await B.restore(backup(), io);
  assert.equal(again.added, 0);
  await assert.rejects(B.restore(backup(), { ...io, ready: async () => false }), { message: STILL_LOADING });
  const refused = await B.restore(backup(), { ...io, have: () => ({ ids: [] }), save: async () => 1 });
  assert.deepEqual([refused.added, refused.refused], [1, 1]);
});

test('.json.gz round trip; a plain .json reads too; junk says so', async () => {
  const bytes = await B.pack(backup());
  assert.deepEqual([bytes[0], bytes[1]], [0x1f, 0x8b]);
  assert.deepEqual((await B.read('x.json.gz', bytes)).records, backup().records);
  assert.equal((await B.read('x.json', new TextEncoder().encode(JSON.stringify(backup())))).records.length, 2);
  await assert.rejects(B.read('x.json', new TextEncoder().encode('{"hello":1}')), /isn’t a backup from this app/);
  await assert.rejects(B.read('x.json', new TextEncoder().encode('not json')), /not JSON/);
});

test('CSV: readable columns, a formula-like cell made text, quotes and new lines kept; reads back the same', async () => {
  const csv = B.toCsv(backup());
  assert.ok(csv.startsWith('﻿Kind,ID,Title,Text,Tags,Updated,Data\r\n'));
  assert.match(csv, /record,b,'=SUM\(A1\)/);
  assert.match(csv, /"home; week",2023-11-14 22:13/);
  const back = B.fromCsv(csv);
  assert.deepEqual(back.records, backup().records);
  assert.deepEqual(back.files, backup().files);
  assert.deepEqual(back.space, { id: 's', name: 'Home' });
  assert.deepEqual(back.settings, { theme: 'dark' });
  // Excel in some countries saves with ;
  assert.equal(B.fromCsv(csv.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ';')).records.length, 2);
  assert.equal(B.fromCsv('Name,Age\r\nx,1\r\n'), null);
  assert.equal(B.fromCsv('Kind,Data\r\nrecord,{bad\r\n').skipped, 1);
});

test('Excel: SheetJS loads on the call; a long record continues in Data 2 and reads back whole', async () => {
  const long = { id: 'z', title: 'Long', body: 'x'.repeat(70000) };
  const data = B.build({ records: [...records, long], now });
  const bytes = await B.toXlsx(data);
  assert.deepEqual([bytes[0], bytes[1]], [0x50, 0x4b]);   // a zip
  const back = await B.read('x.xlsx', bytes);
  assert.deepEqual(back.records, data.records);
  await assert.rejects(B.read('x.csv', new TextEncoder().encode('a,b\n1,2\n')), /no Kind and Data columns/);
});
