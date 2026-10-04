import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import { buildOfficialClassListColumns, classListDocumentName } from "@/features/documents/server/class-list-document";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { applyOfficialDocumentXlsxChrome } from "@/features/documents/server/official-document-xlsx-chrome";
import type { ClassListWorkspaceData } from "@/features/learners/class-list-types";

function excelColumnWidth(key: string): number {
  if (key === "number") return 7;
  if (key === "admissionNumber") return 14;
  if (key === "learner") return 28;
  if (key === "sex") return 7;
  if (key === "status") return 11;
  if (key === "registerClass") return 16;
  if (key === "guardianName") return 24;
  if (key === "guardianPhone") return 18;
  if (key === "guardianAddress") return 28;
  if (key === "emergencyContact") return 28;
  if (key.startsWith("blank-")) return 14;
  return 14;
}

function normalizedSex(value: string | null): "M" | "F" | "" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return "";
}

type BuiltWorksheet = {
  worksheet: XLSX.WorkSheet;
  columnCount: number;
  dataColumnCount: number;
  metaStartColumn: number;
};

function buildClassListWorksheet(input: ClassListWorkspaceData, header: OfficialDocumentHeaderModel): BuiltWorksheet {
  const columns = buildOfficialClassListColumns(input.configuration.columns, input.configuration.blankColumns);
  const columnCount = Math.max(columns.length, 6);
  const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));
  const leftEndColumn = Math.max(1, metaStartColumn - 1);
  const lastColumn = columnCount - 1;
  const blankRow = () => Array.from({ length: columnCount }, () => "");
  const rows: Array<Array<string | number>> = [
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    columns.map((column) => column.label),
    ...input.learners.map((learner, index) => columns.map((column) => column.value(learner, index))),
  ];

  const maleCount = input.learners.filter((learner) => normalizedSex(learner.sex) === "M").length;
  const femaleCount = input.learners.filter((learner) => normalizedSex(learner.sex) === "F").length;

  const contact = new Map(header.contactLines.map((line) => [line.key, line]));
  const address = contact.get("address");
  const telephone = contact.get("telephone");
  const fax = contact.get("fax");
  const email = contact.get("email");
  rows[0][1] = header.schoolName;
  rows[1][1] = header.formerName ? "(" + header.formerName + ")" : "";
  rows[2][1] = address ? address.label + ": " + address.value : "";
  rows[3][1] = [telephone ? telephone.label + ": " + telephone.value : "", fax ? fax.label + ": " + fax.value : ""].filter(Boolean).join("   ");
  rows[4][1] = email ? email.label + ": " + email.value : "";
  rows[5][1] = "";
  rows[0][metaStartColumn] = classListDocumentName(input.className, input.title);
  rows[1][metaStartColumn] = input.grade + " · " + input.className + " · " + input.academicYear;
  rows[2][metaStartColumn] = "Male " + maleCount + " · Female " + femaleCount + " · " + input.learners.length + " learners";
  rows[3][metaStartColumn] = input.roomName ? "Room: " + input.roomName : "";
  rows[4][metaStartColumn] = input.responsibleTeacherName ? "Responsible teacher: " + input.responsibleTeacherName : "";

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const lastColumnName = XLSX.utils.encode_col(lastColumn);
  const leftEndColumnName = XLSX.utils.encode_col(leftEndColumn);
  const metaStartColumnName = XLSX.utils.encode_col(metaStartColumn);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("B1:" + leftEndColumnName + "1"),
    XLSX.utils.decode_range("B2:" + leftEndColumnName + "2"),
    XLSX.utils.decode_range("B3:" + leftEndColumnName + "3"),
    XLSX.utils.decode_range("B4:" + leftEndColumnName + "4"),
    XLSX.utils.decode_range("B5:" + leftEndColumnName + "5"),
    XLSX.utils.decode_range("B6:" + leftEndColumnName + "6"),
    XLSX.utils.decode_range(metaStartColumnName + "1:" + lastColumnName + "1"),
    XLSX.utils.decode_range(metaStartColumnName + "2:" + lastColumnName + "2"),
    XLSX.utils.decode_range(metaStartColumnName + "3:" + lastColumnName + "3"),
    XLSX.utils.decode_range(metaStartColumnName + "4:" + lastColumnName + "4"),
    XLSX.utils.decode_range(metaStartColumnName + "5:" + lastColumnName + "5"),
  ];
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, index) => ({
    wch: columns[index] ? excelColumnWidth(columns[index].key) : 12,
  }));
  const addressSelected = input.configuration.columns.includes("guardianAddress");
  worksheet["!rows"] = [
    { hpt: 22 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 11 },
    { hpt: 21 },
    ...input.learners.map(() => ({ hpt: addressSelected ? 42 : 18 })),
  ];
  worksheet["!margins"] = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.35, header: 0.1, footer: 0.1 };
  (worksheet as XLSX.WorkSheet & { "!pageSetup"?: Record<string, unknown> })["!pageSetup"] = {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  return { worksheet, columnCount, dataColumnCount: columns.length, metaStartColumn };
}

function safeWorksheetName(value: string, used: Set<string>): string {
  const base = value.replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Class List";
  let name = base;
  let suffix = 2;
  while (used.has(name.toLocaleLowerCase())) {
    const tail = " " + suffix;
    name = base.slice(0, Math.max(1, 31 - tail.length)) + tail;
    suffix += 1;
  }
  used.add(name.toLocaleLowerCase());
  return name;
}

function arrayBufferFromBuffer(rendered: Buffer): ArrayBuffer {
  return rendered.buffer.slice(rendered.byteOffset, rendered.byteOffset + rendered.byteLength) as ArrayBuffer;
}

export function renderClassListXlsx(
  input: ClassListWorkspaceData,
  header: OfficialDocumentHeaderModel,
  logoBytes: Uint8Array | null,
): ArrayBuffer {
  const built = buildClassListWorksheet(input, header);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, built.worksheet, "Class List");
  workbook.Props = { Title: classListDocumentName(input.className, input.title), Subject: "ScolaPro class list", Author: input.schoolName };
  const baseBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true, cellStyles: true }) as Buffer;
  const rendered = applyOfficialDocumentXlsxChrome(baseBytes, header, logoBytes, [{
    tableHeaderRow: 7,
    dataRowCount: input.learners.length,
    columnCount: built.dataColumnCount,
    metaStartColumn: built.metaStartColumn,
  }]);
  return arrayBufferFromBuffer(rendered);
}

export function renderClassListBatchXlsx(
  inputs: ClassListWorkspaceData[],
  header: OfficialDocumentHeaderModel,
  logoBytes: Uint8Array | null,
): ArrayBuffer {
  if (!inputs.length) throw new Error("At least one class list is required for Excel export.");
  const workbook = XLSX.utils.book_new();
  const builtSheets: BuiltWorksheet[] = [];
  const usedNames = new Set<string>();

  for (const input of inputs) {
    const built = buildClassListWorksheet(input, header);
    builtSheets.push(built);
    XLSX.utils.book_append_sheet(
      workbook,
      built.worksheet,
      safeWorksheetName(classListDocumentName(input.className, input.title), usedNames),
    );
  }

  workbook.Props = {
    Title: inputs.length === 1 ? classListDocumentName(inputs[0].className, inputs[0].title) : `${inputs.length} Class Lists`,
    Subject: "ScolaPro class-list batch",
    Author: inputs[0].schoolName,
  };

  const rendered = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true, cellStyles: true }) as Buffer;
  const decorated = applyOfficialDocumentXlsxChrome(rendered, header, logoBytes, builtSheets.map((built, index) => ({
    tableHeaderRow: 7,
    dataRowCount: inputs[index].learners.length,
    columnCount: built.dataColumnCount,
    metaStartColumn: built.metaStartColumn,
  })));
  return arrayBufferFromBuffer(decorated);
}
