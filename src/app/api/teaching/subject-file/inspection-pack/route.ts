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
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import { getSubjectFileRow } from "@/features/teaching/server/subject-file";
import { getUserContext } from "@/lib/auth/get-user-context";

function generatedLabel() {
  return new Intl.DateTimeFormat("en-NA", {
    timeZone: "Africa/Windhoek",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export async function GET(request:Request) {
  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if (!context.user || context.platformMemberships.length || !membership) {
    return NextResponse.json({message:"Not authorized."},{status:403});
  }

  const url=new URL(request.url);
  const subjectId=url.searchParams.get("subjectId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(subjectId)) {
    return NextResponse.json({message:"Subject is required."},{status:400});
  }

  const academicYear=await getGovernedAcademicYear(membership.schoolId);
  const result=await getSubjectFileRow(academicYear,subjectId);
  if (!result) {
    return NextResponse.json({message:"Subject File is outside your current governed scope."},{status:404});
  }

  const {row}=result;
  const header=await getLiveSchoolDocumentHeader(membership.schoolId,officialDocumentHeaderModeForType("subject_file_inspection_pack"));
  const sourceRows=row.sourceLinks
    .map((item)=>`<tr><td>${escapeOfficialDocumentHtml(item.label)}</td><td>${escapeOfficialDocumentHtml(item.description)}</td></tr>`)
    .join("");
  const teacherRows=row.teacherNames
    .map((name)=>`<li>${escapeOfficialDocumentHtml(name)}</li>`)
    .join("") || "<li>No current teacher allocation recorded</li>";
  const gaps=row.unavailableSources
    .map((item)=>`<li>${escapeOfficialDocumentHtml(item)}</li>`)
    .join("") || "<li>No explicit source gaps recorded.</li>";
  const policyHierarchy=row.policyHierarchy
    ? `<section class="document-section">
        <h2>Official Subject File hierarchy</h2>
        <p class="muted">${escapeOfficialDocumentHtml(row.policyHierarchy.authority)} · ${escapeOfficialDocumentHtml(row.policyHierarchy.sourceTitle)} · Version ${escapeOfficialDocumentHtml(row.policyHierarchy.templateVersion)}${row.policyHierarchy.phaseLabels.length ? " · "+escapeOfficialDocumentHtml(row.policyHierarchy.phaseLabels.join(", ")) : ""}</p>
        ${row.policyHierarchy.sections.map((section)=>`<div class="policy-section">
          <h3>${escapeOfficialDocumentHtml(section.title)}</h3>
          <div class="table-wrap"><table><thead><tr><th>Requirement</th><th>Source type</th><th>Readiness</th><th>Source / note</th></tr></thead><tbody>
          ${section.items.map((item)=>`<tr><td>${escapeOfficialDocumentHtml(item.label)}</td><td>${escapeOfficialDocumentHtml(item.resolverType.replaceAll("_"," "))}</td><td>${escapeOfficialDocumentHtml(item.status)}</td><td>${escapeOfficialDocumentHtml(item.sourceLabel || item.reason || "—")}</td></tr>`).join("")}
          </tbody></table></div>
        </div>`).join("")}
      </section>`
    : `<section class="document-section"><h2>Official Subject File hierarchy</h2><p class="muted">No authoritative Subject File hierarchy is recorded for this subject. ScolaPro does not apply another subject's policy by assumption.</p></section>`;

  const generatedAt=generatedLabel();
  const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeOfficialDocumentHtml(row.subjectName)} Subject File inspection pack</title>
<style>
${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
*{box-sizing:border-box}
:root{--ink:#151515;--line:#4a4a4a;--muted:#5f636b;--screen:#eef1f5}
html,body{margin:0;padding:0;color:var(--ink)}
body{background:var(--screen);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:9px;line-height:1.35}
.toolbar{display:flex;width:min(210mm,calc(100vw - 24px));margin:14px auto 0;justify-content:flex-end}
.toolbar button{min-height:34px;border:1px solid #cfd4dc;border-radius:7px;background:#fff;padding:0 12px;font:600 12px/1 ui-sans-serif,system-ui;cursor:pointer}
${OFFICIAL_DOCUMENT_FRAME_RULE}
.report{max-width:210mm;margin:10px auto 24px;background:#fff;box-shadow:0 14px 36px rgba(20,28,40,.12)}
${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
.subject-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:9px 0 5px;padding:0 2px}
.subject-heading h1{margin:0;font-size:16px;line-height:1.15}
.subject-heading .subject-meta{margin-top:2px;color:var(--muted);font-size:7px}
.access-chip{shrink:0;border:1px solid #aaa;border-radius:4px;padding:3px 6px;font-size:6.4px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.document-section{margin-top:9px;break-inside:auto}
.document-section>h2{margin:0 0 4px;border-bottom:1px solid var(--line);padding-bottom:3px;font-size:9.5px;line-height:1.2;break-after:avoid}
.policy-section{margin-top:7px}
.policy-section h3{margin:0 0 3px;font-size:7.4px;text-transform:uppercase;letter-spacing:.03em}
.muted{color:var(--muted);margin:2px 0 0}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.metric{min-width:0;border:1px solid #aaa;padding:6px}
.metric span{display:block;color:var(--muted);font-size:6.5px}
.metric b{display:block;margin-top:2px;font-size:14px;line-height:1.1}
.two-column{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:8px}
ul{margin:4px 0 0;padding-left:16px}
.table-wrap{width:100%;overflow-x:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.7px}
th,td{border:1px solid #aaa;padding:3.5px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#f1f2f4;font-weight:700}
table th:first-child,table td:first-child{width:34%}
.source-table th:first-child,.source-table td:first-child{width:30%}
.note{margin-top:9px;border:1px solid #aaa;padding:6px;font-size:6.8px;color:var(--muted)}
${OFFICIAL_DOCUMENT_METADATA_RULE}
@media(max-width:640px){
  .toolbar{width:calc(100vw - 16px);margin-top:8px}
  .report{width:calc(100vw - 8px);margin:6px auto 16px;padding:5mm;min-height:0}
  .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .two-column{grid-template-columns:1fr}
  .subject-heading{flex-direction:column}
}
@media print{
  body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .toolbar{display:none}
  .report{max-width:none;margin:0;box-shadow:none}
  .table-wrap{overflow:visible}
  ${OFFICIAL_DOCUMENT_PRINT_RULE}
  .metrics,.subject-heading,.policy-section,.note{break-inside:avoid;page-break-inside:avoid}
}
</style>
</head>
<body>
<div class="toolbar no-print"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
<main class="report">
  ${renderOfficialDocumentHtmlHeader(header, undefined, {
    context: {
      title: "Subject File Inspection Pack",
      primaryContext: `${row.subjectCode} · ${row.gradeNames.join(", ") || "No current grades"} · ${academicYear}`,
      secondaryContext: row.accessMode==="hod" ? "HOD portfolio" : "Teacher read access",
      summary: `${row.teacherNames.length} teacher(s) · ${row.planningCount} plan(s) · ${row.preparationCount} preparation(s)`,
    },
  })}

  <section class="subject-heading">
    <div>
      <h1>${escapeOfficialDocumentHtml(row.subjectName)}</h1>
      <div class="subject-meta">${escapeOfficialDocumentHtml(row.departmentLabel || "Subject dossier")} · Read-only live evidence</div>
    </div>
    <span class="access-chip">${row.accessMode==="hod"?"HOD portfolio":"Teaching access"}</span>
  </section>

  <section class="document-section">
    <h2>Current evidence summary</h2>
    <div class="metrics">
      <div class="metric"><span>Teaching team</span><b>${row.teacherNames.length}</b></div>
      <div class="metric"><span>Plans / schedules</span><b>${row.planningCount} / ${row.scheduledLessonCount}</b></div>
      <div class="metric"><span>Preparations</span><b>${row.preparationCount}</b></div>
      <div class="metric"><span>Assessments / moderation</span><b>${row.assessmentInstanceCount} / ${row.moderationRequiredCount}</b></div>
    </div>
  </section>

  <section class="document-section two-column">
    <div>
      <h2>Grades</h2>
      <p>${escapeOfficialDocumentHtml(row.gradeNames.join(", ") || "No current grades")}</p>
    </div>
    <div>
      <h2>Teaching team</h2>
      <ul>${teacherRows}</ul>
    </div>
  </section>

  ${policyHierarchy}

  <section class="document-section">
    <h2>Authoritative source register</h2>
    <div class="table-wrap"><table class="source-table"><thead><tr><th>Source module</th><th>Evidence</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
  </section>

  <section class="document-section">
    <h2>Explicit source gaps</h2>
    <ul>${gaps}</ul>
  </section>

  <div class="note">Generated from live ScolaPro source records. This inspection pack is a read-only dossier and does not create duplicate mutable records.</div>
  ${renderOfficialDocumentHtmlFooter({left:`Generated ${generatedAt}`,right:`${row.subjectCode} · ${academicYear}`})}
</main>
</body>
</html>`;

  return new NextResponse(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store"}});
}
