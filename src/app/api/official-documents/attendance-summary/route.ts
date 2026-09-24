import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialAttendanceSummaryPdf } from "@/features/documents/server/render-official-attendance-summary-pdf";
import { renderOfficialAttendanceSummaryHtml } from "@/features/documents/server/render-official-attendance-summary-html";
import { renderOfficialDocumentVerificationQrSvg } from "@/features/documents/server/official-document-verification";
import { getOfficialAttendanceSummary, type OfficialAttendanceSummary } from "@/features/attendance/server/official-summary";
import { getOfficialAttendanceSummaryFinalization } from "@/features/attendance/server/finalization";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "attendance-summary";
}

function exportErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/access|scope|role|permission/i.test(message)) return Response.json({ error: "This summary is outside your active school scope." }, { status: 403 });
  console.error("official attendance summary export failed", { message });
  return Response.json({ error: "Unable to generate the official attendance summary." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function xlsxBytes(summary: OfficialAttendanceSummary, meta: { schoolName: string; revision: number; scolaproReference: string; finalizedLabel: string }): ArrayBuffer {
  const isTerm = summary.mode === "term";
  const metaRows: Array<Array<string | number>> = [
    [meta.schoolName],
    ["Official Attendance Summary"],
    [isTerm ? (summary.term ? `Term Summary — ${summary.term.displayName}` : "Term Summary") : "Weekly Summary"],
    ["Reporting period", `${summary.scopeStart} – ${summary.scopeEnd}`],
    ["Revision", meta.revision],
    ["ScolaPro reference", meta.scolaproReference],
    ["Finalized", meta.finalizedLabel],
    ["Possible attendances", summary.schoolTotals.possibleAttendances],
    ["Absent learner-days", summary.schoolTotals.absentLearnerDays],
    ["% absence", summary.schoolTotals.percentAbsence === null ? "—" : `${summary.schoolTotals.percentAbsence.toFixed(1)}%`],
    [],
  ];

  const weekLabels = isTerm ? summary.schoolTotals.weekly.map((week) => week.weekLabel) : [];
  const tableHeader = isTerm
    ? ["Register class", "Boys", "Girls", "Total", "% absence", ...weekLabels.map((label) => `${label} total`)]
    : ["Register class", "Boys absent", "Girls absent", "Total absent"];

  const classRows = summary.classRows.map((row) => {
    const a = row.absences;
    const base = isTerm ? [row.gradeName + " " + row.className, a.boys, a.girls, a.total, ""] : [row.gradeName + " " + row.className, a.boys, a.girls, a.total];
    if (isTerm) {
      const weekTotals = weekLabels.map((label) => {
        const week = row.weekly.find((weekRow) => weekRow.weekLabel === label);
        return week ? week.absences.total : 0;
      });
      return [...base, ...weekTotals];
    }
    return base;
  });

  const gradeRows = summary.gradeRows.map((row) => {
    const a = row.absences;
    const base = isTerm ? [row.gradeName + " (grade total)", a.boys, a.girls, a.total, ""] : [row.gradeName + " (grade total)", a.boys, a.girls, a.total];
    if (isTerm) {
      const weekTotals = weekLabels.map((label) => {
        const week = row.weekly.find((weekRow) => weekRow.weekLabel === label);
        return week ? week.absences.total : 0;
      });
      return [...base, ...weekTotals];
    }
    return base;
  });

  const school = summary.schoolTotals;
  const schoolRow = isTerm
    ? ["School total", "—", "—", "—", formatPercent(school.percentAbsence), ...school.weekly.map((week) => week.absentLearnerDays)]
    : ["School total", "—", "—", school.absentLearnerDays];

  const aoa: Array<Array<string | number>> = [...metaRows, tableHeader, ...classRows, ...gradeRows, schoolRow];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = [
    { wch: 30 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    ...weekLabels.map(() => ({ wch: 12 })),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Summary");
  workbook.Props = { Title: "Official Attendance Summary", Subject: "ScolaPro official document", Author: "ScolaPro" };
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const membership = context.currentSchoolMembership;
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const url = new URL(request.url);
  const academicYear = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const year = Number.isInteger(academicYear) && academicYear >= 2000 && academicYear <= 2200 ? academicYear : new Date().getFullYear();
  const mode = url.searchParams.get("mode") === "term" ? "term" : "week";
  const date = url.searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek" }).format(new Date());
  const termId = url.searchParams.get("term") || null;
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : url.searchParams.get("format") === "xlsx" ? "xlsx" : "html";

  try {
    // Compute the exact reporting scope so we can resolve the frozen, finalized
    // snapshot for it. Readiness/visibility is governed by the finalization RPC.
    const liveSummary = await getOfficialAttendanceSummary(membership.schoolId, year, mode, date, termId);
    const finalization = await getOfficialAttendanceSummaryFinalization({
      schoolId: membership.schoolId,
      mode,
      scopeStart: liveSummary.scopeStart,
      scopeEnd: liveSummary.scopeEnd,
      termId,
    });
    if (!finalization) {
      // No draft leakage: a non-finalized summary is never exportable.
      return Response.json({ error: "This summary has not been finalized yet." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const summary = finalization.dataSnapshot as OfficialAttendanceSummary;
    const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(finalization.finalizedAt));
    const origin = new URL(request.url).origin;
    const verificationUrl = `${origin}${finalization.verificationPath}`;
    const fileBase = `${safeFilePart(summary.term?.displayName ?? "weekly")}-${mode}-attendance-${finalization.revision}`;

    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, { mode: "internal_school", provenanceSource: "live_school_profile" });
    const schoolName = header.schoolName;

    if (format === "xlsx") {
      const bytes = xlsxBytes(summary, {
        schoolName,
        revision: finalization.revision,
        scolaproReference: finalization.scolaproReference,
        finalizedLabel,
      });
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    if (format === "pdf") {
      const rendered = await renderOfficialAttendanceSummaryPdf({
        header,
        summary,
        revision: finalization.revision,
        scolaproReference: finalization.scolaproReference,
        verificationToken: finalization.verificationToken,
        verificationUrl,
        finalizedAt: finalization.finalizedAt,
        logoBytes: null,
      });
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    const qrSvg = await renderOfficialDocumentVerificationQrSvg({ token: finalization.verificationToken, origin });
    const html = renderOfficialAttendanceSummaryHtml({
      schoolName: header.schoolName,
      summary,
      revision: finalization.revision,
      scolaproReference: finalization.scolaproReference,
      verificationUrl,
      finalizedAt: finalization.finalizedAt,
      qrSvg,
    });
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileBase}.html"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
