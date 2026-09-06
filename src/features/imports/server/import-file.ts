import { parseCsv, type CsvLearnerRow } from "@/features/imports/server/learner-csv";
import ExcelJS from "exceljs";

export const maxImportFileBytes = 2_000_000;

export type ParsedImportFile = {
  rows: CsvLearnerRow[];
  sourceBytes: Uint8Array;
};

export function isSupportedImportFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File
    && value.size > 0
    && value.size <= maxImportFileBytes
    && [".csv", ".xlsx"].some((extension) => value.name.toLowerCase().endsWith(extension));
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (!isSupportedImportFile(file)) throw new Error("UNSUPPORTED_IMPORT_FILE");
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) {
    return { rows: parseCsv(new TextDecoder().decode(sourceBytes)), sourceBytes };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBytes);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { rows: [], sourceBytes };

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = cell.text.trim().toLowerCase().replace(/[\s-]+/g, "_");
  });

  const rows: CsvLearnerRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(headers.filter(Boolean).map((header, index) => {
      const cell = row.getCell(index + 1);
      const value = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text.trim();
      return [header, value];
    }));
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  return { rows, sourceBytes };
}
