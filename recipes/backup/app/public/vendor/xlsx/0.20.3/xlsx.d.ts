// The part of SheetJS (xlsx 0.20.3, vendored beside it as xlsx.js) that @core/backup calls. The library's own types are
// not vendored.
export interface WorkSheet { [cell: string]: unknown }
export interface WorkBook { SheetNames: string[]; Sheets: Record<string, WorkSheet> }
export const utils: {
  book_new(): WorkBook;
  book_append_sheet(book: WorkBook, sheet: WorkSheet, name: string): void;
  aoa_to_sheet(rows: unknown[][]): WorkSheet;
  sheet_to_json(sheet: WorkSheet, opts: { header: 1; defval: unknown }): unknown[][];
};
export function read(data: Uint8Array, opts: { type: 'array' }): WorkBook;
export function write(book: WorkBook, opts: { bookType: 'xlsx'; type: 'array'; compression?: boolean }): ArrayBuffer;
