import ExcelJS from "exceljs";
import { importDefinitions, type ImportTemplateType } from "@/features/imports/import-definitions";

export async function createXlsxTemplate(type: ImportTemplateType) {
  const definition = importDefinitions[type];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ScolaPro";
  workbook.created = new Date();

  const dataSheet = workbook.addWorksheet("Import data", { views: [{ state: "frozen", ySplit: 1 }] });
  dataSheet.columns = definition.columns.map((column) => ({ header: column, key: column, width: Math.max(16, column.length + 3) }));
  dataSheet.getRow(1).font = { bold: true };
  dataSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: definition.columns.length } };

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ key: "instruction", width: 90 }];
  instructions.addRows([
    { instruction: `${definition.label} import template` },
    { instruction: "Enter one record per row on the Import data sheet. Keep the column headings unchanged." },
    { instruction: "Leave optional values blank. ScolaPro validates and previews all rows before anything is committed." },
    { instruction: "Dates should use YYYY-MM-DD." },
  ]);
  instructions.getRow(1).font = { bold: true, size: 14 };
  instructions.getColumn(1).alignment = { vertical: "top", wrapText: true };

  return workbook.xlsx.writeBuffer();
}
