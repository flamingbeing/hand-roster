// Types for @core/backup (app/public/backup/). The comments at the top of index.js say what each does.

/** a record in the backup: it needs a string `id`; the rest is the app's */
export type Item = { id: string } & Record<string, unknown>;

/** a file the records refer to; the bytes are not in the backup */
export type FileRef = { id: string; name: string; path?: string; size?: number; type?: string };

/** a readable spreadsheet column (the Data column, which a restore reads, always comes last) */
export type Column = { title: string; value: (record: Item) => unknown };

export type Options = {
  /** names this app's backups (e.g. "tasks-backup"); a file with another format is refused */
  format: string;
  /** the start of a saved file's name (default: format) */
  name?: string;
  /** the record fields kept (default: every field but the sync's own: a leading _, serverAt). updatedAt is kept when it
   * is a time, for the Updated column, and never restored (the save stamps its own) */
  fields?: string[];
  /** a record read from a file -> the record to save, or null to skip it (counted as "could not be read"): the app's own
   * checks, so only fields of the right type reach the save path */
  clean?: (record: Item) => Item | null;
  /** readable spreadsheet columns, after Kind and ID */
  columns?: Column[];
  /** what the dry-run line calls one record and several */
  noun?: [string, string];
  /** the Excel sheet's name (default "Records") */
  sheet?: string;
};

export type BackupData = {
  format: string;
  version: number;
  exportedAt: string;
  /** the space or account the backup came from, as the app names it */
  space: { id: string; name: string } | null;
  /** the app's settings file, as its settings module wrote it */
  settings: unknown;
  records: Item[];
  files: FileRef[];
  /** rows a spreadsheet held that could not be read */
  skipped?: number;
};

export type RestorePlan = {
  /** what is not here yet: the only records a restore writes */
  add: Item[];
  /** records already here, kept as they are */
  present: number;
  /** files the backup lists that are not here (a restore cannot bring files back) */
  filesMissing: number;
  settings: boolean;
  /** rows or records the file held that could not be read */
  skipped: number;
};

/** what is here now */
export type Have = {
  ids: Iterable<string>;
  fileIds?: Iterable<string>;
  /** whether restoring the backup's settings would change any (the app says; without it, they are assumed to) */
  settingsWouldChange?: (settings: unknown) => boolean;
};

export type RestoreIo = {
  /** true once the server's copy has arrived (waits a while, false after that) */
  ready: () => Promise<boolean>;
  have: () => Have;
  /** save records that are not here yet, under their own ids; resolves to how many were refused */
  save: (records: Item[]) => Promise<number>;
  /** apply the backup's settings where the app allows (never over a value the person changed) */
  applySettings?: (settings: unknown) => Promise<void>;
};

export type BackupApi = {
  build(from: { records: Item[]; files?: FileRef[]; settings?: unknown; space?: { id: string; name: string } | null; now?: Date }): BackupData;
  /** the object a file held, or an error in plain words */
  check(data: unknown): BackupData;
  /** what a restore would add, now */
  plan(data: BackupData, have: Have): RestorePlan;
  /** the dry-run line */
  describe(plan: RestorePlan): string;
  /** waits for the server's copy, plans again from what is here then, and adds what is missing */
  restore(data: BackupData, io: RestoreIo): Promise<{ added: number; refused: number; plan: RestorePlan }>;
  pack(data: BackupData): Promise<Uint8Array>;
  unpack(bytes: Uint8Array): Promise<BackupData>;
  toCsv(data: BackupData): string;
  /** null when the headings aren't a backup's */
  fromCsv(text: string): BackupData | null;
  toXlsx(data: BackupData): Promise<Uint8Array>;
  fromXlsx(bytes: Uint8Array): Promise<BackupData | null>;
  /** a picked file (.json.gz, .json, .csv or .xlsx, by its name) -> the backup, or an error in plain words */
  read(fileName: string, bytes: Uint8Array): Promise<BackupData>;
  /** "<name>-YYYY-MM-DD.<ext>" */
  fileName(ext?: string, now?: Date): string;
  /** "1 record", "3 records" */
  words(count: number): string;
};
