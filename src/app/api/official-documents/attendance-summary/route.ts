import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType, type OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
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

async function storedLogoBytes(storagePath: string, signedUrl: string): Promise<Uint8Array | null> {
  if (!storagePath || !/^https?:\/\//i.test(signedUrl)) return null;
  try {
    const response = await fetch(signedUrl, { cache: "no-store" });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}


function conciseClassLabel(className: string) {
  return className.trim().replace(/^grade\s+/i, "");
}

function weekEnding(summary: OfficialAttendanceSummary, weekId: string) {
  return summary.weeks.find((week) => week.weekId === weekId)?.weekEndingReportedOn ?? null;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function xlsxBytes(summary: OfficialAttendanceSummary, meta: { header: OfficialDocumentHeaderModel; revision: number; scolaproReference: string; finalizedLabel: string }): ArrayBuffer {
  const contact = new Map(meta.header.contactLines.map((line) => [line.key, line]));
  const address = contact.get("address");
  const telephone = contact.get("telephone");
  const fax = contact.get("fax");
  const email = contact.get("email");
  const weeks = summary.schoolTotals.weekly;
  const totalColumns = 1 + weeks.length * 3;

  const aoa: Array<Array<string | number>> = [
    [meta.header.schoolName],
    [meta.header.formerName ? `(${meta.header.formerName})` : ""],
    [address ? `${address.label}: ${address.value}` : ""],
    [[telephone ? `${telephone.label}: ${telephone.value}` : "", fax ? `${fax.label}: ${fax.value}` : ""].filter(Boolean).join("   ")],
    [email ? `${email.label}: ${email.value}` : ""],
    ["SUMMARY OF ABSENTEES"],
    [summary.mode === "term" ? `Term-to-date${summary.term ? ` — ${summary.term.displayName}` : ""}` : `Current week${weeks[0] ? ` — ${weeks[0].weekLabel}` : ""}`],
    ["Reporting period", `${summary.scopeStart} – ${summary.scopeEnd}`],
    ["Revision", meta.revision],
    ["ScolaPro reference", meta.scolaproReference],
    ["Finalized", meta.finalizedLabel],
    [],
  ];

  const headerStart = aoa.length;
  aoa.push(["WEEK", ...weeks.flatMap((week) => [week.weekLabel.replace(/^Week\s*/i, ""), "", ""])]);
  aoa.push(["DATE OF WEEK ENDING", ...weeks.flatMap((week) => [shortDate(weekEnding(summary, week.weekId)), "", ""])]);
  aoa.push(["GRADE / CLASS", ...weeks.flatMap(() => ["B", "G", "TOTAL"])]);

  const gradeGroups = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(gradeGroups.flatMap((group) => group.classes.map((row) => row.classId)));
  const splitCells = (row: (typeof summary.classRows)[number] | (typeof summary.gradeRows)[number]) =>
    weeks.flatMap((week) => {
      const split = row.weekly.find((item) => item.weekId === week.weekId)?.absences ?? { boys: 0, girls: 0, total: 0 };
      return [split.boys, split.girls, split.total];
    });

  const gradeSectionRows: number[] = [];
  for (const group of gradeGroups) {
    gradeSectionRows.push(aoa.length);
    aoa.push([group.grade.gradeName]);
    for (const row of group.classes) aoa.push([conciseClassLabel(row.className), ...splitCells(row)]);
    aoa.push([`${group.grade.gradeName} total`, ...splitCells(group.grade)]);
  }
  for (const row of summary.classRows.filter((item) => !covered.has(item.classId))) {
    aoa.push([conciseClassLabel(row.className), ...splitCells(row)]);
  }

  const schoolSplit = (weekId: string) =>
    summary.classRows.reduce((total, row) => {
      const split = row.weekly.find((item) => item.weekId === weekId)?.absences ?? { boys: 0, girls: 0, total: 0 };
      total.boys += split.boys;
      total.girls += split.girls;
      total.total += split.total;
      return total;
    }, { boys: 0, girls: 0, total: 0 });

  const schoolTotalRow = aoa.length;
  aoa.push(["SCHOOL TOTAL", ...weeks.flatMap((week) => {
    const split = schoolSplit(week.weekId);
    return [split.boys, split.girls, split.total];
  })]);
  aoa.push(["POSSIBLE ATTENDANCES", ...weeks.flatMap((week) => ["", "", week.possibleAttendances])]);
  aoa.push(["% ABSENCE", ...weeks.flatMap((week) => ["", "", formatPercent(week.percentAbsence)])]);
  aoa.push([]);
  aoa.push(["Total absent learner-days", summary.schoolTotals.absentLearnerDays]);
  aoa.push(["Overall % absence", formatPercent(summary.schoolTotals.percentAbsence)]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = [{ wch: 22 }, ...weeks.flatMap(() => [{ wch: 6 }, { wch: 6 }, { wch: 8 }])];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, totalColumns - 1) } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: Math.max(0, totalColumns - 1) } },
    ...weeks.flatMap((_, index) => {
      const start = 1 + index * 3;
      return [
        { s: { r: headerStart, c: start }, e: { r: headerStart, c: start + 2 } },
        { s: { r: headerStart + 1, c: start }, e: { r: headerStart + 1, c: start + 2 } },
      ];
    }),
    ...gradeSectionRows.map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: Math.max(0, totalColumns - 1) } })),
  ];
  worksheet["!freeze"] = { xSplit: 1, ySplit: headerStart + 3, topLeftCell: "B" + (headerStart + 4), activePane: "bottomRight", state: "frozen" };
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerStart + 2, c: 0 }, e: { r: schoolTotalRow, c: Math.max(0, totalColumns - 1) } }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Summary of Absentees");
  workbook.Props = { Title: "Summary of Absentees", Subject: "ScolaPro official attendance document", Author: "ScolaPro" };
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
  const draftPreview = url.searchParams.get("draft") === "1" && url.searchParams.get("preview") === "1" && format === "pdf";

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
    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, { mode: officialDocumentHeaderModeForType("attendance_summary"), provenanceSource: "live_school_profile" });

    if (!finalization) {
      if (!draftPreview) {
        // Drafts remain preview-only: immutable exports require finalization.
        return Response.json({ error: "This summary has not been finalized yet." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      const generatedAt = new Date().toISOString();
      const fileBase = `${safeFilePart(liveSummary.term?.displayName ?? "weekly")}-${mode}-attendance-draft`;
      const rendered = await renderOfficialAttendanceSummaryPdf({
        header,
        summary: liveSummary,
        generatedAt,
        isDraft: true,
        logoBytes: await storedLogoBytes(profile.logoStoragePath, profile.logoUrl),
      });
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Document-State": "draft",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    const summary = finalization.dataSnapshot as OfficialAttendanceSummary;
    const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(finalization.finalizedAt));
    const origin = new URL(request.url).origin;
    const verificationUrl = `${origin}${finalization.verificationPath}`;
    const fileBase = `${safeFilePart(summary.term?.displayName ?? "weekly")}-${mode}-attendance-${finalization.revision}`;

    if (format === "xlsx") {
      const bytes = xlsxBytes(summary, {
        header,
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
        logoBytes: await storedLogoBytes(profile.logoStoragePath, profile.logoUrl),
      });
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${url.searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    const qrSvg = await renderOfficialDocumentVerificationQrSvg({ token: finalization.verificationToken, origin });
    const html = renderOfficialAttendanceSummaryHtml({
      header,
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
