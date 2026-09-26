import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType, type OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { classListDocumentName } from "@/features/documents/server/class-list-document";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialClassListHtml } from "@/features/documents/server/render-official-class-list-html";
import { renderClassListBatchXlsx, renderClassListXlsx } from "@/features/documents/server/render-official-class-list-xlsx";
import { renderOfficialClassListBatchPdf } from "@/features/documents/server/render-official-class-list-batch-pdf";
import { renderOfficialClassListPdf } from "@/features/documents/server/render-official-class-list-pdf";
import { classListColumnIds, type ClassListColumnId, type ClassListConfiguration, type ClassListRosterType, type ClassListTarget, type ClassListWorkspaceData } from "@/features/learners/class-list-types";
import { getClassListBatchWorkspace, getClassListWorkspace } from "@/features/learners/server/class-list-workspace";
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

const allowedRosterTypes = new Set<ClassListRosterType>(["register_class", "grade", "subject", "teacher_subject", "teaching_group", "field_group"]);

function parseTargets(url: URL): ClassListTarget[] {
  return url.searchParams.getAll("target")
    .flatMap((value) => value.split(","))
    .map((value) => {
      const separator = value.indexOf(":");
      if (separator <= 0) return null;
      const rosterType = value.slice(0, separator) as ClassListRosterType;
      const rosterId = value.slice(separator + 1).trim();
      return allowedRosterTypes.has(rosterType) && rosterId ? { rosterType, rosterId } : null;
    })
    .filter((target): target is ClassListTarget => Boolean(target));
}

function documentInputFor(workspace: ClassListWorkspaceData, header: OfficialDocumentHeaderModel, generatedAt: string) {
  return {
    header,
    academicYear: workspace.academicYear,
    grade: workspace.grade,
    registerClass: workspace.className,
    registerTeacherName: workspace.registerTeacherName,
    rosterTitle: workspace.title,
    rows: workspace.learners,
    columns: workspace.configuration.columns,
    blankColumns: workspace.configuration.blankColumns,
    generatedAt,
  };
}

function parseColumns(url: URL): ClassListColumnId[] {
  return Array.from(new Set((url.searchParams.get("columns") ?? "admissionNumber,sex,registerClass,status")
    .split(",").filter((item): item is ClassListColumnId => classListColumnIds.includes(item as ClassListColumnId))));
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

    const requestedTargets = parseTargets(url);
    const batch = requestedTargets.length
      ? await getClassListBatchWorkspace({
          membership,
          academicYear,
          scope: baseConfiguration.scope ?? "all",
          targets: requestedTargets,
          columns: baseConfiguration.columns ?? [],
          blankColumns: baseConfiguration.blankColumns ?? 0,
        })
      : {
          targets: [{ rosterType: workspace.configuration.rosterType, rosterId: workspace.configuration.rosterId }],
          lists: [workspace],
          totalLearners: workspace.learners.length,
        };
    if (!batch.lists.length) return Response.json({ error: "No valid class-list targets were supplied." }, { status: 404 });

    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, { mode: officialDocumentHeaderModeForType("class_list"), provenanceSource: "live_school_profile" });
    const generatedAt = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
    const documentInputs = batch.lists.map((item) => documentInputFor(item, header, generatedAt));
    const fileBase = batch.lists.length > 1
      ? `class-lists-${academicYear}-${batch.lists.length}`
      : `${safeFilePart(classListDocumentName(batch.lists[0].className, batch.lists[0].title))}-${academicYear}`;

    if (format === "xlsx") {
      const logoBytes = await loadClassListLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const bytes = batch.lists.length > 1
        ? renderClassListBatchXlsx(batch.lists, header, logoBytes)
        : renderClassListXlsx(batch.lists[0], header, logoBytes);
      return new Response(bytes, { status: 200, headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      } });
    }
    if (format === "pdf") {
      const logoBytes = await loadClassListLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const previewPdf = url.searchParams.get("preview") === "1";
      const inputsWithLogo = documentInputs.map((item) => ({ ...item, logoBytes }));
      const rendered = inputsWithLogo.length > 1
        ? await renderOfficialClassListBatchPdf(inputsWithLogo)
        : await renderOfficialClassListPdf(inputsWithLogo[0]);
      return new Response(Buffer.from(rendered.bytes), { status: 200, headers: {
        "Content-Type": "application/pdf", "Content-Disposition": `${previewPdf ? "inline" : "attachment"}; filename="${fileBase}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-ScolaPro-Page-Count": String(rendered.pageCount),
      } });
    }
    return new Response(renderOfficialClassListHtml(documentInputs[0]), { status: 200, headers: {
      "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="${fileBase}.html"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
