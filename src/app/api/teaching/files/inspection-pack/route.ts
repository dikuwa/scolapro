import { NextResponse } from "next/server";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_FRAME_RULE,
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { getTeachingFilesHub } from "@/features/teaching/server/file-queries";
import { getOperationalFileControlSheet } from "@/features/teaching/server/operational-file-control-sheet";
import { getOperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";
import { getUserContext } from "@/lib/auth/get-user-context";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NA", {
    timeZone: "Africa/Windhoek",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export async function GET() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    return NextResponse.json({ message: "Not authorized." }, { status: 403 });
  }

  const current = context.currentSchoolMembership;
  if (!current) {
    return NextResponse.json({ message: "Current school membership is required." }, { status: 403 });
  }

  const ownerMembership = context.memberships.find(
    (item) =>
      item.schoolId === current.schoolId &&
      item.staffMemberId &&
      ["teacher", "class_teacher", "hod"].includes(item.roleKey),
  );
  if (!ownerMembership?.staffMemberId) {
    return NextResponse.json({ message: "A current staff-backed teaching identity is required." }, { status: 403 });
  }

  const academicYear = await getGovernedAcademicYear(current.schoolId);
  const header = await getLiveSchoolDocumentHeader(
    current.schoolId,
    officialDocumentHeaderModeForType("teaching_files_inspection_pack"),
  );
  const hub = await getTeachingFilesHub({
    schoolId: current.schoolId,
    academicYear,
    staffMemberId: ownerMembership.staffMemberId,
    canOpenLessonPreparations: context.memberships.some(
      (item) =>
        item.schoolId === current.schoolId &&
        ["teacher", "class_teacher"].includes(item.roleKey),
    ),
  });
  const workspace = await getOperationalTeachingFilesWorkspace({
    academicYear,
    effectiveOn: hub.today,
    allocations: hub.allocations,
  });
  const controlSheet = await getOperationalFileControlSheet(academicYear);

  if (!workspace.allocations.length && !workspace.unsupportedAllocations.length) {
    return NextResponse.json(
      { message: "No current operational-file scope is available for this account." },
      { status: 404 },
    );
  }

  const allocationHtml = workspace.allocations
    .map((allocation) => {
      const files = allocation.fileTypes
        .map((fileType) => {
          const sections = fileType.sections.length
            ? fileType.sections
                .map((section) => {
                  const items = section.items
                    .map((item) => {
                      const source = item.evidence.references
                        .map((reference) => reference.label)
                        .join(", ");
                      return `<tr>
<td>${escapeHtml(item.label)}</td>
<td>${escapeHtml(item.resolverType.replaceAll("_", " "))}</td>
<td>${escapeHtml(item.evidence.status)}</td>
<td>${escapeHtml(source || item.evidence.reason || "—")}</td>
</tr>`;
                    })
                    .join("");
                  return `<h4>${escapeHtml(section.title)}</h4>
<table><thead><tr><th>Requirement</th><th>Source type</th><th>Readiness</th><th>Source / note</th></tr></thead><tbody>${items}</tbody></table>`;
                })
                .join("")
            : `<p class="muted">Recognized by the authoritative policy, but no internal hierarchy is defined by the supplied source.</p>`;
          return `<section class="file"><h3>${escapeHtml(fileType.displayName)}</h3>${sections}</section>`;
        })
        .join("");

      return `<section class="allocation">
<h2>${escapeHtml(allocation.subjectName)} · ${escapeHtml(allocation.gradeName)}${allocation.className ? " · " + escapeHtml(allocation.className) : ""}</h2>
<p class="muted">${escapeHtml(allocation.authority)} · ${escapeHtml(allocation.sourceTitle)} · Version ${allocation.templateVersion}${allocation.phaseLabel ? " · " + escapeHtml(allocation.phaseLabel) : ""}</p>
${files}
</section>`;
    })
    .join("");

  const unsupportedHtml = workspace.unsupportedAllocations.length
    ? `<section><h2>Subjects without a verified operational-file template</h2><ul>${workspace.unsupportedAllocations
        .map(
          (allocation) =>
            `<li><b>${escapeHtml(allocation.subjectName)} · ${escapeHtml(allocation.gradeName)}</b> — ${escapeHtml(allocation.reason)}</li>`,
        )
        .join("")}</ul></section>`
    : "";

  const reviewRows = [
    ...controlSheet.preparationRows,
    ...controlSheet.professionalFileRows,
  ];
  const unavailableReviewSources = [
    controlSheet.preparationUnavailable,
    controlSheet.professionalFileUnavailable,
  ].filter((message): message is string => Boolean(message));
  const reviewHtml = (unavailableReviewSources.length
    ? `<div class="notice">${unavailableReviewSources.map((message)=>escapeHtml(message)).join("<br>")}</div>`
    : "") + (reviewRows.length
    ? reviewRows
        .map((row) => {
          const eventRows = row.events.length
            ? row.events
                .map(
                  (event) =>
                    `<tr><td>${escapeHtml(event.eventKind)}</td><td>${escapeHtml(event.actorRole.replaceAll("_", " "))}</td><td>${escapeHtml(date(event.occurredAt))}</td><td>${escapeHtml(event.comment || "—")}</td></tr>`,
                )
                .join("")
            : `<tr><td colspan="4">No review events recorded.</td></tr>`;
          return `<section class="review">
<h3>${escapeHtml(row.label)}</h3>
<p class="muted">${row.subjectLabel ? escapeHtml(row.subjectLabel) + " · " : ""}${escapeHtml(row.reviewPeriod || "Explicit teacher submission")} · status: ${escapeHtml(row.status)}</p>
<p><b>Submitted:</b> ${escapeHtml(date(row.submittedAt))} &nbsp; <b>Reviewed:</b> ${escapeHtml(date(row.reviewedAt))}</p>
${row.reviewNote ? `<p><b>Review note:</b> ${escapeHtml(row.reviewNote)}</p>` : ""}
<table><thead><tr><th>Event</th><th>Actor role</th><th>Date</th><th>Comment</th></tr></thead><tbody>${eventRows}</tbody></table>
</section>`;
        })
        .join("")
    : unavailableReviewSources.length
      ? ""
      : `<p class="muted">No existing review submissions are recorded for this teacher in the current scope.</p>`);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Teaching Files Inspection Pack</title>
<style>
${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
*{box-sizing:border-box}:root{--ink:#161616;--line:#4a4a4a;--muted:#666;--screen:#eef1f5}html,body{margin:0;padding:0;color:var(--ink)}body{font-family:Arial,sans-serif;background:var(--screen);font-size:9px;line-height:1.4}
.toolbar{display:flex;width:min(210mm,calc(100vw - 24px));margin:14px auto 0;justify-content:flex-end}.toolbar button{min-height:34px;border:1px solid #cfd4dc;border-radius:7px;background:#fff;padding:0 12px;font:600 12px/1 Arial,sans-serif;cursor:pointer}
${OFFICIAL_DOCUMENT_FRAME_RULE}
.report{max-width:210mm;margin:10px auto 24px;background:#fff;box-shadow:0 14px 36px rgba(20,28,40,.12)}
${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
.muted{color:var(--muted)}
h1{font-size:16px;margin:10px 0 2px}h2{font-size:12px;margin:16px 0 6px;border-bottom:1px solid #bbb;padding-bottom:4px}h3{font-size:10px;margin:11px 0 5px}h4{font-size:9px;margin:8px 0 4px}
table{width:100%;border-collapse:collapse;margin:5px 0 10px;table-layout:fixed}th,td{border:1px solid #aaa;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f2f4}
ul{margin:6px 0;padding-left:20px}.allocation{break-inside:auto}.file,.review{break-inside:avoid-page}.notice{border:1px solid #aaa;padding:7px;background:rgba(247,247,247,.82)}
${OFFICIAL_DOCUMENT_METADATA_RULE}
@media(max-width:640px){.toolbar{width:calc(100vw - 16px);margin-top:8px}.report{width:calc(100vw - 8px);margin:6px auto 16px;padding:5mm;min-height:0}}
@media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.toolbar{display:none}.report{max-width:none;margin:0;box-shadow:none}${OFFICIAL_DOCUMENT_PRINT_RULE}}
</style></head><body>
<div class="toolbar no-print"><button onclick="window.print()">Print / Save PDF</button></div>
<main class="report">
${renderOfficialDocumentHtmlHeader(header, undefined, { context: { title: "Teaching Files Inspection Pack", primaryContext: String(academicYear), secondaryContext: "Operational Teaching Files", summary: `${workspace.allocations.length} governed allocation(s)` } })}
<h1>Operational Teaching Files</h1>
<p class="notice">Readiness and review are separate. Available or linked evidence is not presented as HOD-reviewed unless an existing review event records that review.</p>
${allocationHtml}
${unsupportedHtml}
<section><h2>Control sheet / existing review history</h2>${reviewHtml}</section>
<p class="muted">Generated from the signed-in teacher's current governed ScolaPro records. This preview is read-only, private and does not create duplicate mutable evidence.</p>
${renderOfficialDocumentHtmlFooter({ left: `Academic year ${academicYear}`, right: "Teaching Files Inspection Pack" })}
</main>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
