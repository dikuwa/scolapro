import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import { buildOfficialClassListColumns } from "@/features/documents/server/class-list-document";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
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

async function loadStoredLogoBytes(storagePath: string, signedUrl: string): Promise<Uint8Array | null> {
  if (!storagePath || !signedUrl) return null;
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

function parseColumns(url: URL): ClassListColumnId[] {
  return Array.from(new Set((url.searchParams.get("columns") ?? "admissionNumber,sex,registerClass,status")
    .split(",").filter((item): item is ClassListColumnId => classListColumnIds.includes(item as ClassListColumnId))));
}

function xlsxBytes(input: Awaited<ReturnType<typeof getClassListWorkspace>>): ArrayBuffer {
  const columns = buildOfficialClassListColumns(input.configuration.columns, input.configuration.blankColumns);
  const rows: Array<Array<string | number>> = [
    [input.schoolName], [input.title],
    ["Academic Year", input.academicYear, "Grade", input.grade, "Class", input.className],
    ["Register Teacher", input.registerTeacherName ?? "—"], [],
    columns.map((column) => column.label),
    ...input.learners.map((learner, index) => columns.map((column) => column.value(learner, index))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = columns.map((column) => ({ wch: Math.max(8, Math.round(column.weight * 14)) }));
  worksheet["!autofilter"] = { ref: `A6:${XLSX.utils.encode_col(columns.length - 1)}${rows.length}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Class List");
  workbook.Props = { Title: `${input.title} class list`, Subject: "ScolaPro class list", Author: "ScolaPro" };
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
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
      return new Response(xlsxBytes(workspace), { status: 200, headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      } });
    }
    if (format === "pdf") {
      const logoBytes = await loadStoredLogoBytes(profile.logoStoragePath, profile.logoUrl);
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
