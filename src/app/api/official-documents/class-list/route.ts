import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { buildOfficialClassListColumns } from "@/features/documents/server/class-list-document";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType, type OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialClassListHtml } from "@/features/documents/server/render-official-class-list-html";
import { renderOfficialClassListPdf } from "@/features/documents/server/render-official-class-list-pdf";
import { classListColumnIds, type ClassListColumnId, type ClassListConfiguration, type ClassListRosterType } from "@/features/learners/class-list-types";
import { getClassListWorkspace } from "@/features/learners/server/class-list-workspace";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "class-list";
}

function exportErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/access|scope|role/i.test(message)) return Response.json({ error: "This class list is outside your active school class-list scope." }, { status: 403 });
  console.error("official class-list export failed", { message });
  return Response.json({ error: "Unable to generate the class list." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

async function loadClassListLogoBytes(storagePath: string, logoUrl: string): Promise<Uint8Array | null> {
  if (storagePath && /^https:\/\//i.test(logoUrl)) {
    const response = await fetch(logoUrl, { cache: "no-store" });
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
  }
  if (logoUrl.startsWith("/brand/")) {
    try {
      return new Uint8Array(await readFile(join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""))));
    } catch {
      return null;
    }
  }
  return null;
}

function parseColumns(url: URL): ClassListColumnId[] {
  return Array.from(new Set((url.searchParams.get("columns") ?? "admissionNumber,sex,registerClass,status")
    .split(",").filter((item): item is ClassListColumnId => classListColumnIds.includes(item as ClassListColumnId))));
}

function xlsxBytes(
  input: Awaited<ReturnType<typeof getClassListWorkspace>>,
  header: OfficialDocumentHeaderModel,
): ArrayBuffer {
  const columns = buildOfficialClassListColumns(input.configuration.columns, input.configuration.blankColumns);
  const columnCount = Math.max(columns.length, 6);
  const rightStart = Math.max(3, columnCount - 2);
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

  rows[0][0] = header.schoolName;
  rows[1][0] = header.formerName ? `(${header.formerName})` : "";
  rows[2][0] = header.contactLines.map((line) => line.text).join(" · ");
  rows[0][rightStart] = header.postalLines.join("\n");
  rows[3][0] = input.title;
  rows[4][0] = `${input.academicYear} · ${input.grade} · ${input.className}`;
  rows[5][0] = input.registerTeacherName ? `Register teacher: ${input.registerTeacherName}` : "";

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const lastColumn = XLSX.utils.encode_col(columnCount - 1);
  const leftEndColumn = XLSX.utils.encode_col(Math.max(0, rightStart - 1));
  const postalStartColumn = XLSX.utils.encode_col(rightStart);

  worksheet["!merges"] = [
    XLSX.utils.decode_range(`A1:${leftEndColumn}1`),
    XLSX.utils.decode_range(`A2:${leftEndColumn}2`),
    XLSX.utils.decode_range(`A3:${leftEndColumn}3`),
    XLSX.utils.decode_range(`${postalStartColumn}1:${lastColumn}3`),
    XLSX.utils.decode_range(`A4:${lastColumn}4`),
    XLSX.utils.decode_range(`A5:${lastColumn}5`),
    XLSX.utils.decode_range(`A6:${lastColumn}6`),
  ];

  const preferredWidth = (key: string) => {
    if (key === "number") return 6;
    if (key === "admissionNumber") return 14;
    if (key === "learner") return 28;
    if (key === "sex") return 7;
    if (key === "status") return 11;
    if (key === "registerClass") return 16;
    if (key === "guardianName") return 24;
    if (key === "guardianPhone") return 18;
    if (key === "emergencyContact") return 28;
    if (key.startsWith("blank-")) return 14;
    return 14;
  };
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, index) => ({
    wch: columns[index] ? preferredWidth(columns[index].key) : 12,
  }));
  worksheet["!rows"] = [
    { hpt: 22 }, { hpt: 15 }, { hpt: 28 }, { hpt: 20 }, { hpt: 17 }, { hpt: 17 }, { hpt: 22 },
  ];
  worksheet["!autofilter"] = { ref: `A7:${XLSX.utils.encode_col(columns.length - 1)}${rows.length}` };
  worksheet["!margins"] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 };
  (worksheet as XLSX.WorkSheet & { "!pageSetup"?: Record<string, unknown> })["!pageSetup"] = {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  const border = {
    top: { style: "thin", color: { rgb: "B8BDC7" } },
    bottom: { style: "thin", color: { rgb: "B8BDC7" } },
    left: { style: "thin", color: { rgb: "B8BDC7" } },
    right: { style: "thin", color: { rgb: "B8BDC7" } },
  };
  const styleCell = (address: string, style: Record<string, unknown>) => {
    const cell = worksheet[address] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
    if (cell) cell.s = style;
  };
  styleCell("A1", { font: { bold: true, sz: 16 }, alignment: { vertical: "center" } });
  styleCell("A2", { font: { italic: true, sz: 9 }, alignment: { vertical: "center" } });
  styleCell("A3", { font: { sz: 9 }, alignment: { wrapText: true, vertical: "top" } });
  styleCell(`${postalStartColumn}1`, { font: { sz: 9 }, alignment: { wrapText: true, vertical: "top", horizontal: "right" } });
  styleCell("A4", { font: { bold: true, sz: 13 }, alignment: { horizontal: "left" } });
  styleCell("A5", { font: { bold: true, sz: 10 } });
  styleCell("A6", { font: { sz: 9 } });

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const address = `${XLSX.utils.encode_col(columnIndex)}7`;
    styleCell(address, {
      font: { bold: true, sz: 10 },
      fill: { patternType: "solid", fgColor: { rgb: "E9EDF3" } },
      alignment: { vertical: "center", horizontal: columns[columnIndex].key === "number" ? "center" : "left" },
      border,
    });
  }
  for (let rowIndex = 8; rowIndex <= rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      styleCell(`${XLSX.utils.encode_col(columnIndex)}${rowIndex}`, {
        alignment: { vertical: "center", horizontal: columns[columnIndex].key === "number" ? "center" : "left" },
        border,
      });
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Class List");
  workbook.Props = { Title: `${input.title} class list`, Subject: "ScolaPro class list", Author: input.schoolName };
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellStyles: true }) as ArrayBuffer;
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const membership = context.currentSchoolMembership;
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : new Date().getFullYear();
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : url.searchParams.get("format") === "xlsx" ? "xlsx" : "html";
  const baseConfiguration: Partial<ClassListConfiguration> = {
    scope: url.searchParams.get("scope") === "my" ? "my" : "all",
    rosterType: (url.searchParams.get("rosterType") ?? "register_class") as ClassListRosterType,
    rosterId: url.searchParams.get("rosterId") ?? "",
    columns: parseColumns(url),
    blankColumns: Number(url.searchParams.get("blankColumns") ?? 0),
  };

  try {
    let workspace = await getClassListWorkspace({ membership, academicYear, configuration: baseConfiguration });
    // Legacy grade/class links resolve only inside the current school staff scope.
    // Arbitrary labels cannot cross the authenticated school boundary.
    if (!url.searchParams.get("rosterId") && url.searchParams.get("class")) {
      const classLabel = url.searchParams.get("class")?.trim();
      const gradeLabel = url.searchParams.get("grade")?.trim();
      const match = workspace.options.register_class.find((option) => option.label === classLabel && (!gradeLabel || option.helper === gradeLabel));
      if (!match) return Response.json({ error: "This class list is outside your active school class-list scope." }, { status: 403 });
      workspace = await getClassListWorkspace({ membership, academicYear, configuration: { ...baseConfiguration, rosterType: "register_class", rosterId: match.id } });
    }
    if (!workspace.configuration.rosterId) return Response.json({ error: "No roster is available in your active school class-list scope." }, { status: 404 });

    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, { mode: officialDocumentHeaderModeForType("class_list"), provenanceSource: "live_school_profile" });
    const generatedAt = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
    const documentInput = {
      header, academicYear, grade: workspace.grade, registerClass: workspace.className,
      registerTeacherName: workspace.registerTeacherName, rosterTitle: workspace.title,
      rows: workspace.learners, columns: workspace.configuration.columns,
      blankColumns: workspace.configuration.blankColumns, generatedAt,
    };
    const fileBase = `${safeFilePart(workspace.title)}-${academicYear}-class-list`;

    if (format === "xlsx") {
      return new Response(xlsxBytes(workspace, header), { status: 200, headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      } });
    }
    if (format === "pdf") {
      const logoBytes = await loadClassListLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const rendered = await renderOfficialClassListPdf({ ...documentInput, logoBytes });
      return new Response(Buffer.from(rendered.bytes), { status: 200, headers: {
        "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-ScolaPro-Page-Count": String(rendered.pageCount),
      } });
    }
    return new Response(renderOfficialClassListHtml(documentInput), { status: 200, headers: {
      "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="${fileBase}.html"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
