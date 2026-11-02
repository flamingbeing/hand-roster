// @core/backup on the sample list (Settings > Backup): the tasks saved as .json.gz, CSV and Excel; a restore only adds
// what is missing and says so first; a second restore adds nothing; a file that is not a backup changes nothing. (Other
// tests share the list, so the restore is of a file made here from the saved one: two tasks under new ids.)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { test, expect, signIn, add, synced, uniq, openSettings, openToday } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

async function saveAs(page, ext) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(`[data-backup="${ext}"]`)]);
  return { name: download.suggestedFilename(), path: await download.path() };
}

test('back up to .json.gz, CSV and Excel; a restore adds only what is missing, and says so the second time', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const t1 = uniq('bk-one'), t2 = uniq('bk-two');
  await add(a, t1);
  await add(a, t2);
  await synced(a);
  await openSettings(a, 'Backup');
  expect(await AxeBuilder(a)).toEqual([]);

  const gz = await saveAs(a, 'json.gz');
  expect(gz.name).toMatch(/-backup-\d{4}-\d\d-\d\d\.json\.gz$/);
  await expect(a.locator('#backup-msg')).toContainText(`Saved ${gz.name}`);
  const csv = await saveAs(a, 'csv');
  const xlsx = await saveAs(a, 'xlsx');
  expect([csv.name, xlsx.name].map(n => n.split('.').pop())).toEqual(['csv', 'xlsx']);
  expect(fs.readFileSync(csv.path, 'utf8')).toContain(t1);

  // the saved backup holds both tasks; the spreadsheets read back as backups of what is here
  const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz.path)).toString('utf8'));
  const mine = saved.records.filter(r => r.text === t1 || r.text === t2);
  expect(mine).toHaveLength(2);
  // (a download's path has no extension: the picked file gets its suggested name, which says how to read it)
  for (const file of [gz, csv, xlsx]) {
    await a.setInputFiles('#backup-file', { name: file.name, mimeType: 'application/octet-stream', buffer: fs.readFileSync(file.path) });
    await expect(a.locator('#backup-plan')).toContainText('already here, kept as they are', { timeout: 15_000 });
  }

  // the same two tasks under new ids and new words: a restore adds exactly them
  const r1 = `${t1}-back`, r2 = `${t2}-back`;
  const back = { ...saved, records: mine.map((r, i) => ({ ...r, id: `${r.id}x`, text: i ? r2 : r1 })) };
  const file = { name: 'back.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(back)) };
  await a.setInputFiles('#backup-file', file);
  await expect(a.locator('#backup-plan')).toHaveText('Adds 2 tasks.');
  await a.click('#backup-go');
  await expect(a.locator('#backup-msg')).toHaveText('Restored 2 tasks.', { timeout: 30_000 });
  await synced(a);
  await a.setInputFiles('#backup-file', file);
  await expect(a.locator('#backup-plan')).toHaveText('Nothing to add; 2 already here, kept as they are.');
  await expect(a.locator('#backup-go')).toBeHidden();
  await openToday(a);
  await expect(a.locator('#today')).toContainText(r1);
  await expect(a.locator('#today')).toContainText(r2);
});

test('a file that is not a backup says so and changes nothing', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await openSettings(a, 'Backup');
  await a.setInputFiles('#backup-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(a.locator('#backup-msg')).toContainText('isn’t a backup from this app');
  await expect(a.locator('#backup-go')).toBeHidden();
  await a.setInputFiles('#backup-file', { name: 'list.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Age\r\nx,1\r\n') });
  await expect(a.locator('#backup-msg')).toContainText('no Kind and Data columns');
  await expect(a.locator('#backup-go')).toBeHidden();
});
