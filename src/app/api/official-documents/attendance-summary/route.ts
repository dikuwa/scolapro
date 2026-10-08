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

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

type XlsxSourceRow = OfficialAttendanceSummary["classRows"][number] | OfficialAttendanceSummary["gradeRows"][number];
type XlsxSplit = { boys: number; girls: number; total: number };
type XlsxColumn = { label: string; possible: number; percent: number | null; split: (row: XlsxSourceRow) => XlsxSplit };

function emptySplit(): XlsxSplit {
  return { boys: 0, girls: 0, total: 0 };
}

function addSplit(target: XlsxSplit, value: XlsxSplit) {
  target.boys += value.boys;
  target.girls += value.girls;
  target.total += value.total;
  return target;
}

function xlsxColumns(summary: OfficialAttendanceSummary): XlsxColumn[] {
  if (summary.mode === "term") {
    return [...summary.schoolTotals.weekly.map((week) => ({
      label: week.weekLabel,
      possible: week.possibleAttendances,
      percent: week.percentAbsence,
      split: (row: XlsxSourceRow) => row.weekly.find((item) => item.weekId === week.weekId)?.absences ?? emptySplit(),
    })), {
      label: "Term Absent",
      possible: summary.schoolTotals.possibleAttendances,
      percent: summary.schoolTotals.percentAbsence,
      split: (row: XlsxSourceRow) => row.absences,
    }];
  }
  const monday = mondayFor(summary.scopeEnd);
  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = addDays(monday, offset);
    const daily = summary.schoolTotals.daily?.find((item) => item.date === date);
    return {
      label: new Intl.DateTimeFormat("en-NA", { weekday: "long" }).format(new Date(`${date}T12:00:00`)),
      possible: daily?.possibleAttendances ?? 0,
      percent: daily?.percentAbsence ?? null,
      split: (row: XlsxSourceRow) => row.daily.find((item) => item.date === date)?.absences ?? emptySplit(),
    };
  });
  return [...days, {
    label: "Total Absent",
    possible: summary.schoolTotals.possibleAttendances,
    percent: summary.schoolTotals.percentAbsence,
    split: (row: XlsxSourceRow) => row.daily.reduce((total, day) => addSplit(total, day.absences), emptySplit()),
  }];
}

function compactSplit(split: XlsxSplit) {
  return `${split.total} (${split.boys}B / ${split.girls}G)`;
}

function xlsxBytes(summary: OfficialAttendanceSummary, meta: { header: OfficialDocumentHeaderModel; revision: number; scolaproReference: string; finalizedLabel: string }): ArrayBuffer {
  const contact = new Map(meta.header.contactLines.map((line) => [line.key, line]));
  const address = contact.get("address");
  const telephone = contact.get("telephone");
  const fax = contact.get("fax");
  const email = contact.get("email");
  const columns = xlsxColumns(summary);
  const totalColumns = 1 + columns.length;

  const aoa: Array<Array<string | number>> = [
    [meta.header.schoolName],
    [meta.header.formerName ? `(${meta.header.formerName})` : ""],
    [address ? `${address.label}: ${address.value}` : ""],
    [[telephone ? `${telephone.label}: ${telephone.value}` : "", fax ? `${fax.label}: ${fax.value}` : ""].filter(Boolean).join("   ")],
    [email ? `${email.label}: ${email.value}` : ""],
    ["SUMMARY OF ABSENTEES"],
    [summary.mode === "term" ? `Term-to-date${summary.term ? ` — ${summary.term.displayName}` : ""}` : "Current week"],
    ["Reporting period", `${summary.scopeStart} – ${summary.scopeEnd}`],
    ["Revision", meta.revision],
    ["ScolaPro reference", meta.scolaproReference],
    ["Finalized", meta.finalizedLabel],
    [],
  ];

  const headerStart = aoa.length;
  aoa.push(["REGISTER CLASS", ...columns.map((column) => column.label)]);

  const gradeGroups = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(gradeGroups.flatMap((group) => group.classes.map((row) => row.classId)));
  const splitCells = (row: XlsxSourceRow) => columns.map((column) => compactSplit(column.split(row)));

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

  const schoolSplit = (column: XlsxColumn) =>
    summary.classRows.reduce((total, row) => {
      return addSplit(total, column.split(row));
    }, emptySplit());

  const schoolTotalRow = aoa.length;
  aoa.push(["SCHOOL TOTAL", ...columns.map((column) => compactSplit(schoolSplit(column)))]);
  aoa.push(["POSSIBLE ATTENDANCES", ...columns.map((column) => column.possible)]);
  aoa.push(["% ABSENCE", ...columns.map((column) => formatPercent(column.percent))]);
  aoa.push([]);
  aoa.push(["Total absent learner-days", summary.schoolTotals.absentLearnerDays]);
  aoa.push(["Overall % absence", formatPercent(summary.schoolTotals.percentAbsence)]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = [{ wch: 22 }, ...columns.map(() => ({ wch: 16 }))];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, totalColumns - 1) } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: Math.max(0, totalColumns - 1) } },
    ...gradeSectionRows.map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: Math.max(0, totalColumns - 1) } })),
  ];
  worksheet["!freeze"] = { xSplit: 1, ySplit: headerStart + 1, topLeftCell: "B" + (headerStart + 2), activePane: "bottomRight", state: "frozen" };
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerStart, c: 0 }, e: { r: schoolTotalRow, c: Math.max(0, totalColumns - 1) } }) };

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
      const fileBase = mode === "term"
        ? `term-summary-of-absentees-${safeFilePart(liveSummary.term?.displayName ?? liveSummary.scopeEnd)}-draft`
        : `weekly-summary-of-absentees-${safeFilePart(liveSummary.scopeEnd)}-draft`;
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
    const fileBase = mode === "term"
      ? `term-summary-of-absentees-${safeFilePart(summary.term?.displayName ?? summary.scopeEnd)}-rev-${finalization.revision}`
      : `weekly-summary-of-absentees-${safeFilePart(summary.scopeEnd)}-rev-${finalization.revision}`;

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
