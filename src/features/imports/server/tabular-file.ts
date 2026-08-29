import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { parseCsv, rowsToRecords } from "@/features/imports/server/learner-csv";

export function validTabularFile(value: FormDataEntryValue | null, maxBytes = 5_000_000): value is File {
  if (!(value instanceof File) || value.size === 0 || value.size > maxBytes) return false;
  const name = value.name.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
}

export async function tabularFileToRows(file: File): Promise<Record<string, string>[]> {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(await file.text());

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return rowsToRecords(matrix.map((row) => row.map((value) => String(value ?? ""))));
}

export async function fileSha256(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}
