// @core/backup (incubating here; it moves into app-sync once a second kind of app uses it): a person's records as a file
// they keep (.json.gz, CSV or Excel), and a restore that only adds what is missing. Named exports only and nothing runs
// on import, so a build keeps only what a page uses; SheetJS (Excel) loads only when an Excel file is made or read.
//   createBackup(options)  set up once with the app's format name, fields and readable columns (backup.js):
//                          build, check, plan, describe, restore, pack/unpack (.json.gz), toCsv/fromCsv, toXlsx/fromXlsx,
//                          read(fileName, bytes) for any of the three, fileName(ext)
//   STILL_LOADING          the error restore throws when the server's copy never arrived
export { createBackup, STILL_LOADING } from './backup.js';

/** @typedef {import('./types').Options} Options */
/** @typedef {import('./types').BackupApi} BackupApi */
/** @typedef {import('./types').BackupData} BackupData */
/** @typedef {import('./types').RestorePlan} RestorePlan */
/** @typedef {import('./types').RestoreIo} RestoreIo */
